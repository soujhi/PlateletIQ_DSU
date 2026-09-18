import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, SectionLabel, ProvenanceBadge, Drawer } from "../shared";
import { campApi } from "../api/endpoints";

const initialMonths = [
  { m: "SEP", level: "LOW",      current: true },
  { m: "OCT", level: "MODERATE", current: false },
  { m: "NOV", level: "HIGH",     current: false },
  { m: "DEC", level: "HIGH",     current: false },
  { m: "JAN", level: "MODERATE", current: false },
  { m: "FEB", level: "LOW",      current: false },
];

const levelColor = (l: string) => {
  if (l === "HIGH")     return "bg-[#C41230] text-white";
  if (l === "MODERATE") return "bg-[#B25000] text-white";
  return "bg-[#E5E5E7] text-[#6E6E73]";
};

const analogues = [
  {
    country: "Bangladesh",
    r: "+0.970",
    status: "accepted",
    detail: "Strong weekly demand correlation. Used as primary seasonal analogue for India. Urban hospital-based demand pattern matches well across Mon–Fri elective surgery scheduling.",
    positive: true,
  },
  {
    country: "Sri Lanka",
    r: "−0.228",
    status: "rejected",
    detail: "Negative correlation — inverse weekly pattern to India. Likely explained by different case-mix and reporting cadence. Excluded from all planning outputs.",
    positive: false,
  },
];

export default function CampPlanningScreen() {
  const [assumptionsOpen, setAssumptionsOpen] = useState(false);
  const [adjustPlanOpen, setAdjustPlanOpen] = useState(false);
  const [campsCount, setCampsCount] = useState(2);
  const [targetUnitsPerCamp, setTargetUnitsPerCamp] = useState(70);
  const [targetMonth, setTargetMonth] = useState("October");
  const [adjustNotice, setAdjustNotice] = useState<string | null>(null);

  const { data: seasonalData } = useQuery({
    queryKey: ["campSeasonal"],
    queryFn: campApi.getSeasonal,
  });

  const novIndex = seasonalData?.november_index || 1.83;
  const projectedCollectionUnits = campsCount * targetUnitsPerCamp;

  const handleAdjustSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAdjustNotice(`Camp plan updated: ${campsCount} camps scheduled for ${targetMonth} (${projectedCollectionUnits} target units).`);
    setAdjustPlanOpen(false);
  };

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-2">
        <h1 className="text-[28px] font-semibold text-[#1D1D1F] tracking-tight">Camp Planning</h1>
        <p className="text-[14px] text-[#6E6E73] mt-1">What should we prepare for over the next 3–6 months?</p>
      </div>

      {/* Limitation notice — permanent */}
      <div className="mt-4 mb-6 px-4 py-3 bg-[#F5F5F7] border border-[#E5E5E7] rounded-[10px]">
        <p className="text-[12px] text-[#6E6E73] leading-relaxed">
          <span className="font-semibold text-[#1D1D1F]">Planning notice:</span>{" "}
          This is collection planning, not a demand forecast. Ranges are shown — not false-precision point estimates. Results depend on the bridge coefficient from the analogue market. Not donor-level eligibility or patient-level clinical advice.
        </p>
      </div>

      {adjustNotice && (
        <div className="mb-6 px-4 py-3 bg-[#E8F4EB] border border-[#A5D6A7] text-[#1A8A2C] rounded-[10px] flex items-center justify-between text-[13px] font-medium">
          <span>✓ {adjustNotice}</span>
          <button onClick={() => setAdjustNotice(null)} className="text-[#1A8A2C] text-[16px] cursor-pointer">✕</button>
        </div>
      )}

      {/* 6-month outlook timeline */}
      <Card className="p-6 mb-6">
        <SectionLabel>Collection outlook · Next 6 months</SectionLabel>
        <div className="grid grid-cols-6 gap-2">
          {initialMonths.map(m => (
            <div key={m.m} className="text-center">
              <p className={`text-[11px] font-semibold mb-2 ${m.current ? "text-[#0071E3]" : "text-[#6E6E73]"}`}>
                {m.m}
              </p>
              <div className={`rounded-[8px] px-1 py-1.5 text-[11px] font-semibold text-center ${levelColor(m.level)} ${m.current ? "ring-2 ring-[#0071E3] ring-offset-1" : ""}`}>
                {m.level}
              </div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-[#6E6E73] mt-3">
          Seasonal outlook based on historical pattern + Bangladesh analogue. November–December is the peak demand window.
        </p>
      </Card>

      {/* Expected collection need */}
      <Card className="p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <SectionLabel>Expected collection need</SectionLabel>
          <ProvenanceBadge type="model" />
        </div>
        <div className="mb-4">
          <p className="text-[40px] font-bold text-[#1D1D1F] leading-none">3,240–4,120</p>
          <p className="text-[14px] text-[#6E6E73] mt-1.5">units · next 6 months · planning range, not a point estimate</p>
        </div>
        <p className="text-[13px] text-[#6E6E73]">
          Based on projected demand and current collection capacity. Range reflects uncertainty in the bridge coefficient from Bangladesh analogue.
        </p>

        {/* Sensitivity */}
        <div className="mt-4 pt-4 border-t border-[#E5E5E7]">
          <SectionLabel>Sensitivity analysis</SectionLabel>
          <div className="space-y-0">
            {[
              { label: "Low demand scenario",      value: "3,240 units" },
              { label: "Expected scenario",        value: "3,680 units" },
              { label: "High demand scenario",     value: "4,120 units" },
            ].map(r => (
              <div key={r.label} className="flex justify-between py-2.5 border-b border-[#F5F5F7]">
                <span className="text-[13px] text-[#6E6E73]">{r.label}</span>
                <span className="text-[15px] font-semibold text-[#1D1D1F]">{r.value}</span>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* Recommended camps */}
      <Card className="p-6 mb-6">
        <SectionLabel>Recommended camps — {targetMonth}</SectionLabel>
        <div className="bg-[#F0F7FF] rounded-[10px] p-4 mb-4">
          <p className="text-[14px] font-semibold text-[#0071E3] mb-1">
            Govt. General Hospital Chennai · {campsCount} platelet-focused camps
          </p>
          <p className="text-[13px] text-[#1D1D1F]">
            Projected target: +{projectedCollectionUnits} units · Suggested timing: Week 2 + Week 4
          </p>
          <p className="text-[13px] text-[#6E6E73] mt-1">
            Approx. {targetUnitsPerCamp} units/camp · Apheresis capacity: 80 units/camp max
          </p>
        </div>
        <div className="space-y-2">
          <p className="text-[12px] font-semibold text-[#6E6E73] uppercase tracking-wide mb-2">Why this plan?</p>
          {[
            "Projected demand · Nov–Dec peak approaching",
            "Current collection capacity · 480 units/month at Govt. General Hospital Chennai",
            `Historical seasonal pattern · November +83% above annual mean (WHO xMart, M11=${novIndex})`,
            "External signals · dengue and weather as tactical context only",
          ].map((d, i) => (
            <div key={i} className="flex gap-2">
              <span className="text-[#0071E3] text-[12px] flex-shrink-0 mt-0.5">•</span>
              <span className="text-[13px] text-[#1D1D1F]">{d}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-3 mt-5">
          <button
            onClick={() => setAssumptionsOpen(!assumptionsOpen)}
            className="px-4 py-2 bg-[#F5F5F7] text-[#1D1D1F] text-[13px] font-medium rounded-full hover:bg-[#E5E5E7] transition-colors cursor-pointer"
          >
            {assumptionsOpen ? "Hide assumptions" : "View assumptions"}
          </button>
          <button
            onClick={() => setAdjustPlanOpen(true)}
            className="px-4 py-2 bg-[#0071E3] text-white text-[13px] font-medium rounded-full hover:bg-[#0058B0] transition-colors cursor-pointer"
          >
            Adjust plan
          </button>
        </div>

        {assumptionsOpen && (
          <div className="mt-4 pt-4 border-t border-[#E5E5E7] space-y-2">
            {[
              { label: "Bridge coefficient (Bangladesh)", value: "0.970 · primary analogue" },
              { label: "Seasonal index — Nov",            value: "1.83 (from WHO xMart API, India monthly series)" },
              { label: "Camp yield",                      value: `≈${targetUnitsPerCamp} units/camp (configured)` },
              { label: "Apheresis capacity",              value: "80 units/camp max" },
              { label: "Weather signal",                  value: "Context only — not a causal demand predictor" },
            ].map(a => (
              <div key={a.label} className="flex justify-between py-2 border-b border-[#F5F5F7]">
                <span className="text-[12px] text-[#6E6E73]">{a.label}</span>
                <span className="text-[12px] font-medium text-[#1D1D1F] max-w-[200px] text-right">{a.value}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Analogue market evidence */}
      <Card className="p-6">
        <SectionLabel>Analogue market evidence</SectionLabel>
        <p className="text-[12px] text-[#6E6E73] mb-4">
          Weekly demand correlation with India used to bridge seasonal patterns. Only markets with strong positive correlation are used.
        </p>

        <div className="space-y-3">
          {analogues.map(a => (
            <div
              key={a.country}
              className={`rounded-[10px] p-4 border ${
                a.positive
                  ? "bg-[#E6F4E8] border-[#C3DEC6]"
                  : "bg-[#F5F5F7] border-[#E5E5E7] opacity-60"
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <span className={`text-[14px] font-semibold ${a.positive ? "text-[#1D1D1F]" : "text-[#AEAEB2]"}`}>
                    {a.country}
                  </span>
                  {!a.positive && (
                    <span className="ml-2 text-[11px] font-semibold text-[#C41230] uppercase tracking-wide bg-[#FBE8EC] px-2 py-0.5 rounded-full">
                      Rejected
                    </span>
                  )}
                  {a.positive && (
                    <span className="ml-2 text-[11px] font-semibold text-[#1A8A2C] uppercase tracking-wide bg-[#C3DEC6] px-2 py-0.5 rounded-full">
                      Primary analogue
                    </span>
                  )}
                </div>
                <span className={`text-[22px] font-bold ${a.positive ? "text-[#1A8A2C]" : "text-[#AEAEB2]"}`}>
                  r = {a.r}
                </span>
              </div>
              <p className={`text-[12px] leading-relaxed ${a.positive ? "text-[#1D1D1F]" : "text-[#AEAEB2]"}`}>
                {a.detail}
              </p>
            </div>
          ))}
        </div>

        <p className="text-[11px] text-[#6E6E73] mt-4">
          Bangladesh r = +0.970 is the weekly analogue. Sri Lanka r = −0.228 is excluded. This is India/Bangladesh seasonal evidence as supporting context — not proof that the German demand model is India-trained.
        </p>
      </Card>

      {/* Adjust Plan Drawer Modal */}
      {adjustPlanOpen && (
        <Drawer
          title="Adjust Camp Planning Parameters"
          subtitle="Configure seasonal collection targets for Govt. General Hospital Chennai"
          onClose={() => setAdjustPlanOpen(false)}
        >
          <form onSubmit={handleAdjustSubmit} className="space-y-5">
            <div>
              <label className="block text-[12px] font-semibold text-[#1D1D1F] mb-1.5">Target Month</label>
              <select
                value={targetMonth}
                onChange={(e) => setTargetMonth(e.target.value)}
                className="w-full border border-[#E5E5E7] rounded-[8px] p-2.5 text-[13px] outline-none focus:border-[#0071E3]"
              >
                <option value="October">October (Dengue peak prep)</option>
                <option value="November">November (Peak seasonal demand)</option>
                <option value="December">December (Year-end surge)</option>
              </select>
            </div>

            <div>
              <label className="block text-[12px] font-semibold text-[#1D1D1F] mb-1.5">Number of Camps Scheduled</label>
              <input
                type="number"
                min={1}
                max={10}
                value={campsCount}
                onChange={(e) => setCampsCount(Number(e.target.value))}
                className="w-full border border-[#E5E5E7] rounded-[8px] p-2.5 text-[13px] outline-none focus:border-[#0071E3]"
              />
            </div>

            <div>
              <label className="block text-[12px] font-semibold text-[#1D1D1F] mb-1.5">Target Yield Per Camp (Units)</label>
              <input
                type="number"
                min={20}
                max={80}
                value={targetUnitsPerCamp}
                onChange={(e) => setTargetUnitsPerCamp(Number(e.target.value))}
                className="w-full border border-[#E5E5E7] rounded-[8px] p-2.5 text-[13px] outline-none focus:border-[#0071E3]"
              />
              <p className="text-[11px] text-[#AEAEB2] mt-1">Maximum apheresis machine limit: 80 units/camp</p>
            </div>

            <div className="p-3 bg-[#F5F5F7] rounded-[8px]">
              <p className="text-[11px] font-semibold text-[#6E6E73] uppercase mb-1">Projected Total Target</p>
              <p className="text-[22px] font-bold text-[#0071E3]">{projectedCollectionUnits} units</p>
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-[#0071E3] text-white text-[14px] font-semibold rounded-full hover:bg-[#0058B0] transition-colors cursor-pointer"
            >
              Save Plan Adjustment
            </button>
          </form>
        </Drawer>
      )}
    </div>
  );
}
