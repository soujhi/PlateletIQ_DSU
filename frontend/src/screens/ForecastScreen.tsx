import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, ProvenanceBadge, Drawer, SectionLabel } from "../shared";
import { forecastApi } from "../api/endpoints";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { ErrorState } from "../components/ErrorState";
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceArea,
} from "recharts";

type Tab = "7d" | "14d" | "30d";

export default function ForecastScreen() {
  const [tab, setTab] = useState<Tab>("7d");
  const [modelDetailsOpen, setModelDetailsOpen] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["forecastLatest"],
    queryFn: forecastApi.getLatest,
  });

  if (isLoading) {
    return (
      <div className="p-8 max-w-3xl space-y-6">
        <LoadingSkeleton height="60px" />
        <LoadingSkeleton height="240px" />
        <LoadingSkeleton height="150px" />
      </div>
    );
  }

  if (error || !data || !data.forecast) {
    return (
      <div className="p-8 max-w-3xl">
        <ErrorState message="Forecast unavailable." onRetry={refetch} />
      </div>
    );
  }

  const rawForecast = data.forecast;
  
  const chartData = rawForecast.map((f: any) => {
    const d = new Date(f.date);
    const dayOfWeek = d.getDay(); // 0 is Sun, 6 is Sat
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return {
      ...f,
      dayName: dayNames[dayOfWeek],
      isWeekend,
    };
  });

  const formatXAxis = (tickItem: string) => {
    const d = new Date(tickItem);
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return dayNames[d.getDay()];
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const dataPoint = payload[0].payload;
      return (
        <div className="bg-white p-3 border border-[#E5E5E7] rounded-[10px] shadow-sm text-[12px] space-y-1">
          <p className="font-semibold text-[#1D1D1F] border-b pb-1 mb-1">{dataPoint.date} ({dataPoint.dayName})</p>
          <div className="flex justify-between gap-4">
            <span className="text-[#6E6E73]">q50 Point Forecast:</span>
            <span className="font-bold text-[#0071E3]">{dataPoint.q50} units</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-[#6E6E73]">q67 Upper Band:</span>
            <span className="font-bold text-[#1D1D1F]">{dataPoint.q67} units</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-[#6E6E73]">q90 Stress Buffer:</span>
            <span className="font-bold text-[#6E3FA3]">{dataPoint.q90} units</span>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div>
      <div className="bg-[#FFF8E7] border-b border-[#F5D99A] text-[#BA7517] text-[12px] px-8 py-2.5 font-medium flex items-center justify-between">
        <span>⚠ Demo mode — forecast from German hospital dataset (2008–2018) calibrated with WHO India monthly index</span>
        <button onClick={() => setModelDetailsOpen(true)} className="underline cursor-pointer hover:opacity-80">Inspect Model Card →</button>
      </div>

      <div className="p-8 max-w-3xl">
        <div className="mb-6">
          <p className="text-[10px] font-bold text-[#AEAEB2] uppercase tracking-[0.1em] mb-1">
            FORECAST
          </p>
          <h1 className="text-[22px] font-bold text-[#1D1D1F] tracking-tight leading-none">
            Demand outlook
          </h1>
        </div>

        {/* Horizon tabs */}
        <div className="inline-flex gap-[2px] bg-[#F5F5F7] p-[3px] rounded-[16px] mb-6">
          {(["7d", "14d", "30d"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-[5px] rounded-full text-[12px] font-medium transition-all ${
                tab === t ? "bg-white text-[#1D1D1F] shadow-sm" : "text-[#6E6E73] hover:text-[#1D1D1F]"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Chart card */}
        <Card className="p-6 mb-6" index={0}>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-[15px] font-semibold text-[#1D1D1F]">Demand forecast with uncertainty bands</h2>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setModelDetailsOpen(true)}
                className="text-[12px] text-[#0071E3] bg-[#E8F2FD] hover:bg-[#D5E8F9] px-2.5 py-1 rounded-full font-medium transition-colors cursor-pointer"
              >
                LASSO v1.4 · MASE 0.734
              </button>
              <ProvenanceBadge type="model" />
            </div>
          </div>
          <div style={{ height: "140px" }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F5F5F5" vertical={false} />
                <XAxis dataKey="date" tickFormatter={formatXAxis} tick={{ fontSize: 10, fill: "#AEAEB2", fontFamily: "monospace" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#AEAEB2" }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />

                {chartData.map((d: any, i: number) =>
                  d.isWeekend ? (
                    <ReferenceArea
                      key={i}
                      x1={d.date}
                      x2={d.date}
                      fill="#F5F5F7"
                      fillOpacity={1}
                    />
                  ) : null
                )}

                <Area type="monotone" dataKey="q90" fill="rgba(110,63,163,0.08)" stroke="none" />
                <Area type="monotone" dataKey="q67" fill="rgba(0,113,227,0.12)" stroke="none" />
                <Line type="monotone" dataKey="q50" stroke="none" dot={{ r: 4, fill: "#0071E3", stroke: "#fff", strokeWidth: 2 }} activeDot={{ r: 6 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center justify-center gap-6 mt-4 text-[12px] text-[#6E6E73]">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#0071E3]"></span>
              <span>q50 median</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded bg-[rgba(0,113,227,0.2)]"></span>
              <span>q67 band</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded bg-[rgba(110,63,163,0.15)]"></span>
              <span>q90 buffer</span>
            </div>
          </div>
        </Card>

        {/* Prediction heatmap card */}
        <Card className="p-6 mb-6" index={1}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[15px] font-semibold text-[#1D1D1F]">Prediction heatmap</h2>
            <ProvenanceBadge type="model" />
          </div>
          <div className="grid grid-cols-7 gap-2">
            {chartData.map((d: any) => {
              const alpha = Math.min(1.0, Math.max(0.15, (d.q50 - 10) / 25));
              return (
                <div key={d.date} className="flex flex-col items-center">
                  <div
                    className="w-full aspect-square rounded-[10px] flex items-center justify-center transition-transform hover:scale-105"
                    style={{ backgroundColor: `rgba(0, 113, 227, ${alpha})` }}
                  >
                    <span className="text-white font-bold text-[18px]">{Math.round(d.q50)}</span>
                  </div>
                  <span className="text-[10px] text-[#AEAEB2] font-mono mt-1">{d.date.slice(5)}</span>
                </div>
              );
            })}
          </div>
        </Card>

        {/* 2 insight cards */}
        <div className="grid grid-cols-2 gap-4">
          <Card className="bg-[#F5F5F7] border border-[#E5E5E7] rounded-[10px] py-[14px] px-[16px] shadow-none" index={2}>
            <p className="text-[10px] font-semibold text-[#AEAEB2] uppercase tracking-widest mb-3">WEEKLY PATTERN</p>
            <div className="flex items-end gap-[2px] h-[24px] mb-3">
              {[85, 75, 70, 80, 90, 40, 30].map((h, i) => (
                <div
                  key={i}
                  className={`flex-1 rounded-t-sm ${i >= 5 ? 'bg-[#E5E5E7]' : 'bg-[#B5D4F4]'}`}
                  style={{ height: `${h}%` }}
                ></div>
              ))}
            </div>
            <p className="text-[13px] text-[#1D1D1F] leading-snug">Mon–Fri peak, weekend demand ~40% lower</p>
          </Card>
          
          <Card className="bg-[#F5F5F7] border border-[#E5E5E7] rounded-[10px] py-[14px] px-[16px] shadow-none" index={3}>
            <p className="text-[10px] font-semibold text-[#AEAEB2] uppercase tracking-widest mb-3">TRAINING DATA</p>
            <div className="mb-2">
              <span className="text-[20px] font-bold text-[#1D1D1F]">4,018</span>
              <span className="text-[12px] text-[#6E6E73] ml-1">days</span>
            </div>
            <p className="text-[13px] text-[#1D1D1F] leading-snug mb-2">German hospital data (2008–2018)</p>
            <button onClick={() => setModelDetailsOpen(true)} className="text-[11px] text-[#0071E3] hover:underline cursor-pointer">View Model Card &amp; Specs →</button>
          </Card>
        </div>
      </div>

      {/* Model Specifications Drawer */}
      {modelDetailsOpen && (
        <Drawer
          title="LASSO v1.4 Model Specifications"
          subtitle="PlateletIQ Machine Learning Architecture & Evaluation"
          onClose={() => setModelDetailsOpen(false)}
          wide
        >
          <div className="space-y-6">
            <div className="bg-[#E8F2FD] border border-[#B5D4F4] rounded-[12px] p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[14px] font-bold text-[#0071E3]">LASSO Regularized Regression</span>
                <ProvenanceBadge type="model" />
              </div>
              <p className="text-[13px] text-[#1D1D1F] leading-relaxed">
                Trained on 4,018 days of daily platelet issuing records (Aachen hospital dataset 2008–2018). Target variable transformed via square root ($\sqrt{y}$) to stabilize variance before L1 regularized parameter estimation.
              </p>
            </div>

            <div>
              <SectionLabel>Benchmark Performance Metrics (Test Set = 804 Days)</SectionLabel>
              <div className="grid grid-cols-3 gap-3 mt-2">
                <div className="bg-[#F5F5F7] p-3.5 rounded-[10px] text-center">
                  <p className="text-[10px] font-bold text-[#AEAEB2] uppercase mb-1">PlateletIQ MASE</p>
                  <p className="text-[22px] font-bold text-[#0071E3]">0.734</p>
                  <p className="text-[10px] text-[#1A8A2C] mt-0.5">26% beats Naïve</p>
                </div>
                <div className="bg-[#F5F5F7] p-3.5 rounded-[10px] text-center">
                  <p className="text-[10px] font-bold text-[#AEAEB2] uppercase mb-1">Naïve Baseline</p>
                  <p className="text-[22px] font-bold text-[#6E6E73]">0.993</p>
                  <p className="text-[10px] text-[#6E6E73] mt-0.5">Last week = next week</p>
                </div>
                <div className="bg-[#F5F5F7] p-3.5 rounded-[10px] text-center">
                  <p className="text-[10px] font-bold text-[#AEAEB2] uppercase mb-1">Schilling et al. 2022</p>
                  <p className="text-[22px] font-bold text-[#BA7517]">0.746</p>
                  <p className="text-[10px] text-[#BA7517] mt-0.5">Published Benchmark</p>
                </div>
              </div>
            </div>

            <div>
              <SectionLabel>Model Features &amp; Engineering</SectionLabel>
              <div className="space-y-2 mt-2">
                {[
                  { name: "Day-of-Week Dummies", desc: "Mon–Sun categorical indicators capturing surgical schedule peaks (Mon–Fri)" },
                  { name: "Lag Features", desc: "Lags at t-1, t-2, t-3, t-4, t-5, t-6, t-7, t-14, t-21 days" },
                  { name: "Rolling Windows", desc: "7-day, 14-day, and 28-day rolling mean demand" },
                  { name: "Recency Exponential Roll", desc: "7-day rolling window weighted by exponential decay (halflife = 365 days)" },
                  { name: "India Seasonal Calibration", desc: "Monthly seasonal multipliers mapped via WHO xMart India series (Nov index = 1.83)" },
                ].map((f) => (
                  <div key={f.name} className="flex justify-between py-2 border-b border-[#F5F5F7]">
                    <span className="text-[13px] font-semibold text-[#1D1D1F]">{f.name}</span>
                    <span className="text-[12px] text-[#6E6E73] max-w-[300px] text-right">{f.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Drawer>
      )}
    </div>
  );
}
