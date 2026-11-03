import React, { useState } from "react";
import { simulateScenario, type SimulationResult } from "../api/client";
import { LoadingSpinner } from "../components/common/LoadingSpinner";
import { ErrorAlert } from "../components/common/ErrorAlert";

export const SandboxPage: React.FC<{ plantId: string }> = ({ plantId }) => {
  const [scenario, setScenario] = useState<string>("clean_panels");
  const [batteryMwh, setBatteryMwh] = useState<number>(10.0);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SimulationResult | null>(null);

  const handleSimulate = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = scenario === "add_battery" ? { capacity_mwh: batteryMwh } : {};
      const res = await simulateScenario(plantId, scenario, params);
      setResult(res.simulation);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err.message || "Simulation failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div
        style={{
          backgroundColor: "#131C31",
          borderRadius: "10px",
          border: "1px solid #1E293B",
          padding: "1.5rem",
        }}
      >
        <h2 style={{ fontSize: "1.1rem", fontWeight: 700, margin: 0, color: "#F8FAFC" }}>
          Sandbox What-If Scenarios Engine
        </h2>
        <p style={{ fontSize: "0.8rem", color: "#94A3B8", margin: "4px 0 1.25rem 0" }}>
          Execute safe hypothetical dispatch and maintenance trials on an isolated twin copy
        </p>

        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.75rem", color: "#94A3B8", marginBottom: "4px" }}>
              Scenario:
            </label>
            <select
              value={scenario}
              onChange={(e) => setScenario(e.target.value)}
              style={{
                backgroundColor: "#0F172A",
                color: "#F8FAFC",
                border: "1px solid #334155",
                borderRadius: "6px",
                padding: "8px 12px",
                fontSize: "0.85rem",
                fontWeight: 600,
              }}
            >
              <option value="clean_panels">Panel Washing (Soiling Elimination)</option>
              <option value="add_battery">Add Battery Storage (BESS Mitigation)</option>
              <option value="add_capacity">Add Plant Capacity (+15%)</option>
              <option value="monsoon_cloud">Monsoon Heavy Cloud Event</option>
            </select>
          </div>

          {scenario === "add_battery" && (
            <div>
              <label style={{ display: "block", fontSize: "0.75rem", color: "#94A3B8", marginBottom: "4px" }}>
                Storage Capacity (MWh):
              </label>
              <input
                type="number"
                min="1"
                max="50"
                value={batteryMwh}
                onChange={(e) => setBatteryMwh(parseFloat(e.target.value))}
                style={{
                  backgroundColor: "#0F172A",
                  color: "#F8FAFC",
                  border: "1px solid #334155",
                  borderRadius: "6px",
                  padding: "8px 12px",
                  fontSize: "0.85rem",
                  width: "120px",
                }}
              />
            </div>
          )}

          <button
            onClick={handleSimulate}
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
            {loading ? "Running Simulation..." : "Run Simulation"}
          </button>
        </div>
      </div>

      {loading && <LoadingSpinner message="Computing scenario dispatch on twin copy..." />}
      {error && <ErrorAlert title="Simulation Failed" message={error} />}

      {result && (
        <div
          style={{
            backgroundColor: "#131C31",
            borderRadius: "10px",
            border: "1px solid #1E293B",
            padding: "1.5rem",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: 0, color: "#F8FAFC" }}>
              Simulation Outcome: {result.scenario}
            </h3>
            <span
              style={{
                fontSize: "0.75rem",
                padding: "2px 8px",
                borderRadius: "9999px",
                backgroundColor: "#065F46",
                color: "#6EE7B7",
                fontWeight: 600,
              }}
            >
              Twin State Preserved (100% Isolated)
            </span>
          </div>

          <p style={{ fontSize: "0.95rem", color: "#38BDF8", fontWeight: 600, margin: "1rem 0" }}>
            {result.summary}
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "1rem",
              marginBottom: "1.5rem",
            }}
          >
            <div style={boxStyle}>
              <div style={labelStyle}>BEFORE TOTAL GENERATION</div>
              <div style={valStyle}>{result.before.total_kwh.toLocaleString()} kWh</div>
              <div style={subStyle}>{result.before.breach_count} DSM breaches</div>
            </div>

            <div style={boxStyle}>
              <div style={labelStyle}>AFTER TOTAL GENERATION</div>
              <div style={valStyle}>{result.after.total_kwh.toLocaleString()} kWh</div>
              <div style={subStyle}>{result.after.breach_count} DSM breaches</div>
            </div>

            <div style={boxStyle}>
              <div style={labelStyle}>BREACHES ELIMINATED</div>
              <div style={{ ...valStyle, color: "#10B981" }}>
                {result.impact.breaches_eliminated ?? 0} Blocks
              </div>
              <div style={subStyle}>
                Exposure drop: {result.impact.exposure_reduction_pct ?? 0}%
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const boxStyle: React.CSSProperties = {
  backgroundColor: "#0F172A",
  padding: "1rem",
  borderRadius: "8px",
  border: "1px solid #1E293B",
};

const labelStyle: React.CSSProperties = {
  fontSize: "0.7rem",
  fontWeight: 700,
  color: "#94A3B8",
  marginBottom: "0.25rem",
};

const valStyle: React.CSSProperties = {
  fontSize: "1.25rem",
  fontWeight: 800,
  color: "#F8FAFC",
};

const subStyle: React.CSSProperties = {
  fontSize: "0.7rem",
  color: "#64748B",
  marginTop: "0.25rem",
};
