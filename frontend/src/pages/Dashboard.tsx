import React, { useState, useEffect, useCallback } from "react";
import {
  getPlantState,
  getPlantForecast,
  getPlantActual,
  getPlantSchedule,
  getPlantDSM,
  getPlantAccuracy,
  type PlantStateResponse,
  type AccuracyResponse,
  type DSMResponse,
} from "../api/client";
import { HeroChart, type ChartDataPoint } from "../components/dashboard/HeroChart";
import { AccuracyCard } from "../components/dashboard/AccuracyCard";
import { LoadingSpinner } from "../components/common/LoadingSpinner";
import { ErrorAlert } from "../components/common/ErrorAlert";

export const Dashboard: React.FC<{ plantId: string }> = ({ plantId }) => {
  const [state, setState] = useState<PlantStateResponse | null>(null);
  const [dsm, setDsm] = useState<DSMResponse | null>(null);
  const [accuracy, setAccuracy] = useState<AccuracyResponse | null>(null);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string>("");
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const fetchDashboardData = useCallback(async (isInitial = false) => {
    if (isInitial) setLoading(true);
    setIsRefreshing(true);
    setError(null);

    try {
      const [stateRes, forecastRes, actualRes, schedRes, dsmRes, accRes] =
        await Promise.all([
          getPlantState(plantId),
          getPlantForecast(plantId),
          getPlantActual(plantId, 96),
          getPlantSchedule(plantId),
          getPlantDSM(plantId),
          getPlantAccuracy(plantId),
        ]);

      setState(stateRes);
      setDsm(dsmRes);
      setAccuracy(accRes);
      setLastSyncTime(new Date().toLocaleTimeString());

      // Map readings into unified 15-min chart timeline
      const capacityKw = stateRes.capacity_kw || 1000.0;
      const tolPct = dsmRes.tolerance_pct || 10.0;
      const tolKw = capacityKw * (tolPct / 100.0);

      const actualMap = new Map<string, number>();
      (actualRes.actual || []).forEach((a) => {
        actualMap.set(a.ts, a.power_kw);
      });

      const schedMap = new Map<string, number>();
      (schedRes.schedule || []).forEach((s) => {
        schedMap.set(s.ts, s.schedule_kw);
      });

      const breachMap = new Map<string, any>();
      (dsmRes.breach_blocks || []).forEach((b) => {
        breachMap.set(b.ts, b);
      });

      // Assemble unified 96 points
      const points: ChartDataPoint[] = (forecastRes.forecast || []).map((f) => {
        const schedKw = schedMap.get(f.ts) ?? null;
        const actualKw = actualMap.has(f.ts) ? actualMap.get(f.ts)! : null;
        const breachInfo = breachMap.get(f.ts);
        const timePart = f.ts.split("T")[1]?.substring(0, 5) || f.ts;

        return {
          ts: f.ts,
          timeLabel: timePart,
          forecast_kw: f.forecast_kw,
          actual_kw: actualKw,
          schedule_kw: schedKw,
          band_upper: schedKw !== null ? schedKw + tolKw : null,
          band_lower: schedKw !== null ? Math.max(0, schedKw - tolKw) : null,
          isBreach: !!breachInfo,
          deviation_kw: breachInfo?.deviation_kw,
          deviation_pct: breachInfo?.deviation_pct,
        };
      });

      setChartData(points);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err.message || "Failed to load dashboard telemetry.");
    } finally {
      if (isInitial) setLoading(false);
      setIsRefreshing(false);
    }
  }, [plantId]);

  // Initial load
  useEffect(() => {
    fetchDashboardData(true);
  }, [fetchDashboardData]);

  // Auto-refresh interval (5 seconds) to catch incoming simulator replay blocks
  useEffect(() => {
    const interval = setInterval(() => {
      fetchDashboardData(false);
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchDashboardData]);

  if (loading) return <LoadingSpinner message="Connecting to digital twin live telemetry stream..." />;
  if (error) return <ErrorAlert title="Dashboard Communication Error" message={error} onRetry={() => fetchDashboardData(true)} />;

  const gapPct = state?.gap_pct ?? 0;
  const breachesCount = dsm?.total_breaches ?? 0;
  const exposurePct = dsm?.relative_exposure_pct ?? 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Top Sync & Status Bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "0.75rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{
              width: "10px",
              height: "10px",
              borderRadius: "50%",
              backgroundColor: state?.node_status === "online" ? "#10B981" : "#EF4444",
              boxShadow: state?.node_status === "online" ? "0 0 8px #10B981" : "none",
            }}
          />
          <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#F8FAFC" }}>
            Node Status: {state?.node_status === "online" ? "ACTIVE STREAM" : "OFFLINE"}
          </span>
          {isRefreshing && (
            <span style={{ fontSize: "0.75rem", color: "#38BDF8", fontWeight: 600 }}>
              (syncing...)
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ fontSize: "0.8rem", color: "#94A3B8" }}>
            Last Twin Sync: <strong>{lastSyncTime || "Just now"}</strong>
          </span>
          <button
            onClick={() => fetchDashboardData(false)}
            style={{
              backgroundColor: "#1E293B",
              color: "#38BDF8",
              border: "1px solid #334155",
              borderRadius: "6px",
              padding: "4px 10px",
              fontSize: "0.75rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            ↻ Manual Sync
          </button>
        </div>
      </div>

      {/* Hero KPI Cards Row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "1rem",
        }}
      >
        <div style={kpiCardStyle}>
          <div style={kpiLabelStyle}>ACTUAL INGESTED POWER</div>
          <div style={kpiValueStyle}>{state?.actual_kw.toLocaleString()} kW</div>
          <div style={kpiSubStyle}>Latest timestamp: {state?.last_ts || "N/A"}</div>
        </div>

        <div style={kpiCardStyle}>
          <div style={kpiLabelStyle}>PHYSICS TWIN EXPECTED</div>
          <div style={kpiValueStyle}>{state?.expected_kw.toLocaleString()} kW</div>
          <div style={kpiSubStyle}>
            {state?.plant_type === "solar_pv" ? "PV cell temp & irradiance model" : "Wind cubic power equation"}
          </div>
        </div>

        <div style={kpiCardStyle}>
          <div style={kpiLabelStyle}>TWIN SYNC GAP</div>
          <div
            style={{
              ...kpiValueStyle,
              color: Math.abs(gapPct) > 10 ? "#EF4444" : "#10B981",
            }}
          >
            {gapPct > 0 ? `+${gapPct}%` : `${gapPct}%`}
          </div>
          <div style={kpiSubStyle}>
            {Math.abs(gapPct) > 10 ? "⚠ Discrepancy beyond ±10% threshold" : "✓ Tracking expected physics"}
          </div>
        </div>

        <div
          style={{
            ...kpiCardStyle,
            borderColor: breachesCount > 0 ? "#EF4444" : "#1E293B",
            backgroundColor: breachesCount > 0 ? "#1C1420" : "#131C31",
          }}
        >
          <div style={kpiLabelStyle}>DSM BREACH BLOCKS (24H)</div>
          <div
            style={{
              ...kpiValueStyle,
              color: breachesCount > 0 ? "#EF4444" : "#10B981",
            }}
          >
            {breachesCount} Blocks
          </div>
          <div style={kpiSubStyle}>
            Penalty Exposure: {exposurePct.toFixed(1)}% | Band: ±{dsm?.tolerance_pct || 10}%
          </div>
        </div>
      </div>

      {/* Hero Chart Section */}
      <div
        style={{
          backgroundColor: "#131C31",
          borderRadius: "10px",
          border: "1px solid #1E293B",
          padding: "1.5rem",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            flexWrap: "wrap",
            gap: "0.75rem",
            marginBottom: "1rem",
          }}
        >
          <div>
            <h2 style={{ fontSize: "1.1rem", fontWeight: 700, margin: 0, color: "#F8FAFC" }}>
              24-Hour Horizon Power Dispatch & DSM Bands
            </h2>
            <p style={{ fontSize: "0.8rem", color: "#94A3B8", margin: "4px 0 0 0" }}>
              15-minute resolution LightGBM forecast vs Scheduled commitments & DSM tolerance band
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {breachesCount > 0 && (
              <span
                style={{
                  backgroundColor: "#7F1D1D",
                  color: "#FCA5A5",
                  padding: "4px 10px",
                  borderRadius: "9999px",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                }}
              >
                ⚠ {breachesCount} DSM Breaches Detected
              </span>
            )}
            <span
              style={{
                fontSize: "0.75rem",
                color: "#94A3B8",
                backgroundColor: "#0F172A",
                padding: "4px 8px",
                borderRadius: "4px",
                border: "1px solid #334155",
              }}
            >
              Capacity: {state?.capacity_kw.toLocaleString()} kW
            </span>
          </div>
        </div>

        <HeroChart
          data={chartData}
          capacityKw={state?.capacity_kw || 1000.0}
          tolerancePct={dsm?.tolerance_pct || 10.0}
        />
      </div>

      {/* Measured Accuracy Benchmark Card */}
      <AccuracyCard accuracy={accuracy} />
    </div>
  );
};

const kpiCardStyle: React.CSSProperties = {
  backgroundColor: "#131C31",
  border: "1px solid #1E293B",
  borderRadius: "10px",
  padding: "1.25rem",
};

const kpiLabelStyle: React.CSSProperties = {
  fontSize: "0.72rem",
  fontWeight: 700,
  color: "#94A3B8",
  letterSpacing: "0.05em",
  marginBottom: "0.4rem",
};

const kpiValueStyle: React.CSSProperties = {
  fontSize: "1.65rem",
  fontWeight: 800,
  color: "#F8FAFC",
  letterSpacing: "-0.025em",
  marginBottom: "0.25rem",
};

const kpiSubStyle: React.CSSProperties = {
  fontSize: "0.72rem",
  color: "#64748B",
};
