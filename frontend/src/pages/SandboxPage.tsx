import React, { useState, useEffect, useCallback } from "react";
import {
  simulateScenario,
  getPlantState,
  getPlantActual,
  type SimulationResult,
  type PlantStateResponse,
  type ActualBlock,
} from "../api/client";
import { LoadingSpinner } from "../components/common/LoadingSpinner";
import { ErrorAlert } from "../components/common/ErrorAlert";
import { PageHeader } from "../components/common/PageHeader";
import { Card } from "../components/common/Card";
import { KpiCard } from "../components/common/KpiCard";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import {
  BatteryCharging,
  ShieldCheck,
  AlertOctagon,
  Sparkles,
  FileCheck2,
} from "lucide-react";

export const SandboxPage: React.FC<{ plantId: string }> = ({ plantId }) => {
  const [scenario, setScenario] = useState<string>("add_battery");
  const [batteryMwh, setBatteryMwh] = useState<number>(20.0);
  const [capacityPct, setCapacityPct] = useState<number>(15.0);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SimulationResult | null>(null);

  const [plantState, setPlantState] = useState<PlantStateResponse | null>(null);
  const [latestTelemetry, setLatestTelemetry] = useState<ActualBlock | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string>("");


  const fetchNodeHealth = useCallback(async () => {
    try {
      const [stateRes, actualRes] = await Promise.all([
        getPlantState(plantId),
        getPlantActual(plantId, 1),
      ]);
      setPlantState(stateRes);
      if (actualRes.actual && actualRes.actual.length > 0) {
        setLatestTelemetry(actualRes.actual[0]);
      }
      setLastSyncTime(new Date().toLocaleTimeString());
    } catch {
      // Graceful fallback if node is offline
    }
  }, [plantId]);

  useEffect(() => {
    fetchNodeHealth();
    const interval = setInterval(fetchNodeHealth, 5000);
    return () => clearInterval(interval);
  }, [fetchNodeHealth]);

  // Initial simulation run on mount
  useEffect(() => {
    handleSimulate(scenario, batteryMwh);
  }, [plantId]);

  const handleSimulate = async (sc = scenario, mwh = batteryMwh, capPct = capacityPct) => {
    setLoading(true);
    setError(null);
    try {
      let params: Record<string, any> = {};
      if (sc === "add_battery") {
        params = { capacity_mwh: mwh };
      } else if (sc === "add_capacity") {
        params = { capacity_pct: capPct };
      }
      const res = await simulateScenario(plantId, sc, params);
      setResult(res.simulation);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err.message || "Simulation failed");
    } finally {
      setLoading(false);
    }
  };

  const isOnline = plantState?.node_status === "online";
  const isSolar = plantState?.plant_type === "solar_pv";

  const chartData = (result?.series || []).map((s) => {
    const timeLabel = s.ts.split("T")[1]?.substring(0, 5) || s.ts;
    return {
      ts: s.ts,
      timeLabel,
      schedule_kw: s.schedule_kw,
      before_kw: s.before_kw,
      after_kw: s.after_kw,
      battery_dispatch_kw: s.battery_dispatch_kw ?? 0,
      battery_soc_mwh: s.battery_soc_mwh ?? 0,
    };
  });

  return (
    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <PageHeader
        title="Sandbox What-If Scenarios & Edge Node Health"
        subtitle="Evaluate corrective operational strategies safely on an isolated in-memory twin clone without modifying live telemetry."
        actions={
          <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
            Last sync: <strong style={{ color: "var(--text-secondary)" }}>{lastSyncTime || "Just now"}</strong>
          </span>
        }
      />

      {/* Node Health & Connectivity Card */}
      <Card variant={isOnline ? "default" : "breach"} padding="md">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "1rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                width: "12px",
                height: "12px",
                borderRadius: "50%",
                backgroundColor: isOnline ? "var(--emerald-400)" : "var(--breach-red)",
                boxShadow: isOnline ? "0 0 10px var(--emerald-400)" : "var(--breach-red-glow)",
              }}
            />
            <div>
              <div style={{ fontSize: "1rem", fontWeight: 800, color: "var(--text-primary)" }}>
                Edge Telemetry Node Health: {isOnline ? "ONLINE (Active MQTT Replay)" : "OFFLINE (Telemetry Interrupted)"}
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                Last Seen: {plantState?.last_ts || "No telemetry received"} | Power: {plantState?.actual_kw !== undefined ? plantState.actual_kw.toLocaleString() : "--"} kW
                {latestTelemetry && isSolar && ` | Irradiance: ${latestTelemetry.irradiance ?? 0} W/m² | Temp: ${latestTelemetry.module_temp ?? 0}°C`}
                {latestTelemetry && !isSolar && ` | Wind Speed: ${latestTelemetry.wind_speed ?? 0} m/s`}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            {!isOnline && (
              <span
                style={{
                  fontSize: "0.72rem",
                  padding: "4px 10px",
                  borderRadius: "var(--radius-sm)",
                  backgroundColor: "var(--breach-red-bg)",
                  color: "var(--breach-red)",
                  border: "1px solid var(--breach-red-border)",
                  fontWeight: 700,
                }}
              >
                ⚠ NODE OFFLINE ALERT TRIGGERED
              </span>
            )}
            <span
              style={{
                fontSize: "0.7rem",
                padding: "4px 8px",
                borderRadius: "var(--radius-sm)",
                backgroundColor: "var(--bg-app)",
                color: "var(--sky-400)",
                fontWeight: 600,
                border: "1px solid var(--border-subtle)",
              }}
            >
              Simulated ESP32 SCADA Node
            </span>
          </div>
        </div>
      </Card>

      {/* Simulation Controls Card */}
      <Card variant="default" padding="md">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.5rem" }}>
          <div>
            <h2 style={{ fontSize: "1.1rem", fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
              Hypothetical Simulation Controls
            </h2>
            <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", margin: "4px 0 1.25rem 0" }}>
              Compute corrective actions against baseline 24-hour schedule commitments
            </p>
          </div>
          <span
            style={{
              fontSize: "0.75rem",
              padding: "4px 10px",
              borderRadius: "var(--radius-full)",
              backgroundColor: "var(--emerald-bg)",
              color: "var(--emerald-400)",
              fontWeight: 600,
              border: "1px solid var(--emerald-border)",
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <ShieldCheck size={14} />
            Twin State Strictly Preserved (Copy Guarantee)
          </span>
        </div>

        <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "6px" }}>
              Hypothetical Scenario:
            </label>
            <select
              value={scenario}
              onChange={(e) => {
                setScenario(e.target.value);
                handleSimulate(e.target.value, batteryMwh);
              }}
              aria-label="Select simulation scenario"
              style={{
                backgroundColor: "var(--bg-app)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-sm)",
                padding: "8px 14px",
                fontSize: "0.85rem",
                fontWeight: 600,
                outline: "none",
              }}
            >
              <option value="add_battery">Add Battery Storage (BESS DSM Mitigation)</option>
              <option value="clean_panels">Panel Washing (Zero Soiling Loss)</option>
              <option value="add_capacity">Expand Plant Capacity (What-If Scaling)</option>
              <option value="monsoon_cloud">Severe Monsoon Cloud Cover (60% drop)</option>
            </select>
          </div>

          {scenario === "add_battery" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                <span>Storage Capacity:</span>
                <strong style={{ color: "var(--sky-400)" }}>{batteryMwh} MWh</strong>
              </div>
              <input
                type="range"
                min="2"
                max="50"
                step="2"
                value={batteryMwh}
                aria-label="Storage capacity slider in megawatt-hours"
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setBatteryMwh(val);
                }}
                onMouseUp={() => handleSimulate("add_battery", batteryMwh, capacityPct)}
                onTouchEnd={() => handleSimulate("add_battery", batteryMwh, capacityPct)}
                style={{ width: "200px", cursor: "pointer" }}
              />
            </div>
          )}

          {scenario === "add_capacity" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                <span>Capacity Expansion:</span>
                <strong style={{ color: "var(--cyan-400)" }}>+{capacityPct}%</strong>
              </div>
              <input
                type="range"
                min="5"
                max="50"
                step="5"
                value={capacityPct}
                aria-label="Plant capacity expansion percentage slider"
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setCapacityPct(val);
                }}
                onMouseUp={() => handleSimulate("add_capacity", batteryMwh, capacityPct)}
                onTouchEnd={() => handleSimulate("add_capacity", batteryMwh, capacityPct)}
                style={{ width: "200px", cursor: "pointer" }}
              />
            </div>
          )}

          <button
            onClick={() => handleSimulate(scenario, batteryMwh)}
            disabled={loading}
            aria-label="Run simulation on twin"
            style={{
              backgroundColor: "var(--sky-500)",
              color: "#FFF",
              fontWeight: 700,
              fontSize: "0.85rem",
              border: "none",
              borderRadius: "var(--radius-sm)",
              padding: "9px 20px",
              cursor: loading ? "not-allowed" : "pointer",
              boxShadow: "0 2px 8px rgba(14, 165, 233, 0.35)",
            }}
          >
            {loading ? "Simulating..." : "Run on Twin"}
          </button>
        </div>
      </Card>

      {loading && <LoadingSpinner message="Dispatching simulation algorithm on isolated twin state..." />}
      {error && <ErrorAlert title="Simulation Error" message={error} />}

      {/* Simulation Result Presentation */}
      {result && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {/* Summary Banner & KPIs */}
          <Card variant="elevated" padding="md">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ fontSize: "1.05rem", fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
                Simulation Impact Analysis
              </h3>
              <span style={{ fontSize: "0.78rem", color: "var(--sky-400)", fontWeight: 700 }}>
                Scenario: {result.scenario}
              </span>
            </div>

            <p style={{ fontSize: "1rem", color: "var(--sky-400)", fontWeight: 600, margin: "0.75rem 0 1.25rem 0" }}>
              {result.summary}
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: "1rem",
              }}
            >
              <KpiCard
                label="Before DSM Breaches"
                value={`${result.before.breach_count} Blocks`}
                subValue={`Penalty exposure: ${result.before.relative_exposure_pct.toFixed(1)}%`}
                icon={<AlertOctagon size={18} />}
                status="default"
              />

              <KpiCard
                label="After DSM Breaches"
                value={`${result.after.breach_count} Blocks`}
                subValue={`Penalty exposure: ${result.after.relative_exposure_pct.toFixed(1)}%`}
                icon={<ShieldCheck size={18} />}
                status={result.after.breach_count < result.before.breach_count ? "emerald" : "breach"}
              />

              <KpiCard
                label="Breaches Eliminated"
                value={`${result.impact.breaches_eliminated ?? 0} Blocks`}
                subValue={`Exposure reduction: ${result.impact.exposure_reduction_pct ?? 0}%`}
                icon={<BatteryCharging size={18} />}
                status="emerald"
              />

              <KpiCard
                label="Total 24h Generation"
                value={`${Math.round(result.after.total_kwh).toLocaleString()} kWh`}
                subValue={result.impact.gain_kwh ? `+${result.impact.gain_kwh.toLocaleString()} kWh (+${result.impact.gain_pct}%)` : "Net plant delivery"}
                icon={<Sparkles size={18} />}
                status="default"
              />
            </div>
          </Card>

          {/* Before vs After Chart */}
          <Card variant="default" padding="md">
            <h3 style={{ fontSize: "1rem", fontWeight: 800, margin: "0 0 1rem 0", color: "var(--text-primary)" }}>
              Before vs After Generation & Schedule Profile (24-Hour Horizon)
            </h3>

            <div style={{ width: "100%", height: "300px" }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 10, right: 15, left: 10, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                  <XAxis dataKey="timeLabel" stroke="var(--text-muted)" tick={{ fontSize: 11, fill: "var(--text-secondary)" }} interval={11} />
                  <YAxis stroke="var(--text-muted)" tick={{ fontSize: 11, fill: "var(--text-secondary)" }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "var(--bg-app)", borderColor: "var(--border-default)", borderRadius: "var(--radius-sm)", fontSize: "0.8rem" }}
                  />
                  <Line
                    type="stepAfter"
                    dataKey="schedule_kw"
                    stroke="var(--amber-500)"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    name="Committed Schedule (kW)"
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="before_kw"
                    stroke="var(--text-muted)"
                    strokeWidth={1.5}
                    name="Before Profile (kW)"
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="after_kw"
                    stroke="var(--sky-400)"
                    strokeWidth={2.5}
                    name="After Simulation (Optimized)"
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <div style={{ display: "flex", justifyContent: "center", gap: "1.5rem", marginTop: "0.5rem", fontSize: "0.75rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ width: "16px", height: "2px", borderTop: "2px dashed var(--amber-500)" }} />
                <span style={{ color: "var(--text-secondary)" }}>Committed Schedule</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ width: "16px", height: "2px", backgroundColor: "var(--text-muted)" }} />
                <span style={{ color: "var(--text-secondary)" }}>Before Profile</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ width: "16px", height: "3px", backgroundColor: "var(--sky-400)" }} />
                <span style={{ color: "var(--sky-400)", fontWeight: 600 }}>After Simulation</span>
              </div>
            </div>
          </Card>

          {/* Model Assumptions Card */}
          <Card variant="elevated" padding="md">
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "0.5rem" }}>
              <FileCheck2 size={16} color="var(--sky-400)" />
              <h4 style={{ fontSize: "0.9rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                Simulation Engine Constraints & Mathematical Assumptions
              </h4>
            </div>
            <ul style={{ margin: 0, paddingLeft: "1.25rem", color: "var(--text-secondary)", fontSize: "0.8rem", lineHeight: "1.6" }}>
              {(result.assumptions || []).map((asm, i) => (
                <li key={i}>{asm}</li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </div>
  );
};
