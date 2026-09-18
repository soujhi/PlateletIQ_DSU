import { useQuery } from "@tanstack/react-query";
import { Card, SectionLabel, FreshnessBadge, ProvenanceBadge } from "../shared";
import { networkApi } from "../api/endpoints";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { ErrorState } from "../components/ErrorState";

export default function NetworkScreen() {
  const { data: networkData, isLoading, error, refetch } = useQuery({
    queryKey: ["networkData"],
    queryFn: networkApi.getNetwork,
  });

  if (isLoading) {
    return (
      <div className="p-8 max-w-3xl space-y-6">
        <LoadingSkeleton height="150px" />
        <LoadingSkeleton height="80px" />
        <LoadingSkeleton height="300px" />
      </div>
    );
  }

  if (error || !networkData) {
    return (
      <div className="p-8 max-w-3xl">
        <ErrorState message="Failed to load eRaktKosh network data." onRetry={refetch} />
      </div>
    );
  }

  const summary = networkData.summary;
  const rawDistricts = networkData.districts || [];

  // Sort districts by stock (highest first)
  const districts = [...rawDistricts].sort((a: any, b: any) => {
    const totalA = (a.rdp_units || 0) + (a.sdp_units || 0);
    const totalB = (b.rdp_units || 0) + (b.sdp_units || 0);
    return totalB - totalA;
  });

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-8">
        <p className="text-[11px] font-semibold text-[#AEAEB2] uppercase tracking-widest mb-2">Network</p>
        <h1 className="text-[28px] font-bold text-[#1D1D1F] tracking-tight">
          Cross-bank inventory
        </h1>
        <p className="text-[14px] text-[#6E6E73] mt-1 font-light">Transfer signals and network-wide stock position.</p>
      </div>

      {/* SDP Scarcity Alert Card — Top */}
      <div
        className="rounded-[14px] border border-[#F0DFC5] p-6 mb-6"
        style={{ background: "#FFFCF7", borderLeft: "4px solid #B25000" }}
      >
        <div className="flex items-start justify-between mb-5">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <p className="text-[13px] font-bold text-[#B25000] uppercase tracking-wide">SDP Scarcity Alert</p>
              <span className="text-[12px] text-[#AEAEB2]">· Live from eRaktKosh</span>
            </div>
            <p className="text-[12px] text-[#AEAEB2]">
              {summary.total_hospitals} hospitals · {summary.total_districts} districts · scraped Sep 2026
            </p>
          </div>
          <ProvenanceBadge type="external" />
        </div>

        <div className="grid grid-cols-3 gap-5 mb-5">
          {[
            { value: `${summary.sdp_pct}%`,  label: "of all stock is SDP (4.7%)", color: "text-[#B25000]" },
            { value: `${summary.zero_sdp_districts}/${summary.total_districts}`, label: "districts have zero SDP (23/32)", color: "text-[#C41230]" },
            { value: `${Math.round(summary.avg_staleness_hours / 24.0)}d`,  label: "average data age (170.6h)", color: "text-[#1D1D1F]" },
          ].map((m) => (
            <div key={m.label}>
              <p className={`text-[32px] font-bold leading-none tracking-tight mb-1 ${m.color}`}>{m.value}</p>
              <p className="text-[12px] text-[#6E6E73]">{m.label}</p>
            </div>
          ))}
        </div>

        <p className="text-[12px] text-[#AEAEB2] leading-relaxed">
          SDP represents only 4.7% of all platelet stock across 756 tracked hospitals. 23 of 32 districts show zero SDP availability. eRaktKosh public portal — data age varies by hospital.
        </p>
      </div>

      {/* Data Quality Card */}
      <Card className="p-6 mb-6 border-l-4 border-l-[#6E3FA3]">
        <div className="flex items-center justify-between mb-3">
          <SectionLabel>Data Quality &amp; Staleness</SectionLabel>
          <ProvenanceBadge type="external" />
        </div>
        <p className="text-[15px] font-bold text-[#1D1D1F] mb-1">
          Avg staleness: 170.6h · 32% records &gt;24h stale · Offline flag: NON-FUNCTIONAL
        </p>
        <p className="text-[12px] text-[#6E6E73]">
          722 of 2,259 records are stale. Offline status returns 1 for all records. Source entry timestamp drives operational freshness.
        </p>
      </Card>

      {/* District table sorted by stock */}
      <Card className="overflow-hidden" index={2}>
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <div>
            <p className="text-[15px] font-semibold text-[#1D1D1F]">District-level inventory (Sorted by Total Stock)</p>
            <p className="text-[12px] text-[#AEAEB2] mt-0.5">Green dot = CURRENT, Amber = AGING, Red = STALE/VERY_STALE</p>
          </div>
          <div className="flex items-center gap-1.5">
            <ProvenanceBadge type="external" />
          </div>
        </div>

        <table className="w-full">
          <thead>
            <tr style={{ borderTop: "1px solid #F5F5F7", borderBottom: "1px solid #F5F5F7" }}>
              {["District / State", "RDP", "SDP", "Hospitals", "Freshness"].map((h) => (
                <th key={h} className="text-left px-6 py-3 text-[10px] font-semibold text-[#AEAEB2] uppercase tracking-widest">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {districts.map((h: any, i: number) => {
              const totalStock = (h.rdp_units || 0) + (h.sdp_units || 0);
              const isZeroStock = totalStock === 0;
              const freshnessState = h.freshness_state === "CURRENT" ? "fresh" : h.freshness_state === "AGING" ? "aging" : h.freshness_state === "STALE" ? "stale" : "very-stale";

              return (
                <tr
                  key={h.district}
                  className={`transition-colors ${isZeroStock ? "bg-[#FBE8EC] hover:bg-[#F8D7DA]" : "hover:bg-[#FAFAFA]"}`}
                  style={{ borderBottom: i < districts.length - 1 ? "1px solid #F5F5F7" : "none" }}
                >
                  <td className="px-6 py-4">
                    <p className={`text-[14px] font-medium ${isZeroStock ? "text-[#C41230] font-bold" : "text-[#1D1D1F]"}`}>
                      {h.district} {isZeroStock ? "(Zero Stock)" : ""}
                    </p>
                    <p className="text-[11px] text-[#AEAEB2] mt-0.5">{h.state}</p>
                  </td>
                  <td className="px-6 py-4 text-[14px] font-medium text-[#1D1D1F]">{h.rdp_units}</td>
                  <td className="px-6 py-4">
                    <span className={`text-[14px] font-medium ${h.sdp_units === 0 ? "text-[#C41230] font-bold" : "text-[#1D1D1F]"}`}>
                      {h.sdp_units}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-[15px] font-bold text-[#1D1D1F]">{h.hospitals}</td>
                  <td className="px-6 py-4"><FreshnessBadge state={freshnessState} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
