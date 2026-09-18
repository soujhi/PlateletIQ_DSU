import { useState } from "react";
import { Card, SectionLabel, StatusBadge, FreshnessBadge, FreshnessLine, Drawer, transferOpportunities } from "../shared";

// ─── Data ────────────────────────────────────────────────────────────────────

const atRisk = [
  {
    id: "u1", bag: "RDP-0241", type: "RDP", group: "O+",
    expires: "Today 23:00", hoursLeft: 9, units: 1,
    pathway: "transfer" as const,
    dest: "Max Saket · 4.2 km · shortage 8 units",
  },
  {
    id: "u2", bag: "RDP-0198", type: "RDP", group: "A+",
    expires: "Today 21:30", hoursLeft: 7.5, units: 1,
    pathway: "transfer" as const,
    dest: "Safdarjung · 7.8 km · shortage 3 units",
  },
  {
    id: "u3", bag: "SDP-0077", type: "SDP", group: "O+",
    expires: "Today 20:00", hoursLeft: 6, units: 1,
    pathway: "research" as const,
    dest: "Approved for HPL production · AIIMS Research Unit",
  },
  {
    id: "u4", bag: "RDP-0199", type: "RDP", group: "B+",
    expires: "Today 22:15", hoursLeft: 8, units: 1,
    pathway: "research" as const,
    dest: "Approved for HPL production · AIIMS Research Unit",
  },
  {
    id: "u5", bag: "RDP-0203", type: "RDP", group: "AB+",
    expires: "Today 19:45", hoursLeft: 5, units: 1,
    pathway: "clinical" as const,
    dest: "ICU · Req #4472 · platelet count 12k",
  },
  {
    id: "u6", bag: "RDP-0204", type: "RDP", group: "A-",
    expires: "Today 18:00", hoursLeft: 3, units: 1,
    pathway: "discard" as const,
    dest: "No viable pathway — no compatible shortage, no research slot",
  },
];

const PATHWAY_META = {
  clinical:  { label: "Clinical allocation",   color: "text-[#1A8A2C]", bg: "bg-[#E6F4E8]", border: "border-l-[#1A8A2C]" },
  transfer:  { label: "Transfer opportunity",  color: "text-[#0071E3]", bg: "bg-[#E8F1FC]", border: "border-l-[#0071E3]" },
  research:  { label: "Research / HPL",        color: "text-[#6E3FA3]", bg: "bg-[#F3EAFC]", border: "border-l-[#6E3FA3]" },
  discard:   { label: "Discard",               color: "text-[#C41230]", bg: "bg-[#FBE8EC]", border: "border-l-[#C41230]" },
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function TransfersScreen() {
  const [reviewId,   setReviewId]   = useState<string | null>(null);
  const [unitId,     setUnitId]     = useState<string | null>(null);
  const [offered,    setOffered]    = useState<Set<string>>(new Set());
  const [confirmed,  setConfirmed]  = useState<Set<string>>(new Set());
  const [pendingMsg, setPendingMsg] = useState<string | null>(null);

  const opportunity = transferOpportunities.find(t => t.id === reviewId);
  const unit        = atRisk.find(u => u.id === unitId);

  const counts = {
    clinical: atRisk.filter(u => u.pathway === "clinical").length,
    transfer: atRisk.filter(u => u.pathway === "transfer").length,
    research: atRisk.filter(u => u.pathway === "research").length,
    discard:  atRisk.filter(u => u.pathway === "discard").length,
  };
  const recoverable = counts.clinical + counts.transfer + counts.research;

  function handleOffer(id: string, msg: string) {
    setOffered(prev => new Set(prev).add(id));
    setPendingMsg(msg);
    setReviewId(null);
    setUnitId(null);
  }

  return (
    <div className="p-8 max-w-3xl">

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-[28px] font-semibold text-[#1D1D1F] tracking-tight">
          Transfers & Recovery
        </h1>
        <p className="text-[14px] text-[#6E6E73] mt-1">
          Units at expiry risk today — ranked by recovery pathway
        </p>
      </div>

      {/* Pending confirmation toast */}
      {pendingMsg && (
        <div className="mb-5 px-4 py-3 bg-[#E8F1FC] border border-[#C8DCF5] rounded-[10px] flex items-center justify-between">
          <p className="text-[13px] text-[#0071E3] font-medium">{pendingMsg}</p>
          <button onClick={() => setPendingMsg(null)} className="text-[#0071E3] text-[18px] leading-none">×</button>
        </div>
      )}

      {/* Summary card — same structure as Waste Recovery */}
      <Card className="p-6 mb-6">
        <SectionLabel>Units at risk today</SectionLabel>
        <div className="grid grid-cols-2 gap-6 mb-6">
          <div>
            <p className="text-[40px] font-bold text-[#B25000] leading-none">{atRisk.length}</p>
            <p className="text-[13px] text-[#6E6E73] mt-1">units at risk of expiry</p>
          </div>
          <div>
            <p className="text-[40px] font-bold text-[#0071E3] leading-none">{recoverable}</p>
            <p className="text-[13px] text-[#6E6E73] mt-1">with a recovery pathway</p>
          </div>
        </div>

        <SectionLabel>Breakdown</SectionLabel>
        <div className="space-y-0">
          {(["clinical", "transfer", "research", "discard"] as const).map(k => {
            const m = PATHWAY_META[k];
            return (
              <div key={k} className="flex justify-between items-center py-3 border-b border-[#F5F5F7]">
                <div>
                  <span className="text-[14px] text-[#6E6E73]">{m.label}</span>
                  {k === "research" && (
                    <p className="text-[11px] text-[#6E6E73] mt-0.5">
                      Human platelet lysate — approved non-clinical use
                    </p>
                  )}
                </div>
                <span className={`text-[22px] font-semibold ${m.color}`}>{counts[k]}</span>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Cross-bank transfer opportunities */}
      <Card className="p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <SectionLabel>Cross-bank transfer opportunities</SectionLabel>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-[#1A8A2C]" />
            <span className="text-[11px] text-[#6E6E73]">eRaktKosh · scraped 09:20</span>
          </div>
        </div>
        <p className="text-[12px] text-[#6E6E73] mb-4">
          Identified from surplus stock at nearby hospitals. Acceptance, logistics and blood-group
          compatibility remain human responsibilities.
        </p>

        <div className="space-y-3">
          {transferOpportunities.map(t => {
            const isOffered = offered.has(t.id);
            return (
              <div key={t.id} className={`border-l-4 ${t.priority === "HIGH" ? "border-l-[#C41230]" : "border-l-[#B25000]"} bg-[#F9F9FB] rounded-r-[10px] p-4`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <StatusBadge status={t.priority} />
                      <span className="text-[14px] font-semibold text-[#1D1D1F]">
                        {t.from} → {t.to}
                      </span>
                      <span className="text-[13px] text-[#6E6E73]">· {t.units} units</span>
                    </div>
                    <FreshnessLine
                      entry={t.sourceEntry}
                      retrieved="Sep 7, 09:20"
                      age="38 min"
                      state={t.sourceFreshness}
                    />
                    <p className="text-[12px] text-[#B25000] mt-1.5 font-medium">{t.expiryNote}</p>
                    <p className="text-[12px] text-[#6E6E73] mt-1">{t.reason}</p>
                  </div>
                  {isOffered ? (
                    <span className="text-[11px] text-[#6E6E73] bg-white border border-[#E5E5E7] px-2.5 py-1 rounded-full flex-shrink-0">
                      Offer sent
                    </span>
                  ) : (
                    <button
                      onClick={() => setReviewId(t.id)}
                      className="text-[13px] font-medium text-[#0071E3] bg-[#E8F1FC] px-3 py-1.5 rounded-full hover:bg-[#D0E4F8] transition-colors flex-shrink-0"
                    >
                      Review →
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* At-risk unit list */}
      <Card className="p-6 mb-6">
        <SectionLabel>Units expiring today — by pathway</SectionLabel>
        <p className="text-[12px] text-[#6E6E73] mb-4">
          Ordered by hours remaining. Tap a unit to act.
        </p>

        <div className="space-y-2">
          {atRisk.map(u => {
            const m    = PATHWAY_META[u.pathway];
            const done = confirmed.has(u.id);
            return (
              <div
                key={u.id}
                onClick={() => !done && setUnitId(u.id)}
                className={`border-l-4 ${m.border} rounded-r-[10px] p-4 cursor-pointer hover:bg-[#F5F5F7] transition-colors ${done ? "opacity-50 pointer-events-none" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[13px] font-semibold text-[#1D1D1F]">{u.bag}</span>
                      <span className="text-[11px] text-[#6E6E73]">{u.type} · {u.group}</span>
                      <span className={`text-[11px] font-medium ${m.color}`}>{m.label}</span>
                    </div>
                    <p className="text-[12px] text-[#B25000] font-medium">
                      ⏱ {u.hoursLeft}h remaining — expires {u.expires}
                    </p>
                    <p className="text-[12px] text-[#6E6E73] mt-0.5">{u.dest}</p>
                  </div>
                  {done ? (
                    <span className="text-[11px] text-[#1A8A2C]">✓ Done</span>
                  ) : (
                    <span className="text-[12px] text-[#6E6E73]">→</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* HPL info card */}
      <Card className="p-5">
        <SectionLabel>About human platelet lysate (HPL)</SectionLabel>
        <p className="text-[13px] text-[#1D1D1F] mt-1 mb-3">
          Expired platelet concentrates can be converted into HPL — a cell-culture supplement used
          in stem cell and regenerative medicine research, replacing fetal bovine serum.
        </p>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Clinical equivalence", value: "Comparable post-transfusion recovery to fresh SDP", src: "Jonsdottir-Buch et al., PLoS ONE 2013" },
            { label: "Availability", value: "Fresh and expired concentrates perform equally for HPL", src: "PubMed 25198449" },
          ].map(r => (
            <div key={r.label} className="bg-[#F3EAFC] rounded-[10px] p-3">
              <p className="text-[11px] text-[#6E3FA3] font-medium uppercase tracking-wide mb-1">{r.label}</p>
              <p className="text-[12px] text-[#1D1D1F]">{r.value}</p>
              <p className="text-[11px] text-[#6E6E73] mt-1 italic">{r.src}</p>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-[#6E6E73] mt-3">
          PlateletIQ identifies a possible research pathway. Suitability and institutional approval
          remain the responsibility of the blood bank and partner facility.
        </p>
      </Card>

      {/* Transfer review drawer */}
      {reviewId && opportunity && (
        <Drawer
          title="Transfer review"
          subtitle={`${opportunity.from} → ${opportunity.to}`}
          onClose={() => setReviewId(null)}
          wide
        >
          <div className="space-y-5">
            <StatusBadge status={opportunity.priority} />

            <div>
              <SectionLabel>Details</SectionLabel>
              {[
                { label: "Source",             value: opportunity.from },
                { label: "Destination",        value: opportunity.to },
                { label: "Potential quantity", value: `${opportunity.units} units` },
              ].map(r => (
                <div key={r.label} className="flex justify-between py-2.5 border-b border-[#F5F5F7]">
                  <span className="text-[14px] text-[#6E6E73]">{r.label}</span>
                  <span className="text-[14px] font-semibold text-[#1D1D1F]">{r.value}</span>
                </div>
              ))}
            </div>

            <div>
              <SectionLabel>Source freshness</SectionLabel>
              <FreshnessLine
                entry={opportunity.sourceEntry}
                retrieved="Sep 7, 09:20"
                age="38 min"
                state={opportunity.sourceFreshness}
              />
              <p className="text-[12px] text-[#6E6E73] mt-2">
                "Retrieved 09:20" is when PlateletIQ fetched the record — not when the bank last
                updated it. The source entry date is the key freshness field.
              </p>
            </div>

            <div className="bg-[#F5F5F7] rounded-[10px] p-4">
              <SectionLabel>Reason</SectionLabel>
              <p className="text-[13px] text-[#1D1D1F]">{opportunity.reason}</p>
              <p className="text-[12px] text-[#B25000] mt-2 font-medium">{opportunity.expiryNote}</p>
            </div>

            <p className="text-[12px] text-[#6E6E73]">
              Transfer requires receiving-bank acceptance plus operational, regulatory, storage
              and logistics checks. Only aggregate cross-bank information is shown here.
            </p>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => handleOffer(opportunity.id, `Transfer offer sent · ${opportunity.from} → ${opportunity.to} · Pending acceptance`)}
                className="flex-1 py-2.5 bg-[#0071E3] text-white text-[14px] font-medium rounded-full hover:bg-[#0058B0] transition-colors"
              >
                Offer transfer
              </button>
              <button
                onClick={() => setReviewId(null)}
                className="flex-1 py-2.5 bg-[#F5F5F7] text-[#1D1D1F] text-[14px] font-medium rounded-full hover:bg-[#E5E5E7] transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </Drawer>
      )}

      {/* Unit action drawer */}
      {unitId && unit && (
        <Drawer
          title={unit.bag}
          subtitle={`${unit.type} · ${unit.group} · expires ${unit.expires}`}
          onClose={() => setUnitId(null)}
        >
          <div className="space-y-5">
            <div className={`${PATHWAY_META[unit.pathway].bg} rounded-[10px] p-4`}>
              <p className={`text-[13px] font-semibold ${PATHWAY_META[unit.pathway].color}`}>
                {PATHWAY_META[unit.pathway].label}
              </p>
              <p className="text-[13px] text-[#1D1D1F] mt-1">{unit.dest}</p>
            </div>

            <div>
              <p className="text-[12px] text-[#B25000] font-medium mb-1">
                ⏱ {unit.hoursLeft} hours remaining
              </p>
              <p className="text-[12px] text-[#6E6E73]">
                {unit.pathway === "research"
                  ? "Routing this unit to HPL production prevents a discard. Requires partner facility confirmation."
                  : unit.pathway === "transfer"
                  ? "Review the cross-bank transfer opportunity above to action this unit."
                  : unit.pathway === "clinical"
                  ? "Clinical allocation is already pending. Issue via the Requisitions screen."
                  : "No viable recovery pathway identified. This unit will be discarded and logged."}
              </p>
            </div>

            {unit.pathway === "research" && (
              <button
                onClick={() => {
                  setConfirmed(prev => new Set(prev).add(unit.id));
                  handleOffer(unit.id, `HPL pathway confirmed · ${unit.bag} · routed to research unit`);
                }}
                className="w-full py-2.5 bg-[#6E3FA3] text-white text-[14px] font-medium rounded-full hover:bg-[#5C2E8F] transition-colors"
              >
                Confirm HPL routing
              </button>
            )}
            {unit.pathway === "discard" && (
              <button
                onClick={() => {
                  setConfirmed(prev => new Set(prev).add(unit.id));
                  handleOffer(unit.id, `Discard logged · ${unit.bag} · reason: no viable pathway`);
                }}
                className="w-full py-2.5 bg-[#F5F5F7] text-[#C41230] text-[14px] font-medium rounded-full border border-[#C41230] hover:bg-[#FBE8EC] transition-colors"
              >
                Log discard
              </button>
            )}
            <button onClick={() => setUnitId(null)} className="w-full py-2 text-[13px] text-[#6E6E73]">
              Close
            </button>
          </div>
        </Drawer>
      )}

    </div>
  );
}
