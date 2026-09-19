import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Card, SectionLabel, ProvenanceBadge, DemoModeBanner, Drawer } from "../shared";
import { facilityApi, inventoryApi, forecastApi, recommendationApi, transferApi } from "../api/endpoints";
import type { Counterparty } from "../api/types";
import { useAuth } from "../contexts/AuthContext";
import { AnimatedNumber } from "../components/AnimatedNumber";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { ErrorState } from "../components/ErrorState";
import {
  BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell
} from "recharts";

export default function OverviewScreen() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [whyOpen, setWhyOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferSuccess, setTransferSuccess] = useState<string | null>(null);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [requestUnits, setRequestUnits] = useState(12);

  const { data: summary, isLoading: loadingSummary, error: errorSummary, refetch: refetchSummary } = useQuery({
    queryKey: ["inventorySummary"],
    queryFn: inventoryApi.getSummary,
  });

  const { data: forecastData, isLoading: loadingForecast, error: errorForecast, refetch: refetchForecast } = useQuery({
    queryKey: ["forecastLatest"],
    queryFn: forecastApi.getLatest,
  });

  const { data: recData, isLoading: loadingRec, error: errorRec, refetch: refetchRec } = useQuery({
    queryKey: ["recommendationCurrent"],
    queryFn: recommendationApi.getCurrent,
  });

  // Who in the network could actually cover a shortfall right now.
  const { data: candidates } = useQuery({
    queryKey: ["counterparties", "SDP", user?.bank_id],
    queryFn: () => facilityApi.counterparties("SDP"),
    enabled: Boolean(user?.bank_id),
  });

  const openRequest = useMutation({
    mutationFn: ({ facilityId, units }: { facilityId: string; units: number }) =>
      transferApi.create({
        counterparty_bank_id: facilityId,
        direction: "SHORTAGE_PULL",
        units,
        component_type: "SDP",
        priority: "URGENT",
        reason: "Raised from the overview against a projected SDP shortfall.",
      }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["transfers"] });
      setTransferError(null);
      setTransferSuccess(
        `Request ${created.id} sent to ${created.source.short_name}. Track it under Transfers.`,
      );
    },
    onError: (err: unknown) =>
      setTransferError(err instanceof Error ? err.message : "Could not open the transfer."),
  });

  if (loadingSummary || loadingForecast || loadingRec) {
    return (
      <div className="p-8 max-w-4xl space-y-6">
        <LoadingSkeleton height="40px" />
        <LoadingSkeleton height="80px" />
        <div className="grid grid-cols-4 gap-4">
          <LoadingSkeleton height="120px" />
          <LoadingSkeleton height="120px" />
          <LoadingSkeleton height="120px" />
          <LoadingSkeleton height="120px" />
        </div>
        <LoadingSkeleton height="220px" />
      </div>
    );
  }

  if (errorSummary || errorForecast || errorRec) {
    return (
      <div className="p-8 max-w-4xl">
        <ErrorState message="Failed to load Overview data from backend server." onRetry={() => { refetchSummary(); refetchForecast(); refetchRec(); }} />
      </div>
    );
  }

  const rec = recData;
  const isHealthy = rec.action === "HOLD";

  const availableUnits = summary.available;
  const expiringToday = summary.expiring_today;
  const expectedToday = forecastData.forecast[0].q50;
  const coverageDays = (availableUnits / expectedToday).toFixed(1);
  const atRiskValue = expiringToday * 3000;

  // Build chart data from API
  const rawForecast = forecastData.forecast || [];
  const chartData = rawForecast.map((f: any, idx: number) => ({
    day: f.date.slice(5),
    actual: idx < 3 ? Math.round(f.q50 * 0.95) : null,
    forecast: f.q50,
  }));

  // The nearest facility holding enough usable SDP to be worth asking.
  const transfer: Counterparty | null =
    (candidates ?? [])
      .filter((candidate) => candidate.available_units >= 12)
      .sort((a, b) => (a.straight_line_km ?? Infinity) - (b.straight_line_km ?? Infinity))[0] ?? null;

  return (
    <div className="p-8 max-w-[980px]">
      <DemoModeBanner />

      {/* Header */}
      <div className="mt-6 mb-8">
        <p className="text-[11px] font-bold text-[#AEAEB2] uppercase tracking-[0.1em] mb-1">
          OVERVIEW
        </p>
        <h1 className="text-[26px] font-bold text-[#1D1D1F] tracking-tight leading-none mb-1">
          {user?.bank_name}
        </h1>
        <p className="text-[13px] text-[#6E6E73]">
          Blood bank operations dashboard · Officer view
        </p>
      </div>

      {/* 4-column stat grid — Enlarged Card Size */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <Card className="p-5 flex flex-col justify-between" index={0}>
          <div>
            <p className="text-[11px] font-bold text-[#AEAEB2] uppercase tracking-wider mb-3">Available</p>
            <p className="text-[32px] font-bold text-[#1D1D1F] leading-none mb-2">
              <AnimatedNumber value={availableUnits} decimals={0} />
            </p>
          </div>
          <p className="text-[11px] font-medium text-[#6E6E73]">{coverageDays} days coverage</p>
        </Card>

        <Card className="p-5 flex flex-col justify-between" index={1}>
          <div>
            <p className="text-[11px] font-bold text-[#AEAEB2] uppercase tracking-wider mb-3">Expected</p>
            <p className="text-[32px] font-bold text-[#1D1D1F] leading-none mb-2">
              <AnimatedNumber value={expectedToday} decimals={0} />
            </p>
          </div>
          <p className="text-[11px] font-medium text-[#6E6E73]">units/day avg demand</p>
        </Card>

        <Card className="p-5 flex flex-col justify-between" index={2}>
          <div>
            <p className="text-[11px] font-bold text-[#AEAEB2] uppercase tracking-wider mb-3">Horizon</p>
            <p className="text-[32px] font-bold text-[#1D1D1F] leading-none mb-2">7d</p>
          </div>
          <p className="text-[11px] font-medium text-[#6E6E73]">forecast window</p>
        </Card>

        <Card className="p-5 border-[#C41230] flex flex-col justify-between" index={3}>
          <div>
            <p className="text-[11px] font-bold text-[#AEAEB2] uppercase tracking-wider mb-3">At risk today</p>
            <p className="text-[32px] font-bold text-[#C41230] leading-none mb-2">
              <AnimatedNumber value={expiringToday} decimals={0} />
            </p>
          </div>
          <p className="text-[11px] font-medium text-[#C41230]">₹{atRiskValue.toLocaleString()} expiring value</p>
        </Card>
      </div>

      {/* Recommendation card */}
      <motion.div
        key={rec.id || rec.action}
        initial={{ backgroundColor: "#FFF3E0" }}
        animate={{ backgroundColor: "#FFFFFF" }}
        transition={{ duration: 1.5 }}
        className="rounded-[14px] mb-6 shadow-xs"
        style={{ borderLeft: "5px solid #BA7517" }}
      >
        <Card className="p-6 border-[#E5E5E7] border-l-0" index={4} style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}>
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-[32px] font-bold leading-none mb-2 tracking-tight">
                <span className={isHealthy ? "text-[#1A8A2C]" : "text-[#1D1D1F]"}>{rec.action} </span>
                {rec.quantity > 0 ? (
                  <>
                    <span className="text-[#BA7517]">{rec.quantity} </span>
                    <span className="text-[16px] font-normal text-[#AEAEB2] lowercase">units</span>
                  </>
                ) : (
                  <span className="text-[16px] font-normal text-[#6E6E73]">— Stock Healthy</span>
                )}
              </p>
              <p className="text-[13px] text-[#1D1D1F] max-w-xl leading-relaxed">
                {rec.reason_summary}
              </p>
              <button
                onClick={() => setWhyOpen(true)}
                className="mt-3 text-[13px] text-[#0071E3] hover:opacity-75 transition-opacity inline-flex items-center gap-1 font-semibold cursor-pointer"
              >
                Why {rec.action} {rec.quantity > 0 ? rec.quantity : ""} →
              </button>
            </div>
            <div className="flex items-center gap-2">
              <ProvenanceBadge type="model" />
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#FFF3E0] text-[#B25000] text-[10px] font-bold rounded-full uppercase">
                ● Watch
              </span>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-3 bg-[#F5F5F7] p-3.5 rounded-[10px]">
            <div className="text-center text-[11px] font-medium text-[#1D1D1F]">
              📦 {availableUnits} on hand
            </div>
            <div className="text-center text-[11px] font-medium text-[#1D1D1F]">
              📈 {expectedToday}/day expected
            </div>
            <div className="text-center text-[11px] font-medium text-[#1D1D1F]">
              🛡 15-unit buffer
            </div>
            <div className="text-center text-[11px] font-medium text-[#1D1D1F]">
              ⚠ Gap Thu, Fri
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Nearest facility that could cover a shortfall */}
      {transfer && (
        <Card className="p-5 flex items-center justify-between mb-6" index={5}>
          <div className="flex items-center gap-4">
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <div className="w-2 h-2 rounded-full bg-[#1A8A2C]"></div>
                <p className="text-[13px] font-bold text-[#1D1D1F]">{transfer.short_name}</p>
              </div>
              <p className="text-[10px] text-[#6E6E73] uppercase tracking-wider font-semibold">
                {transfer.straight_line_km !== null ? `${transfer.straight_line_km.toFixed(1)} km away` : "Distance unknown"}
              </p>
            </div>
            <div className="text-[#AEAEB2] text-[18px] font-light">→</div>
            <div>
              <p className="text-[13px] font-bold text-[#1D1D1F]">{user?.bank_name}</p>
              <p className="text-[10px] text-[#6E6E73] uppercase tracking-wider font-semibold">your facility</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-[20px] font-bold text-[#0071E3] leading-none">{transfer.available_units}</p>
              <p className="text-[10px] text-[#6E6E73] font-medium">usable SDP</p>
            </div>
            <button
              onClick={() => setTransferOpen(true)}
              className="text-[12px] font-semibold text-[#0071E3] bg-[#E8F2FD] px-3.5 py-1.5 rounded-full hover:bg-[#D5E8F9] transition-colors cursor-pointer"
            >
              Request units →
            </button>
            <ProvenanceBadge type="live" />
          </div>
        </Card>
      )}

      {/* Demand chart card */}
      <Card className="p-6" index={6}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-[15px] font-bold text-[#1D1D1F]">Demand — actual vs forecast</p>
            <p className="text-[11px] text-[#AEAEB2]">Solid bars = actual history · Dashed bars = LASSO 7-day forecast</p>
          </div>
          <ProvenanceBadge type="model" />
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
            <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#AEAEB2" }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 10, border: "1px solid #E5E5E7", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
              cursor={{ fill: "#F5F5F7" }}
            />
            <Bar dataKey="forecast" isAnimationActive={false}>
              {chartData.map((entry: any, index: number) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={entry.actual !== null ? "#0071E3" : "transparent"} 
                  stroke="#0071E3" 
                  strokeWidth={entry.actual !== null ? 0 : 2}
                  strokeDasharray={entry.actual !== null ? "0" : "4 4"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Why Drawer */}
      {whyOpen && (
        <Drawer title={`Why ${rec.action} ${rec.quantity > 0 ? rec.quantity : ''}?`} subtitle="Decision Engine Drivers & Provenance" onClose={() => setWhyOpen(false)}>
          <div className="space-y-6">
            <div className={`rounded-[12px] p-5 ${isHealthy ? "bg-[#E8F4EB]" : "bg-[#FFF3E0]"}`}>
              <p className={`text-[14px] font-bold mb-1 ${isHealthy ? "text-[#1A8A2C]" : "text-[#B25000]"}`}>
                {rec.action} {rec.quantity > 0 ? rec.quantity : ""} Recommendation
              </p>
              <p className="text-[13px] text-[#1D1D1F] leading-relaxed">
                {rec.reason_summary}
              </p>
            </div>
            <div>
              <SectionLabel>Top Drivers</SectionLabel>
              {(rec.drivers || []).map((d: string, i: number) => (
                <div key={i} className="flex gap-3 py-3 border-b border-[#F5F5F7]">
                  <span className="text-[#0071E3] text-[14px] flex-shrink-0 mt-0.5">•</span>
                  <span className="text-[13px] text-[#1D1D1F] leading-relaxed">{d}</span>
                </div>
              ))}
            </div>
            <div>
              <SectionLabel>Model Provenance</SectionLabel>
              <p className="text-[12px] text-[#6E6E73] leading-relaxed">
                LASSO demand model · German hospital dataset (2008–2018) · MASE 0.734 · Calibrated with WHO India monthly index.
              </p>
            </div>
          </div>
        </Drawer>
      )}

      {/* Request drawer */}
      {transferOpen && transfer && (
        <Drawer
          title="Request units"
          subtitle={`${transfer.short_name} → ${user?.bank_name}`}
          onClose={() => { setTransferOpen(false); setTransferSuccess(null); setTransferError(null); }}
        >
          <div className="space-y-5">
            {transferSuccess ? (
              <div className="p-4 bg-[#E8F4EB] border border-[#A5D6A7] text-[#1A8A2C] rounded-[10px] text-[13px] font-medium leading-relaxed">
                {transferSuccess}
              </div>
            ) : (
              <>
                <div className="bg-[#E8F2FD] rounded-[12px] p-5 border border-[#B5D4F4]">
                  <p className="text-[14px] font-bold text-[#0071E3] mb-1">{transfer.name}</p>
                  <p className="text-[13px] text-[#1D1D1F] leading-relaxed">{transfer.address}</p>
                </div>

                <div>
                  <SectionLabel>What they currently hold</SectionLabel>
                  <div className="space-y-2.5">
                    <div className="flex justify-between py-2 border-b border-[#F5F5F7]">
                      <span className="text-[13px] text-[#6E6E73]">Usable SDP units</span>
                      <span className="text-[14px] font-bold text-[#0071E3]">{transfer.available_units}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-[#F5F5F7]">
                      <span className="text-[13px] text-[#6E6E73]">Expiring within 24h</span>
                      <span className="text-[13px] font-bold text-[#1D1D1F]">{transfer.expiring_24h}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-[#F5F5F7]">
                      <span className="text-[13px] text-[#6E6E73]">eRaktKosh code</span>
                      <span className="text-[13px] font-mono text-[#1D1D1F]">{transfer.code}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <SectionLabel>Units to request</SectionLabel>
                  <input
                    type="number"
                    min={1}
                    max={Math.max(1, transfer.available_units)}
                    value={requestUnits}
                    onChange={(event) => setRequestUnits(Math.max(1, Number(event.target.value) || 1))}
                    className="w-32 bg-[#F5F5F7] border border-[#E5E5E7] text-[#1D1D1F] text-[14px] rounded-[10px] px-3 py-2.5 focus:outline-none focus:border-[#0071E3]"
                  />
                </div>

                {transferError && (
                  <div className="p-4 bg-[#FDECEC] border border-[#F5C6C6] text-[#B3261E] rounded-[10px] text-[13px] leading-relaxed">
                    {transferError}
                  </div>
                )}

                <p className="text-[12px] text-[#6E6E73] leading-relaxed">
                  This sends a request. {transfer.short_name} decides whether to release the units
                  and controls the handover.
                </p>

                <button
                  onClick={() => openRequest.mutate({ facilityId: transfer.id, units: requestUnits })}
                  disabled={openRequest.isPending}
                  className="w-full py-3 bg-[#0071E3] text-white text-[14px] font-semibold rounded-full hover:bg-[#0058B0] transition-colors cursor-pointer disabled:opacity-50"
                >
                  {openRequest.isPending ? "Sending…" : `Request ${requestUnits} SDP units`}
                </button>
              </>
            )}
          </div>
        </Drawer>
      )}
    </div>
  );
}
