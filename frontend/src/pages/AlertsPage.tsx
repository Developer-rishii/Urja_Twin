/**
 * Alerts & DSM Management Page (Task T11).
 *
 * Includes:
 * 1. Alerts Feed (Filterable by type: all, dsm_breach, soiling, node_offline)
 * 2. Next N Blocks Breach Panel with high-contrast warning
 * 3. Suggested Revised Schedule (Before vs After Schedule Comparison Chart & Table)
 * 4. Soiling Status Badge with Estimated Loss % & Cleaning Gain (kW/kWh)
 */

import React, { useState, useEffect, useCallback } from "react";
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
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

export const AlertsPage: React.FC<{ plantId: string }> = ({ plantId }) => {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [dsm, setDsm] = useState<DSMResponse | null>(null);
  const [state, setState] = useState<PlantStateResponse | null>(null);
  const [filterType, setFilterType] = useState<string>("all");
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string>("");

  const fetchData = useCallback(async (isInitial = false) => {
    if (isInitial) setLoading(true);
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
      if (isInitial) setLoading(false);
    }
  }, [plantId]);

  useEffect(() => {
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

  // Build chart comparison data between committed schedule and suggested revised schedule
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

  // Calculate latest soiling alert metrics
  const latestSoilingAlert = alerts.find((a) => a.type === "soiling");
  const cleaningGainKw = latestSoilingAlert?.cleaning_gain_kw || (state ? (state.capacity_kw * (state.soiling_loss_pct / 100)) : 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Top Banner: DSM & Soiling Badges */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: "1rem",
        }}
      >
        {/* DSM Compliance Status Badge */}
        <div
          style={{
            backgroundColor: (dsm?.total_breaches || 0) > 0 ? "#2B1115" : "#0A261D",
            border: `1px solid ${(dsm?.total_breaches || 0) > 0 ? "#EF4444" : "#10B981"}`,
            borderRadius: "10px",
            padding: "1.25rem",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#94A3B8" }}>
              DSM REGULATION STATUS
            </span>
            <span
              style={{
                fontSize: "0.7rem",
                padding: "2px 8px",
                borderRadius: "4px",
                backgroundColor: (dsm?.total_breaches || 0) > 0 ? "#7F1D1D" : "#065F46",
                color: "#FFF",
                fontWeight: 700,
              }}
            >
              {(dsm?.total_breaches || 0) > 0 ? "ACTION REQUIRED" : "COMPLIANT"}
            </span>
          </div>
          <div
            style={{
              fontSize: "1.75rem",
              fontWeight: 800,
              color: (dsm?.total_breaches || 0) > 0 ? "#EF4444" : "#10B981",
              margin: "0.4rem 0 0.2rem 0",
            }}
          >
            {dsm?.total_breaches || 0} Breaches
          </div>
          <div style={{ fontSize: "0.75rem", color: "#CBD5E1" }}>
            Tolerance Band: ±{dsm?.tolerance_pct || 10}% | Relative Exposure: {dsm?.relative_exposure_pct.toFixed(1)}%
          </div>
        </div>

        {/* Soiling Status Badge */}
        <div
          style={{
            backgroundColor: (state?.soiling_loss_pct || 0) > 10 ? "#2B1D0E" : "#131C31",
            border: `1px solid ${(state?.soiling_loss_pct || 0) > 10 ? "#F59E0B" : "#1E293B"}`,
            borderRadius: "10px",
            padding: "1.25rem",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#94A3B8" }}>
              PANEL SOILING ESTIMATE
            </span>
            <span
              style={{
                fontSize: "0.7rem",
                padding: "2px 8px",
                borderRadius: "4px",
                backgroundColor: (state?.soiling_loss_pct || 0) > 10 ? "#78350F" : "#1E293B",
                color: (state?.soiling_loss_pct || 0) > 10 ? "#FDE68A" : "#94A3B8",
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
              color: (state?.soiling_loss_pct || 0) > 10 ? "#F59E0B" : "#38BDF8",
              margin: "0.4rem 0 0.2rem 0",
            }}
          >
            {state?.soiling_loss_pct.toFixed(1)}% Loss
          </div>
          <div style={{ fontSize: "0.75rem", color: "#CBD5E1" }}>
            Estimated Cleaning Recovery: <strong>+{Math.round(cleaningGainKw).toLocaleString()} kW</strong>
          </div>
        </div>
      </div>

      {/* Suggested Revised Schedule Section */}
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
            <h3 style={{ fontSize: "1.05rem", fontWeight: 700, margin: 0, color: "#F8FAFC" }}>
              Suggested Revised Schedule (DSM Mitigation)
            </h3>
            <p style={{ fontSize: "0.8rem", color: "#94A3B8", margin: "4px 0 1rem 0" }}>
              Automatically adjusts schedule blocks toward generation forecast to eliminate penalty exposure
            </p>
          </div>
          <div style={{ fontSize: "0.75rem", color: "#38BDF8", fontWeight: 600 }}>
            {revisedSched.length} Blocks Evaluated
          </div>
        </div>

        {/* Comparison Chart */}
        <div style={{ width: "100%", height: "260px", marginTop: "0.5rem" }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={scheduleChartData} margin={{ top: 10, right: 15, left: 10, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
              <XAxis dataKey="timeLabel" stroke="#64748B" tick={{ fontSize: 11, fill: "#94A3B8" }} interval={11} />
              <YAxis stroke="#64748B" tick={{ fontSize: 11, fill: "#94A3B8" }} />
              <Tooltip
                contentStyle={{ backgroundColor: "#0B0F19", borderColor: "#334155", borderRadius: "8px", fontSize: "0.8rem" }}
              />
              <Line
                type="stepAfter"
                dataKey="original_schedule"
                stroke="#F59E0B"
                strokeWidth={2}
                strokeDasharray="4 4"
                name="Original Schedule (kW)"
                dot={false}
              />
              <Line
                type="stepAfter"
                dataKey="revised_schedule"
                stroke="#10B981"
                strokeWidth={2.5}
                name="Revised Schedule (kW)"
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div style={{ display: "flex", justifyContent: "center", gap: "1.5rem", marginTop: "0.5rem", fontSize: "0.75rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ width: "16px", height: "2px", borderTop: "2px dashed #F59E0B" }} />
            <span style={{ color: "#E2E8F0" }}>Original Schedule</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ width: "16px", height: "3px", backgroundColor: "#10B981" }} />
            <span style={{ color: "#E2E8F0" }}>Suggested Revised Schedule (Zero Breaches)</span>
          </div>
        </div>
      </div>

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
          <div
            style={{
              backgroundColor: "#131C31",
              borderRadius: "10px",
              border: "1px solid #7F1D1D",
              padding: "1.25rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
              <h4 style={{ fontSize: "0.95rem", fontWeight: 700, margin: 0, color: "#FCA5A5" }}>
                Active Breach Blocks ({breaches.length})
              </h4>
              <span style={{ fontSize: "0.7rem", color: "#F87171" }}>Band: ±{dsm?.tolerance_pct}%</span>
            </div>

            <div style={{ maxHeight: "380px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {breaches.map((b, i) => (
                <div
                  key={i}
                  style={{
                    padding: "8px 12px",
                    borderRadius: "6px",
                    backgroundColor: "#1C1420",
                    border: "1px solid #7F1D1D",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: "0.8rem",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, color: "#F8FAFC" }}>{b.ts}</div>
                    <div style={{ fontSize: "0.7rem", color: "#94A3B8" }}>
                      Forecast: {b.forecast_kw.toLocaleString()} kW | Sched: {b.schedule_kw.toLocaleString()} kW
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 800, color: "#EF4444" }}>
                      {b.deviation_pct > 0 ? `+${b.deviation_pct.toFixed(1)}%` : `${b.deviation_pct.toFixed(1)}%`}
                    </div>
                    <div style={{ fontSize: "0.7rem", color: "#FCA5A5" }}>
                      Severity: +{b.severity_pct.toFixed(1)}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Live Operational Alerts Feed */}
        <div
          style={{
            backgroundColor: "#131C31",
            borderRadius: "10px",
            border: "1px solid #1E293B",
            padding: "1.25rem",
          }}
        >
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
              <h4 style={{ fontSize: "0.95rem", fontWeight: 700, margin: 0, color: "#F8FAFC" }}>
                Operational Alerts Feed ({filteredAlerts.length})
              </h4>
              <span style={{ fontSize: "0.7rem", color: "#64748B" }}>Last sync: {lastSyncTime}</span>
            </div>

            {/* Filter buttons */}
            <div style={{ display: "flex", gap: "4px" }}>
              {["all", "dsm_breach", "soiling", "node_offline"].map((t) => (
                <button
                  key={t}
                  onClick={() => setFilterType(t)}
                  style={{
                    padding: "3px 8px",
                    fontSize: "0.7rem",
                    fontWeight: 600,
                    borderRadius: "4px",
                    border: "none",
                    cursor: "pointer",
                    backgroundColor: filterType === t ? "#0284C7" : "#0F172A",
                    color: filterType === t ? "#FFF" : "#94A3B8",
                  }}
                >
                  {t === "all" ? "All" : t.replace("_", " ")}
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
                    borderRadius: "6px",
                    backgroundColor: "#0F172A",
                    border: `1px solid ${
                      alert.type === "dsm_breach"
                        ? "#EF4444"
                        : alert.type === "soiling"
                        ? "#F59E0B"
                        : "#64748B"
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
                          borderRadius: "3px",
                          backgroundColor:
                            alert.type === "dsm_breach"
                              ? "#7F1D1D"
                              : alert.type === "soiling"
                              ? "#78350F"
                              : "#334155",
                          color: "#FFF",
                        }}
                      >
                        {alert.type}
                      </span>
                      <span style={{ fontSize: "0.7rem", color: "#94A3B8" }}>{alert.ts}</span>
                    </div>
                    <div style={{ fontSize: "0.8rem", color: "#E2E8F0", marginTop: "4px" }}>
                      {alert.message}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: "0.7rem",
                      fontWeight: 700,
                      color:
                        alert.severity === "high"
                          ? "#EF4444"
                          : alert.severity === "medium"
                          ? "#F59E0B"
                          : "#10B981",
                      textTransform: "uppercase",
                    }}
                  >
                    {alert.severity}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
