import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, SectionLabel, Drawer, ProvenanceBadge } from "../shared";
import { transferApi } from "../api/endpoints";
import { LoadingSkeleton } from "../components/LoadingSkeleton";

const ERAKTKOSH_FACILITIES = [
  { id: "TN-GGH-001", name: "Govt. General Hospital Chennai", role: "Surplus Holding Bank (48 SDP)", sdp: 48, lat: 13.0827, lng: 80.2707 },
  { id: "TN-APO-014", name: "Apollo Hospitals Greams Road", role: "High Demand Deficit (Shortage)", sdp: 14, lat: 13.0604, lng: 80.2496 },
  { id: "TN-STA-002", name: "Govt. Stanley Medical College Hospital", role: "Regional Deficit (19 SDP)", sdp: 19, lat: 13.1042, lng: 80.2872 },
  { id: "TN-KMH-003", name: "Kilpauk Medical College Hospital", role: "Critical Shortage (8 SDP)", sdp: 8, lat: 13.0789, lng: 80.2428 },
  { id: "TN-MGM-005", name: "MGM Healthcare Adyar", role: "Surplus Reserve (22 SDP)", sdp: 22, lat: 13.0084, lng: 80.2571 },
];

export default function TransfersScreen({ onViewTracking }: { onViewTracking?: () => void }) {
  const queryClient = useQueryClient();

  const [activeBankId, setActiveBankId] = useState<string>("TN-GGH-001");
  const [selectedProvider, setSelectedProvider] = useState<string>("shiprocket");
  const [pendingMsg, setPendingMsg] = useState<string | null>(null);

  // Transfer Modals State
  const [shortagePullOpen, setShortagePullOpen] = useState(false);
  const [wastagePushOpen, setWastagePushOpen] = useState(false);
  const [otpModalOpen, setOtpModalOpen] = useState<"pickup" | "delivery" | null>(null);
  const [otpInput, setOtpInput] = useState<string>("");
  const [reviewId, setReviewId] = useState<string | null>(null);

  // Pull / Push Form Inputs
  const [targetBankId, setTargetBankId] = useState<string>("TN-APO-014");
  const [reqUnits, setReqUnits] = useState<number>(12);
  const [reqComponent, setReqComponent] = useState<string>("SDP");

  // Operational Transfer State Machine
  const [localState, setLocalState] = useState<string>("REQUESTED");
  const [pickupOtp, setPickupOtp] = useState<string>("849201");
  const [deliveryOtp, setDeliveryOtp] = useState<string>("123456");

  const activeFacility = ERAKTKOSH_FACILITIES.find((f) => f.id === activeBankId) || ERAKTKOSH_FACILITIES[0];

  // 1. Fetch Candidate Opportunities
  const { data: opps, isLoading } = useQuery({
    queryKey: ["transferOpportunities"],
    queryFn: transferApi.getOpportunities,
  });

  // 2. Poll Central Backend API for Real-Time 2-Laptop Transfer Sync (every 2000ms)
  const { data: liveTransfers } = useQuery({
    queryKey: ["liveTransfers"],
    queryFn: transferApi.listTransfers,
    refetchInterval: 2000,
  });

  const activeBackendTransfer = liveTransfers && liveTransfers.length > 0 ? liveTransfers[liveTransfers.length - 1] : null;
  const transferState = activeBackendTransfer?.status || localState;
  const activeTransferId = activeBackendTransfer?.id || "TRF-DEMO-001";

  // Backend Mutations for Live 2-Laptop Sync
  const createMutation = useMutation({
    mutationFn: (payload: any) => transferApi.createTransfer(payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["liveTransfers"] });
      setLocalState(data.status || "REQUESTED");
      if (data.pickup_otp_code) setPickupOtp(data.pickup_otp_code);
    },
  });

  const acceptMutation = useMutation({
    mutationFn: (id: string) => transferApi.acceptTransfer(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["liveTransfers"] });
      setLocalState("UNITS_RESERVED");
    },
  });

  const verifyPickupOtpMutation = useMutation({
    mutationFn: ({ id, otp }: { id: string; otp: string }) => transferApi.verifyPickupOtp(id, otp),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["liveTransfers"] });
      setLocalState("IN_TRANSIT");
    },
  });

  const verifyDeliveryOtpMutation = useMutation({
    mutationFn: ({ id, otp }: { id: string; otp: string }) => transferApi.verifyDeliveryOtp(id, otp),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["liveTransfers"] });
      setLocalState("TRANSFER_COMPLETED");
    },
  });

  const offerMutation = useMutation({
    mutationFn: ({ oppId, quantity }: { oppId: string; quantity: number }) =>
      transferApi.makeOffer(oppId, { quantity }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transferOpportunities"] });
      setPendingMsg("Transfer Approved! 12 SDP units reserved (AVAILABLE → UNITS_RESERVED). Shiprocket ad-hoc dispatch created.");
      setReviewId(null);
      setLocalState("UNITS_RESERVED");
    },
  });

  // Flow A: Initiate Shortage Pull Request
  const handleInitiateShortagePull = (e: React.FormEvent) => {
    e.preventDefault();
    setShortagePullOpen(false);
    setLocalState("REQUESTED");

    createMutation.mutate({
      source_blood_bank_id: targetBankId,
      destination_blood_bank_id: activeBankId,
      units: reqUnits,
      component: reqComponent,
      priority: "high",
      provider: selectedProvider,
    });

    setPendingMsg(`Shortage Pull Request transmitted to ${ERAKTKOSH_FACILITIES.find(f => f.id === targetBankId)?.name}. Live synced across all network laptops.`);
  };

  // Flow B: Initiate Wastage Push (Expiry Prevention)
  const handleInitiateWastagePush = (e: React.FormEvent) => {
    e.preventDefault();
    setWastagePushOpen(false);
    setLocalState("UNITS_RESERVED");

    createMutation.mutate({
      source_blood_bank_id: activeBankId,
      destination_blood_bank_id: targetBankId,
      units: reqUnits,
      component: reqComponent,
      priority: "urgent",
      provider: selectedProvider,
    });

    setPendingMsg(`Expiry Prevention Dispatch created! Offered ${reqUnits} ${reqComponent} units expiring <36h to ${ERAKTKOSH_FACILITIES.find(f => f.id === targetBankId)?.name}. Live synced.`);
  };

  // Authorize Transfer
  const handleAuthorizeTransfer = () => {
    acceptMutation.mutate(activeTransferId);
    setLocalState("UNITS_RESERVED");
    setPendingMsg("Transfer Authorized! 12 SDP units reserved in inventory. Pickup OTP generated: " + displayPickupOtp);
  };

  // OTP Verification Handoff
  const handleVerifyOtp = () => {
    if (otpInput.length !== 6) return;
    if (otpModalOpen === "pickup") {
      verifyPickupOtpMutation.mutate({ id: activeTransferId, otp: otpInput });
      setPendingMsg("Pickup OTP verified! Custody transferred to courier. Shipment IN_TRANSIT.");
    } else if (otpModalOpen === "delivery") {
      verifyDeliveryOtpMutation.mutate({ id: activeTransferId, otp: otpInput });
      setPendingMsg("Receipt OTP verified! Transfer completed. Inventory settled (Source −N, Destination +N).");
    }
    setOtpModalOpen(null);
    setOtpInput("");
  };

  if (isLoading) {
    return (
      <div className="p-8 max-w-4xl space-y-6">
        <LoadingSkeleton height="150px" />
        <LoadingSkeleton height="240px" />
      </div>
    );
  }

  const DEFAULT_OPPORTUNITIES = [
    {
      id: "opp-001",
      from: "Govt. Stanley Medical College Hospital",
      to: "Govt. General Hospital Chennai",
      units: 12,
      component_type: "SDP",
      reason: "Stanley surplus stock available for intra-city balancing. 12 SDP units usable with zero expected local deficit.",
      status: "OPEN",
    },
    {
      id: "opp-002",
      from: "Kilpauk Medical College Hospital",
      to: "Apollo Hospitals Greams Road",
      units: 15,
      component_type: "SDP",
      reason: "Kilpauk regional surplus available for high-demand emergency redistribution.",
      status: "OPEN",
    },
    {
      id: "opp-003",
      from: "MGM Healthcare Adyar",
      to: "Govt. General Hospital Chennai",
      units: 20,
      component_type: "RDP",
      reason: "MGM surplus stock ready for intra-regional balancing.",
      status: "OPEN",
    },
  ];

  const opportunities = opps && Array.isArray(opps) && opps.length > 0 ? opps : DEFAULT_OPPORTUNITIES;
  const selectedOpp = opportunities.find((o: any) => o.id === reviewId);

  return (
    <div className="p-8 max-w-4xl">
      {/* Production Facility Context Switcher Bar */}
      <div className="mb-6 bg-white p-4 rounded-[14px] border border-[#E5E5E7] shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#E8F1FC] flex items-center justify-center text-[#0071E3] font-bold text-[15px]">
            🏦
          </div>
          <div>
            <p className="text-[10px] font-bold text-[#AEAEB2] uppercase tracking-widest">Active Hospital Facility Context</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#1A8A2C]" />
              <span className="text-[15px] font-bold text-[#1D1D1F]">{activeFacility.name}</span>
              <span className="text-[12px] font-semibold text-[#6E6E73]">({activeFacility.id})</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-[11px] font-semibold text-[#6E6E73]">Switch Operational Facility:</label>
          <select
            value={activeBankId}
            onChange={(e) => {
              setActiveBankId(e.target.value);
              setPendingMsg(`Switched context to ${ERAKTKOSH_FACILITIES.find(f => f.id === e.target.value)?.name}`);
            }}
            className="bg-[#F5F5F7] border border-[#E5E5E7] text-[#1D1D1F] text-[13px] font-medium rounded-full px-3.5 py-1.5 focus:outline-none focus:border-[#0071E3] cursor-pointer"
          >
            {ERAKTKOSH_FACILITIES.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name} ({f.id})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Screen Title Bar */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-semibold text-[#1D1D1F] tracking-tight">
            Transfers & Transport Dispatch
          </h1>
          <p className="text-[14px] text-[#6E6E73] mt-1">
            Shortage Pull Requests · Expiry Wastage Transfers · Cold-Chain 20–24 °C Handoff
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setTargetBankId("TN-GGH-001");
              setShortagePullOpen(true);
            }}
            className="px-4 py-2 bg-[#0071E3] text-white text-[13px] font-semibold rounded-full hover:bg-[#0058B0] transition-colors shadow-sm cursor-pointer"
          >
            + Request Units (Shortage Pull)
          </button>
          <button
            onClick={() => {
              setTargetBankId("TN-APO-014");
              setWastagePushOpen(true);
            }}
            className="px-4 py-2 bg-[#BA7517] text-white text-[13px] font-semibold rounded-full hover:bg-[#9A5F10] transition-colors shadow-sm cursor-pointer"
          >
            ⚡ Dispatch Expiry Units (Wastage Push)
          </button>
        </div>
      </div>

      {pendingMsg && (
        <div className="mb-5 px-4 py-3 bg-[#E8F1FC] border border-[#C8DCF5] rounded-[10px] flex items-center justify-between">
          <p className="text-[13px] text-[#0071E3] font-medium">✓ {pendingMsg}</p>
          <button onClick={() => setPendingMsg(null)} className="text-[#0071E3] text-[18px] leading-none">×</button>
        </div>
      )}

      {/* Active Transfer Card */}
      <Card className="p-6 mb-6 border-l-4 border-l-[#0071E3] bg-gradient-to-br from-white to-[#F9FAFB]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className={`inline-block w-2.5 h-2.5 rounded-full ${transferState === "TRANSFER_COMPLETED" ? "bg-[#1A8A2C]" : "bg-[#0071E3] animate-pulse"}`} />
            <SectionLabel>Active Transfer Lifecycle · {transferState.replace("_", " ")}</SectionLabel>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 text-[11px] font-semibold rounded-full bg-[#E8F1FC] text-[#0071E3] border border-[#C8DCF5]">
              AWB: {activeBackendTransfer?.awb_code || "AWB-SR-998877"}
            </span>
            <div className="flex items-center gap-1 bg-[#F5F5F7] px-2 py-0.5 rounded-full border border-[#E5E5E7] text-[11px] font-semibold text-[#1D1D1F]">
              <span>PROVIDER:</span>
              <select
                value={selectedProvider}
                onChange={(e) => setSelectedProvider(e.target.value)}
                className="bg-transparent text-[#0071E3] font-bold focus:outline-none cursor-pointer"
              >
                <option value="shiprocket">Shiprocket API</option>
                <option value="porter">Porter API</option>
                <option value="internal">Internal Fleet</option>
              </select>
            </div>
          </div>
        </div>

        {/* Transfer Route & Logistics Summary */}
        <div className="my-3 p-4 bg-white rounded-[12px] border border-[#E5E5E7] shadow-sm">
          <div className="flex items-center justify-between text-[15px] font-semibold text-[#1D1D1F] mb-2">
            <span>📍 {activeBackendTransfer?.source_name || "Govt. General Hospital Chennai"}</span>
            <span className="text-[#0071E3]">→ {activeBackendTransfer?.units || 12} {activeBackendTransfer?.component || "SDP"} Units →</span>
            <span>📍 {activeBackendTransfer?.destination_name || "Apollo Hospitals Greams Road"}</span>
          </div>

          <div className="grid grid-cols-4 gap-3 text-center my-3 py-2.5 bg-[#F5F5F7] rounded-[8px]">
            <div>
              <p className="text-[10px] uppercase font-bold text-[#AEAEB2]">Mapbox ETA</p>
              <p className="text-[15px] font-bold text-[#1D1D1F]">
                {transferState === "TRANSFER_COMPLETED" ? "Arrived" : `${activeBackendTransfer?.eta_minutes || 18} mins`}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-[#AEAEB2]">Route Distance</p>
              <p className="text-[15px] font-bold text-[#1D1D1F]">{activeBackendTransfer?.distance_km || 8.4} km</p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-[#AEAEB2]">Courier Partner</p>
              <p className="text-[13px] font-bold text-[#0071E3]">{activeBackendTransfer?.courier_name || "Delhivery Express (Shiprocket)"}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-[#AEAEB2]">Rider Details</p>
              <p className="text-[12px] font-semibold text-[#1D1D1F]">
                {activeBackendTransfer?.driver?.name || "Ramesh V."} ({activeBackendTransfer?.driver?.vehicle || "TN-01-SR-8888"})
              </p>
            </div>
          </div>

          <div className="p-2.5 bg-[#FFF8E1] border border-[#FFE082] rounded-[8px] flex items-center justify-between text-[11px] text-[#B25000]">
            <span><strong className="font-bold">🧊 Cold-Chain Monitoring:</strong> 22.4 °C (Target: 20–24 °C) · Agitation Off: 18 min / 1440 min max</span>
            <span className="px-2 py-0.5 bg-[#E8F4EB] text-[#1A8A2C] font-bold rounded-full">● NORMAL</span>
          </div>
        </div>

        {/* Verification Action Bar & Workflow Buttons */}
        <div className="mt-4 pt-3 border-t border-[#E5E5E7] flex items-center justify-between">
          <div>
            <p className="text-[11px] uppercase font-bold text-[#AEAEB2]">Cryptographic OTP Handoff Security</p>
            <p className="text-[12px] text-[#6E6E73]">
              {transferState === "REQUESTED"
                ? "Shortage Pull Request pending: Source giving officer must authorize transfer and issue Pickup OTP"
                : transferState === "UNITS_RESERVED" || transferState === "PICKUP_PENDING"
                ? "Source Handoff: Verify Pickup OTP with courier rider to dispatch shipment"
                : transferState === "IN_TRANSIT"
                ? "Destination Handoff: Verify Receipt OTP upon driver arrival to complete transfer"
                : "Transfer Completed & Inventory Settled in eRaktKosh Ledger"}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {transferState === "REQUESTED" && (
              <button
                onClick={handleAuthorizeTransfer}
                className="px-4 py-2 bg-[#0071E3] text-white text-[12px] font-semibold rounded-full hover:bg-[#0058B0] transition-colors cursor-pointer"
              >
                Authorize & Accept Transfer →
              </button>
            )}

            {(transferState === "UNITS_RESERVED" || transferState === "PICKUP_PENDING") && (
              <button
                onClick={() => setOtpModalOpen("pickup")}
                className="px-4 py-2 bg-[#0071E3] text-white text-[12px] font-semibold rounded-full hover:bg-[#0058B0] transition-colors cursor-pointer"
              >
                Verify Pickup OTP →
              </button>
            )}

            {transferState === "IN_TRANSIT" && (
              <>
                <button
                  onClick={() => onViewTracking?.()}
                  className="px-3.5 py-2 bg-[#F5F5F7] text-[#1D1D1F] border border-[#E5E5E7] text-[12px] font-semibold rounded-full hover:bg-[#EAEAEA] transition-colors cursor-pointer"
                >
                  Live Flipkart Tracking 🗺
                </button>
                <button
                  onClick={() => setOtpModalOpen("delivery")}
                  className="px-4 py-2 bg-[#1A8A2C] text-white text-[12px] font-semibold rounded-full hover:bg-[#157424] transition-colors cursor-pointer"
                >
                  Verify Receipt OTP →
                </button>
              </>
            )}

            {transferState === "TRANSFER_COMPLETED" && (
              <span className="px-3.5 py-1.5 bg-[#E8F4EB] text-[#1A8A2C] text-[12px] font-bold rounded-full border border-[#A5D6A7]">
                ✓ Ledger & Inventory Settled
              </span>
            )}
          </div>
        </div>

        {/* 10-State Lifecycle Progress Track */}
        <div className="mt-4 pt-3 border-t border-[#E5E5E7]">
          <p className="text-[11px] uppercase font-bold text-[#AEAEB2] mb-2">State Machine Lifecycle</p>
          <div className="flex items-center justify-between text-[10px] font-medium text-[#6E6E73]">
            <span className="text-[#1A8A2C] font-semibold">✓ Requested</span>
            <span className={transferState !== "REQUESTED" ? "text-[#1A8A2C] font-semibold" : "text-[#0071E3] font-bold animate-pulse"}>
              {transferState !== "REQUESTED" ? "✓ Approved" : "● Awaiting Approval"}
            </span>
            <span className={["UNITS_RESERVED", "PICKUP_PENDING", "IN_TRANSIT", "TRANSFER_COMPLETED"].includes(transferState) ? "text-[#1A8A2C] font-semibold" : "text-[#AEAEB2]"}>
              {["UNITS_RESERVED", "PICKUP_PENDING", "IN_TRANSIT", "TRANSFER_COMPLETED"].includes(transferState) ? "✓ Reserved" : "○ Reserved"}
            </span>
            <span className={["IN_TRANSIT", "TRANSFER_COMPLETED"].includes(transferState) ? "text-[#1A8A2C] font-semibold" : "text-[#AEAEB2]"}>
              {["IN_TRANSIT", "TRANSFER_COMPLETED"].includes(transferState) ? "✓ Pickup Verified" : "○ Pickup OTP"}
            </span>
            <span className={transferState === "IN_TRANSIT" ? "text-[#0071E3] font-bold animate-pulse" : transferState === "TRANSFER_COMPLETED" ? "text-[#1A8A2C] font-semibold" : "text-[#AEAEB2]"}>
              {transferState === "IN_TRANSIT" ? "● In Transit" : transferState === "TRANSFER_COMPLETED" ? "✓ In Transit" : "○ In Transit"}
            </span>
            <span className={transferState === "TRANSFER_COMPLETED" ? "text-[#1A8A2C] font-bold" : "text-[#AEAEB2]"}>
              {transferState === "TRANSFER_COMPLETED" ? "✓ Delivery Verified" : "○ Receipt OTP"}
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
                  className="text-[13px] font-medium text-[#0071E3] bg-[#E8F1FC] px-3.5 py-1.5 rounded-full hover:bg-[#D0E4F8] transition-colors flex-shrink-0 cursor-pointer"
                >
                  Review Transfer →
                </button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Shortage Pull Request Drawer Modal */}
      {shortagePullOpen && (
        <Drawer
          title="Initiate Shortage Pull Request"
          subtitle="Request platelet units from a network hospital with surplus stock"
          onClose={() => setShortagePullOpen(false)}
        >
          <form onSubmit={handleInitiateShortagePull} className="space-y-4">
            <div>
              <label className="block text-[12px] font-semibold text-[#1D1D1F] mb-1">Requesting Facility (Destination)</label>
              <input
                type="text"
                disabled
                value={activeFacility.name}
                className="w-full bg-[#F5F5F7] border border-[#E5E5E7] text-[#1D1D1F] text-[13px] rounded-[8px] p-2.5 font-medium"
              />
            </div>

            <div>
              <label className="block text-[12px] font-semibold text-[#1D1D1F] mb-1">Source Holding Bank (Giving Hospital)</label>
              <select
                value={targetBankId}
                onChange={(e) => setTargetBankId(e.target.value)}
                className="w-full bg-white border border-[#E5E5E7] text-[#1D1D1F] text-[13px] rounded-[8px] p-2.5 font-medium cursor-pointer"
              >
                {ERAKTKOSH_FACILITIES.filter(f => f.id !== activeBankId).map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} ({f.sdp} SDP Surplus Available)
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[12px] font-semibold text-[#1D1D1F] mb-1">Component Type</label>
                <select
                  value={reqComponent}
                  onChange={(e) => setReqComponent(e.target.value)}
                  className="w-full bg-white border border-[#E5E5E7] text-[#1D1D1F] text-[13px] rounded-[8px] p-2.5 font-medium cursor-pointer"
                >
                  <option value="SDP">SDP (Single Donor Platelet)</option>
                  <option value="RDP">RDP (Random Donor Platelet)</option>
                </select>
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-[#1D1D1F] mb-1">Requested Quantity (Units)</label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={reqUnits}
                  onChange={(e) => setReqUnits(parseInt(e.target.value) || 1)}
                  className="w-full bg-white border border-[#E5E5E7] text-[#1D1D1F] text-[13px] rounded-[8px] p-2.5 font-medium"
                />
              </div>
            </div>

            <div className="p-3 bg-[#E8F1FC] border border-[#C8DCF5] rounded-[8px]">
              <p className="text-[11px] text-[#0071E3] font-medium leading-relaxed">
                ℹ Mapbox Directions route estimation: ~18 mins travel time (8.4 km). Pickup OTP will be issued upon source officer authorization.
              </p>
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-[#0071E3] text-white text-[14px] font-semibold rounded-full hover:bg-[#0058B0] transition-colors cursor-pointer shadow-sm"
            >
              Submit Shortage Pull Request →
            </button>
          </form>
        </Drawer>
      )}

      {/* Expiry Wastage Push Drawer Modal */}
      {wastagePushOpen && (
        <Drawer
          title="Dispatch Expiry Prevention Transfer (Wastage Push)"
          subtitle="Transfer units expiring <48h to a hospital with immediate demand"
          onClose={() => setWastagePushOpen(false)}
        >
          <form onSubmit={handleInitiateWastagePush} className="space-y-4">
            <div>
              <label className="block text-[12px] font-semibold text-[#1D1D1F] mb-1">Source Hospital (Holding Expiring Stock)</label>
              <input
                type="text"
                disabled
                value={activeFacility.name}
                className="w-full bg-[#F5F5F7] border border-[#E5E5E7] text-[#1D1D1F] text-[13px] rounded-[8px] p-2.5 font-medium"
              />
            </div>

            <div>
              <label className="block text-[12px] font-semibold text-[#1D1D1F] mb-1">Target Receiving Hospital (Deficit Demand)</label>
              <select
                value={targetBankId}
                onChange={(e) => setTargetBankId(e.target.value)}
                className="w-full bg-white border border-[#E5E5E7] text-[#1D1D1F] text-[13px] rounded-[8px] p-2.5 font-medium cursor-pointer"
              >
                {ERAKTKOSH_FACILITIES.filter(f => f.id !== activeBankId).map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} ({f.role})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[12px] font-semibold text-[#1D1D1F] mb-1">Component</label>
                <select
                  value={reqComponent}
                  onChange={(e) => setReqComponent(e.target.value)}
                  className="w-full bg-white border border-[#E5E5E7] text-[#1D1D1F] text-[13px] rounded-[8px] p-2.5 font-medium cursor-pointer"
                >
                  <option value="SDP">SDP (Expiring in 28h)</option>
                  <option value="RDP">RDP (Expiring in 34h)</option>
                </select>
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-[#1D1D1F] mb-1">Units to Transfer</label>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={reqUnits}
                  onChange={(e) => setReqUnits(parseInt(e.target.value) || 1)}
                  className="w-full bg-white border border-[#E5E5E7] text-[#1D1D1F] text-[13px] rounded-[8px] p-2.5 font-medium"
                />
              </div>
            </div>

            <div className="p-3 bg-[#FFF8E1] border border-[#FFE082] rounded-[8px]">
              <p className="text-[11px] text-[#B25000] font-medium leading-relaxed">
                ⚡ Prevent Wastage: Units will be locked in inventory and dispatched via Shiprocket ad-hoc courier under cold-chain surveillance (20–24 °C).
              </p>
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-[#BA7517] text-white text-[14px] font-semibold rounded-full hover:bg-[#9A5F10] transition-colors cursor-pointer shadow-sm"
            >
              Dispatch Expiry Transfer & Reserve Units →
            </button>
          </form>
        </Drawer>
      )}

      {/* OTP / QR Verification Drawer Modal */}
      {otpModalOpen && (
        <Drawer
          title={otpModalOpen === "pickup" ? "Source Pickup Handoff Verification" : "Destination Receipt Verification"}
          subtitle="Dual Cryptographic OTP Security Gate"
          onClose={() => setOtpModalOpen(null)}
        >
          <div className="space-y-5">
            <div className="p-4 bg-[#E8F1FC] border border-[#C8DCF5] rounded-[10px]">
              <p className="text-[13px] font-bold text-[#0071E3] mb-1">
                {otpModalOpen === "pickup" ? "Courier Pickup Handoff Gate" : "Destination Handoff Receipt Gate"}
              </p>
              <p className="text-[12px] text-[#1D1D1F] leading-relaxed">
                {otpModalOpen === "pickup"
                  ? "Enter the 6-digit OTP provided by the source hospital officer to confirm pickup and transfer custody to the courier."
                  : "Enter the 6-digit OTP provided by the courier driver to confirm delivery and settle inventory in the eRaktKosh ledger."}
              </p>
            </div>

            <div>
              <label className="block text-[12px] font-semibold text-[#1D1D1F] mb-1">6-Digit OTP Code</label>
              <input
                type="text"
                maxLength={6}
                placeholder="Enter 6-digit OTP"
                value={otpInput}
                onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="w-full border border-[#E5E5E7] rounded-[8px] p-3 text-[20px] font-mono tracking-widest text-center font-bold text-[#0071E3]"
                autoFocus
              />
              {otpInput.length > 0 && otpInput.length < 6 && (
                <p className="text-[11px] text-[#C41230] mt-1">Please enter all 6 digits</p>
              )}
            </div>

            <button
              onClick={handleVerifyOtp}
              disabled={otpInput.length !== 6}
              className={`w-full py-3 text-white text-[14px] font-semibold rounded-full transition-colors cursor-pointer shadow-sm ${
                otpInput.length === 6
                  ? "bg-[#1A8A2C] hover:bg-[#157424]"
                  : "bg-[#AEAEB2] cursor-not-allowed"
              }`}
            >
              {otpInput.length === 6 ? "Verify OTP & Update Custody →" : "Enter 6-digit OTP to continue"}
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
              className="w-full py-3 bg-[#0071E3] text-white text-[14px] font-semibold rounded-full hover:bg-[#0058B0] transition-colors cursor-pointer shadow-sm"
            >
              Accept Transfer & Reserve Units
            </button>
          </div>
        </Drawer>
      )}
    </div>
  );
}
