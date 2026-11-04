import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  getPlantAlerts,
  getPlantDSM,
  getPlantState,
  type AlertItem,
  type DSMResponse,
  type PlantStateResponse,
} from "../api/client";
import { LoadingSpinner } from "../components/common/LoadingSpinner";
import { ErrorAlert } from "../components/common/ErrorAlert";
import { EmptyState } from "../components/common/EmptyState";
import { PageHeader } from "../components/common/PageHeader";
import { Card } from "../components/common/Card";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { AlertTriangle, Sparkles, ShieldAlert } from "lucide-react";

export const AlertsPage: React.FC<{ plantId: string }> = ({ plantId }) => {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [dsm, setDsm] = useState<DSMResponse | null>(null);
  const [state, setState] = useState<PlantStateResponse | null>(null);
  const [filterType, setFilterType] = useState<string>("all");
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string>("");

  const isInitialMount = useRef(true);

  const fetchData = useCallback(async (isInitial = false) => {
    if (isInitial && isInitialMount.current) setLoading(true);
    setError(null);
    try {
      const [alertsRes, dsmRes, stateRes] = await Promise.all([
        getPlantAlerts(plantId, 50),
        getPlantDSM(plantId),
        getPlantState(plantId),
      ]);
      setAlerts(alertsRes.alerts || []);
      setDsm(dsmRes);
      setState(stateRes);
      setLastSyncTime(new Date().toLocaleTimeString());
    } catch (err: any) {
      setError(err?.response?.data?.detail || err.message || "Failed to load alerts and DSM data");
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

  if (loading) return <LoadingSpinner message="Fetching plant operational alerts and DSM breach status..." />;
  if (error) return <ErrorAlert title="Alerts Retrieval Error" message={error} onRetry={() => fetchData(true)} />;

  const filteredAlerts = alerts.filter(
    (a) => filterType === "all" || a.type === filterType
  );

  const breaches = dsm?.breach_blocks || [];
  const revisedSched = dsm?.revised_schedule || [];

  const scheduleChartData = revisedSched.map((rev) => {
    const breach = breaches.find((b) => b.ts === rev.ts);
    const originalSched = breach ? breach.schedule_kw : rev.schedule_kw;
    const timeLabel = rev.ts.split("T")[1]?.substring(0, 5) || rev.ts;
    return {
      ts: rev.ts,
      timeLabel,
      original_schedule: originalSched,
      revised_schedule: rev.schedule_kw,
      forecast_kw: breach ? breach.forecast_kw : null,
      isBreach: !!breach,
    };
  });

  const latestSoilingAlert = alerts.find((a) => a.type === "soiling");
  const cleaningGainKw = latestSoilingAlert?.cleaning_gain_kw || (state ? (state.capacity_kw * (state.soiling_loss_pct / 100)) : 0);

  return (
    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <PageHeader
        title="Alerts & Deviation Management (DSM)"
        subtitle="Real-time band compliance checks, automated schedule shift calculations, and soiling detection."
        actions={
          <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
            Last sync: <strong style={{ color: "var(--text-secondary)" }}>{lastSyncTime || "Just now"}</strong>
          </span>
        }
      />

      {/* Top Banner: DSM & Soiling Badges */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: "1rem",
        }}
      >
        {/* DSM Compliance Status Card */}
        <Card variant={breaches.length > 0 ? "breach" : "default"} padding="md">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <ShieldAlert size={16} color={breaches.length > 0 ? "var(--breach-red)" : "var(--emerald-400)"} />
              <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)" }}>
                DSM REGULATION STATUS
              </span>
            </div>
            <span
              style={{
                fontSize: "0.7rem",
                padding: "2px 8px",
                borderRadius: "var(--radius-sm)",
                backgroundColor: breaches.length > 0 ? "var(--breach-red-bg)" : "var(--emerald-bg)",
                color: breaches.length > 0 ? "var(--breach-red)" : "var(--emerald-400)",
                border: `1px solid ${breaches.length > 0 ? "var(--breach-red-border)" : "var(--emerald-border)"}`,
                fontWeight: 700,
              }}
            >
              {breaches.length > 0 ? "ACTION REQUIRED" : "COMPLIANT"}
            </span>
          </div>
          <div
            style={{
              fontSize: "1.75rem",
              fontWeight: 800,
              color: breaches.length > 0 ? "var(--breach-red)" : "var(--emerald-400)",
              margin: "0.5rem 0 0.2rem 0",
              letterSpacing: "-0.02em",
            }}
          >
            {dsm?.total_breaches || 0} Breaches
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
            Tolerance Band: ±{dsm?.tolerance_pct || 10}% | Relative Exposure: {dsm?.relative_exposure_pct !== undefined ? dsm.relative_exposure_pct.toFixed(1) : "0.0"}%
          </div>
        </Card>

        {/* Soiling Status Card */}
        <Card variant={(state?.soiling_loss_pct || 0) > 10 ? "amber" : "default"} padding="md">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <Sparkles size={16} color={(state?.soiling_loss_pct || 0) > 10 ? "var(--amber-400)" : "var(--sky-400)"} />
              <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)" }}>
                PANEL SOILING ESTIMATE
              </span>
            </div>
            <span
              style={{
                fontSize: "0.7rem",
                padding: "2px 8px",
                borderRadius: "var(--radius-sm)",
                backgroundColor: (state?.soiling_loss_pct || 0) > 10 ? "var(--amber-bg)" : "rgba(14, 165, 233, 0.1)",
                color: (state?.soiling_loss_pct || 0) > 10 ? "var(--amber-400)" : "var(--sky-400)",
                border: `1px solid ${(state?.soiling_loss_pct || 0) > 10 ? "var(--amber-border)" : "rgba(14, 165, 233, 0.3)"}`,
                fontWeight: 700,
              }}
            >
              {(state?.soiling_loss_pct || 0) > 10 ? "WASH RECOMMENDED" : "NORMAL RATIO"}
            </span>
          </div>
          <div
            style={{
              fontSize: "1.75rem",
              fontWeight: 800,
              color: (state?.soiling_loss_pct || 0) > 10 ? "var(--amber-400)" : "var(--sky-400)",
              margin: "0.5rem 0 0.2rem 0",
              letterSpacing: "-0.02em",
            }}
          >
            {state?.soiling_loss_pct.toFixed(1)}% Loss
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
            Estimated Cleaning Recovery: <strong style={{ color: "var(--text-secondary)" }}>+{Math.round(cleaningGainKw).toLocaleString()} kW</strong>
          </div>
        </Card>
      </div>

      {/* Suggested Revised Schedule Section */}
      <Card variant="default" padding="md">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.5rem" }}>
          <div>
            <h3 style={{ fontSize: "1.05rem", fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
              Suggested Revised Schedule (DSM Mitigation)
            </h3>
            <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", margin: "4px 0 1rem 0" }}>
              Automated algorithm shifts schedule toward generation forecast just enough to eliminate breach exposure
            </p>
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--sky-400)", fontWeight: 600 }}>
            {revisedSched.length} Blocks Evaluated
          </div>
        </div>

        {/* Comparison Chart */}
        <div style={{ width: "100%", height: "260px", marginTop: "0.5rem" }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={scheduleChartData} margin={{ top: 10, right: 15, left: 10, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
              <XAxis dataKey="timeLabel" stroke="var(--text-muted)" tick={{ fontSize: 11, fill: "var(--text-secondary)" }} interval={11} />
              <YAxis stroke="var(--text-muted)" tick={{ fontSize: 11, fill: "var(--text-secondary)" }} />
              <Tooltip
                contentStyle={{ backgroundColor: "var(--bg-app)", borderColor: "var(--border-default)", borderRadius: "var(--radius-sm)", fontSize: "0.8rem" }}
              />
              <Line
                type="stepAfter"
                dataKey="original_schedule"
                stroke="var(--amber-500)"
                strokeWidth={2}
                strokeDasharray="4 4"
                name="Original Schedule (kW)"
                dot={false}
              />
              <Line
                type="stepAfter"
                dataKey="revised_schedule"
                stroke="var(--emerald-400)"
                strokeWidth={2.5}
                name="Revised Schedule (kW)"
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div style={{ display: "flex", justifyContent: "center", gap: "1.5rem", marginTop: "0.5rem", fontSize: "0.75rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ width: "16px", height: "2px", borderTop: "2px dashed var(--amber-500)" }} />
            <span style={{ color: "var(--text-secondary)" }}>Original Schedule</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ width: "16px", height: "3px", backgroundColor: "var(--emerald-400)" }} />
            <span style={{ color: "var(--emerald-400)", fontWeight: 600 }}>Suggested Revised Schedule (Zero Breaches)</span>
          </div>
        </div>
      </Card>

      {/* Next N Blocks Breach List & Filterable Alerts Feed */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: breaches.length > 0 ? "1fr 1fr" : "1fr",
          gap: "1.5rem",
        }}
      >
        {/* Next N Breach Blocks List */}
        {breaches.length > 0 && (
          <Card variant="breach" padding="md">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <AlertTriangle size={16} color="var(--breach-red)" />
                <h4 style={{ fontSize: "0.95rem", fontWeight: 700, margin: 0, color: "var(--breach-red)" }}>
                  Active Breach Blocks ({breaches.length})
                </h4>
              </div>
              <span style={{ fontSize: "0.72rem", color: "var(--breach-red)", fontWeight: 700 }}>Band: ±{dsm?.tolerance_pct}%</span>
            </div>

            <div style={{ maxHeight: "380px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {breaches.map((b, i) => (
                <div
                  key={i}
                  style={{
                    padding: "8px 12px",
                    borderRadius: "var(--radius-sm)",
                    backgroundColor: "var(--bg-app)",
                    border: "1px solid var(--breach-red-border)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: "0.8rem",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>{b.ts}</div>
                    <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>
                      Forecast: {b.forecast_kw.toLocaleString()} kW | Sched: {b.schedule_kw.toLocaleString()} kW
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 800, color: "var(--breach-red)" }}>
                      {b.deviation_pct > 0 ? `+${b.deviation_pct.toFixed(1)}%` : `${b.deviation_pct.toFixed(1)}%`}
                    </div>
                    <div style={{ fontSize: "0.7rem", color: "var(--breach-red)" }}>
                      Severity: +{b.severity_pct.toFixed(1)}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Live Operational Alerts Feed */}
        <Card variant="default" padding="md">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "0.75rem",
              flexWrap: "wrap",
              gap: "0.5rem",
            }}
          >
            <div>
              <h4 style={{ fontSize: "0.95rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                Operational Alerts Feed ({filteredAlerts.length})
              </h4>
              <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Filtered by category</span>
            </div>

            {/* Filter buttons */}
            <div style={{ display: "flex", gap: "4px" }}>
              {["all", "dsm_breach", "soiling", "node_offline"].map((t) => (
                <button
                  key={t}
                  onClick={() => setFilterType(t)}
                  style={{
                    padding: "4px 8px",
                    fontSize: "0.7rem",
                    fontWeight: 600,
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border-default)",
                    cursor: "pointer",
                    backgroundColor: filterType === t ? "var(--sky-500)" : "var(--bg-app)",
                    color: filterType === t ? "#FFF" : "var(--text-secondary)",
                  }}
                >
                  {t === "all" ? "All" : t.replace("_", " ").toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {filteredAlerts.length === 0 ? (
            <EmptyState
              title="No Alerts In Current View"
              description="No operational events or fault injections recorded matching filter."
            />
          ) : (
            <div style={{ maxHeight: "380px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {filteredAlerts.map((alert, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: "8px 12px",
                    borderRadius: "var(--radius-sm)",
                    backgroundColor: "var(--bg-app)",
                    border: `1px solid ${
                      alert.type === "dsm_breach"
                        ? "var(--breach-red-border)"
                        : alert.type === "soiling"
                        ? "var(--amber-border)"
                        : "var(--border-subtle)"
                    }`,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span
                        style={{
                          fontSize: "0.65rem",
                          fontWeight: 700,
                          textTransform: "uppercase",
                          padding: "1px 5px",
                          borderRadius: "var(--radius-sm)",
                          backgroundColor:
                            alert.type === "dsm_breach"
                              ? "var(--breach-red-bg)"
                              : alert.type === "soiling"
                              ? "var(--amber-bg)"
                              : "rgba(100, 116, 139, 0.2)",
                          color:
                            alert.type === "dsm_breach"
                              ? "var(--breach-red)"
                              : alert.type === "soiling"
                              ? "var(--amber-400)"
                              : "var(--text-secondary)",
                          border: `1px solid ${
                            alert.type === "dsm_breach"
                              ? "var(--breach-red-border)"
                              : alert.type === "soiling"
                              ? "var(--amber-border)"
                              : "transparent"
                          }`,
                        }}
                      >
                        {alert.type.replace("_", " ")}
                      </span>
                      <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{alert.ts}</span>
                    </div>
                    <div style={{ fontSize: "0.8rem", color: "var(--text-primary)", marginTop: "4px" }}>
                      {alert.message}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: "0.7rem",
                      fontWeight: 700,
                      color:
                        alert.severity === "high"
                          ? "var(--breach-red)"
                          : alert.severity === "medium"
                          ? "var(--amber-400)"
                          : "var(--emerald-400)",
                      textTransform: "uppercase",
                    }}
                  >
                    {alert.severity}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};
