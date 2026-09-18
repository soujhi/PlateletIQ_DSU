import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, SectionLabel, StatusBadge, FreshnessLine, Drawer, ProvenanceBadge } from "../shared";
import { transferApi } from "../api/endpoints";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { ErrorState } from "../components/ErrorState";

const atRisk = [
  {
    id: "u1", bag: "DEMO-RDP-0001", type: "RDP", group: "O+",
    expires: "Today 23:00", hoursLeft: 9, units: 1,
    pathway: "transfer" as const,
    dest: "Bangalore Urban · 60 SDP available",
  },
  {
    id: "u2", bag: "DEMO-RDP-0002", type: "RDP", group: "A+",
    expires: "Today 21:30", hoursLeft: 7.5, units: 1,
    pathway: "transfer" as const,
    dest: "Mumbai City · 25 SDP available",
  },
  {
    id: "u3", bag: "DEMO-SDP-0003", type: "SDP", group: "O+",
    expires: "Today 20:00", hoursLeft: 6, units: 1,
    pathway: "research" as const,
    dest: "Approved for HPL production · Research Unit",
  },
  {
    id: "u4", bag: "DEMO-RDP-0004", type: "RDP", group: "B+",
    expires: "Today 22:15", hoursLeft: 8, units: 1,
    pathway: "research" as const,
    dest: "Approved for HPL production · Research Unit",
  },
];

const PATHWAY_META = {
  clinical:  { label: "Clinical allocation",   color: "text-[#1A8A2C]", bg: "bg-[#E6F4E8]", border: "border-l-[#1A8A2C]" },
  transfer:  { label: "Transfer opportunity",  color: "text-[#0071E3]", bg: "bg-[#E8F1FC]", border: "border-l-[#0071E3]" },
  research:  { label: "Research / HPL",        color: "text-[#6E3FA3]", bg: "bg-[#F3EAFC]", border: "border-l-[#6E3FA3]" },
  discard:   { label: "Discard",               color: "text-[#C41230]", bg: "bg-[#FBE8EC]", border: "border-l-[#C41230]" },
};

export default function TransfersScreen() {
  const queryClient = useQueryClient();
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [pendingMsg, setPendingMsg] = useState<string | null>(null);

  const { data: opps, isLoading, error, refetch } = useQuery({
    queryKey: ["transferOpportunities"],
    queryFn: transferApi.getOpportunities,
  });

  const offerMutation = useMutation({
    mutationFn: ({ oppId, quantity }: { oppId: string; quantity: number }) =>
      transferApi.makeOffer(oppId, { quantity }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transferOpportunities"] });
      setPendingMsg("Transfer offer submitted! Awaiting receiving-bank acceptance.");
      setReviewId(null);
    },
  });

  if (isLoading) {
    return (
      <div className="p-8 max-w-3xl space-y-6">
        <LoadingSkeleton height="150px" />
        <LoadingSkeleton height="240px" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 max-w-3xl">
        <ErrorState message="Could not load transfer opportunities." onRetry={refetch} />
      </div>
    );
  }

  const opportunities = opps || [];
  const selectedOpp = opportunities.find((o: any) => o.id === reviewId);

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-8">
        <h1 className="text-[28px] font-semibold text-[#1D1D1F] tracking-tight">
          Transfers & Recovery
        </h1>
        <p className="text-[14px] text-[#6E6E73] mt-1">
          Units at expiry risk today — ranked by recovery pathway
        </p>
      </div>

      {pendingMsg && (
        <div className="mb-5 px-4 py-3 bg-[#E8F1FC] border border-[#C8DCF5] rounded-[10px] flex items-center justify-between">
          <p className="text-[13px] text-[#0071E3] font-medium">{pendingMsg}</p>
          <button onClick={() => setPendingMsg(null)} className="text-[#0071E3] text-[18px] leading-none">×</button>
        </div>
      )}

      {/* Cross-bank transfer opportunities */}
      <Card className="p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <SectionLabel>Cross-bank transfer opportunities</SectionLabel>
          <ProvenanceBadge type="external" />
        </div>
        <p className="text-[12px] text-[#6E6E73] mb-4">
          Identified from surplus stock at nearby hospitals. Acceptance, logistics and blood-group compatibility remain human responsibilities.
        </p>

        <div className="space-y-3">
          {opportunities.map((t: any) => (
            <div key={t.id} className="border-l-4 border-l-[#0071E3] bg-[#F9F9FB] rounded-r-[10px] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[14px] font-semibold text-[#1D1D1F]">
                      {t.from} → {t.to}
                    </span>
                    <span className="text-[13px] text-[#6E6E73]">· {t.units} units</span>
                  </div>
                  <p className="text-[12px] text-[#6E6E73] mt-1">{t.reason}</p>
                </div>
                <button
                  onClick={() => setReviewId(t.id)}
                  className="text-[13px] font-medium text-[#0071E3] bg-[#E8F1FC] px-3 py-1.5 rounded-full hover:bg-[#D0E4F8] transition-colors flex-shrink-0"
                >
                  Review →
                </button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* At-risk unit list */}
      <Card className="p-6 mb-6">
        <SectionLabel>Units expiring today — by pathway</SectionLabel>
        <p className="text-[12px] text-[#6E6E73] mb-4">
          Ordered by hours remaining.
        </p>

        <div className="space-y-2">
          {atRisk.map((u) => {
            const m = PATHWAY_META[u.pathway];
            return (
              <div key={u.id} className={`border-l-4 ${m.border} rounded-r-[10px] p-4`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[13px] font-semibold text-[#1D1D1F]">{u.bag}</span>
                      <span className="text-[11px] text-[#6E6E73]">{u.type} · {u.group}</span>
                      <span className={`text-[11px] font-medium ${m.color}`}>{m.label}</span>
                    </div>
                    <p className="text-[12px] text-[#B25000] font-medium">⏱ {u.hoursLeft}h remaining</p>
                    <p className="text-[12px] text-[#6E6E73] mt-0.5">{u.dest}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Transfer review drawer */}
      {selectedOpp && (
        <Drawer
          title="Transfer review"
          subtitle={`${selectedOpp.from} → ${selectedOpp.to}`}
          onClose={() => setReviewId(null)}
        >
          <div className="space-y-5">
            <div>
              <SectionLabel>Details</SectionLabel>
              <p className="text-[14px] text-[#1D1D1F] mb-2">{selectedOpp.reason}</p>
              <p className="text-[13px] text-[#6E6E73]">Available Units: {selectedOpp.units}</p>
            </div>
            <button
              onClick={() => offerMutation.mutate({ oppId: selectedOpp.id, quantity: selectedOpp.units })}
              className="w-full py-3 bg-[#0071E3] text-white text-[14px] font-semibold rounded-full hover:bg-[#0058B0] transition-colors"
            >
              Submit Transfer Offer
            </button>
          </div>
        </Drawer>
      )}
    </div>
  );
}
