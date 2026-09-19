import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Facility, RouteGeometry, TrackedLocation } from "../api/types";

/**
 * Live shipment map.
 *
 * Leaflet over OpenStreetMap tiles — no API key, so the map works on any
 * machine that can reach the internet. The route polyline is whatever the
 * backend's router returned (Mapbox or OSRM road geometry, or a straight line
 * when both were unreachable), and the courier marker is placed at the
 * position the tracking endpoint resolved.
 *
 * The map is driven imperatively rather than through react-leaflet: we hold
 * one map instance for the component's life and move the marker on each
 * update, so a 3-second poll does not tear down and rebuild the tile layer.
 */

const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

function pinIcon(color: string, label: string): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `
      <div style="
        width:26px;height:26px;border-radius:50%;
        background:${color};border:2.5px solid white;
        box-shadow:0 2px 6px rgba(0,0,0,0.3);
        display:flex;align-items:center;justify-content:center;
        color:white;font:600 11px/1 Inter,system-ui,sans-serif;">${label}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

function courierIcon(isLive: boolean): L.DivIcon {
  // A live GPS fix pulses; a projected position does not, so the two never
  // look alike at a glance.
  return L.divIcon({
    className: "",
    html: `
      <div style="position:relative;width:34px;height:34px;">
        ${isLive ? `<div style="
            position:absolute;inset:0;border-radius:50%;
            background:rgba(0,113,227,0.28);
            animation:pulse 1.8s ease-out infinite;"></div>` : ""}
        <div style="
          position:absolute;left:5px;top:5px;width:24px;height:24px;border-radius:50%;
          background:${isLive ? "#0071E3" : "#8E8E93"};border:2.5px solid white;
          box-shadow:0 2px 8px rgba(0,0,0,0.35);
          display:flex;align-items:center;justify-content:center;
          font-size:12px;">&#128666;</div>
      </div>
      <style>@keyframes pulse{0%{transform:scale(.6);opacity:.9}100%{transform:scale(1.9);opacity:0}}</style>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

export default function RouteMap({
  source,
  destination,
  routeGeometry,
  location,
  height = 420,
}: {
  source: Facility;
  destination: Facility;
  routeGeometry: RouteGeometry | null;
  location: TrackedLocation | null;
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const courierRef = useRef<L.Marker | null>(null);
  const travelledRef = useRef<L.Polyline | null>(null);
  const hasFittedRef = useRef(false);

  // GeoJSON is [lng, lat]; Leaflet wants [lat, lng].
  const latLngs: L.LatLngExpression[] =
    routeGeometry?.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]) ?? [];

  // Build the map once. Static layers (route, endpoints) go in here so that
  // poll-driven re-renders only touch the courier marker.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: true,
      scrollWheelZoom: false, // page scroll should not zoom the map out from under you
    });
    L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 19 }).addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      courierRef.current = null;
      travelledRef.current = null;
      hasFittedRef.current = false;
    };
  }, []);

  // Route line and the two endpoints.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const layers: L.Layer[] = [];

    if (latLngs.length >= 2) {
      layers.push(
        L.polyline(latLngs, { color: "#0071E3", weight: 5, opacity: 0.28 }).addTo(map),
      );
    }

    if (source.latitude != null && source.longitude != null) {
      layers.push(
        L.marker([source.latitude, source.longitude], { icon: pinIcon("#1A7431", "A") })
          .bindPopup(`<strong>From</strong><br/>${source.name}<br/>${source.address ?? ""}`)
          .addTo(map),
      );
    }

    if (destination.latitude != null && destination.longitude != null) {
      layers.push(
        L.marker([destination.latitude, destination.longitude], { icon: pinIcon("#C41230", "B") })
          .bindPopup(`<strong>To</strong><br/>${destination.name}<br/>${destination.address ?? ""}`)
          .addTo(map),
      );
    }

    // Fit to the route the first time only — refitting on every poll would
    // fight an operator who has panned or zoomed in.
    if (!hasFittedRef.current) {
      const bounds = latLngs.length >= 2
        ? L.latLngBounds(latLngs)
        : L.latLngBounds(
            [source.latitude ?? 13.08, source.longitude ?? 80.27],
            [destination.latitude ?? 13.06, destination.longitude ?? 80.25],
          );
      map.fitBounds(bounds, { padding: [48, 48] });
      hasFittedRef.current = true;
    }

    return () => layers.forEach((layer) => map.removeLayer(layer));
  }, [source.id, destination.id, routeGeometry]);

  // Courier position and the travelled portion of the route.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!location || location.lat == null || location.lng == null) {
      if (courierRef.current) { map.removeLayer(courierRef.current); courierRef.current = null; }
      return;
    }

    const point: [number, number] = [location.lat, location.lng];
    const isLive = location.location_source === "courier_live";

    if (courierRef.current) {
      courierRef.current.setLatLng(point);
      courierRef.current.setIcon(courierIcon(isLive));
    } else {
      courierRef.current = L.marker(point, { icon: courierIcon(isLive), zIndexOffset: 1000 }).addTo(map);
    }

    courierRef.current.bindPopup(
      `<strong>Shipment</strong><br/>${describeSource(location.location_source)}` +
      (location.progress !== null ? `<br/>${Math.round(location.progress * 100)}% of the route` : ""),
    );

    // Solid overlay showing how much of the route is behind the shipment.
    if (travelledRef.current) { map.removeLayer(travelledRef.current); travelledRef.current = null; }
    if (latLngs.length >= 2 && location.progress != null && location.progress > 0) {
      const upto = Math.max(1, Math.floor(latLngs.length * location.progress));
      travelledRef.current = L.polyline([...latLngs.slice(0, upto), point], {
        color: "#0071E3",
        weight: 5,
        opacity: 0.95,
      }).addTo(map);
    }
  }, [location?.lat, location?.lng, location?.location_source, location?.progress, routeGeometry]);

  return (
    <div
      ref={containerRef}
      style={{ height, width: "100%", borderRadius: 14, overflow: "hidden", background: "#E8E8EC" }}
    />
  );
}

export function describeSource(source: TrackedLocation["location_source"]): string {
  switch (source) {
    case "courier_live":
      return "Live position reported by the courier";
    case "courier_last_known":
      return "Last position the courier reported";
    case "route_projection":
      return "Projected along the route from elapsed time — not a GPS fix";
    case "origin":
      return "Still at the sending facility";
    case "destination":
      return "Delivered at the receiving facility";
    default:
      return "Position unavailable";
  }
}
