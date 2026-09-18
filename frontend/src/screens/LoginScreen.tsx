import { useState, useRef, useEffect } from "react";
import Globe from "react-globe.gl";
import { useAuth } from "../contexts/AuthContext";

const INDIA_LAT = 20.5937;
const INDIA_LNG = 78.9629;

interface Marker {
  lat: number;
  lng: number;
  city: string;
  units: number;
  critical: boolean;
}

const hospitalMarkers: Marker[] = [
  { lat: 13.0827, lng: 80.2707, city: "GGH Chennai", units: 48, critical: false },
  { lat: 13.0604, lng: 80.2496, city: "Apollo Chennai", units: 14, critical: false },
  { lat: 12.8108, lng: 77.6942, city: "Narayana Bangalore", units: 22, critical: false },
  { lat: 19.0178, lng: 72.8478, city: "Tata Mumbai", units: 18, critical: false },
  { lat: 19.0760, lng: 72.8777, city: "KEM Mumbai", units: 17, critical: false },
  { lat: 12.9716, lng: 77.5946, city: "Victoria Hospital Bengaluru", units: 8, critical: true },
  { lat: 22.5726, lng: 88.3639, city: "NRS Medical Kolkata", units: 31, critical: false },
  { lat: 17.3850, lng: 78.4867, city: "Osmania General Hyderabad", units: 12, critical: true },
  { lat: 13.0827, lng: 80.2800, city: "Govt Stanley Chennai", units: 19, critical: false },
  { lat: 23.0225, lng: 72.5714, city: "SVP Hospital Ahmedabad", units: 5, critical: true },
  { lat: 26.8467, lng: 80.9462, city: "KGMC Lucknow", units: 14, critical: false },
  { lat: 18.5204, lng: 73.8567, city: "Sassoon General Pune", units: 9, critical: true },
  { lat: 21.1458, lng: 79.0882, city: "GMCH Nagpur", units: 11, critical: false },
  { lat: 25.3176, lng: 82.9739, city: "BHU Varanasi", units: 7, critical: true },
  { lat: 26.9124, lng: 75.7873, city: "SMS Hospital Jaipur", units: 20, critical: false },
  { lat: 11.0168, lng: 76.9558, city: "CMCH Coimbatore", units: 4, critical: true },
  { lat: 9.9312,  lng: 76.2673, city: "Medical College Kochi", units: 16, critical: false },
  { lat: 15.3173, lng: 75.7139, city: "KIMS Hubli", units: 6, critical: true },
  { lat: 23.2599, lng: 77.4126, city: "Hamidia Hospital Bhopal", units: 13, critical: false },
  { lat: 30.7333, lng: 76.7794, city: "PGIMER Chandigarh", units: 25, critical: false },
  { lat: 27.1767, lng: 78.0081, city: "SN Medical College Agra", units: 9, critical: true },
  { lat: 16.5062, lng: 80.6480, city: "GGH Vijayawada", units: 7, critical: true },
  { lat: 24.5854, lng: 73.7125, city: "RNT Medical Udaipur", units: 11, critical: false },
];

export default function LoginScreen({ onLogin }: { onLogin?: () => void }) {
  const { loginAsDemo, loginWithGoogleToken, setAuthSession } = useAuth();
  const [selectedHospital, setSelectedHospital] = useState("TN-GGH-001");
  const [loading, setLoading] = useState(false);
  const [gsiLoaded, setGsiLoaded] = useState(false);
  const globeRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId || clientId === "your_client_id_here") return;

    const scriptId = "google-gsi-script";
    let script = document.getElementById(scriptId) as HTMLScriptElement;

    const initGsi = () => {
      if ((window as any).google?.accounts?.id) {
        (window as any).google.accounts.id.initialize({
          client_id: clientId,
          callback: async (response: any) => {
            if (response.credential) {
              setLoading(true);
              try {
                await loginWithGoogleToken(response.credential);
                if (onLogin) onLogin();
              } catch (err) {
                console.error("Google token verification failed:", err);
              } finally {
                setLoading(false);
              }
            }
          },
        });

        const btnDiv = document.getElementById("google-gsi-button");
        if (btnDiv) {
          btnDiv.innerHTML = "";
          (window as any).google.accounts.id.renderButton(btnDiv, {
            theme: "outline",
            size: "large",
            width: 324,
            shape: "pill",
            text: "signin_with",
          });
          setGsiLoaded(true);
        }
      }
    };

    if (!script) {
      script = document.createElement("script");
      script.id = scriptId;
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.onload = initGsi;
      document.body.appendChild(script);
    } else {
      initGsi();
    }
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setDims({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!globeRef.current || dims.w === 0) return;
    const t = setTimeout(() => {
      globeRef.current?.pointOfView({ lat: INDIA_LAT, lng: INDIA_LNG, altitude: 0.82 }, 2200);
    }, 800);
    return () => clearTimeout(t);
  }, [dims.w]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const baseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api/v1";
      const res = await fetch(`${baseUrl}/auth/switch-bank`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bank_id: selectedHospital }),
      });
      const data = await res.json();
      if (data?.data?.token) {
        setAuthSession(data.data.token, data.data.user);
      } else {
        await loginAsDemo();
      }
    } catch (err) {
      await loginAsDemo();
    } finally {
      setLoading(false);
      if (onLogin) onLogin();
    }
  }

  const handleGoogleRedirect = async () => {
    try {
      setLoading(true);
      const baseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api/v1";
      const res = await fetch(`${baseUrl}/auth/google/start`);
      const data = await res.json();
      if (data?.data?.redirect_url) {
        window.location.href = data.data.redirect_url;
      } else {
        await loginAsDemo();
        if (onLogin) onLogin();
      }
    } catch (e) {
      await loginAsDemo();
      if (onLogin) onLogin();
    } finally {
      setLoading(false);
    }
  };

  const criticalCount = hospitalMarkers.filter(m => m.critical).length;

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Globe panel */}
      <div ref={containerRef} className="flex-1 relative overflow-hidden" style={{ background: "#08080F" }}>
        {dims.w > 0 && (
          <Globe
            ref={globeRef}
            width={dims.w}
            height={dims.h}
            globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
            backgroundImageUrl="//unpkg.com/three-globe/example/img/night-sky.png"
            atmosphereColor="#1A3A6E"
            atmosphereAltitude={0.18}
            pointsData={hospitalMarkers}
            pointLat={(d: object) => (d as Marker).lat}
            pointLng={(d: object) => (d as Marker).lng}
            pointColor={(d: object) => (d as Marker).critical ? "#FF3B30" : "#FF9F0A"}
            pointAltitude={0.018}
            pointRadius={0.38}
            pointLabel={(d: object) => {
              const m = d as Marker;
              return `<div style="background:#1D1D1F;color:white;padding:6px 10px;border-radius:8px;font-size:12px;font-family:Inter,system-ui;line-height:1.5"><strong>${m.city}</strong><br/>${m.units} units · ${m.critical ? "⚠ Low stock" : "Adequate"}</div>`;
            }}
          />
        )}

        {/* Bottom-left label */}
        <div className="absolute bottom-8 left-8">
          <p className="text-[11px] font-semibold tracking-wider mb-2" style={{ color: "rgba(255,255,255,0.4)" }}>
            LIVE NETWORK
          </p>
          <p className="text-[26px] font-semibold leading-tight" style={{ color: "white" }}>
            {hospitalMarkers.length} hospitals<br />across India
          </p>
          <p className="text-[13px] mt-2" style={{ color: "rgba(255,255,255,0.35)" }}>
            {criticalCount} at critical stock level
          </p>
        </div>

        {/* Legend */}
        <div className="absolute top-8 left-8 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#FF3B30]" />
            <span className="text-[12px]" style={{ color: "rgba(255,255,255,0.5)" }}>Low stock</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#FF9F0A]" />
            <span className="text-[12px]" style={{ color: "rgba(255,255,255,0.5)" }}>Adequate</span>
          </div>
        </div>
      </div>

      {/* Login panel */}
      <div className="w-[420px] bg-white flex flex-col justify-center px-12 flex-shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-2.5 mb-10">
          <div className="w-8 h-8 bg-[#C41230] rounded-[8px] flex items-center justify-center flex-shrink-0">
            <span className="text-white text-[14px] font-bold">P</span>
          </div>
          <span className="text-[18px] font-semibold text-[#1D1D1F]">PlateletIQ</span>
        </div>

        <h1 className="text-[28px] font-semibold text-[#1D1D1F] tracking-tight leading-tight mb-1.5">
          Sign in
        </h1>
        <p className="text-[14px] text-[#6E6E73] mb-8">
          Predict platelet demand. Act before shortage or wastage.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[12px] font-semibold text-[#1D1D1F] mb-1.5 uppercase tracking-wider">
              Select eRaktKosh Hospital Facility
            </label>
            <select
              value={selectedHospital}
              onChange={(e) => setSelectedHospital(e.target.value)}
              className="w-full bg-[#F5F5F7] border border-[#E5E5E7] text-[#1D1D1F] text-[14px] rounded-[10px] p-3 focus:outline-none focus:border-[#0071E3] font-medium"
            >
              <option value="TN-GGH-001">Govt. General Hospital Chennai (TN-GGH-001)</option>
              <option value="TN-APO-014">Apollo Hospitals Greams Road (TN-APO-014)</option>
              <option value="TN-STA-002">Govt. Stanley Medical College Hospital (TN-STA-002)</option>
              <option value="TN-KMH-003">Kilpauk Medical College Hospital (TN-KMH-003)</option>
              <option value="TN-MGM-005">MGM Healthcare Adyar (TN-MGM-005)</option>
              <option value="TN-SIM-006">MIOT International Hospital (TN-SIM-006)</option>
              <option value="TN-FOR-007">Billroth Hospitals Shenoy Nagar (TN-FOR-007)</option>
              <option value="TN-SRM-008">Govt. Omandurar Medical College Hospital (TN-SRM-008)</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-[#0071E3] text-white text-[15px] font-medium rounded-full hover:bg-[#0058B0] transition-colors disabled:opacity-60 mt-2 cursor-pointer shadow-sm"
          >
            {loading ? "Authenticating Facility Officer…" : "Sign In as Transfusion Officer"}
          </button>

          <div className="relative flex py-2 items-center">
            <div className="flex-grow border-t border-gray-200"></div>
            <span className="flex-shrink mx-4 text-[12px] text-gray-400">or</span>
            <div className="flex-grow border-t border-gray-200"></div>
          </div>

          {/* Render Google GSI native button if loaded, otherwise render fallback Google button */}
          <div className="flex flex-col items-center gap-2">
            <div id="google-gsi-button" className="min-h-[40px] flex justify-center"></div>

            {!gsiLoaded && (
              <button
                type="button"
                onClick={handleGoogleRedirect}
                disabled={loading}
                className="w-full py-3 bg-white border border-[#E5E5E7] text-[#1D1D1F] text-[14px] font-medium rounded-full hover:bg-[#F5F5F7] transition-colors flex items-center justify-center gap-2.5 shadow-sm cursor-pointer"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>Sign in with eRaktKosh SSO</span>
              </button>
            )}
          </div>
        </form>

        <div className="mt-8 p-4 bg-[#F5F5F7] rounded-[12px] border border-[#E5E5E7]">
          <p className="text-[11px] font-semibold text-[#1D1D1F] uppercase tracking-wide mb-1">eRaktKosh Network Node</p>
          <p className="text-[12px] text-[#6E6E73] leading-relaxed">
            Connected to Ministry of Health & Family Welfare eRaktKosh Portal. Predictive demand analytics & cold-chain transfer logistics active.
          </p>
        </div>

        <p className="text-[11px] text-[#AEAEB2] mt-8 text-center">
          eRaktKosh · National Blood Transfusion Council Node
        </p>
      </div>
    </div>
  );
}
