import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext";
import { facilityApi } from "../api/endpoints";
import type { Facility } from "../api/types";

const ROLES = [
  { id: "OFFICER", label: "Transfusion Officer", note: "Authorises transfers and handovers" },
  { id: "TECHNICIAN", label: "Blood Bank Technician", note: "Registers, issues, and disposes units" },
  { id: "COMMITTEE", label: "Transfusion Committee", note: "Reviews policy and utilisation" },
  { id: "ADMIN", label: "Administrator", note: "Full access" },
];

/**
 * Stage two of sign-in: which facility are you on duty at?
 *
 * The list comes from the backend registry, so it is the same set the transfer
 * engine routes between. Choosing here is what gives the session a bank_id;
 * until then no stock-touching endpoint will answer.
 */
export default function FacilitySelectScreen() {
  const { user, selectFacility, signOut } = useAuth();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [role, setRole] = useState("OFFICER");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: facilities, isLoading, error: loadError } = useQuery({
    queryKey: ["facilities", "picker"],
    queryFn: () => facilityApi.list({ includeStock: true }),
    staleTime: 30_000,
  });

  const filtered = useMemo(() => {
    if (!facilities) return [];
    const needle = search.trim().toLowerCase();
    if (!needle) return facilities;
    return facilities.filter((facility) =>
      [facility.name, facility.short_name, facility.id, facility.code, facility.address, facility.pincode]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(needle)),
    );
  }, [facilities, search]);

  const selected = facilities?.find((facility) => facility.id === selectedId) ?? null;

  async function handleContinue() {
    if (!selectedId) return;
    setBusy(true);
    setError(null);
    try {
      await selectFacility(selectedId, role);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not select that facility.");
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#F5F5F7" }}>
      <header className="px-8 py-5 bg-white flex items-center justify-between" style={{ borderBottom: "1px solid #E5E5E7" }}>
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-[7px] flex items-center justify-center" style={{ background: "#C41230" }}>
            <span className="text-white text-[13px] font-bold">P</span>
          </div>
          <span className="text-[16px] font-semibold text-[#1D1D1F]">PlateletIQ</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-[13px] text-[#6E6E73]">{user?.email}</span>
          <button
            onClick={signOut}
            className="text-[13px] text-[#6E6E73] hover:text-[#1D1D1F] transition-colors cursor-pointer"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-[1100px] w-full mx-auto px-8 py-10">
        <h1 className="text-[28px] font-semibold text-[#1D1D1F] tracking-tight">
          Which facility are you on duty at?
        </h1>
        <p className="text-[14px] text-[#6E6E73] mt-1.5 mb-7 max-w-[640px] leading-relaxed">
          Everything that follows — your inventory, your forecast, and which side of a transfer you
          are on — is scoped to this choice. You can switch later from the sidebar.
        </p>

        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name, eRaktKosh code, locality, or pincode"
          className="w-full max-w-[520px] bg-white border border-[#E5E5E7] text-[#1D1D1F] text-[14px] rounded-[10px] px-4 py-3 mb-6 focus:outline-none focus:border-[#0071E3]"
        />

        {isLoading && <p className="text-[14px] text-[#6E6E73]">Loading the facility registry…</p>}

        {loadError && (
          <div className="rounded-[12px] px-5 py-4 max-w-[640px]" style={{ background: "#FFF2F2", border: "1px solid #F5C6C6" }}>
            <p className="text-[14px] font-medium text-[#B3261E]">Could not load the facility registry.</p>
            <p className="text-[13px] text-[#B3261E] mt-1 leading-relaxed">
              {loadError instanceof Error ? loadError.message : "Unknown error."}
            </p>
          </div>
        )}

        {facilities && filtered.length === 0 && (
          <p className="text-[14px] text-[#6E6E73]">No facility matches “{search}”.</p>
        )}

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((facility) => (
            <FacilityCard
              key={facility.id}
              facility={facility}
              selected={facility.id === selectedId}
              onSelect={() => setSelectedId(facility.id)}
            />
          ))}
        </div>
      </main>

      {/* Confirmation bar, only once something is picked */}
      {selected && (
        <footer className="sticky bottom-0 bg-white px-8 py-4" style={{ borderTop: "1px solid #E5E5E7" }}>
          <div className="max-w-[1100px] mx-auto flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-[240px]">
              <p className="text-[14px] font-medium text-[#1D1D1F]">{selected.name}</p>
              <p className="text-[12px] text-[#6E6E73] mt-0.5">
                {selected.id} · eRaktKosh {selected.code} · {selected.address}
              </p>
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold text-[#6E6E73] uppercase tracking-wider">Your role</span>
              <select
                value={role}
                onChange={(event) => setRole(event.target.value)}
                className="bg-[#F5F5F7] border border-[#E5E5E7] text-[#1D1D1F] text-[13px] rounded-[9px] px-3 py-2 focus:outline-none focus:border-[#0071E3]"
              >
                {ROLES.map((entry) => (
                  <option key={entry.id} value={entry.id}>{entry.label}</option>
                ))}
              </select>
            </label>

            <button
              onClick={handleContinue}
              disabled={busy}
              className="px-7 py-3 text-white text-[15px] font-medium rounded-full transition-colors disabled:opacity-50 cursor-pointer"
              style={{ background: "#0071E3" }}
            >
              {busy ? "Signing in…" : "Continue"}
            </button>
          </div>

          {error && <p className="max-w-[1100px] mx-auto text-[13px] text-[#B3261E] mt-2">{error}</p>}
        </footer>
      )}
    </div>
  );
}

function FacilityCard({
  facility,
  selected,
  onSelect,
}: {
  facility: Facility;
  selected: boolean;
  onSelect: () => void;
}) {
  const sdp = facility.stock?.SDP;
  const rdp = facility.stock?.RDP;

  return (
    <button
      type="button"
      onClick={onSelect}
      className="text-left bg-white rounded-[14px] p-5 transition-all cursor-pointer hover:shadow-md"
      style={{
        border: selected ? "2px solid #0071E3" : "1px solid #E5E5E7",
        boxShadow: selected ? "0 0 0 3px rgba(0,113,227,0.12)" : undefined,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[14px] font-semibold text-[#1D1D1F] leading-snug">{facility.short_name}</p>
        {selected && (
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: "#E8F1FD", color: "#0071E3" }}>
            Selected
          </span>
        )}
      </div>

      <p className="text-[12px] text-[#6E6E73] mt-1 leading-snug">{facility.tier}</p>
      <p className="text-[12px] text-[#AEAEB2] mt-2 leading-snug">{facility.address}</p>
      <p className="text-[11px] text-[#AEAEB2] mt-1 font-mono">
        {facility.id} · {facility.pincode}
      </p>

      <div className="flex gap-5 mt-4 pt-3" style={{ borderTop: "1px solid #F0F0F0" }}>
        <StockReadout label="SDP" available={sdp?.available} expiring={sdp?.expiring_24h} />
        <StockReadout label="RDP" available={rdp?.available} expiring={rdp?.expiring_24h} />
      </div>
    </button>
  );
}

function StockReadout({
  label,
  available,
  expiring,
}: {
  label: string;
  available?: number;
  expiring?: number;
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-[#AEAEB2] uppercase tracking-wider">{label}</p>
      <p className="text-[17px] font-semibold text-[#1D1D1F] leading-tight mt-0.5">
        {available ?? "—"}
      </p>
      {expiring ? (
        <p className="text-[11px] mt-0.5" style={{ color: "#C77700" }}>{expiring} expire in 24h</p>
      ) : (
        <p className="text-[11px] text-[#AEAEB2] mt-0.5">usable units</p>
      )}
    </div>
  );
}
