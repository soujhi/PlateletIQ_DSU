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

  // Account Context State (For 2-Laptop Demo)
  const [activeBank, setActiveBank] = useState<"source" | "dest">("source");
  const [otpModalOpen, setOtpModalOpen] = useState<"pickup" | "delivery" | null>(null);
  const [otpInput, setOtpInput] = useState<string>("849201");
  const [transferState, setTransferState] = useState<string>("IN_TRANSIT");

  const { data: opps, isLoading, error, refetch } = useQuery({
    queryKey: ["transferOpportunities"],
    queryFn: transferApi.getOpportunities,
  });

  const offerMutation = useMutation({
    mutationFn: ({ oppId, quantity }: { oppId: string; quantity: number }) =>
      transferApi.makeOffer(oppId, { quantity }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transferOpportunities"] });
      setPendingMsg("Transfer Accepted! Inventory units locked (AVAILABLE → RESERVED). Shiprocket adhoc delivery created.");
      setReviewId(null);
      setTransferState("RESERVED");
    },
  });

  const handleVerifyOtp = () => {
    if (otpModalOpen === "pickup") {
      setTransferState("IN_TRANSIT");
      setPendingMsg("Pickup Verified! OTP/QR validated. Custody transferred to courier. Status updated to IN_TRANSIT.");
    } else if (otpModalOpen === "delivery") {
      setTransferState("DELIVERED");
      setPendingMsg("Receipt Verified! Destination OTP validated. 12 SDP units received & inventory updated transactionally (Source -12, Destination +12).");
    }
    setOtpModalOpen(null);
  };

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
      {/* 2-Laptop Account Selector & Provider Header */}
      <div className="mb-6 bg-white p-4 rounded-[14px] border border-[#E5E5E7] shadow-sm flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold text-[#AEAEB2] uppercase tracking-widest">Active Account Context (2-Laptop Demo)</p>
          <div className="flex items-center gap-2 mt-1">
            <span className={`w-2.5 h-2.5 rounded-full ${activeBank === "source" ? "bg-[#0071E3]" : "bg-[#1A8A2C]"}`} />
            <span className="text-[14px] font-bold text-[#1D1D1F]">
              {activeBank === "source" ? "Govt. General Hospital Chennai (Source / Giver)" : "Apollo Hospitals Greams Road (Destination / Receiver)"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveBank(activeBank === "source" ? "dest" : "source")}
            className="px-3.5 py-1.5 bg-[#F5F5F7] text-[#1D1D1F] border border-[#E5E5E7] text-[12px] font-semibold rounded-full hover:bg-[#EAEAEA] transition-colors"
          >
            Switch Account View ⇄
          </button>
        </div>
      </div>

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-semibold text-[#1D1D1F] tracking-tight">
            Transfers & Transport Dispatch
          </h1>
          <p className="text-[14px] text-[#6E6E73] mt-1">
            Shiprocket + Mapbox Logistics Integration · Cold-Chain 20–24 °C Tracking
          </p>
        </div>
        <div className="flex items-center gap-1.5 bg-[#F5F5F7] p-1 rounded-full border border-[#E5E5E7]">
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
            <span className={`inline-block w-2.5 h-2.5 rounded-full ${transferState === "DELIVERED" ? "bg-[#1A8A2C]" : "bg-[#0071E3] animate-pulse"}`} />
            <SectionLabel>Active Platelet Transfer · {transferState.replace("_", " ")}</SectionLabel>
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
              <p className="text-[16px] font-bold text-[#1D1D1F]">{transferState === "DELIVERED" ? "Arrived" : "18 mins"}</p>
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

          <div className="p-2.5 bg-[#FFF8E1] border border-[#FFE082] rounded-[8px] flex items-center justify-between text-[11px] text-[#B25000]">
            <span><strong className="font-bold">🧊 Cold-Chain Monitoring:</strong> 22.4 °C (Target: 20–24 °C) · Agitation Off: 18 min / 1440 min max</span>
            <span className="px-2 py-0.5 bg-[#E8F4EB] text-[#1A8A2C] font-bold rounded-full">● NORMAL</span>
          </div>
        </div>

        {/* Verification Action Bar */}
        <div className="mt-4 pt-3 border-t border-[#E5E5E7] flex items-center justify-between">
          <div>
            <p className="text-[11px] uppercase font-bold text-[#AEAEB2]">Custody Verification Handoff</p>
            <p className="text-[12px] text-[#6E6E73]">
              {transferState === "RESERVED"
                ? "Source Handoff: Verify Pickup OTP with courier"
                : transferState === "IN_TRANSIT"
                ? "Destination Handoff: Verify Receipt OTP to complete transfer"
                : "Transfer Completed & Inventory Settled"}
            </p>
          </div>

          {transferState === "RESERVED" && (
            <button
              onClick={() => setOtpModalOpen("pickup")}
              className="px-4 py-2 bg-[#0071E3] text-white text-[12px] font-semibold rounded-full hover:bg-[#0058B0] transition-colors"
            >
              Verify Pickup OTP / QR →
            </button>
          )}

          {transferState === "IN_TRANSIT" && (
            <button
              onClick={() => setOtpModalOpen("delivery")}
              className="px-4 py-2 bg-[#1A8A2C] text-white text-[12px] font-semibold rounded-full hover:bg-[#157424] transition-colors"
            >
              Verify Receipt OTP / QR →
            </button>
          )}

          {transferState === "DELIVERED" && (
            <span className="px-3 py-1 bg-[#E8F4EB] text-[#1A8A2C] text-[12px] font-bold rounded-full border border-[#A5D6A7]">
              ✓ Settled in Ledger & Inventory
            </span>
          )}
        </div>

        {/* 10-State Lifecycle Progress Track */}
        <div className="mt-4 pt-3 border-t border-[#E5E5E7]">
          <p className="text-[11px] uppercase font-bold text-[#AEAEB2] mb-2">State Machine Lifecycle</p>
          <div className="flex items-center justify-between text-[10px] font-medium text-[#6E6E73]">
            <span className="text-[#1A8A2C] font-semibold">✓ Proposed</span>
            <span className="text-[#1A8A2C] font-semibold">✓ Eligibility Check</span>
            <span className="text-[#1A8A2C] font-semibold">✓ Accepted (Reserved)</span>
            <span className="text-[#1A8A2C] font-semibold">✓ Shiprocket Order</span>
            <span className={transferState === "IN_TRANSIT" ? "text-[#0071E3] font-bold animate-pulse" : "text-[#1A8A2C] font-semibold"}>
              {transferState === "IN_TRANSIT" ? "● In Transit" : "✓ In Transit"}
            </span>
            <span className={transferState === "DELIVERED" ? "text-[#1A8A2C] font-bold" : "text-[#AEAEB2]"}>
              {transferState === "DELIVERED" ? "✓ Received & Settled" : "○ Received"}
            </span>
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

      {/* OTP / QR Verification Drawer Modal */}
      {otpModalOpen && (
        <Drawer
          title={otpModalOpen === "pickup" ? "Source Pickup Handoff Verification" : "Destination Receipt Verification"}
          subtitle="Dual OTP / QR Security Verification Gate"
          onClose={() => setOtpModalOpen(null)}
        >
          <div className="space-y-5">
            <div className="p-4 bg-[#E8F1FC] border border-[#C8DCF5] rounded-[10px]">
              <p className="text-[13px] font-bold text-[#0071E3] mb-1">
                {otpModalOpen === "pickup" ? "Courier Pickup Handoff" : "Destination Handoff Receipt"}
              </p>
              <p className="text-[12px] text-[#1D1D1F] leading-relaxed">
                {otpModalOpen === "pickup"
                  ? "Verify 6-digit OTP provided by courier rider (Ramesh V. - Delhivery) before transferring custody from AVAILABLE to RESERVED -> IN_TRANSIT."
                  : "Verify 6-digit OTP upon arrival before confirming unit receipt and reallocating inventory."}
              </p>
            </div>

            <div>
              <label className="block text-[12px] font-semibold text-[#1D1D1F] mb-1">6-Digit Verification OTP</label>
              <input
                type="text"
                maxLength={6}
                value={otpInput}
                onChange={(e) => setOtpInput(e.target.value)}
                className="w-full border border-[#E5E5E7] rounded-[8px] p-3 text-[18px] font-mono tracking-widest text-center"
              />
            </div>

            <div className="p-3 bg-[#F5F5F7] rounded-[8px] text-center">
              <p className="text-[10px] uppercase font-bold text-[#AEAEB2]">Simulated QR Security Hash</p>
              <p className="text-[11px] font-mono text-[#6E6E73] mt-0.5">QR-PLT-2026-9988-7766-XX</p>
            </div>

            <button
              onClick={handleVerifyOtp}
              className="w-full py-3 bg-[#1A8A2C] text-white text-[14px] font-semibold rounded-full hover:bg-[#157424] transition-colors"
            >
              Verify OTP & Complete Custody Handoff
            </button>
          </div>
        </Drawer>
      )}

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
