/**
 * Sandbox What-If Scenarios Page & Node Health Monitor (Task T12).
 *
 * Features:
 * 1. Scenario Selection:
 *    - Panel Washing (`clean_panels`)
 *    - Add Battery Storage (`add_battery`) with interactive capacity slider (1 to 50 MWh)
 *    - Plant Expansion (`add_capacity`, +15%)
 *    - Monsoon Cloud Event (`monsoon_cloud`, 60% attenuation)
 * 2. Visual Outcome:
 *    - Interactive Before vs After Generation & Schedule Chart (Recharts ComposedChart)
 *    - Key Metrics: Pre/Post Generation (kWh), DSM breaches eliminated, penalty exposure drop
 *    - Explanatory summary and transparent assumptions list
 * 3. Sensor Node Health Monitor:
 *    - Node connectivity status (`ONLINE` vs `OFFLINE`)
 *    - Last telemetry packet received timestamp
 *    - Simulated node telemetry metrics (Irradiance/Module Temp / Wind Speed)
 *    - Node-offline warning alert banner when telemetry halts
 * 4. Twin Isolation Guarantee:
 *    - Badge confirming all simulations execute strictly in-memory without altering live state
 */

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
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

export const SandboxPage: React.FC<{ plantId: string }> = ({ plantId }) => {
  const [scenario, setScenario] = useState<string>("add_battery");
  const [batteryMwh, setBatteryMwh] = useState<number>(20.0);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SimulationResult | null>(null);

  // Node health state
  const [plantState, setPlantState] = useState<PlantStateResponse | null>(null);
  const [latestTelemetry, setLatestTelemetry] = useState<ActualBlock | null>(null);

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
    } catch {
      // Graceful fallback if node is offline
    }
  }, [plantId]);

  useEffect(() => {
    fetchNodeHealth();
    const interval = setInterval(fetchNodeHealth, 5000);
    return () => clearInterval(interval);
  }, [fetchNodeHealth]);

  // Initial simulation run on load
  useEffect(() => {
    handleSimulate(scenario, batteryMwh);
  }, [plantId]);

  const handleSimulate = async (sc = scenario, mwh = batteryMwh) => {
    setLoading(true);
    setError(null);
    try {
      const params = sc === "add_battery" ? { capacity_mwh: mwh } : {};
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

  // Build chart dataset from simulation result series
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
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Node Health & Connectivity Card */}
      <div
        style={{
          backgroundColor: isOnline ? "#0F172A" : "#2B1115",
          border: `1px solid ${isOnline ? "#1E293B" : "#EF4444"}`,
          borderRadius: "10px",
          padding: "1.25rem 1.5rem",
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
              backgroundColor: isOnline ? "#10B981" : "#EF4444",
              boxShadow: isOnline ? "0 0 10px #10B981" : "none",
            }}
          />
          <div>
            <div style={{ fontSize: "1rem", fontWeight: 700, color: "#F8FAFC" }}>
              Edge Telemetry Node Health: {isOnline ? "ONLINE (Active MQTT Replay)" : "OFFLINE (Telemetry Interrupted)"}
            </div>
            <div style={{ fontSize: "0.75rem", color: "#94A3B8" }}>
              Last Seen: {plantState?.last_ts || "No telemetry received"} | Power: {plantState?.actual_kw.toLocaleString()} kW
              {latestTelemetry && isSolar && ` | Irradiance: ${latestTelemetry.irradiance ?? 0} W/m² | Temp: ${latestTelemetry.module_temp ?? 0}°C`}
              {latestTelemetry && !isSolar && ` | Wind Speed: ${latestTelemetry.wind_speed ?? 0} m/s`}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {!isOnline && (
            <span
              style={{
                fontSize: "0.75rem",
                padding: "4px 10px",
                borderRadius: "4px",
                backgroundColor: "#7F1D1D",
                color: "#FCA5A5",
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
              borderRadius: "4px",
              backgroundColor: "#1E293B",
              color: "#38BDF8",
              fontWeight: 600,
            }}
          >
            Power Source: Simulated ESP32 SCADA
          </span>
        </div>
      </div>

      {/* Simulation Controls Card */}
      <div
        style={{
          backgroundColor: "#131C31",
          borderRadius: "10px",
          border: "1px solid #1E293B",
          padding: "1.5rem",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.5rem" }}>
          <div>
            <h2 style={{ fontSize: "1.1rem", fontWeight: 700, margin: 0, color: "#F8FAFC" }}>
              Sandbox What-If Scenarios Engine
            </h2>
            <p style={{ fontSize: "0.8rem", color: "#94A3B8", margin: "4px 0 1.25rem 0" }}>
              Evaluate corrective operational strategies safely on an isolated in-memory twin clone
            </p>
          </div>
          <span
            style={{
              fontSize: "0.75rem",
              padding: "4px 10px",
              borderRadius: "9999px",
              backgroundColor: "#065F46",
              color: "#6EE7B7",
              fontWeight: 600,
              border: "1px solid #059669",
            }}
          >
            ✓ Twin State Strictly Preserved (Copy Guarantee)
          </span>
        </div>

        <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.75rem", color: "#94A3B8", marginBottom: "6px" }}>
              Hypothetical Scenario:
            </label>
            <select
              value={scenario}
              onChange={(e) => {
                setScenario(e.target.value);
                handleSimulate(e.target.value, batteryMwh);
              }}
              style={{
                backgroundColor: "#0F172A",
                color: "#F8FAFC",
                border: "1px solid #334155",
                borderRadius: "6px",
                padding: "8px 14px",
                fontSize: "0.85rem",
                fontWeight: 600,
                outline: "none",
              }}
            >
              <option value="add_battery">Add Battery Storage (BESS DSM Mitigation)</option>
              <option value="clean_panels">Panel Washing (Zero Soiling Loss)</option>
              <option value="add_capacity">Expand Plant Capacity (+15%)</option>
              <option value="monsoon_cloud">Severe Monsoon Cloud Cover (60% drop)</option>
            </select>
          </div>

          {scenario === "add_battery" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "#94A3B8" }}>
                <span>Storage Capacity:</span>
                <strong style={{ color: "#38BDF8" }}>{batteryMwh} MWh</strong>
              </div>
              <input
                type="range"
                min="2"
                max="50"
                step="2"
                value={batteryMwh}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setBatteryMwh(val);
                }}
                onMouseUp={() => handleSimulate("add_battery", batteryMwh)}
                onTouchEnd={() => handleSimulate("add_battery", batteryMwh)}
                style={{ width: "200px", cursor: "pointer" }}
              />
            </div>
          )}

          <button
            onClick={() => handleSimulate(scenario, batteryMwh)}
            disabled={loading}
            style={{
              backgroundColor: "#0284C7",
              color: "#FFF",
              fontWeight: 700,
              fontSize: "0.85rem",
              border: "none",
              borderRadius: "6px",
              padding: "9px 20px",
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Simulating..." : "Run on Twin"}
          </button>
        </div>
      </div>

      {loading && <LoadingSpinner message="Dispatching simulation algorithm on isolated twin state..." />}
      {error && <ErrorAlert title="Simulation Error" message={error} />}

      {/* Simulation Result Presentation */}
      {result && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {/* Summary Banner */}
          <div
            style={{
              backgroundColor: "#131C31",
              borderRadius: "10px",
              border: "1px solid #1E293B",
              padding: "1.5rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ fontSize: "1.05rem", fontWeight: 700, margin: 0, color: "#F8FAFC" }}>
                Simulation Impact Analysis
              </h3>
              <span style={{ fontSize: "0.8rem", color: "#38BDF8", fontWeight: 600 }}>
                Scenario: {result.scenario}
              </span>
            </div>

            <p style={{ fontSize: "1rem", color: "#38BDF8", fontWeight: 600, margin: "0.75rem 0 1.25rem 0" }}>
              {result.summary}
            </p>

            {/* Before vs After Metric Cards */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: "1rem",
              }}
            >
              <div style={kpiBox}>
                <div style={kpiLabel}>BEFORE DSM BREACHES</div>
                <div style={kpiVal}>{result.before.breach_count} Blocks</div>
                <div style={kpiSub}>Penalty exposure: {result.before.relative_exposure_pct.toFixed(1)}%</div>
              </div>

              <div style={kpiBox}>
                <div style={kpiLabel}>AFTER DSM BREACHES</div>
                <div
                  style={{
                    ...kpiVal,
                    color: result.after.breach_count < result.before.breach_count ? "#10B981" : "#EF4444",
                  }}
                >
                  {result.after.breach_count} Blocks
                </div>
                <div style={kpiSub}>Penalty exposure: {result.after.relative_exposure_pct.toFixed(1)}%</div>
              </div>

              <div style={kpiBox}>
                <div style={kpiLabel}>BREACHES ELIMINATED</div>
                <div style={{ ...kpiVal, color: "#10B981" }}>
                  {result.impact.breaches_eliminated ?? 0} Blocks
                </div>
                <div style={kpiSub}>Exposure reduction: {result.impact.exposure_reduction_pct ?? 0}%</div>
              </div>

              <div style={kpiBox}>
                <div style={kpiLabel}>TOTAL 24H GENERATION</div>
                <div style={kpiVal}>{Math.round(result.after.total_kwh).toLocaleString()} kWh</div>
                <div style={kpiSub}>
                  {result.impact.gain_kwh ? `+${result.impact.gain_kwh.toLocaleString()} kWh (+${result.impact.gain_pct}%)` : "Net plant output"}
                </div>
              </div>
            </div>
          </div>

          {/* Before vs After Chart */}
          <div
            style={{
              backgroundColor: "#131C31",
              borderRadius: "10px",
              border: "1px solid #1E293B",
              padding: "1.5rem",
            }}
          >
            <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: "0 0 1rem 0", color: "#F8FAFC" }}>
              Before vs After Generation & Schedule Profile (24-Hour Horizon)
            </h3>

            <div style={{ width: "100%", height: "300px" }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 10, right: 15, left: 10, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
                  <XAxis dataKey="timeLabel" stroke="#64748B" tick={{ fontSize: 11, fill: "#94A3B8" }} interval={11} />
                  <YAxis stroke="#64748B" tick={{ fontSize: 11, fill: "#94A3B8" }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#0B0F19", borderColor: "#334155", borderRadius: "8px", fontSize: "0.8rem" }}
                  />
                  <Line
                    type="stepAfter"
                    dataKey="schedule_kw"
                    stroke="#F59E0B"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    name="Committed Schedule (kW)"
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="before_kw"
                    stroke="#64748B"
                    strokeWidth={1.5}
                    name="Before Simulation (kW)"
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="after_kw"
                    stroke="#38BDF8"
                    strokeWidth={2.5}
                    name="After Simulation (kW)"
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <div style={{ display: "flex", justifyContent: "center", gap: "1.5rem", marginTop: "0.5rem", fontSize: "0.75rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ width: "16px", height: "2px", borderTop: "2px dashed #F59E0B" }} />
                <span style={{ color: "#E2E8F0" }}>Committed Schedule</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ width: "16px", height: "2px", backgroundColor: "#64748B" }} />
                <span style={{ color: "#E2E8F0" }}>Before Profile</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ width: "16px", height: "3px", backgroundColor: "#38BDF8" }} />
                <span style={{ color: "#E2E8F0" }}>After Simulation (Optimized)</span>
              </div>
            </div>
          </div>

          {/* Model Assumptions Card */}
          <div
            style={{
              backgroundColor: "#131C31",
              borderRadius: "10px",
              border: "1px solid #1E293B",
              padding: "1.25rem 1.5rem",
            }}
          >
            <h4 style={{ fontSize: "0.9rem", fontWeight: 700, margin: "0 0 0.5rem 0", color: "#F8FAFC" }}>
              Simulation Engine Assumptions
            </h4>
            <ul style={{ margin: 0, paddingLeft: "1.25rem", color: "#94A3B8", fontSize: "0.8rem", lineHeight: "1.6" }}>
              {(result.assumptions || []).map((asm, i) => (
                <li key={i}>{asm}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

const kpiBox: React.CSSProperties = {
  backgroundColor: "#0F172A",
  padding: "1rem",
  borderRadius: "8px",
  border: "1px solid #1E293B",
};

const kpiLabel: React.CSSProperties = {
  fontSize: "0.7rem",
  fontWeight: 700,
  color: "#94A3B8",
  marginBottom: "0.25rem",
};

const kpiVal: React.CSSProperties = {
  fontSize: "1.4rem",
  fontWeight: 800,
  color: "#F8FAFC",
};

const kpiSub: React.CSSProperties = {
  fontSize: "0.7rem",
  color: "#64748B",
  marginTop: "0.2rem",
};
