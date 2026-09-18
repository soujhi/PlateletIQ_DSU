import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Card, ProvenanceBadge } from "../shared";
import { analyticsApi } from "../api/endpoints";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { ErrorState } from "../components/ErrorState";

export default function AnalyticsScreen() {
  const { data: metrics, isLoading, error, refetch } = useQuery({
    queryKey: ["forecastAnalytics"],
    queryFn: analyticsApi.getForecastAnalytics,
  });

  if (isLoading) {
    return (
      <div className="p-8 max-w-3xl space-y-6">
        <LoadingSkeleton height="100px" />
        <LoadingSkeleton height="200px" />
      </div>
    );
  }

  if (error || !metrics) {
    return (
      <div className="p-8 max-w-3xl">
        <ErrorState message="Could not load Analytics metadata." onRetry={refetch} />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-3xl">
      {/* Header */}
      <div className="mb-8">
        <p className="text-[11px] font-semibold text-[#AEAEB2] uppercase tracking-widest mb-2">ANALYTICS</p>
        <h1 className="text-[28px] font-bold text-[#1D1D1F] tracking-tight">
          Model performance and outcomes
        </h1>
      </div>

      {/* 3 hero metric cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card className="p-6 flex flex-col items-center justify-center border border-[#F5F5F7] bg-white text-center" index={0}>
          <div className="text-[26px] font-bold text-[#1A8A2C] mb-1">{metrics.wastage_simulated}%</div>
          <div className="text-[10px] uppercase text-[#AEAEB2] font-semibold tracking-wider">Wastage rate</div>
        </Card>
        <Card className="p-6 flex flex-col items-center justify-center border border-[#F5F5F7] bg-white text-center" index={1}>
          <div className="text-[26px] font-bold text-[#0071E3] mb-1">{metrics.mase}</div>
          <div className="text-[10px] uppercase text-[#AEAEB2] font-semibold tracking-wider">MASE score</div>
        </Card>
        <Card className="p-6 flex flex-col items-center justify-center border border-[#F5F5F7] bg-white text-center" index={2}>
          <div className="text-[26px] font-bold text-[#1D1D1F] mb-1">{metrics.training_days.toLocaleString()}</div>
          <div className="text-[10px] uppercase text-[#AEAEB2] font-semibold tracking-wider">Training days</div>
        </Card>
      </div>

      {/* Wastage reduction card */}
      <Card className="p-6 mb-6 bg-white" index={3}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-[16px] font-bold text-[#1D1D1F]">Wastage reduction</h2>
          <ProvenanceBadge type="simulated" />
        </div>
        
        <div className="space-y-4 mb-6">
          {/* Row 1 */}
          <div className="flex items-center gap-3">
            <div className="w-[70px] text-right text-[12px] text-[#6E6E73]">Baseline</div>
            <div className="flex-1 h-[24px] bg-[#F5F5F7] rounded-full overflow-hidden relative">
              <motion.div 
                initial={{ width: 0 }} 
                animate={{ width: "96%" }} 
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="h-full bg-[#C41230] rounded-full flex items-center px-3"
              >
                <span className="text-[10px] text-white font-medium">No model</span>
              </motion.div>
            </div>
            <div className="w-[50px] text-right text-[13px] font-mono font-medium text-[#C41230]">{metrics.wastage_baseline}%</div>
          </div>
          
          {/* Row 2 */}
          <div className="flex items-center gap-3">
            <div className="w-[70px] text-right text-[12px] text-[#1D1D1F] font-medium">PlateletIQ</div>
            <div className="flex-1 h-[24px] bg-[#F5F5F7] rounded-full overflow-hidden">
              <motion.div 
                initial={{ width: 0 }} 
                animate={{ width: "33%" }} 
                transition={{ duration: 0.8, ease: "easeOut", delay: 0.1 }}
                className="h-full bg-[#1A8A2C] rounded-full"
              />
            </div>
            <div className="w-[50px] text-right text-[13px] font-mono font-medium text-[#1A8A2C]">{metrics.wastage_simulated}%</div>
          </div>
          
          {/* Row 3 */}
          <div className="flex items-center gap-3">
            <div className="w-[70px] text-right text-[12px] text-[#6E6E73]">Shortage</div>
            <div className="flex-1 h-[24px] bg-[#F5F5F7] rounded-full overflow-hidden relative">
              <motion.div 
                initial={{ width: 0 }} 
                animate={{ width: "67%" }} 
                transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
                className="h-full bg-[#BA7517] opacity-70 rounded-full flex items-center px-3"
              >
                <span className="text-[10px] text-white font-medium">Baseline</span>
              </motion.div>
            </div>
            <div className="w-[50px] text-right text-[13px] font-mono font-medium text-[#BA7517]">{metrics.shortage_baseline}%</div>
          </div>
          
          {/* Row 4 */}
          <div className="flex items-center gap-3">
            <div className="w-[70px] text-right text-[12px] text-[#1D1D1F] font-medium">With model</div>
            <div className="flex-1 h-[24px] bg-[#F5F5F7] rounded-full overflow-hidden">
              <motion.div 
                initial={{ width: 0 }} 
                animate={{ width: "30%" }} 
                transition={{ duration: 0.8, ease: "easeOut", delay: 0.3 }}
                className="h-full bg-[#0071E3] opacity-70 rounded-full"
              />
            </div>
            <div className="w-[50px] text-right text-[13px] font-mono font-medium text-[#0071E3]">{metrics.shortage_simulated}%</div>
          </div>
        </div>

        <div className="bg-[#E8F4EB] border border-[#A5D6A7] rounded-lg p-3 flex items-center justify-center">
          <span className="text-[#1A8A2C] text-[13px] font-medium">💰 Saves ₹7.2 lakh/year per hospital (200 units/mo × ₹3,000/unit)</span>
        </div>
      </Card>

      {/* Forecast accuracy benchmark card */}
      <Card className="p-6 mb-6 bg-white" index={4}>
        <div className="flex items-start justify-between mb-2">
          <div>
            <h2 className="text-[16px] font-bold text-[#1D1D1F]">Forecast accuracy benchmark</h2>
            <p className="text-[11px] text-[#AEAEB2] mt-1">MASE — lower is better. Below 1.0 beats naive guessing.</p>
          </div>
          <ProvenanceBadge type="model" />
        </div>
        
        <div className="mt-6 flex flex-col">
          {/* Naive baseline */}
          <div className="flex items-center gap-4 py-3 border-b border-[#F5F5F7]">
            <div className="w-[100px] text-[13px] text-[#6E6E73]">Naive baseline</div>
            <div className="flex-1 h-[14px] bg-[#F5F5F7] rounded-full overflow-hidden">
              <motion.div initial={{ width: 0 }} animate={{ width: "99%" }} transition={{ duration: 0.8 }} className="h-full bg-[#D3D1C7] rounded-full" />
            </div>
            <div className="w-[40px] text-right text-[13px] font-mono text-[#6E6E73]">{metrics.naive_mase}</div>
            <div className="w-[70px] text-right"><span className="text-[9px] uppercase font-bold text-[#6E6E73] bg-[#F5F5F7] px-2 py-1 rounded">reference</span></div>
          </div>
          
          {/* Schilling et al. */}
          <div className="flex items-center gap-4 py-3 border-b border-[#F5F5F7]">
            <div className="w-[100px] text-[13px] text-[#6E6E73]">Schilling et al.</div>
            <div className="flex-1 h-[14px] bg-[#F5F5F7] rounded-full overflow-hidden">
              <motion.div initial={{ width: 0 }} animate={{ width: "75%" }} transition={{ duration: 0.8, delay: 0.1 }} className="h-full bg-[#BA7517] rounded-full" />
            </div>
            <div className="w-[40px] text-right text-[13px] font-mono text-[#BA7517]">{metrics.schilling_mase}</div>
            <div className="w-[70px] text-right"><span className="text-[9px] uppercase font-bold text-white bg-[#BA7517] px-2 py-1 rounded">published</span></div>
          </div>
          
          {/* PlateletIQ */}
          <div className="flex items-center gap-4 py-3 border-b border-[#F5F5F7]">
            <div className="w-[100px] text-[13px] font-medium text-[#1D1D1F]">PlateletIQ</div>
            <div className="flex-1 h-[14px] bg-[#F5F5F7] rounded-full overflow-hidden">
              <motion.div initial={{ width: 0 }} animate={{ width: "74%" }} transition={{ duration: 0.8, delay: 0.2 }} className="h-full bg-[#0071E3] rounded-full" />
            </div>
            <div className="w-[40px] text-right text-[13px] font-mono font-bold text-[#0071E3]">{metrics.mase}</div>
            <div className="w-[70px] text-right"><span className="text-[9px] uppercase font-bold text-white bg-[#0071E3] px-2 py-1 rounded">ours</span></div>
          </div>
        </div>
      </Card>

      {/* Model transparency card */}
      <Card className="p-6 bg-white" index={5}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-[16px] font-bold text-[#1D1D1F]">Model transparency</h2>
          <ProvenanceBadge type="model" />
        </div>
        
        <div className="grid grid-cols-4 gap-3 mb-5">
          <div className="bg-[#F5F5F7] rounded-lg p-3 flex flex-col items-center justify-center">
            <div className="text-[14px] font-bold font-mono text-[#1D1D1F] mb-1">{metrics.mase}</div>
            <div className="text-[10px] text-[#6E6E73] uppercase font-medium">MASE</div>
          </div>
          <div className="bg-[#F5F5F7] rounded-lg p-3 flex flex-col items-center justify-center">
            <div className="text-[14px] font-bold font-mono text-[#1D1D1F] mb-1">24.6%</div>
            <div className="text-[10px] text-[#6E6E73] uppercase font-medium">MAPE</div>
          </div>
          <div className="bg-[#F5F5F7] rounded-lg p-3 flex flex-col items-center justify-center">
            <div className="text-[14px] font-bold font-mono text-[#1D1D1F] mb-1">5.3 u/d</div>
            <div className="text-[10px] text-[#6E6E73] uppercase font-medium">MAE</div>
          </div>
          <div className="bg-[#F5F5F7] rounded-lg p-3 flex flex-col items-center justify-center text-center">
            <div className="text-[14px] font-bold font-mono text-[#1D1D1F] mb-1">11</div>
            <div className="text-[10px] text-[#6E6E73] uppercase font-medium">Models tested</div>
          </div>
        </div>
        
        <div className="flex flex-wrap gap-2">
          <div className="bg-[#F5F5F7] text-[#6E6E73] text-[11px] font-medium px-3 py-1.5 rounded-full flex items-center">
            ✓ Shuffle test: MASE → 1.127 (no leakage)
          </div>
          <div className="bg-[#F5F5F7] text-[#6E6E73] text-[11px] font-medium px-3 py-1.5 rounded-full flex items-center">
            ✓ Train/OOS gap: 19.8% (below 30%)
          </div>
          <div className="border border-[#FFCDD2] text-[#C41230] text-[11px] font-medium px-3 py-1.5 rounded-full flex items-center bg-white">
            ✗ India-calibrated: No
          </div>
        </div>
      </Card>
    </div>
  );
}
