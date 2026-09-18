import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Card, SectionLabel, Drawer, DemoModeBanner, ProvenanceBadge } from "../shared";
import { inventoryApi } from "../api/endpoints";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { ErrorState } from "../components/ErrorState";

export default function InventoryScreen() {
  const queryClient = useQueryClient();
  const [selectedUnit, setSelectedUnit] = useState<any>(null);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [fifoWarning, setFifoWarning] = useState<string | null>(null);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [componentFilter, setComponentFilter] = useState("All");
  const [groupFilter, setGroupFilter] = useState("All");

  // Form state
  const [bagId, setBagId] = useState("");
  const [componentType, setComponentType] = useState("RDP");
  const [bloodGroup, setBloodGroup] = useState("O+");

  const { data: summary, isLoading: loadingSummary } = useQuery({
    queryKey: ["inventorySummary"],
    queryFn: inventoryApi.getSummary,
  });

  const { data: unitsData, isLoading: loadingUnits, error, refetch } = useQuery({
    queryKey: ["inventoryUnits"],
    queryFn: () => inventoryApi.getUnits(),
  });

  const issueMutation = useMutation({
    mutationFn: ({ unitId, reason }: { unitId: string; reason?: string }) =>
      inventoryApi.issueUnit(unitId, { override_reason: reason }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["inventorySummary"] });
      queryClient.invalidateQueries({ queryKey: ["inventoryUnits"] });
      if (data.fifo_warning) {
        setFifoWarning(data.fifo_warning);
      } else {
        setSelectedUnit(null);
        setFifoWarning(null);
      }
    },
    onError: (err: any) => {
      alert(err.response?.data?.detail || "Failed to issue unit");
    },
  });

  const registerMutation = useMutation({
    mutationFn: (payload: any) => inventoryApi.registerUnit(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventorySummary"] });
      queryClient.invalidateQueries({ queryKey: ["inventoryUnits"] });
      setRegisterOpen(false);
      setBagId("");
    },
    onError: (err: any) => {
      alert(err.response?.data?.detail || "Failed to register unit");
    },
  });

  if (loadingSummary || loadingUnits) {
    return (
      <div className="p-8 max-w-4xl space-y-6">
        <LoadingSkeleton height="60px" />
        <LoadingSkeleton height="300px" />
      </div>
    );
  }

  if (error || !summary || !unitsData) {
    return (
      <div className="p-8 max-w-4xl">
        <ErrorState message="Could not load inventory units." onRetry={refetch} />
      </div>
    );
  }

  const s = summary;
  const rawItems = unitsData.items || [];

  // Filter items
  const items = rawItems.filter((u: any) => {
    const matchesSearch = u.bag_id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesComponent = componentFilter === "All" || u.component_type === componentFilter;
    const matchesGroup = groupFilter === "All" || u.blood_group === groupFilter;
    return matchesSearch && matchesComponent && matchesGroup;
  });

  const totalUnits = s.expiring_today + s.expiring_1d + s.expiring_2d + s.expiring_3d;

  const bands = [
    { label: "Today (0–24h)", count: s.expiring_today, color: "text-[#C41230]", bg: "bg-[#FBE8EC]", border: "border-[#F8B4B4]" },
    { label: "1 Day (24–48h)", count: s.expiring_1d, color: "text-[#B25000]", bg: "bg-[#FFF3E0]", border: "border-[#FFE0B2]" },
    { label: "2 Days (48–72h)", count: s.expiring_2d, color: "text-[#558B2F]", bg: "bg-[#F0F8E8]", border: "border-[#C8E6C9]" },
    { label: "3 Days+ (72–96h)", count: s.expiring_3d, color: "text-[#1A8A2C]", bg: "bg-[#E8F4EB]", border: "border-[#C8E6C9]" },
  ];

  return (
    <div>
      <DemoModeBanner />

      <div className="p-8 max-w-4xl">
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <p className="text-[11px] font-semibold text-[#AEAEB2] uppercase tracking-widest">Inventory</p>
              <ProvenanceBadge type="demo" />
            </div>
            <h1 className="text-[28px] font-bold text-[#1D1D1F] tracking-tight">
              Platelet Unit Directory
            </h1>
            <p className="text-[14px] text-[#6E6E73] mt-1 font-light">
              Govt. General Hospital Chennai · {totalUnits} units registered
            </p>
          </div>
          <button
            onClick={() => setRegisterOpen(true)}
            className="px-4 py-2.5 bg-[#0071E3] text-white text-[13px] font-medium rounded-full hover:bg-[#0058B0] transition-colors cursor-pointer"
          >
            + Register unit
          </button>
        </div>

        {/* Shelf-life distribution strip */}
        <Card className="p-6 mb-6">
          <SectionLabel>Shelf-life distribution (5-day expiry window)</SectionLabel>
          <div className="flex gap-2 mb-2">
            {bands.map((b, idx) => {
              const flexWeight = Math.max(b.count, 1);
              return (
                <motion.div
                  key={b.label}
                  initial={{ scaleX: 0, opacity: 0 }}
                  animate={{ scaleX: 1, opacity: 1 }}
                  transition={{ duration: 0.6, delay: idx * 0.1, ease: [0.22, 1, 0.36, 1] }}
                  style={{ flex: flexWeight, transformOrigin: "left" }}
                  className={`${b.bg} rounded-[8px] p-3 border ${b.border} text-center min-w-[70px]`}
                >
                  <p className={`text-[10px] font-bold uppercase truncate ${b.color}`}>{b.label}</p>
                  <p className={`text-[24px] font-bold mt-1 ${b.color}`}>{b.count}</p>
                </motion.div>
              );
            })}
          </div>
          <p className="text-[12px] font-medium text-[#6E6E73] mt-3 text-center">
            Total: {totalUnits} units · 5-day supply window
          </p>
        </Card>

        {/* Filter Controls Bar */}
        <div className="bg-white p-4 rounded-[12px] border border-[#E5E5E7] mb-5 space-y-3">
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="🔍 Search Bag ID (e.g. RDP-8001)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 border border-[#E5E5E7] rounded-[8px] px-3.5 py-2 text-[13px] outline-none focus:border-[#0071E3]"
            />
            <div className="flex items-center gap-1 bg-[#F5F5F7] p-1 rounded-[8px]">
              {["All", "RDP", "SDP"].map((c) => (
                <button
                  key={c}
                  onClick={() => setComponentFilter(c)}
                  className={`px-3 py-1 rounded-[6px] text-[12px] font-medium transition-all ${
                    componentFilter === c ? "bg-white text-[#1D1D1F] shadow-xs" : "text-[#6E6E73] hover:text-[#1D1D1F]"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pt-1 border-t border-[#F5F5F7]">
            <span className="text-[11px] font-semibold text-[#AEAEB2] uppercase mr-2 flex-shrink-0">Group:</span>
            {["All", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((g) => (
              <button
                key={g}
                onClick={() => setGroupFilter(g)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all ${
                  groupFilter === g ? "bg-[#0071E3] text-white" : "bg-[#F5F5F7] text-[#6E6E73] hover:bg-[#E5E5E7]"
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>

        {/* Table sorted by FIFO (expiry_at ascending) */}
        <Card className="overflow-hidden border border-[#E5E5E7]">
          <table className="w-full">
            <thead>
              <tr className="bg-[#FAFAFA] border-b border-[#E5E5E7]">
                {["Bag ID", "Component", "Group", "Expiry", "Status", "Action"].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-[11px] font-semibold text-[#8E8E93] uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-[13px] text-[#6E6E73]">
                    No inventory units match your search filters.
                  </td>
                </tr>
              ) : (
                items.map((u: any) => (
                  <tr key={u.id} className="border-b border-[#F5F5F7] hover:bg-[#F9F9FB] transition-colors">
                    <td className="px-5 py-3.5 text-[14px] font-semibold text-[#1D1D1F]">{u.bag_id}</td>
                    <td className="px-5 py-3.5 text-[13px] text-[#6E6E73]">{u.component_type}</td>
                    <td className="px-5 py-3.5 text-[13px] font-bold text-[#1D1D1F]">{u.blood_group}</td>
                    <td className="px-5 py-3.5 text-[13px] text-[#6E6E73]">{u.expiry_at.slice(0, 16).replace("T", " ")}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex px-2 py-0.5 text-[11px] font-semibold rounded-full ${u.status === "AVAILABLE" ? "bg-[#E8F4EB] text-[#1A8A2C]" : "bg-[#F5F5F7] text-[#6E6E73]"}`}>
                        {u.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      {u.status === "AVAILABLE" ? (
                        <button
                          onClick={() => setSelectedUnit(u)}
                          className="text-[12px] font-medium text-[#0071E3] hover:underline cursor-pointer"
                        >
                          Issue unit →
                        </button>
                      ) : (
                        <span className="text-[12px] text-[#AEAEB2]">Issued</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Card>
      </div>

      {/* Register Unit Drawer */}
      {registerOpen && (
        <Drawer title="Register New Platelet Unit" onClose={() => setRegisterOpen(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const now = new Date();
              const exp = new Date(now.getTime() + 5 * 24 * 3600 * 1000);
              registerMutation.mutate({
                bag_id: bagId || `RDP-${Math.floor(8000 + Math.random() * 1000)}`,
                component_type: componentType,
                blood_group: bloodGroup,
                collection_at: now.toISOString(),
                expiry_at: exp.toISOString(),
              });
            }}
            className="space-y-4"
          >
            <div>
              <label className="block text-[12px] font-semibold text-[#1D1D1F] mb-1">Bag Identification ID</label>
              <input
                type="text"
                placeholder="e.g. RDP-8105"
                value={bagId}
                onChange={(e) => setBagId(e.target.value)}
                className="w-full border border-[#E5E5E7] rounded-[8px] p-2.5 text-[13px]"
              />
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-[#1D1D1F] mb-1">Component Type</label>
              <select
                value={componentType}
                onChange={(e) => setComponentType(e.target.value)}
                className="w-full border border-[#E5E5E7] rounded-[8px] p-2.5 text-[13px]"
              >
                <option value="RDP">RDP — Random Donor Platelet</option>
                <option value="SDP">SDP — Single Donor Platelet</option>
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-[#1D1D1F] mb-1">Blood Group</label>
              <select
                value={bloodGroup}
                onChange={(e) => setBloodGroup(e.target.value)}
                className="w-full border border-[#E5E5E7] rounded-[8px] p-2.5 text-[13px]"
              >
                {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              className="w-full py-3 bg-[#0071E3] text-white text-[13px] font-semibold rounded-full mt-4 cursor-pointer"
            >
              Register Unit
            </button>
          </form>
        </Drawer>
      )}

      {/* Issue Unit Modal */}
      {selectedUnit && (
        <Drawer title={`Issue Unit: ${selectedUnit.bag_id}`} onClose={() => { setSelectedUnit(null); setFifoWarning(null); }}>
          <div className="space-y-4">
            <p className="text-[13px] text-[#1D1D1F]">
              Confirm issuance of bag <b>{selectedUnit.bag_id}</b> ({selectedUnit.component_type} · {selectedUnit.blood_group}) expiring on {selectedUnit.expiry_at.slice(0, 10)}.
            </p>

            {fifoWarning && (
              <div className="p-3.5 bg-[#FFF8E7] border border-[#F5D99A] rounded-[8px] text-[12px] text-[#B25000]">
                <p className="font-bold mb-1">⚠ FIFO Warning</p>
                <p>{fifoWarning}</p>
                <p className="mt-1">Please provide a mandatory reason to override FIFO issuance order.</p>
              </div>
            )}

            {fifoWarning && (
              <div>
                <label className="block text-[12px] font-semibold text-[#1D1D1F] mb-1">Override Reason (Mandatory)</label>
                <input
                  type="text"
                  placeholder="e.g. Specific blood group request for pediatric emergency"
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  className="w-full border border-[#E5E5E7] rounded-[8px] p-2.5 text-[13px]"
                />
              </div>
            )}

            <button
              onClick={() => issueMutation.mutate({ unitId: selectedUnit.id, reason: overrideReason })}
              className="w-full py-3 bg-[#1A8A2C] text-white text-[13px] font-semibold rounded-full cursor-pointer"
            >
              Confirm Issuance
            </button>
          </div>
        </Drawer>
      )}
    </div>
  );
}
