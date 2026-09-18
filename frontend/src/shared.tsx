import { ReactNode } from "react";
import { motion } from "framer-motion";

// ─── Card ─────────────────────────────────────────────────────────────────────
export function Card({ children, className = "", index = 0 }: { children: ReactNode; className?: string; index?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.08, ease: [0.22, 1, 0.36, 1] }}
      className={`bg-white rounded-[14px] border border-[#E5E5E7] shadow-[0_1px_3px_rgba(0,0,0,0.05)] ${className}`}
    >
      {children}
    </motion.div>
  );
}

// ─── SectionLabel ─────────────────────────────────────────────────────────────
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] font-semibold text-[#AEAEB2] uppercase tracking-widest mb-3">
      {children}
    </p>
  );
}

// ─── StatusBadge ──────────────────────────────────────────────────────────────
export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    HIGH:     "bg-[#FBE8EC] text-[#C41230]",
    MEDIUM:   "bg-[#FFF3E0] text-[#B25000]",
    LOW:      "bg-[#E8F4EB] text-[#1A8A2C]",
    HEALTHY:  "bg-[#E8F4EB] text-[#1A8A2C]",
    WATCH:    "bg-[#FFF3E0] text-[#B25000]",
    CRITICAL: "bg-[#FBE8EC] text-[#C41230]",
  };
  const s = map[status] ?? "bg-[#F5F5F7] text-[#6E6E73]";
  return (
    <span className={`text-[11px] font-semibold uppercase tracking-wide px-2.5 py-[3px] rounded-full ${s}`}>
      {status}
    </span>
  );
}

// ─── FreshnessBadge ───────────────────────────────────────────────────────────
type FreshnessState = "fresh" | "current" | "aging" | "stale" | "very-stale" | "unknown";

export function FreshnessBadge({ state }: { state: FreshnessState }) {
  const map: Record<FreshnessState, { dot: string; text: string; label: string }> = {
    fresh:        { dot: "bg-[#1A8A2C]", text: "text-[#1A8A2C]", label: "Current" },
    current:      { dot: "bg-[#1A8A2C]", text: "text-[#1A8A2C]", label: "Current" },
    aging:        { dot: "bg-[#B25000]", text: "text-[#B25000]", label: "Aging" },
    stale:        { dot: "bg-[#B25000]", text: "text-[#B25000]", label: "Stale" },
    "very-stale": { dot: "bg-[#C41230]", text: "text-[#C41230]", label: "Very stale" },
    unknown:      { dot: "bg-[#AEAEB2]", text: "text-[#6E6E73]", label: "Unknown" },
  };
  const m = map[state] ?? map.unknown;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`w-[6px] h-[6px] rounded-full flex-shrink-0 ${m.dot}`} />
      <span className={`text-[11px] font-medium ${m.text}`}>{m.label}</span>
    </span>
  );
}

// ─── FreshnessLine — simplified, no raw timestamps in main content ─────────────
export function FreshnessLine({
  entry,
  state,
  // legacy props accepted but not displayed
  retrieved: _retrieved,
  age: _age,
}: {
  entry: string;
  state: "fresh" | "stale" | "unknown";
  retrieved?: string;
  age?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[12px] text-[#6E6E73]">
        Source entry: <span className="text-[#1D1D1F]">{entry}</span>
      </span>
      <FreshnessBadge state={state} />
    </div>
  );
}

// ─── Drawer ───────────────────────────────────────────────────────────────────
export function Drawer({
  title, subtitle, onClose, wide, children,
}: {
  title: string; subtitle?: string; onClose: () => void; wide?: boolean; children: ReactNode;
}) {
  return (
    <>
      <div
        className="fixed inset-0 z-40"
        style={{ background: "rgba(0,0,0,0.15)", backdropFilter: "blur(2px)" }}
        onClick={onClose}
      />
      <div
        className={`fixed right-0 top-0 bottom-0 ${wide ? "w-[500px]" : "w-[400px]"} bg-white z-50 flex flex-col`}
        style={{ boxShadow: "-1px 0 0 #E5E5E7, -20px 0 60px rgba(0,0,0,0.08)" }}
      >
        <div className="px-7 py-6 border-b border-[#E5E5E7] flex items-start justify-between flex-shrink-0">
          <div>
            <h2 className="text-[17px] font-semibold text-[#1D1D1F]">{title}</h2>
            {subtitle && <p className="text-[13px] text-[#6E6E73] mt-0.5">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="text-[#AEAEB2] hover:text-[#1D1D1F] transition-colors ml-4"
            style={{ fontSize: 22, lineHeight: 1, marginTop: -2 }}
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-7 py-6">{children}</div>
      </div>
    </>
  );
}

// ─── ProvenanceBadge ──────────────────────────────────────────────────────────
export function ProvenanceBadge({ type }: { type: "live" | "model" | "simulated" | "external" | "demo" }) {
  const map = {
    live:      { symbol: "●", color: "text-[#1A8A2C]", label: "LIVE DATA" },
    model:     { symbol: "■", color: "text-[#0071E3]", label: "MODEL" },
    simulated: { symbol: "■", color: "text-[#B25000]", label: "SIMULATED" },
    external:  { symbol: "■", color: "text-[#6E3FA3]", label: "EXTERNAL SIGNAL" },
    demo:       { symbol: "■", color: "text-[#6E6E73]", label: "DEMO" },
  };
  const m = map[type] ?? map.demo;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold tracking-wide ${m.color}`}>
      <span style={{ fontSize: 7 }}>{m.symbol}</span>
      <span>{m.label}</span>
    </span>
  );
}

// ─── DemoModeBanner ───────────────────────────────────────────────────────────
export function DemoModeBanner() {
  return (
    <div
      className="flex items-center gap-2 px-7 py-2"
      style={{ background: "#F5F5F7", borderBottom: "1px solid #EBEBEB" }}
    >
      <span className="w-2 h-2 rounded-full bg-[#1A8A2C] animate-pulse" />
      <span className="text-[10px] font-semibold tracking-widest text-[#1D1D1F] uppercase">
        eRaktKosh Node Active
      </span>
      <span style={{ color: "#AEAEB2" }}>·</span>
      <span className="text-[12px] text-[#6E6E73]">
        Predictive Demand Engine Active · Continuous daily issue log calibration & cold-chain transfer network online.
      </span>
    </div>
  );
}

// ─── Transfer opportunities data ──────────────────────────────────────────────
export interface TransferOpportunity {
  id: string;
  from: string;
  to: string;
  units: number;
  priority: "HIGH" | "MEDIUM";
  sourceEntry: string;
  sourceFreshness: "fresh" | "stale" | "unknown";
  expiryNote: string;
  reason: string;
}

export const transferOpportunities: TransferOpportunity[] = [
  {
    id: "t1",
    from: "Bangalore Urban Blood Bank",
    to: "GGH Chennai",
    units: 12,
    priority: "HIGH",
    sourceEntry: "Sep 18",
    sourceFreshness: "fresh",
    expiryNote: "Source units expire today — same-day transfer required",
    reason: "Bangalore Urban has 60 SDP units with zero expected local deficit. Chennai projected shortage in 4 days.",
  },
  {
    id: "t2",
    from: "Mumbai City Blood Centre",
    to: "GGH Chennai",
    units: 8,
    priority: "MEDIUM",
    sourceEntry: "Sep 17",
    sourceFreshness: "fresh",
    expiryNote: "Source entry active — verify stock before initiating",
    reason: "Mumbai City surplus stock available for intra-regional balancing.",
  },
];
