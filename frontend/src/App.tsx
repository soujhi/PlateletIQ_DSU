import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import LoginScreen from "./screens/LoginScreen";
import OverviewScreen from "./screens/OverviewScreen";
import ForecastScreen from "./screens/ForecastScreen";
import InventoryScreen from "./screens/InventoryScreen";
import ActionsScreen from "./screens/ActionsScreen";
import AnalyticsScreen from "./screens/AnalyticsScreen";
import TransfersScreen from "./screens/TransfersScreen";
import NetworkScreen from "./screens/NetworkScreen";
import WasteRecoveryScreen from "./screens/WasteRecoveryScreen";
import CampPlanningScreen from "./screens/CampPlanningScreen";
import DataUploadScreen from "./screens/DataUploadScreen";
import { Drawer, SectionLabel } from "./shared";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60000,
      retry: 1,
    },
  },
});

type Screen =
  | "overview" | "forecast" | "inventory" | "actions" | "analytics"
  | "transfers" | "network" | "waste" | "camp" | "upload";

type DemoState = "healthy" | "watch";

const NAV_GROUPS = [
  {
    label: null,
    items: [
      { id: "overview"  as Screen, label: "Overview" },
      { id: "forecast"  as Screen, label: "Forecast" },
      { id: "inventory" as Screen, label: "Inventory" },
      { id: "actions"   as Screen, label: "Actions" },
      { id: "upload"    as Screen, label: "Data Setup" },
      { id: "analytics" as Screen, label: "Analytics" },
    ],
  },
  {
    label: "Network",
    items: [
      { id: "transfers" as Screen, label: "Transfers & Recovery" },
      { id: "network"   as Screen, label: "Network" },
    ],
  },
  {
    label: "Planning",
    items: [
      { id: "waste" as Screen, label: "Waste Recovery" },
      { id: "camp"  as Screen, label: "Camp Planning" },
    ],
  },
];

function MainApp() {
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const [screen, setScreen]         = useState<Screen>("overview");
  const [demo, setDemo]             = useState<DemoState>("healthy");
  const [sourceOpen, setSourceOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#F5F5F7]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-[#0071E3] border-t-transparent rounded-full animate-spin"></div>
          <p className="text-[13px] font-medium text-[#6E6E73]">Loading session…</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginScreen onLogin={() => {}} />;
  }

  function renderScreen() {
    switch (screen) {
      case "overview":  return <OverviewScreen />;
      case "forecast":  return <ForecastScreen />;
      case "inventory": return <InventoryScreen />;
      case "actions":   return <ActionsScreen />;
      case "analytics": return <AnalyticsScreen />;
      case "transfers": return <TransfersScreen />;
      case "network":   return <NetworkScreen />;
      case "waste":     return <WasteRecoveryScreen />;
      case "camp":      return <CampPlanningScreen />;
      case "upload":    return <DataUploadScreen />;
    }
  }

  const currentDateStr = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "#F5F5F7" }}>

      {/* ── Sidebar ──────────────────────────────────────────────────────────── */}
      <aside
        className="w-[240px] flex flex-col flex-shrink-0 overflow-y-auto"
        style={{ background: "white", borderRight: "1px solid #E5E5E7" }}
      >
        {/* Brand */}
        <div className="px-6 pt-7 pb-6">
          <h1
            className="text-[18px] font-bold text-[#1D1D1F]"
            style={{ letterSpacing: "-0.4px" }}
          >
            PlateletIQ
          </h1>
          <p className="text-[12px] text-[#6E6E73] mt-0.5">{user?.bank_name || "Govt. General Hospital Chennai"}</p>
        </div>

        {/* Nav groups */}
        <nav className="flex-1 px-3 pb-4">
          {NAV_GROUPS.map((group, gi) => (
            <div key={gi} className={gi > 0 ? "mt-5" : ""}>
              {group.label && (
                <p className="px-3 mb-1 text-[10px] font-semibold text-[#AEAEB2] uppercase tracking-widest">
                  {group.label}
                </p>
              )}
              {group.items.map(item => {
                const active = screen === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setScreen(item.id)}
                    className="w-full text-left px-3 py-2 rounded-[8px] text-[14px] transition-colors mb-0.5"
                    style={{
                      color: active ? "#1D1D1F" : "#6E6E73",
                      background: active ? "#F5F5F7" : "transparent",
                      fontWeight: active ? 500 : 400,
                    }}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Demo Mode toggle */}
        <div className="px-4 py-4" style={{ borderTop: "1px solid #F0F0F0" }}>
          <p className="px-2 mb-2 text-[10px] font-semibold text-[#AEAEB2] uppercase tracking-widest">
            Demo Mode
          </p>
          <div className="flex gap-1 rounded-[9px] p-0.5" style={{ background: "#F0F0F0" }}>
            {(["healthy", "watch"] as DemoState[]).map(d => (
              <button
                key={d}
                onClick={() => setDemo(d)}
                className="flex-1 py-1.5 rounded-[7px] text-[12px] font-medium transition-colors capitalize"
                style={{
                  background: demo === d ? "#1D1D1F" : "transparent",
                  color: demo === d ? "white" : "#6E6E73",
                }}
              >
                {d.charAt(0).toUpperCase() + d.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* User footer */}
        <div className="px-6 py-4" style={{ borderTop: "1px solid #F0F0F0" }}>
          <div className="flex items-center gap-2 mb-1">
            {user?.picture ? (
              <img src={user.picture} alt={user.name} className="w-6 h-6 rounded-full" />
            ) : (
              <div className="w-6 h-6 rounded-full bg-[#0071E3] text-white text-[11px] font-semibold flex items-center justify-center">
                {(user?.name || "O").charAt(0)}
              </div>
            )}
            <p className="text-[13px] font-medium text-[#1D1D1F] truncate">{user?.name || "Officer"}</p>
          </div>
          <p className="text-[11px] text-[#6E6E73] truncate">{user?.email || "demo@plateletiq.dev"}</p>
          <button
            onClick={logout}
            className="text-[11px] text-[#AEAEB2] mt-2 hover:text-[#6E6E73] transition-colors font-medium"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Main ─────────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Top bar */}
        <div
          className="h-11 flex items-center px-7 gap-2 flex-shrink-0"
          style={{ background: "white", borderBottom: "1px solid #E5E5E7" }}
        >
          <span className="text-[13px] font-medium text-[#1D1D1F]">Chennai, TN</span>
          <span className="text-[#E5E5E7] font-light">·</span>
          <span className="text-[13px] text-[#6E6E73]">{currentDateStr}</span>
          <span className="text-[#E5E5E7] font-light">·</span>
          <span className="text-[13px] text-[#6E6E73]">Inventory source · eRaktKosh</span>

          <div className="ml-auto flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#1A8A2C]" />
            <span className="text-[12px] font-medium text-[#1A8A2C]">Current</span>
            <button
              onClick={() => setSourceOpen(true)}
              className="text-[12px] text-[#AEAEB2] hover:text-[#6E6E73] transition-colors ml-1"
            >
              source details
            </button>
          </div>
        </div>

        {/* Screen */}
        <div className="flex-1 overflow-y-auto">
          {renderScreen()}
        </div>
      </div>

      {/* Source details drawer */}
      {sourceOpen && (
        <Drawer title="Data source" onClose={() => setSourceOpen(false)}>
          <div className="space-y-5">
            <div>
              <SectionLabel>eRaktKosh connection</SectionLabel>
              {[
                { label: "Source",          value: "eRaktKosh — National Blood Bank Portal" },
                { label: "Freshness",       value: "Current" },
                { label: "Coverage",        value: "756 hospitals · 32 districts" },
              ].map(r => (
                <div key={r.label} className="flex justify-between py-2.5 border-b border-[#F5F5F7]">
                  <span className="text-[13px] text-[#6E6E73]">{r.label}</span>
                  <span className="text-[13px] font-medium text-[#1D1D1F]">{r.value}</span>
                </div>
              ))}
            </div>
            <div className="bg-[#F5F5F7] rounded-[12px] p-4">
              <p className="text-[12px] text-[#6E6E73] leading-relaxed">
                <strong className="text-[#1D1D1F]">Freshness note:</strong> The source entry date — when the hospital last updated its record — is the key operational freshness field. PlateletIQ retrieval time is separate and does not imply the bank updated its data at that moment.
              </p>
            </div>
            <div>
              <SectionLabel>Data quality</SectionLabel>
              <p className="text-[12px] text-[#6E6E73] leading-relaxed">
                Average staleness across eRaktKosh records: 170.6 hours. 32% of records older than 24 hours. These are dataset observations, not permanent system values.
              </p>
            </div>
          </div>
        </Drawer>
      )}
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MainApp />
      </AuthProvider>
    </QueryClientProvider>
  );
}
