import React, { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import {
  Zap,
  Gauge,
  Percent,
  AlertOctagon,
  RefreshCw,
  TrendingUp,
  ArrowRight,
} from "lucide-react";
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
import { KpiCard } from "../components/common/KpiCard";
import { Card } from "../components/common/Card";
import { PageHeader } from "../components/common/PageHeader";
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

  // Ref to track initial load so polling updates do not re-trigger mount animations
  const isInitialMount = useRef(true);

  const fetchDashboardData = useCallback(async (isInitial = false) => {
    if (isInitial && isInitialMount.current) setLoading(true);
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
      if (isInitial && isInitialMount.current) {
        setLoading(false);
        isInitialMount.current = false;
      }
      setIsRefreshing(false);
    }
  }, [plantId]);

  useEffect(() => {
    isInitialMount.current = true;
    fetchDashboardData(true);
  }, [fetchDashboardData]);

  // Regular 5-second polling for real-time simulator blocks
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
    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* SaaS Page Header */}
      <PageHeader
        title="Generation & Dispatch Compliance"
        subtitle="15-minute resolution LightGBM forecast, continuous physics twin synchronization, and DSM penalty mitigation."
        actions={
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
              Last sync: <strong style={{ color: "var(--text-secondary)" }}>{lastSyncTime || "Just now"}</strong>
            </span>
            <button
              onClick={() => fetchDashboardData(false)}
              aria-label="Refresh telemetry data"
              style={{
                backgroundColor: "var(--bg-surface-elevated)",
                color: "var(--sky-400)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-sm)",
                padding: "6px 12px",
                fontSize: "0.78rem",
                fontWeight: 600,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <RefreshCw size={13} className={isRefreshing ? "spin-icon" : ""} />
              <span>Sync</span>
            </button>
          </div>
        }
      />

      {/* 4 Hero KPI Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "1rem",
        }}
      >
        <KpiCard
          label="Actual Generation"
          value={`${state?.actual_kw.toLocaleString()} kW`}
          subValue={`Latest timestamp: ${state?.last_ts || "Awaiting packet"}`}
          icon={<Zap size={18} />}
          status="default"
          badge={state?.node_status === "online" ? "STREAM ACTIVE" : "OFFLINE"}
          tooltip="Real telemetry reading ingested from simulated sensor node via MQTT"
        />

        <KpiCard
          label="Physics Twin Expected"
          value={`${state?.expected_kw.toLocaleString()} kW`}
          subValue={state?.plant_type === "solar_pv" ? "PV cell temp & irradiance model" : "SCADA aerodynamic cubic equation"}
          icon={<Gauge size={18} />}
          status="default"
          badge="PHYSICS"
          tooltip="Instantaneous thermodynamic power equation output"
        />

        <KpiCard
          label="Twin Sync Gap"
          value={gapPct > 0 ? `+${gapPct}%` : `${gapPct}%`}
          subValue={Math.abs(gapPct) > 10 ? "Exceeds ±10% physical threshold" : "Tracking expected physics"}
          icon={<Percent size={18} />}
          status={Math.abs(gapPct) > 10 ? "amber" : "emerald"}
          badge={Math.abs(gapPct) > 10 ? "DIVERGENT" : "CALIBRATED"}
          tooltip="Discrepancy between actual sensor output and physics model"
        />

        <KpiCard
          label="DSM Breach Blocks (24h)"
          value={`${breachesCount} Blocks`}
          subValue={`Penalty exposure: ${exposurePct.toFixed(1)}% | Band: ±${dsm?.tolerance_pct || 10}%`}
          icon={<AlertOctagon size={18} />}
          status={breachesCount > 0 ? "breach" : "emerald"}
          badge={breachesCount > 0 ? "ACTION REQ" : "COMPLIANT"}
          tooltip="Blocks deviating beyond CERC tolerance band relative to committed schedule"
        />
      </div>

      {/* Hero Chart Section */}
      <Card variant="default" padding="md">
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
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <TrendingUp size={18} color="var(--sky-400)" />
              <h2 style={{ fontSize: "1.1rem", fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
                24-Hour Horizon Dispatch & DSM Band Analysis
              </h2>
            </div>
            <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", margin: "4px 0 0 0" }}>
              15-minute resolution LightGBM forecast vs Committed Schedule with CERC ±{dsm?.tolerance_pct || 10}% tolerance zone
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {breachesCount > 0 && (
              <span
                style={{
                  backgroundColor: "var(--breach-red-bg)",
                  color: "var(--breach-red)",
                  border: "1px solid var(--breach-red-border)",
                  padding: "4px 10px",
                  borderRadius: "var(--radius-full)",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                ⚠ {breachesCount} Breaches Active
              </span>
            )}
            <span
              style={{
                fontSize: "0.75rem",
                color: "var(--text-secondary)",
                backgroundColor: "var(--bg-app)",
                padding: "4px 10px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              Capacity: <strong>{state?.capacity_kw.toLocaleString()} kW</strong>
            </span>
          </div>
        </div>

        <HeroChart
          data={chartData}
          capacityKw={state?.capacity_kw || 1000.0}
          tolerancePct={dsm?.tolerance_pct || 10.0}
        />
      </Card>

      {/* Quick Navigation Cards linking to Existing Functional Pages */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: "1rem",
        }}
      >
        <Card variant="elevated" padding="md">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--amber-400)", textTransform: "uppercase" }}>
                Active Alerts & Schedule Revisions
              </div>
              <div style={{ fontSize: "0.95rem", fontWeight: 700, marginTop: "4px", color: "var(--text-primary)" }}>
                {breachesCount > 0 ? `${breachesCount} DSM Breaches Detected` : "All Schedule Bands Compliant"}
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                View suggested zero-breach revised schedules & soiling status
              </div>
            </div>
            <Link
              to="/alerts"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "8px",
                borderRadius: "var(--radius-md)",
                backgroundColor: "var(--bg-app)",
                color: "var(--sky-400)",
                border: "1px solid var(--border-default)",
                textDecoration: "none",
              }}
              aria-label="Navigate to Alerts & DSM"
            >
              <ArrowRight size={16} />
            </Link>
          </div>
        </Card>

        <Card variant="elevated" padding="md">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--sky-400)", textTransform: "uppercase" }}>
                What-If Sandbox Scenarios
              </div>
              <div style={{ fontSize: "0.95rem", fontWeight: 700, marginTop: "4px", color: "var(--text-primary)" }}>
                BESS Battery Storage & Panel Washing
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                Simulate corrective dispatch on an isolated twin clone
              </div>
            </div>
            <Link
              to="/sandbox"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "8px",
                borderRadius: "var(--radius-md)",
                backgroundColor: "var(--bg-app)",
                color: "var(--sky-400)",
                border: "1px solid var(--border-default)",
                textDecoration: "none",
              }}
              aria-label="Navigate to Sandbox"
            >
              <ArrowRight size={16} />
            </Link>
          </div>
        </Card>
      </div>

      {/* Measured Accuracy Benchmark Card */}
      <AccuracyCard accuracy={accuracy} />
    </div>
  );
};
