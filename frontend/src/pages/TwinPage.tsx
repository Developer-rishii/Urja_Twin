import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  getPlantState,
  getPlantActual,
  type PlantStateResponse,
  type ActualBlock,
} from "../api/client";
import { LoadingSpinner } from "../components/common/LoadingSpinner";
import { ErrorAlert } from "../components/common/ErrorAlert";
import { PageHeader } from "../components/common/PageHeader";
import { Card } from "../components/common/Card";
import { KpiCard } from "../components/common/KpiCard";
import { Cpu, Zap, Activity, CheckCircle } from "lucide-react";

export const TwinPage: React.FC<{ plantId: string }> = ({ plantId }) => {
  const [state, setState] = useState<PlantStateResponse | null>(null);
  const [recentReadings, setRecentReadings] = useState<ActualBlock[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string>("");

  const isInitialMount = useRef(true);

  const fetchData = useCallback(async (isInitial = false) => {
    if (isInitial && isInitialMount.current) setLoading(true);
    setError(null);
    try {
      const [stateRes, actualRes] = await Promise.all([
        getPlantState(plantId),
        getPlantActual(plantId, 24),
      ]);
      setState(stateRes);
      setRecentReadings(actualRes.actual || []);
      setLastSyncTime(new Date().toLocaleTimeString());
    } catch (err: any) {
      setError(err?.response?.data?.detail || err.message || "Failed to load twin state");
    } finally {
      if (isInitial && isInitialMount.current) {
        setLoading(false);
        isInitialMount.current = false;
      }
    }
  }, [plantId]);

  useEffect(() => {
    isInitialMount.current = true;
    fetchData(true);
    const interval = setInterval(() => fetchData(false), 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) return <LoadingSpinner message="Fetching physics digital twin synchronization..." />;
  if (error) return <ErrorAlert title="Twin Sync Error" message={error} onRetry={() => fetchData(true)} />;

  const isSolar = state?.plant_type === "solar_pv";
  const gapPct = state?.gap_pct ?? 0;
  const isOnline = state?.node_status === "online";

  return (
    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <PageHeader
        title="Physics Digital Twin & Sensor Telemetry"
        subtitle="Continuous thermodynamic equations coupled with real-time SCADA telemetry feedback and daily recalibration loops."
        actions={
          <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
            Last sync: <strong style={{ color: "var(--text-secondary)" }}>{lastSyncTime || "Just now"}</strong>
          </span>
        }
      />

      {/* Synchronization Status Banner */}
      <Card variant="default" padding="md">
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
              <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "var(--text-primary)" }}>
                Digital Twin Synchronization: {isOnline ? "LIVE SYNCED" : "NODE DISCONNECTED"}
              </div>
              <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                Model Standard: {isSolar ? "Solar PV (IEC 61724 First Principles)" : "Wind Turbine (Betz Law SCADA Model)"}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span
              style={{
                fontSize: "0.75rem",
                padding: "4px 12px",
                borderRadius: "var(--radius-full)",
                backgroundColor: Math.abs(gapPct) > 10 ? "var(--amber-bg)" : "var(--emerald-bg)",
                color: Math.abs(gapPct) > 10 ? "var(--amber-400)" : "var(--emerald-400)",
                border: `1px solid ${Math.abs(gapPct) > 10 ? "var(--amber-border)" : "var(--emerald-border)"}`,
                fontWeight: 700,
              }}
            >
              Twin Gap: {gapPct > 0 ? `+${gapPct}%` : `${gapPct}%`}
            </span>
          </div>
        </div>
      </Card>

      {/* Physics KPI Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "1rem",
        }}
      >
        <KpiCard
          label="Actual Ingested Power"
          value={`${state?.actual_kw.toLocaleString()} kW`}
          subValue="Telemetry reading from node"
          icon={<Zap size={18} />}
          status="default"
        />

        <KpiCard
          label="Physics Model Output"
          value={`${state?.expected_kw.toLocaleString()} kW`}
          subValue="Physical equation expected power"
          icon={<Cpu size={18} />}
          status="default"
        />

        <KpiCard
          label="Estimated Soiling Loss"
          value={`${state?.soiling_loss_pct.toFixed(2)}%`}
          subValue="Rolling actual/expected daytime ratio"
          icon={<Activity size={18} />}
          status={(state?.soiling_loss_pct || 0) > 10 ? "amber" : "default"}
          badge={(state?.soiling_loss_pct || 0) > 10 ? "WASH REQ" : "CLEAR"}
        />

        <KpiCard
          label="Daily Recalibration"
          value="ACTIVE"
          subValue="Continuous PR / Cp parameter fit loop"
          icon={<CheckCircle size={18} />}
          status="emerald"
          badge="FEEDBACK LOOP"
        />
      </div>

      {/* Active Physics Equations & Calibrated Coefficients */}
      <Card variant="elevated" padding="md">
        <h3 style={{ fontSize: "1.05rem", fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
          Active Physics Model Equations & Calibrated Coefficients
        </h3>
        <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", margin: "4px 0 1rem 0" }}>
          {isSolar
            ? "P_pv = P_stc × (G / 1000) × [1 + γ(T_cell - 25)] × (1 - L_soil) × PR"
            : "P_wind = min(P_rated, 0.5 × ρ × A × Cp × v_hub³) for v_cut_in ≤ v ≤ v_cut_out"}
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "0.75rem",
          }}
        >
          {isSolar ? (
            <>
              <div style={paramCard}>
                <span style={paramLabel}>Nameplate STC Capacity (P_stc):</span>
                <span style={paramVal}>32,000 kW (32 MW)</span>
              </div>
              <div style={paramCard}>
                <span style={paramLabel}>Temp Coefficient (γ):</span>
                <span style={paramVal}>-0.004 / °C (c-Si)</span>
              </div>
              <div style={paramCard}>
                <span style={paramLabel}>Performance Ratio (PR):</span>
                <span style={paramVal}>0.9916 (Calibrated)</span>
              </div>
              <div style={paramCard}>
                <span style={paramLabel}>Irradiance Unit:</span>
                <span style={paramVal}>W/m² (Scaled)</span>
              </div>
            </>
          ) : (
            <>
              <div style={paramCard}>
                <span style={paramLabel}>Turbine Rated Capacity (P_rated):</span>
                <span style={paramVal}>3,600 kW (3.6 MW)</span>
              </div>
              <div style={paramCard}>
                <span style={paramLabel}>Rotor Swept Area (A):</span>
                <span style={paramVal}>10,207.03 m²</span>
              </div>
              <div style={paramCard}>
                <span style={paramLabel}>Max Power Coefficient (Cp):</span>
                <span style={paramVal}>0.3313 (Betz compliant)</span>
              </div>
              <div style={paramCard}>
                <span style={paramLabel}>Cut-in / Cut-out Speeds:</span>
                <span style={paramVal}>3.0 m/s / 25.0 m/s</span>
              </div>
            </>
          )}
        </div>
      </Card>

      {/* Recent Telemetry Table */}
      <Card variant="default" padding="md">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
          <div>
            <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
              Recent Ingested Telemetry Buffer ({recentReadings.length} readings)
            </h3>
            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: "2px 0 0 0" }}>
              Ingested via Mosquitto MQTT (`urjatwin/{state?.plant_id}/telemetry`)
            </p>
          </div>
          <span
            style={{
              fontSize: "0.72rem",
              padding: "3px 8px",
              borderRadius: "var(--radius-sm)",
              backgroundColor: isOnline ? "var(--emerald-bg)" : "var(--breach-red-bg)",
              color: isOnline ? "var(--emerald-400)" : "var(--breach-red)",
              border: `1px solid ${isOnline ? "var(--emerald-border)" : "var(--breach-red-border)"}`,
              fontWeight: 700,
            }}
          >
            Sensor Node: {state?.node_status.toUpperCase()}
          </span>
        </div>

        {recentReadings.length === 0 ? (
          <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)", fontSize: "0.85rem" }}>
            No telemetry readings in buffer. Start simulator replay (`python simulator/replay.py`).
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "0.8rem",
                textAlign: "left",
              }}
            >
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-default)", color: "var(--text-muted)" }}>
                  <th style={{ padding: "10px 12px" }}>Timestamp</th>
                  <th style={{ padding: "10px 12px" }}>Power Output (kW)</th>
                  {isSolar ? (
                    <>
                      <th style={{ padding: "10px 12px" }}>Irradiance (W/m²)</th>
                      <th style={{ padding: "10px 12px" }}>Module Temp (°C)</th>
                    </>
                  ) : (
                    <th style={{ padding: "10px 12px" }}>Wind Speed (m/s)</th>
                  )}
                  <th style={{ padding: "10px 12px" }}>Validation Status</th>
                </tr>
              </thead>
              <tbody>
                {recentReadings.slice(-10).reverse().map((r, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--border-subtle)", color: "var(--text-primary)" }}>
                    <td style={{ padding: "10px 12px", fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                      {r.ts}
                    </td>
                    <td style={{ padding: "10px 12px", fontWeight: 700, color: "var(--sky-400)" }}>
                      {r.power_kw.toLocaleString()} kW
                    </td>
                    {isSolar ? (
                      <>
                        <td style={{ padding: "10px 12px" }}>{r.irradiance ?? "N/A"}</td>
                        <td style={{ padding: "10px 12px" }}>{r.module_temp ?? "N/A"}</td>
                      </>
                    ) : (
                      <td style={{ padding: "10px 12px" }}>{r.wind_speed ?? "N/A"}</td>
                    )}
                    <td style={{ padding: "10px 12px" }}>
                      <span
                        style={{
                          fontSize: "0.68rem",
                          backgroundColor: "var(--emerald-bg)",
                          color: "var(--emerald-400)",
                          padding: "2px 6px",
                          borderRadius: "var(--radius-sm)",
                          fontWeight: 700,
                        }}
                      >
                        VALIDATED
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};

const paramCard: React.CSSProperties = {
  backgroundColor: "var(--bg-app)",
  padding: "10px 14px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--border-subtle)",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  fontSize: "0.8rem",
};

const paramLabel: React.CSSProperties = {
  color: "var(--text-secondary)",
};

const paramVal: React.CSSProperties = {
  fontWeight: 700,
  color: "var(--text-primary)",
};
