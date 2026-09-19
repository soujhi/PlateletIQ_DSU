import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, SectionLabel, StatusBadge, ProvenanceBadge, DemoModeBanner, Drawer } from "../shared";
import { facilityApi, recommendationApi, transferApi, requisitionApi } from "../api/endpoints";
import type { Counterparty } from "../api/types";
import { useAuth } from "../contexts/AuthContext";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { ErrorState } from "../components/ErrorState";

export default function ActionsScreen() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [reviewOpen, setReviewOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [reqOpen, setReqOpen] = useState(false);
  const [transferReviewId, setTransferReviewId] = useState<string | null>(null);
  const [transferMsg, setTransferMsg] = useState<string | null>(null);
  const [reqMsg, setReqMsg] = useState<string | null>(null);

  const [adjustQty, setAdjustQty] = useState(0);
  const [adjustReason, setAdjustReason] = useState("");

  // Requisition Form State
  const [ward, setWard] = useState("ICU Ward 4");
  const [indication, setIndication] = useState("Prophylaxis prior to central line insertion");
  const [plateletCount, setPlateletCount] = useState<number>(18);
  const [bleedingStatus, setBleedingStatus] = useState<boolean>(false);
  const [unitsRequested, setUnitsRequested] = useState<number>(1);
  const [componentRequested, setComponentRequested] = useState<string>("RDP");

  const { data: recData, isLoading: loadingRec, error: recError, refetch } = useQuery({
    queryKey: ["recommendationCurrent"],
    queryFn: recommendationApi.getCurrent,
  });

  // Real transfer candidates: facilities that currently hold usable SDP stock,
  // ranked by how much they hold. Nothing here is suggested unless the other
  // facility actually has the units on its ledger right now.
  const { data: candidates } = useQuery({
    queryKey: ["counterparties", "SDP", user?.bank_id],
    queryFn: () => facilityApi.counterparties("SDP"),
    enabled: Boolean(user?.bank_id),
  });

  const confirmMutation = useMutation({
    mutationFn: (id: string) => recommendationApi.confirm(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recommendationCurrent"] });
      setReviewOpen(false);
    },
    onError: (err: any) => {
      alert(err.response?.data?.detail || "Failed to confirm recommendation");
    },
  });

  const adjustMutation = useMutation({
    mutationFn: ({ id, quantity, reason }: { id: string; quantity: number; reason: string }) =>
      recommendationApi.adjust(id, { quantity, reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recommendationCurrent"] });
      setAdjustOpen(false);
      setReviewOpen(false);
    },
    onError: (err: any) => {
      alert(err.response?.data?.detail || "Reason is required to adjust recommendation");
    },
  });

  const requestUnitsMutation = useMutation({
    mutationFn: ({ facilityId, units }: { facilityId: string; units: number }) =>
      transferApi.create({
        counterparty_bank_id: facilityId,
        direction: "SHORTAGE_PULL",
        units,
        component_type: "SDP",
        priority: "URGENT",
        reason: "Raised from the decision engine against a projected SDP shortfall.",
      }),
    onSuccess: (transfer) => {
      queryClient.invalidateQueries({ queryKey: ["transfers"] });
      setTransferMsg(
        `Request ${transfer.id} sent to ${transfer.source.short_name}. They decide whether to release the units — watch Transfers for their response.`,
      );
      setTransferReviewId(null);
    },
    onError: (err: any) => {
      setTransferMsg(null);
      alert(err?.message || "Could not open the transfer.");
    },
  });

  const reqMutation = useMutation({
    mutationFn: (payload: any) => requisitionApi.create(payload),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["inventorySummary"] });
      setReqMsg(`Requisition ${data.request_ref} submitted! Guideline Note: ${data.guideline_note}`);
      setReqOpen(false);
    },
    onError: (err: any) => {
      alert(err.response?.data?.detail || "Failed to submit requisition");
    },
  });

  if (loadingRec) {
    return (
      <div className="p-8 max-w-3xl space-y-6">
        <LoadingSkeleton height="60px" />
        <LoadingSkeleton height="200px" />
      </div>
    );
  }

  if (recError || !recData) {
    return (
      <div className="p-8 max-w-3xl">
        <ErrorState message="Could not load decision recommendation." onRetry={refetch} />
      </div>
    );
  }

  const rec = recData;
  // Somebody worth asking: the nearest facility that can actually cover a
  // typical 12-unit pull.
  const opportunities: Counterparty[] = (candidates ?? [])
    .filter((candidate) => candidate.available_units >= 12)
    .sort((a, b) => (a.straight_line_km ?? Infinity) - (b.straight_line_km ?? Infinity));
  const selectedTransferOpp = opportunities.find((candidate) => candidate.id === transferReviewId) ?? null;

  const isConfirmed = rec.status === "CONFIRMED";
  const isAdjusted = rec.status === "ADJUSTED";

  // Real-time WHO Transfusion Concordance Evaluator
  const isConcordant = plateletCount < 20 || (plateletCount < 50 && bleedingStatus);

  return (
    <div>
      <DemoModeBanner />

      <div className="p-8 max-w-3xl">
        <div className="flex items-center justify-between mb-8">
          <div>
            <p className="text-[11px] font-semibold text-[#AEAEB2] uppercase tracking-widest mb-1">Actions</p>
            <h1 className="text-[28px] font-bold text-[#1D1D1F] tracking-tight">
              What should we do next?
            </h1>
            <p className="text-[14px] text-[#6E6E73] mt-1 font-light">
              Decision engine · Inter-bank transfers · Clinical requisitions.
            </p>
          </div>
          <button
            onClick={() => setReqOpen(true)}
            className="px-4 py-2.5 bg-[#0071E3] text-white text-[13px] font-semibold rounded-full hover:bg-[#0058B0] transition-colors cursor-pointer"
          >
            + Create Requisition
          </button>
        </div>

        {transferMsg && (
          <div className="mb-5 p-4 bg-[#E8F4EB] border border-[#A5D6A7] rounded-[12px] flex items-center justify-between text-[#1A8A2C] text-[13px] font-medium">
            <span>✓ {transferMsg}</span>
            <button onClick={() => setTransferMsg(null)} className="text-[#1A8A2C] text-[16px] cursor-pointer">✕</button>
          </div>
        )}

        {reqMsg && (
          <div className="mb-5 p-4 bg-[#E8F4EB] border border-[#A5D6A7] rounded-[12px] flex items-center justify-between text-[#1A8A2C] text-[13px] font-medium">
            <span>✓ {reqMsg}</span>
            <button onClick={() => setReqMsg(null)} className="text-[#1A8A2C] text-[16px] cursor-pointer">✕</button>
          </div>
        )}

        {/* Nearest facility that could cover a shortfall */}
        {opportunities.slice(0, 1).map((candidate) => (
          <div
            key={candidate.id}
            className="mb-5 rounded-[14px] border border-[#E5E5E7] bg-white p-6"
            style={{ borderLeft: "4px solid #0071E3" }}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <p className="text-[10px] font-semibold text-[#AEAEB2] uppercase tracking-widest mb-2">
                  Closest facility holding usable SDP
                </p>
                <p className="text-[17px] font-semibold text-[#1D1D1F] mb-1">
                  {candidate.short_name} · {candidate.available_units} usable SDP units
                </p>
                <p className="text-[12px] text-[#6E6E73]">
                  {candidate.straight_line_km !== null
                    ? `${candidate.straight_line_km.toFixed(1)} km away`
                    : "Distance unknown"}
                  {" · "}{candidate.tier}
                  {candidate.expiring_24h > 0 && ` · ${candidate.expiring_24h} of their units expire within 24h`}
                </p>
              </div>
              <button
                onClick={() => setTransferReviewId(candidate.id)}
                className="text-[13px] font-medium text-[#0071E3] bg-[#EAF2FC] px-4 py-2 rounded-full hover:bg-[#D5E8F9] transition-colors flex-shrink-0 cursor-pointer"
              >
                Request units →
              </button>
            </div>
          </div>
        ))}

        {/* Primary recommendation */}
        <Card className="p-7 mb-5">
          <div className="flex items-start justify-between mb-4">
            <p className="text-[11px] font-semibold text-[#AEAEB2] uppercase tracking-widest">Today&apos;s Action</p>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#1A8A2C]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#1A8A2C]" />
              {rec.status || "HEALTHY"}
            </span>
          </div>

          <p className="text-[36px] font-bold text-[#1A8A2C] leading-none tracking-tight mb-3">
            {rec.action} {rec.quantity > 0 ? rec.quantity : ""}
          </p>
          <p className="text-[15px] text-[#1D1D1F] mb-5 leading-snug max-w-lg">
            {rec.reason_summary}
          </p>

          <div className="grid grid-cols-3 gap-4 mb-6 pt-4 border-t border-[#F0F0F0]">
            {[
              { label: "Projected gap",  value: rec.projected_gap || "+41 units", color: "text-[#1A8A2C]" },
              { label: "Horizon",        value: rec.horizon || "7 days",    color: "text-[#1D1D1F]" },
              { label: "Inventory surplus", value: rec.inventory_surplus || "+41 above safety", color: "text-[#1A8A2C]" },
            ].map((m) => (
              <div key={m.label}>
                <p className="text-[10px] text-[#AEAEB2] uppercase tracking-wide mb-1">{m.label}</p>
                <p className={`text-[16px] font-semibold ${m.color}`}>{m.value}</p>
              </div>
            ))}
          </div>

          {!isConfirmed && !isAdjusted ? (
            <div className="flex gap-3">
              <button
                onClick={() => setReviewOpen(true)}
                className="px-5 py-2.5 bg-[#0071E3] text-white text-[13px] font-medium rounded-full hover:bg-[#0058B0] transition-colors cursor-pointer"
              >
                Review action →
              </button>
              <button
                onClick={() => confirmMutation.mutate(rec.id)}
                className="px-5 py-2.5 bg-[#F5F5F7] text-[#1D1D1F] text-[13px] font-medium rounded-full hover:bg-[#EAEAEA] transition-colors cursor-pointer"
              >
                Confirm recommendation
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-[#1A8A2C]">
              <span className="text-[15px]">✓</span>
              <span className="text-[13px] font-medium">{rec.action} {rec.status} · logged in audit trail</span>
            </div>
          )}

          <div className="mt-5 pt-4 border-t border-[#F0F0F0]">
            <ProvenanceBadge type="model" />
          </div>
        </Card>

        {/* Expiry watch */}
        <Card className="p-7">
          <SectionLabel>Expiry watch — next 24 h</SectionLabel>
          {[
            { bag: "RDP-8001", group: "A−", hours: 3, pathway: "No viable pathway",   pathwayColor: "text-[#C41230]" },
            { bag: "RDP-8002", group: "AB+", hours: 5, pathway: "Clinical — ICU",      pathwayColor: "text-[#1A8A2C]" },
            { bag: "SDP-8003", group: "O+",  hours: 6, pathway: "Research / HPL",      pathwayColor: "text-[#6E3FA3]" },
          ].map((u) => (
            <div key={u.bag} className="flex items-center justify-between py-3.5 border-b border-[#F5F5F7]">
              <div>
                <p className="text-[14px] font-semibold text-[#1D1D1F]">{u.bag} · {u.group}</p>
                <p className={`text-[12px] font-medium ${u.pathwayColor}`}>{u.pathway}</p>
              </div>
              <p className="text-[13px] font-semibold text-[#B25000]">{u.hours}h remaining</p>
            </div>
          ))}
        </Card>
      </div>

      {/* Create Requisition Drawer with WHO Concordance Check */}
      {reqOpen && (
        <Drawer
          title="Create Clinical Requisition"
          subtitle="Hospital Order Request & WHO Guideline Concordance Check"
          onClose={() => setReqOpen(false)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              reqMutation.mutate({
                ward,
                clinical_indication: indication,
                platelet_count: plateletCount,
                bleeding_status: bleedingStatus,
                units_requested: unitsRequested,
                component_requested: componentRequested,
              });
            }}
            className="space-y-4"
          >
            <div>
              <label className="block text-[12px] font-semibold text-[#1D1D1F] mb-1">Ward / Unit</label>
              <input
                type="text"
                value={ward}
                onChange={(e) => setWard(e.target.value)}
                className="w-full border border-[#E5E5E7] rounded-[8px] p-2.5 text-[13px]"
                required
              />
            </div>

            <div>
              <label className="block text-[12px] font-semibold text-[#1D1D1F] mb-1">Clinical Indication</label>
              <input
                type="text"
                value={indication}
                onChange={(e) => setIndication(e.target.value)}
                className="w-full border border-[#E5E5E7] rounded-[8px] p-2.5 text-[13px]"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[12px] font-semibold text-[#1D1D1F] mb-1">Patient Platelet Count (×10⁹/L)</label>
                <input
                  type="number"
                  value={plateletCount}
                  onChange={(e) => setPlateletCount(Number(e.target.value))}
                  className="w-full border border-[#E5E5E7] rounded-[8px] p-2.5 text-[13px]"
                  required
                />
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-[#1D1D1F] mb-1">Active Bleeding?</label>
                <select
                  value={bleedingStatus ? "yes" : "no"}
                  onChange={(e) => setBleedingStatus(e.target.value === "yes")}
                  className="w-full border border-[#E5E5E7] rounded-[8px] p-2.5 text-[13px]"
                >
                  <option value="no">No active bleeding (Prophylactic)</option>
                  <option value="yes">Yes active bleeding (Therapeutic)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[12px] font-semibold text-[#1D1D1F] mb-1">Units Requested</label>
                <input
                  type="number"
                  min={1}
                  max={6}
                  value={unitsRequested}
                  onChange={(e) => setUnitsRequested(Number(e.target.value))}
                  className="w-full border border-[#E5E5E7] rounded-[8px] p-2.5 text-[13px]"
                />
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-[#1D1D1F] mb-1">Component Type</label>
                <select
                  value={componentRequested}
                  onChange={(e) => setComponentRequested(e.target.value)}
                  className="w-full border border-[#E5E5E7] rounded-[8px] p-2.5 text-[13px]"
                >
                  <option value="RDP">RDP (Random Donor Platelets)</option>
                  <option value="SDP">SDP (Single Donor Platelets)</option>
                </select>
              </div>
            </div>

            {/* WHO Guideline Concordance Preview Box */}
            <div className={`p-4 rounded-[10px] border ${isConcordant ? "bg-[#E8F4EB] border-[#A5D6A7]" : "bg-[#FFF8E7] border-[#F5D99A]"}`}>
              <div className="flex items-center justify-between mb-1">
                <span className={`text-[12px] font-bold ${isConcordant ? "text-[#1A8A2C]" : "text-[#BA7517]"}`}>
                  {isConcordant ? "✓ WHO Guideline Concordant" : "⚠ Non-Concordant Order (Requires Review)"}
                </span>
              </div>
              <p className="text-[11px] text-[#1D1D1F] leading-relaxed">
                {isConcordant
                  ? `Platelet count (${plateletCount} ×10⁹/L) satisfies WHO guideline protocol.`
                  : `Platelet count (${plateletCount} ×10⁹/L) without active bleeding exceeds standard prophylactic threshold (<20 ×10⁹/L).`}
              </p>
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-[#0071E3] text-white text-[14px] font-semibold rounded-full hover:bg-[#0058B0] transition-colors cursor-pointer mt-2"
            >
              Submit Clinical Requisition
            </button>
          </form>
        </Drawer>
      )}

      {/* Review Transfer Opportunity Drawer */}
      {transferReviewId && selectedTransferOpp && (
        <Drawer
          title="Request units"
          subtitle={`${user?.bank_name} ← ${selectedTransferOpp.short_name}`}
          onClose={() => setTransferReviewId(null)}
        >
          <div className="space-y-5">
            <div className="bg-[#E8F2FD] rounded-[12px] p-5 border border-[#B5D4F4]">
              <p className="text-[14px] font-bold text-[#0071E3] mb-1">{selectedTransferOpp.name}</p>
              <p className="text-[13px] text-[#1D1D1F] leading-relaxed">
                {selectedTransferOpp.address}
              </p>
            </div>

            <div>
              <SectionLabel>What they currently hold</SectionLabel>
              <div className="space-y-3">
                <div className="flex justify-between py-2 border-b border-[#F5F5F7]">
                  <span className="text-[13px] text-[#6E6E73]">Usable SDP units</span>
                  <span className="text-[14px] font-bold text-[#0071E3]">{selectedTransferOpp.available_units}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-[#F5F5F7]">
                  <span className="text-[13px] text-[#6E6E73]">Expiring within 24h</span>
                  <span className="text-[13px] font-bold text-[#1D1D1F]">{selectedTransferOpp.expiring_24h}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-[#F5F5F7]">
                  <span className="text-[13px] text-[#6E6E73]">Distance</span>
                  <span className="text-[13px] font-bold text-[#1D1D1F]">
                    {selectedTransferOpp.straight_line_km !== null
                      ? `${selectedTransferOpp.straight_line_km.toFixed(1)} km`
                      : "Unknown"}
                  </span>
                </div>
                <div className="flex justify-between py-2 border-b border-[#F5F5F7]">
                  <span className="text-[13px] text-[#6E6E73]">eRaktKosh code</span>
                  <span className="text-[13px] font-mono text-[#1D1D1F]">{selectedTransferOpp.code}</span>
                </div>
              </div>
            </div>

            <p className="text-[12px] text-[#6E6E73] leading-relaxed">
              This sends a request. {selectedTransferOpp.short_name} decides whether to release the
              units, and controls the handover with a one-time code.
            </p>

            <button
              onClick={() =>
                requestUnitsMutation.mutate({ facilityId: selectedTransferOpp.id, units: 12 })
              }
              disabled={requestUnitsMutation.isPending}
              className="w-full py-3 bg-[#0071E3] text-white text-[14px] font-semibold rounded-full hover:bg-[#0058B0] transition-colors cursor-pointer disabled:opacity-50"
            >
              {requestUnitsMutation.isPending ? "Sending…" : "Request 12 SDP units"}
            </button>
          </div>
        </Drawer>
      )}

      {/* Evidence drawer */}
      {reviewOpen && (
        <Drawer title={`${rec.action} — Evidence`} subtitle="Why this recommendation?" onClose={() => setReviewOpen(false)} wide>
          <div className="space-y-6">
            <div className="bg-[#E8F4EB] rounded-[12px] p-5">
              <p className="text-[13px] font-semibold text-[#1A8A2C] mb-1">Inventory surplus confirmed</p>
              <p className="text-[13px] text-[#1D1D1F] leading-relaxed">
                48 units available. 7-day forecast demand: 177 units. Buffer: +41 units above safety stock.
              </p>
            </div>
            <div>
              <SectionLabel>Evidence chain</SectionLabel>
              {(rec.drivers || []).map((d: string, i: number) => (
                <div key={i} className="flex gap-4 py-3.5 border-b border-[#F5F5F7]">
                  <span className="w-5 h-5 rounded-full bg-[#F0F0F0] text-[10px] font-bold text-[#6E6E73] flex items-center justify-center flex-shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <div>
                    <p className="text-[13px] font-semibold text-[#1D1D1F]">{d}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => confirmMutation.mutate(rec.id)}
                className="flex-1 py-3 bg-[#1A8A2C] text-white text-[14px] font-medium rounded-full hover:bg-[#157424] transition-colors cursor-pointer"
              >
                Confirm {rec.action}
              </button>
              <button
                onClick={() => setAdjustOpen(true)}
                className="flex-1 py-3 bg-[#F5F5F7] text-[#1D1D1F] text-[14px] font-medium rounded-full hover:bg-[#EAEAEA] transition-colors cursor-pointer"
              >
                Adjust
              </button>
            </div>
          </div>
        </Drawer>
      )}

      {/* Adjust Modal */}
      {adjustOpen && (
        <Drawer title="Adjust Recommendation" onClose={() => setAdjustOpen(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-[12px] font-semibold text-[#1D1D1F] mb-1">Adjusted Quantity</label>
              <input
                type="number"
                value={adjustQty}
                onChange={(e) => setAdjustQty(Number(e.target.value))}
                className="w-full border border-[#E5E5E7] rounded-[8px] p-2.5 text-[13px]"
              />
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-[#1D1D1F] mb-1">Mandatory Reason</label>
              <textarea
                placeholder="State why this recommendation is being adjusted..."
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                className="w-full border border-[#E5E5E7] rounded-[8px] p-2.5 text-[13px] h-24"
              />
            </div>
            <button
              onClick={() => adjustMutation.mutate({ id: rec.id, quantity: adjustQty, reason: adjustReason })}
              className="w-full py-3 bg-[#0071E3] text-white text-[13px] font-semibold rounded-full mt-4 cursor-pointer"
            >
              Submit Adjustment
            </button>
          </div>
        </Drawer>
      )}
    </div>
  );
}
