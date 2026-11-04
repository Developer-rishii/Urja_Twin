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
  ShieldCheck,
  Sparkles,
  Calendar,
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
  const [selectedIssueTime, setSelectedIssueTime] = useState<string>("");

  // Ref to track initial load so polling updates do not re-trigger mount animations
  const isInitialMount = useRef(true);

  const fetchDashboardData = useCallback(async (isInitial = false, customIssueTime?: string) => {
    if (isInitial && isInitialMount.current) setLoading(true);
    setIsRefreshing(true);
    setError(null);

    try {
      // 1. Fetch current plant state to determine active telemetry and sync horizon
      const stateRes = await getPlantState(plantId);
      setState(stateRes);

      // Determine aligned issue_time across forecast, schedule, and DSM
      // Solar historical benchmark: "2020-06-10T12:00:00"
      // Wind historical benchmark: "2018-10-15T06:00:00"
      const defaultHistorical = plantId.includes("wind")
        ? "2018-10-15T06:00:00"
        : "2020-06-10T12:00:00";

      const effectiveIssueTime = customIssueTime !== undefined
        ? customIssueTime
        : (selectedIssueTime || defaultHistorical);

      // 2. Fetch all telemetry & analytics concurrently with aligned issue_time
      const [forecastRes, actualRes, schedRes, dsmRes, accRes] =
        await Promise.all([
          getPlantForecast(plantId, effectiveIssueTime || undefined),
          getPlantActual(plantId, 96),
          getPlantSchedule(plantId, effectiveIssueTime || undefined),
          getPlantDSM(plantId, effectiveIssueTime || undefined),
          getPlantAccuracy(plantId),
        ]);

      setDsm(dsmRes);
      setAccuracy(accRes);
      setLastSyncTime(new Date().toLocaleTimeString());

      const capacityKw = stateRes.capacity_kw || 1000.0;
      const tolPct = dsmRes.tolerance_pct || 10.0;
      const tolKw = capacityKw * (tolPct / 100.0);

      // Handle either .readings or .actual from backend
      const actualList = (actualRes as any).readings || (actualRes as any).actual || [];
      const actualMap = new Map<string, number>();
      actualList.forEach((a: any) => {
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
  }, [plantId, selectedIssueTime]);

  useEffect(() => {
    isInitialMount.current = true;
    fetchDashboardData(true);
  }, [fetchDashboardData]);

  // Regular 5-second polling for real-time simulator updates
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
  const capacityKw = state?.capacity_kw || 1000.0;
  const isSolar = state?.plant_type === "solar_pv";

  return (
    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "1.5rem", width: "100%" }}>
      {/* SaaS Page Header */}
      <PageHeader
        title="Generation & Dispatch Intelligence"
        subtitle="15-minute resolution LightGBM forecast, continuous physics twin synchronization, and DSM penalty mitigation."
        actions={
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            {/* Synchronized Horizon Switcher */}
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                backgroundColor: "var(--bg-surface)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-md)",
                padding: "3px 8px",
                fontSize: "0.76rem",
              }}
            >
              <Calendar size={13} color="var(--sky-400)" />
              <span style={{ color: "var(--text-muted)" }}>Horizon:</span>
              <button
                onClick={() => {
                  const defaultHistorical = plantId.includes("wind") ? "2018-10-15T06:00:00" : "2020-06-10T12:00:00";
                  setSelectedIssueTime(defaultHistorical);
                  fetchDashboardData(false, defaultHistorical);
                }}
                style={{
                  background: (!selectedIssueTime || selectedIssueTime.startsWith("2020") || selectedIssueTime.startsWith("2018"))
                    ? "var(--sky-500)"
                    : "transparent",
                  color: (!selectedIssueTime || selectedIssueTime.startsWith("2020") || selectedIssueTime.startsWith("2018"))
                    ? "#FFF"
                    : "var(--text-secondary)",
                  border: "none",
                  borderRadius: "var(--radius-sm)",
                  padding: "3px 7px",
                  fontSize: "0.72rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Historical Replay 24h
              </button>
              {state?.last_ts && (
                <button
                  onClick={() => {
                    setSelectedIssueTime(state.last_ts!);
                    fetchDashboardData(false, state.last_ts!);
                  }}
                  style={{
                    background: selectedIssueTime === state.last_ts ? "var(--sky-500)" : "transparent",
                    color: selectedIssueTime === state.last_ts ? "#FFF" : "var(--text-secondary)",
                    border: "none",
                    borderRadius: "var(--radius-sm)",
                    padding: "3px 7px",
                    fontSize: "0.72rem",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Latest Reading Sync
                </button>
              )}
            </div>

            <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
              Sync: <strong style={{ color: "var(--text-secondary)" }}>{lastSyncTime || "Just now"}</strong>
            </span>

            <button
              onClick={() => fetchDashboardData(false)}
              aria-label="Refresh telemetry data"
              style={{
                backgroundColor: "var(--bg-surface-elevated)",
                color: "var(--sky-400)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-md)",
                padding: "6px 14px",
                fontSize: "0.78rem",
                fontWeight: 600,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <RefreshCw size={13} className={isRefreshing ? "spin-icon" : ""} />
              <span>Refresh</span>
            </button>
          </div>
        }
      />

      {/* Primary KPI Grid (4 Metrics) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "1rem",
        }}
      >
        <KpiCard
          label="Actual Generation"
          value={`${(state?.actual_kw ?? 0).toLocaleString()} kW`}
          subValue={`Latest timestamp: ${state?.last_ts || "Awaiting packet"}`}
          icon={<Zap size={18} />}
          status="default"
          badge={state?.node_status === "online" ? "STREAM ACTIVE" : "OFFLINE"}
          tooltip="Real telemetry reading ingested from simulated sensor node via MQTT"
        />

        <KpiCard
          label="Physics Twin Expected"
          value={`${(state?.expected_kw ?? 0).toLocaleString()} kW`}
          subValue={isSolar ? "PV cell temp & irradiance model" : "SCADA aerodynamic cubic equation"}
          icon={<Gauge size={18} />}
          status="default"
          badge="PHYSICS TWIN"
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

      {/* Hero Chart Section with Multi-Scale & Series Toggles */}
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
              {(dsm as any)?.issue_time && (
                <span style={{ color: "var(--sky-400)", marginLeft: "6px" }}>
                  (Issue Time: {(dsm as any).issue_time})
                </span>
              )}
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
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
              Capacity: <strong>{capacityKw.toLocaleString()} kW</strong>
            </span>
          </div>
        </div>

        <HeroChart
          data={chartData}
          capacityKw={capacityKw}
          tolerancePct={dsm?.tolerance_pct || 10.0}
        />
      </Card>

      {/* Operational Intelligence & Dynamic Anomaly Insights Panel */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: "1rem",
        }}
      >
        {/* Real-time DSM Risk Assessment */}
        <Card variant={breachesCount > 0 ? "breach" : "default"} padding="md">
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
            <AlertOctagon size={16} color={breachesCount > 0 ? "var(--breach-red)" : "var(--emerald-400)"} />
            <h3 style={{ fontSize: "0.85rem", fontWeight: 700, margin: 0, color: "var(--text-primary)", textTransform: "uppercase" }}>
              DSM Compliance Intelligence
            </h3>
          </div>
          <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
            {breachesCount > 0 ? (
              <>
                Detected <strong style={{ color: "var(--breach-red)" }}>{breachesCount} schedule breach blocks</strong> across the active 24-hour dispatch horizon. Total relative exposure is <strong style={{ color: "var(--breach-red)" }}>{exposurePct.toFixed(1)}%</strong> of tolerance band volume.
                Immediate schedule revision is recommended before the CERC gate closure cutoff.
              </>
            ) : (
              <>
                All 96 blocks are operating within the statutory CERC <strong style={{ color: "var(--emerald-400)" }}>±{dsm?.tolerance_pct || 10}%</strong> tolerance margin. No deviation penalty exposure detected for this dispatch horizon.
              </>
            )}
          </div>
          <div style={{ marginTop: "12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
              Tolerance: ±{(capacityKw * ((dsm?.tolerance_pct || 10) / 100)).toLocaleString()} kW
            </span>
            <Link
              to="/alerts"
              style={{
                fontSize: "0.76rem",
                fontWeight: 600,
                color: "var(--sky-400)",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              Review Revised Schedule <ArrowRight size={13} />
            </Link>
          </div>
        </Card>

        {/* Physics Twin & Soiling Advisory */}
        <Card variant={(state?.soiling_loss_pct || 0) > 10 ? "amber" : "default"} padding="md">
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
            <Sparkles size={16} color={(state?.soiling_loss_pct || 0) > 10 ? "var(--amber-400)" : "var(--sky-400)"} />
            <h3 style={{ fontSize: "0.85rem", fontWeight: 700, margin: 0, color: "var(--text-primary)", textTransform: "uppercase" }}>
              Physics Twin & Sensor Diagnostics
            </h3>
          </div>
          <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
            {isSolar ? (
              (state?.soiling_loss_pct || 0) > 10 ? (
                <>
                  Severe dust accumulation identified: estimated <strong style={{ color: "var(--amber-400)" }}>{state?.soiling_loss_pct.toFixed(1)}%</strong> generation reduction. Incurring potential lost generation of <strong style={{ color: "var(--amber-400)" }}>{Math.round(capacityKw * (state!.soiling_loss_pct / 100)).toLocaleString()} kW</strong>.
                </>
              ) : (
                <>
                  Solar panels are clean. Estimated soiling attenuation is <strong style={{ color: "var(--emerald-400)" }}>{state?.soiling_loss_pct.toFixed(2)}%</strong> (well below the 10% maintenance threshold).
                </>
              )
            ) : (
              <>
                Wind turbine aerodynamic twin model tracking Betz cubic law. Edge sensor node status is <strong style={{ color: state?.node_status === "online" ? "var(--emerald-400)" : "var(--breach-red)" }}>{state?.node_status?.toUpperCase() || "OFFLINE"}</strong>.
              </>
            )}
          </div>
          <div style={{ marginTop: "12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
              Twin gap: {gapPct > 0 ? `+${gapPct}%` : `${gapPct}%`}
            </span>
            <Link
              to="/twin"
              style={{
                fontSize: "0.76rem",
                fontWeight: 600,
                color: "var(--sky-400)",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              Inspect Telemetry & Model <ArrowRight size={13} />
            </Link>
          </div>
        </Card>

        {/* What-If Dispatch Optimization Sandbox */}
        <Card variant="elevated" padding="md">
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
            <ShieldCheck size={16} color="var(--emerald-400)" />
            <h3 style={{ fontSize: "0.85rem", fontWeight: 700, margin: 0, color: "var(--text-primary)", textTransform: "uppercase" }}>
              Corrective Dispatch Sandbox
            </h3>
          </div>
          <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
            Simulate Battery Energy Storage System (BESS) peak-shaving and nocturnal dispatch or robotic panel washing on an isolated in-memory digital twin clone without disturbing live telemetry.
          </div>
          <div style={{ marginTop: "12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
              Isolated Twin Clone Engine
            </span>
            <Link
              to="/sandbox"
              style={{
                fontSize: "0.76rem",
                fontWeight: 600,
                color: "var(--sky-400)",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              Launch Sandbox Scenarios <ArrowRight size={13} />
            </Link>
          </div>
        </Card>
      </div>

      {/* Measured Accuracy Benchmark Card */}
      <AccuracyCard accuracy={accuracy} />
    </div>
  );
};
