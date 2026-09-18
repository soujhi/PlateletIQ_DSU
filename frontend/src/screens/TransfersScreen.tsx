import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, SectionLabel, Drawer, ProvenanceBadge } from "../shared";
import { transferApi } from "../api/endpoints";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { ErrorState } from "../components/ErrorState";

export default function TransfersScreen() {
  const queryClient = useQueryClient();
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [pendingMsg, setPendingMsg] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<string>("shiprocket");

  const { data: opps, isLoading, error, refetch } = useQuery({
    queryKey: ["transferOpportunities"],
    queryFn: transferApi.getOpportunities,
  });

  const offerMutation = useMutation({
    mutationFn: ({ oppId, quantity }: { oppId: string; quantity: number }) =>
      transferApi.makeOffer(oppId, { quantity }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transferOpportunities"] });
      setPendingMsg("Shiprocket Transfer Accepted! Units reserved & adhoc delivery dispatched with 20–24 °C instructions.");
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
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-semibold text-[#1D1D1F] tracking-tight">
            Transfers & Transport Dispatch
          </h1>
          <p className="text-[14px] text-[#6E6E73] mt-1">
            Shiprocket + Mapbox Logistics Integration · Cold-Chain 20–24 °C Tracking
          </p>
        </div>
        <div className="flex items-center gap-2 bg-[#F5F5F7] p-1 rounded-full border border-[#E5E5E7]">
          {["shiprocket", "porter", "internal", "beckn"].map((p) => (
            <button
              key={p}
              onClick={() => setSelectedProvider(p)}
              className={`px-3 py-1 rounded-full text-[12px] font-medium transition-all ${
                selectedProvider === p
                  ? "bg-white text-[#0071E3] shadow-sm font-semibold"
                  : "text-[#6E6E73] hover:text-[#1D1D1F]"
              }`}
            >
              {p === "shiprocket" ? "Shiprocket API" : p === "porter" ? "Porter API" : p === "internal" ? "Internal Fleet" : "ONDC Beckn"}
            </button>
          ))}
        </div>
      </div>

      {pendingMsg && (
        <div className="mb-5 px-4 py-3 bg-[#E8F1FC] border border-[#C8DCF5] rounded-[10px] flex items-center justify-between">
          <p className="text-[13px] text-[#0071E3] font-medium">{pendingMsg}</p>
          <button onClick={() => setPendingMsg(null)} className="text-[#0071E3] text-[18px] leading-none">×</button>
        </div>
      )}

      {/* Active Transfer Card with Mapbox & Shiprocket Info */}
      <Card className="p-6 mb-6 border-l-4 border-l-[#0071E3] bg-gradient-to-br from-white to-[#F9FAFB]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#1A8A2C] animate-pulse" />
            <SectionLabel>Active Platelet Transfer · In Transit</SectionLabel>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 text-[11px] font-semibold rounded-full bg-[#E8F1FC] text-[#0071E3] border border-[#C8DCF5]">
              AWB: AWB-SR-998877
            </span>
            <span className="px-2.5 py-0.5 text-[11px] font-semibold rounded-full bg-[#F5F5F7] text-[#1D1D1F] border border-[#E5E5E7]">
              {selectedProvider.toUpperCase()}
            </span>
          </div>
        </div>

        <div className="my-3 p-4 bg-white rounded-[12px] border border-[#E5E5E7] shadow-sm">
          <div className="flex items-center justify-between text-[15px] font-semibold text-[#1D1D1F] mb-2">
            <span>📍 Govt. General Hospital Chennai</span>
            <span className="text-[#0071E3]">→ 12 SDP Units →</span>
            <span>📍 Apollo Hospitals Greams Road</span>
          </div>

          <div className="grid grid-cols-3 gap-3 text-center my-3 py-2.5 bg-[#F5F5F7] rounded-[8px]">
            <div>
              <p className="text-[10px] uppercase font-bold text-[#AEAEB2]">Mapbox ETA</p>
              <p className="text-[16px] font-bold text-[#1D1D1F]">18 mins</p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-[#AEAEB2]">Distance</p>
              <p className="text-[16px] font-bold text-[#1D1D1F]">8.4 km</p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-[#AEAEB2]">Courier Partner</p>
              <p className="text-[13px] font-bold text-[#0071E3]">Delhivery Express (Shiprocket)</p>
            </div>
          </div>

          <div className="p-2.5 bg-[#FFF8E1] border border-[#FFE082] rounded-[8px] text-[11px] text-[#B25000]">
            <span className="font-bold">🧊 Cold-Chain Instruction:</span> Medical cargo (Category: MEDICAL_PERISHABLE) — keep upright at 20–24 °C. Do NOT refrigerate.
          </div>
        </div>

        {/* 10-State Lifecycle Progress Track */}
        <div className="mt-4 pt-3 border-t border-[#E5E5E7]">
          <p className="text-[11px] uppercase font-bold text-[#AEAEB2] mb-2">State Machine Lifecycle</p>
          <div className="flex items-center justify-between text-[10px] font-medium text-[#6E6E73]">
            <span className="text-[#1A8A2C] font-semibold">✓ Proposed</span>
            <span className="text-[#1A8A2C] font-semibold">✓ Eligibility Check</span>
            <span className="text-[#1A8A2C] font-semibold">✓ Accepted (Reserved)</span>
            <span className="text-[#1A8A2C] font-semibold">✓ Shiprocket Order</span>
            <span className="text-[#0071E3] font-bold animate-pulse">● In Transit</span>
            <span className="text-[#AEAEB2]">○ Received</span>
          </div>
        </div>
      </Card>

      {/* Eligible Candidate Transfers */}
      <Card className="p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <SectionLabel>Eligible Candidate Network Transfers</SectionLabel>
          <ProvenanceBadge type="external" />
        </div>
        <p className="text-[12px] text-[#6E6E73] mb-4">
          Evaluated via Mapbox Matrix travel times, shelf-life residual, and source transferable surplus.
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
                  Review Transfer →
                </button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Transfer review drawer */}
      {selectedOpp && (
        <Drawer
          title="Review & Dispatch Transfer Order"
          subtitle={`${selectedOpp.from} → ${selectedOpp.to}`}
          onClose={() => setReviewId(null)}
        >
          <div className="space-y-5">
            <div>
              <SectionLabel>Mapbox Routing & Shiprocket Dispatch</SectionLabel>
              <p className="text-[14px] text-[#1D1D1F] mb-2">{selectedOpp.reason}</p>
              <p className="text-[13px] text-[#6E6E73]">Available Surplus: {selectedOpp.units} units</p>
              <p className="text-[13px] text-[#6E6E73]">Active Provider: <strong className="text-[#0071E3]">{selectedProvider.toUpperCase()}</strong></p>
            </div>
            <button
              onClick={() => offerMutation.mutate({ oppId: selectedOpp.id, quantity: selectedOpp.units })}
              className="w-full py-3 bg-[#0071E3] text-white text-[14px] font-semibold rounded-full hover:bg-[#0058B0] transition-colors"
            >
              Accept Transfer & Reserve Units
            </button>
          </div>
        </Drawer>
      )}
    </div>
  );
}
