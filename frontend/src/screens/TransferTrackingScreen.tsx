import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { transferApi } from "../api/endpoints";
import type { Transfer } from "../api/types";
import RouteMap, { describeSource } from "../components/RouteMap";

const TRACK_POLL_MS = 3000;

/**
 * Flipkart-style shipment tracking for one transfer: a live map, the stage
 * strip, and the scan-by-scan timeline.
 *
 * Both facilities see the same page from the same endpoint, so neither side
 * has to ask the other where the box is.
 */
export default function TransferTrackingScreen({
  transferId,
  onBack,
}: {
  transferId: string | null;
  onBack?: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(transferId);

  useEffect(() => { setSelectedId(transferId); }, [transferId]);

  // Without a specific transfer, offer whatever is currently in flight.
  const { data: active } = useQuery({
    queryKey: ["transfers", "active"],
    queryFn: () => transferApi.list("active"),
    enabled: !selectedId,
    refetchInterval: TRACK_POLL_MS,
  });

  const { data: tracked, error, isLoading } = useQuery({
    queryKey: ["track", selectedId],
    queryFn: () => transferApi.track(selectedId!),
    enabled: Boolean(selectedId),
    refetchInterval: TRACK_POLL_MS,
  });

  if (!selectedId) {
    return <TransferPicker transfers={active ?? []} onPick={setSelectedId} />;
  }

  if (isLoading) {
    return <div className="px-8 py-7"><p className="text-[14px] text-[#6E6E73]">Loading shipment…</p></div>;
  }

  if (error || !tracked) {
    return (
      <div className="px-8 py-7">
        <div className="rounded-[12px] px-5 py-4 max-w-[560px]" style={{ background: "#FDECEC", border: "1px solid #F5C6C6" }}>
          <p className="text-[14px] font-medium" style={{ color: "#B3261E" }}>Could not load this shipment.</p>
          <p className="text-[13px] mt-1 leading-relaxed" style={{ color: "#B3261E" }}>
            {error instanceof Error ? error.message : "Unknown error."}
          </p>
        </div>
        <button onClick={() => setSelectedId(null)} className="mt-4 text-[13px] text-[#0071E3] cursor-pointer">
          Pick another shipment
        </button>
      </div>
    );
  }

  const isSender = tracked.viewer_role === "SENDER";
  const live = tracked.location.location_source === "courier_live";

  return (
    <div className="px-8 py-7 max-w-[1180px]">
      <button
        onClick={() => (onBack ? onBack() : setSelectedId(null))}
        className="text-[13px] text-[#6E6E73] hover:text-[#1D1D1F] mb-4 cursor-pointer transition-colors"
      >
        ← Back
      </button>

      <header className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <p className="text-[12px] font-mono text-[#AEAEB2]">{tracked.id}</p>
          <h1 className="text-[24px] font-semibold text-[#1D1D1F] tracking-tight mt-1 leading-snug">
            {tracked.units} {tracked.component_type} unit{tracked.units === 1 ? "" : "s"} ·{" "}
            {tracked.source.short_name} → {tracked.destination.short_name}
          </h1>
          <p className="text-[13px] text-[#6E6E73] mt-1">
            {isSender ? "You are the sending facility." : "You are the receiving facility."}
          </p>
        </div>

        <div className="text-right">
          <p className="text-[11px] font-semibold text-[#AEAEB2] uppercase tracking-wider">
            {tracked.status === "IN_TRANSIT" ? "Arriving in" : "Status"}
          </p>
          <p className="text-[22px] font-semibold text-[#1D1D1F] leading-tight mt-0.5">
            {tracked.status === "IN_TRANSIT" && tracked.eta_remaining_minutes !== null
              ? `${tracked.eta_remaining_minutes} min`
              : tracked.status.replace(/_/g, " ").toLowerCase()}
          </p>
        </div>
      </header>

      <StageStrip transfer={tracked} />

      <div className="grid lg:grid-cols-[1.45fr_1fr] gap-5 mt-6">
        {/* Map */}
        <div>
          <RouteMap
            source={tracked.source}
            destination={tracked.destination}
            routeGeometry={tracked.route_geometry}
            location={tracked.location}
            height={440}
          />

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-3">
            <span className="flex items-center gap-2">
              <span
                className="w-2 h-2 rounded-full"
                style={{ background: live ? "#0071E3" : "#8E8E93" }}
              />
              <span className="text-[12px] text-[#6E6E73]">
                {describeSource(tracked.location.location_source)}
              </span>
            </span>

            {tracked.location.fix_age_seconds !== null && tracked.location.fix_age_seconds > 0 && (
              <span className="text-[12px] text-[#AEAEB2]">
                updated {tracked.location.fix_age_seconds}s ago
              </span>
            )}

            <span className="text-[12px] text-[#AEAEB2]">
              Route via {routeProviderLabel(tracked.route_provider)}
            </span>
          </div>
        </div>

        {/* Shipment details */}
        <div className="space-y-4">
          <Panel title="Shipment">
            <Row label="Courier" value={tracked.courier_name ?? "Not booked"} />
            <Row label="Airway bill" value={tracked.awb_code ?? "—"} mono />
            <Row label="Provider" value={tracked.transport_provider_label ?? tracked.transport_provider ?? "—"} />
            {tracked.rider?.name && <Row label="Rider" value={tracked.rider.name} />}
            {tracked.rider?.vehicle && <Row label="Vehicle" value={tracked.rider.vehicle} mono />}
            <Row label="Distance" value={tracked.distance_km ? `${tracked.distance_km.toFixed(2)} km` : "—"} />
            <Row label="Routed ETA" value={tracked.eta_minutes ? `${tracked.eta_minutes} min` : "—"} />
          </Panel>

          <Panel title="Handling">
            <ul className="space-y-2">
              {tracked.instructions.map((line) => (
                <li key={line} className="flex items-start gap-2.5">
                  <span className="mt-[7px] w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: "#C41230" }} />
                  <span className="text-[13px] text-[#1D1D1F] leading-relaxed">{line}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>

      {/* Timeline */}
      <section className="mt-8">
        <h2 className="text-[11px] font-semibold text-[#AEAEB2] uppercase tracking-widest mb-4">
          Shipment history
        </h2>
        <ol className="relative">
          {tracked.timeline.map((entry, index) => {
            const last = index === tracked.timeline.length - 1;
            return (
              <li key={`${entry.occurred_at}-${index}`} className="flex gap-4 pb-5 relative">
                {!last && (
                  <span className="absolute left-[5px] top-4 bottom-0 w-px" style={{ background: "#E5E5E7" }} />
                )}
                <span
                  className="w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 relative z-10"
                  style={{ background: last ? "#0071E3" : "#C7C7CC" }}
                />
                <div className="min-w-0">
                  <p className="text-[14px] font-medium text-[#1D1D1F] leading-snug">{entry.title}</p>
                  {entry.description && (
                    <p className="text-[13px] text-[#6E6E73] mt-1 leading-relaxed">{entry.description}</p>
                  )}
                  <p className="text-[11px] text-[#AEAEB2] mt-1.5">
                    {formatTimestamp(entry.occurred_at)}
                    {entry.source !== "system" && ` · ${entry.source}`}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}

// ── Pieces ───────────────────────────────────────────────────────────────────

const STAGES = [
  { key: "REQUESTED", label: "Requested" },
  { key: "UNITS_RESERVED", label: "Authorised" },
  { key: "SHIPMENT_CREATED", label: "Courier booked" },
  { key: "IN_TRANSIT", label: "In transit" },
  { key: "ARRIVED", label: "Arrived" },
  { key: "TRANSFER_COMPLETED", label: "Delivered" },
];

function StageStrip({ transfer }: { transfer: Transfer }) {
  const order = [
    "REQUESTED", "ACCEPTED", "UNITS_RESERVED", "SHIPMENT_CREATED", "AWB_ASSIGNED",
    "PICKUP_OTP_REQUIRED", "IN_TRANSIT", "ARRIVED", "DELIVERY_OTP_REQUIRED", "TRANSFER_COMPLETED",
  ];
  const current = order.indexOf(transfer.status);

  return (
    <div className="flex items-center gap-1.5 bg-white rounded-[14px] px-5 py-4" style={{ border: "1px solid #E5E5E7" }}>
      {STAGES.map((stage, index) => {
        const reached = current >= order.indexOf(stage.key);
        return (
          <div key={stage.key} className="flex items-center flex-1 min-w-0">
            <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
              <span
                className="w-3 h-3 rounded-full"
                style={{ background: reached ? "#1A7431" : "#E5E5E7" }}
              />
              <span
                className="text-[11px] whitespace-nowrap"
                style={{ color: reached ? "#1D1D1F" : "#AEAEB2", fontWeight: reached ? 500 : 400 }}
              >
                {stage.label}
              </span>
            </div>
            {index < STAGES.length - 1 && (
              <span
                className="flex-1 h-px mx-1.5 mb-5"
                style={{ background: current > order.indexOf(stage.key) ? "#1A7431" : "#E5E5E7" }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function TransferPicker({ transfers, onPick }: { transfers: Transfer[]; onPick: (id: string) => void }) {
  return (
    <div className="px-8 py-7 max-w-[820px]">
      <h1 className="text-[24px] font-semibold text-[#1D1D1F] tracking-tight">Track a shipment</h1>
      <p className="text-[14px] text-[#6E6E73] mt-1.5 mb-6">
        Pick a transfer that is currently in flight.
      </p>

      {transfers.length === 0 ? (
        <p className="text-[14px] text-[#AEAEB2]">
          Nothing is in flight. Open a transfer first, and it will appear here once the sending
          facility authorises it.
        </p>
      ) : (
        <div className="space-y-2.5">
          {transfers.map((transfer) => (
            <button
              key={transfer.id}
              onClick={() => onPick(transfer.id)}
              className="w-full text-left bg-white rounded-[12px] px-5 py-4 cursor-pointer hover:shadow-md transition-shadow"
              style={{ border: "1px solid #E5E5E7" }}
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-[14px] font-medium text-[#1D1D1F]">
                    {transfer.units} {transfer.component_type} · {transfer.source.short_name} → {transfer.destination.short_name}
                  </p>
                  <p className="text-[12px] text-[#6E6E73] mt-0.5 font-mono">{transfer.id}</p>
                </div>
                <span className="text-[12px] text-[#6E6E73]">{transfer.status.replace(/_/g, " ").toLowerCase()}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-[14px] p-5" style={{ border: "1px solid #E5E5E7" }}>
      <h3 className="text-[11px] font-semibold text-[#AEAEB2] uppercase tracking-widest mb-3">{title}</h3>
      {children}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4 py-2" style={{ borderBottom: "1px solid #F5F5F7" }}>
      <span className="text-[13px] text-[#6E6E73] flex-shrink-0">{label}</span>
      <span className={`text-[13px] text-[#1D1D1F] text-right ${mono ? "font-mono" : "font-medium"}`}>{value}</span>
    </div>
  );
}

function routeProviderLabel(provider: string | null): string {
  switch (provider) {
    case "mapbox_directions": return "Mapbox road routing";
    case "osrm": return "OSRM road routing";
    case "haversine_estimate": return "straight-line estimate (routing unavailable)";
    default: return provider ?? "unknown";
  }
}

function formatTimestamp(value: string | null): string {
  if (!value) return "—";
  // Naive UTC from the API; mark it as UTC so the browser localises correctly.
  const date = new Date(value.endsWith("Z") ? value : `${value}Z`);
  return date.toLocaleString("en-IN", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}
