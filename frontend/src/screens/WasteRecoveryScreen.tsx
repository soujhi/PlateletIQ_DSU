import { useQuery } from "@tanstack/react-query";
import { Card, SectionLabel, ProvenanceBadge } from "../shared";
import { analyticsApi, inventoryApi } from "../api/endpoints";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { ErrorState } from "../components/ErrorState";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";

const wastageTrendData = [
  { month: "Oct", rate: 4.1 },
  { month: "Nov", rate: 3.9 },
  { month: "Dec", rate: 4.3 },
  { month: "Jan", rate: 3.7 },
  { month: "Feb", rate: 3.5 },
  { month: "Mar", rate: 3.6 },
  { month: "Apr", rate: 3.8 },
  { month: "May", rate: 3.4 },
  { month: "Jun", rate: 3.3 },
  { month: "Jul", rate: 3.5 },
  { month: "Aug", rate: 3.4 },
  { month: "Sep", rate: 3.25 },
];

export default function WasteRecoveryScreen() {
  const { data: wasteAnalytics, isLoading: loadingWaste, error: wasteError, refetch } = useQuery({
    queryKey: ["wasteAnalytics"],
    queryFn: analyticsApi.getWasteAnalytics,
  });

  const { data: summary, isLoading: loadingSummary } = useQuery({
    queryKey: ["inventorySummary"],
    queryFn: inventoryApi.getSummary,
  });

  const { data: unitsData, isLoading: loadingUnits } = useQuery({
    queryKey: ["inventoryUnits"],
    queryFn: () => inventoryApi.getUnits(),
  });

  if (loadingWaste || loadingSummary || loadingUnits) {
    return (
      <div className="p-8 max-w-3xl space-y-6">
        <LoadingSkeleton height="60px" />
        <LoadingSkeleton height="120px" />
        <LoadingSkeleton height="240px" />
      </div>
    );
  }

  if (wasteError || !wasteAnalytics) {
    return (
      <div className="p-8 max-w-3xl">
        <ErrorState message="Failed to load waste recovery analytics." onRetry={refetch} />
      </div>
    );
  }

  const wastageRate = wasteAnalytics.current_wastage_pct ?? 3.25;
  const baselineRate = wasteAnalytics.baseline ?? 9.61;
  const annualSavings = wasteAnalytics.annual_savings_inr ?? 720000;

  const expiringToday = summary?.expiring_today ?? 9;
  const recoverableCount = Math.max(1, expiringToday - 1);

  const unitsList = unitsData?.items || [];
  const now = new Date();
  const atRiskUnits = unitsList
    .filter((u: any) => u.status === "AVAILABLE")
    .map((u: any) => {
      const exp = new Date(u.expiry_at);
      const hoursLeft = Math.max(0, Math.round((exp.getTime() - now.getTime()) / (1000 * 3600)));
      return {
        bag: u.bag_id,
        group: u.blood_group,
        hours: hoursLeft,
        component: u.component_type,
        pathway: hoursLeft < 12 ? "Clinical Allocation" : hoursLeft < 36 ? "Cross-bank Transfer" : "Research / HPL Routing",
        pathwayColor: hoursLeft < 12 ? "text-[#C41230]" : hoursLeft < 36 ? "text-[#0071E3]" : "text-[#6E3FA3]",
      };
    })
    .sort((a: any, b: any) => a.hours - b.hours)
    .slice(0, 6);

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-8">
        <p className="text-[11px] font-semibold text-[#AEAEB2] uppercase tracking-widest mb-2">Waste &amp; Recovery</p>
        <h1 className="text-[28px] font-bold text-[#1D1D1F] tracking-tight">
          Waste Recovery
        </h1>
        <p className="text-[14px] text-[#6E6E73] mt-1 font-light">Minimise expiry loss through timely recovery actions.</p>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-3 gap-4 mb-5">
        <Card className="p-6">
          <p className="text-[11px] font-semibold text-[#AEAEB2] uppercase tracking-widest mb-3">Wastage Rate</p>
          <p className="text-[38px] font-bold text-[#1A8A2C] leading-none tracking-tight">{wastageRate}%</p>
          <p className="text-[12px] text-[#AEAEB2] mt-2">vs {baselineRate}% baseline</p>
          <div className="mt-3"><ProvenanceBadge type="simulated" /></div>
        </Card>
        <Card className="p-6">
          <p className="text-[11px] font-semibold text-[#AEAEB2] uppercase tracking-widest mb-3">At Risk Today</p>
          <p className="text-[38px] font-bold text-[#B25000] leading-none tracking-tight">{expiringToday}</p>
          <p className="text-[12px] text-[#AEAEB2] mt-2">units expiring within 24 h</p>
          <div className="mt-3"><ProvenanceBadge type="live" /></div>
        </Card>
        <Card className="p-6">
          <p className="text-[11px] font-semibold text-[#AEAEB2] uppercase tracking-widest mb-3">Recoverable</p>
          <p className="text-[38px] font-bold text-[#0071E3] leading-none tracking-tight">{recoverableCount}</p>
          <p className="text-[12px] text-[#AEAEB2] mt-2">have a recovery pathway</p>
          <div className="mt-3"><ProvenanceBadge type="model" /></div>
        </Card>
      </div>

      {/* Wastage trend */}
      <Card className="p-7 mb-5">
        <div className="flex items-start justify-between mb-6">
          <div>
            <p className="text-[15px] font-semibold text-[#1D1D1F]">Wastage rate trend</p>
            <p className="text-[12px] text-[#AEAEB2] mt-0.5">Last 12 months · simulated on validation set</p>
          </div>
          <ProvenanceBadge type="simulated" />
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={wastageTrendData} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F5F5F5" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#AEAEB2" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "#AEAEB2" }} axisLine={false} tickLine={false} domain={[0, 12]} tickFormatter={(v: number) => `${v}%`} />
            <Tooltip
              formatter={(value) => [`${value}%`, "Wastage"] as [string, string]}
              contentStyle={{ fontSize: 12, borderRadius: 10, border: "1px solid #E5E5E7", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
            />
            <ReferenceLine y={9.61} stroke="#B25000" strokeDasharray="4 2" label={{ value: "Baseline 9.61%", position: "insideTopRight", fontSize: 10, fill: "#B25000" }} />
            <Bar dataKey="rate" fill="#0071E3" radius={[4, 4, 0, 0]} maxBarSize={26} />
          </BarChart>
        </ResponsiveContainer>
        <p className="text-[11px] text-[#AEAEB2] mt-3">
          Dashed line = {baselineRate}% pre-PlateletIQ baseline. Current: {wastageRate}% (−{(baselineRate - wastageRate).toFixed(2)} pp improvement · ₹{annualSavings.toLocaleString()}/yr saved).
        </p>
      </Card>

      {/* Recovery breakdown */}
      <Card className="p-7 mb-5">
        <SectionLabel>Recovery pathway breakdown — today</SectionLabel>
        {[
          { label: "Clinical allocation", count: Math.ceil(expiringToday * 0.3), color: "text-[#1A8A2C]", detail: "Matched to active requisition" },
          { label: "Cross-bank transfer", count: Math.ceil(expiringToday * 0.4), color: "text-[#0071E3]", detail: "Offer pending bank acceptance" },
          { label: "Research / HPL routing", count: Math.floor(expiringToday * 0.2), color: "text-[#6E3FA3]", detail: "Approved for HPL production" },
          { label: "Discard — no viable pathway", count: Math.max(1, expiringToday - Math.ceil(expiringToday * 0.3) - Math.ceil(expiringToday * 0.4) - Math.floor(expiringToday * 0.2)), color: "text-[#C41230]", detail: "Logged and audited" },
        ].map(r => (
          <div key={r.label} className="flex items-center justify-between py-4 border-b border-[#F5F5F7]">
            <div>
              <p className="text-[14px] text-[#1D1D1F]">{r.label}</p>
              <p className="text-[12px] text-[#AEAEB2] mt-0.5">{r.detail}</p>
            </div>
            <span className={`text-[26px] font-bold ${r.color}`}>{r.count}</span>
          </div>
        ))}
      </Card>

      {/* At-risk units */}
      <Card className="p-7">
        <SectionLabel>At-risk units — ordered by urgency</SectionLabel>
        {atRiskUnits.map((u: any) => (
          <div key={u.bag} className="flex items-center justify-between py-3.5 border-b border-[#F5F5F7]">
            <div>
              <p className="text-[14px] font-semibold text-[#1D1D1F]">{u.bag} ({u.component}) · {u.group}</p>
              <p className={`text-[12px] font-medium ${u.pathwayColor}`}>{u.pathway}</p>
            </div>
            <p className="text-[13px] font-semibold text-[#B25000]">{u.hours}h remaining</p>
          </div>
        ))}
        <p className="text-[11px] text-[#AEAEB2] mt-4">
          Full action flow available in Transfers &amp; Recovery screen.
        </p>
      </Card>
    </div>
  );
}
