/**
 * UrjaTwin Hero Chart Component.
 *
 * Visualizes:
 * - 96-block 15-minute resolution LightGBM forecast
 * - Recent actual generation readings from simulator telemetry
 * - Default committed schedule with shaded DSM tolerance band (±10%)
 * - Highlighted DSM breach blocks in prominent red
 * - Interactive tooltip showing deviation and compliance status
 * - Toggleable Auto-Scale vs Full Plant Capacity view
 * - Toggleable series visibility pills
 */

import React, { useState, useMemo } from "react";
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceDot,
} from "recharts";
import { Maximize2, Minimize2 } from "lucide-react";

export interface ChartDataPoint {
  ts: string;
  timeLabel: string;
  forecast_kw: number | null;
  actual_kw: number | null;
  schedule_kw: number | null;
  band_upper: number | null;
  band_lower: number | null;
  isBreach: boolean;
  deviation_kw?: number;
  deviation_pct?: number;
}

interface HeroChartProps {
  data: ChartDataPoint[];
  capacityKw: number;
  tolerancePct: number;
}

export const HeroChart: React.FC<HeroChartProps> = ({
  data,
  capacityKw,
  tolerancePct,
}) => {
  const [useCapacityScale, setUseCapacityScale] = useState<boolean>(false);
  const [showForecast, setShowForecast] = useState<boolean>(true);
  const [showSchedule, setShowSchedule] = useState<boolean>(true);
  const [showActual, setShowActual] = useState<boolean>(true);
  const [showToleranceBand, setShowToleranceBand] = useState<boolean>(true);

  // Compute dynamic max value from active series to provide vivid, uncompressed view
  const dynamicMax = useMemo(() => {
    let max = 100;
    data.forEach((d) => {
      if (d.forecast_kw !== null && d.forecast_kw > max) max = d.forecast_kw;
      if (d.schedule_kw !== null && d.schedule_kw > max) max = d.schedule_kw;
      if (d.actual_kw !== null && d.actual_kw > max) max = d.actual_kw;
      if (d.band_upper !== null && d.band_upper > max) max = d.band_upper;
    });
    return Math.ceil(max * 1.15); // 15% visual headroom
  }, [data]);

  if (!data || data.length === 0) {
    return (
      <div
        style={{
          height: "360px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "var(--bg-app)",
          borderRadius: "var(--radius-md)",
          color: "var(--text-muted)",
          border: "1px dashed var(--border-default)",
        }}
      >
        No telemetry or forecast blocks available for plotting.
      </div>
    );
  }

  // Filter breach points for high-contrast red reference indicators
  const breachPoints = data.filter((d) => d.isBreach && d.forecast_kw !== null);

  const formatKw = (val: number) => {
    if (val >= 1000) return `${(val / 1000).toFixed(1)} MW`;
    return `${Math.round(val)} kW`;
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const item: ChartDataPoint = payload[0]?.payload;
      return (
        <div
          style={{
            backgroundColor: "rgba(11, 15, 25, 0.95)",
            backdropFilter: "blur(12px)",
            border: `1px solid ${item.isBreach ? "var(--breach-red)" : "var(--border-default)"}`,
            borderRadius: "var(--radius-md)",
            padding: "10px 14px",
            boxShadow: item.isBreach ? "var(--breach-red-glow)" : "0 10px 25px -5px rgba(0, 0, 0, 0.5)",
            fontSize: "0.8rem",
            color: "var(--text-primary)",
            minWidth: "240px",
            zIndex: 100,
          }}
        >
          <div style={{ fontWeight: 700, borderBottom: "1px solid var(--border-subtle)", paddingBottom: "4px", marginBottom: "6px" }}>
            ⏱ {item.ts}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", margin: "4px 0" }}>
            <span style={{ color: "var(--sky-400)", fontWeight: 500 }}>LightGBM Forecast:</span>
            <span style={{ fontWeight: 700 }}>
              {item.forecast_kw !== null ? `${Math.round(item.forecast_kw).toLocaleString()} kW` : "N/A"}
            </span>
          </div>

          {item.actual_kw !== null && (
            <div style={{ display: "flex", justifyContent: "space-between", margin: "4px 0" }}>
              <span style={{ color: "var(--emerald-400)", fontWeight: 500 }}>Actual Telemetry:</span>
              <span style={{ fontWeight: 700 }}>{Math.round(item.actual_kw).toLocaleString()} kW</span>
            </div>
          )}

          {item.schedule_kw !== null && (
            <div style={{ display: "flex", justifyContent: "space-between", margin: "4px 0" }}>
              <span style={{ color: "var(--amber-400)", fontWeight: 500 }}>Committed Schedule:</span>
              <span style={{ fontWeight: 700 }}>{Math.round(item.schedule_kw).toLocaleString()} kW</span>
            </div>
          )}

          {item.band_upper !== null && item.band_lower !== null && (
            <div style={{ display: "flex", justifyContent: "space-between", margin: "4px 0", color: "var(--text-muted)" }}>
              <span>DSM ±{tolerancePct}% Band:</span>
              <span>{Math.round(item.band_lower).toLocaleString()} - {Math.round(item.band_upper).toLocaleString()} kW</span>
            </div>
          )}

          {item.isBreach && (
            <div
              style={{
                marginTop: "8px",
                padding: "6px 8px",
                backgroundColor: "var(--breach-red-bg)",
                border: "1px solid var(--breach-red-border)",
                color: "var(--breach-red)",
                borderRadius: "var(--radius-sm)",
                fontWeight: 700,
                textAlign: "center",
                fontSize: "0.76rem",
              }}
            >
              ⚠ DSM BAND BREACH: {item.deviation_pct ? `${item.deviation_pct > 0 ? "+" : ""}${item.deviation_pct.toFixed(1)}%` : "Exceeded"} ({item.deviation_kw ? `${Math.round(item.deviation_kw).toLocaleString()} kW` : ""})
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  const yDomain: [number, number] = useCapacityScale
    ? [0, Math.ceil(capacityKw * 1.05)]
    : [0, dynamicMax];

  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "10px" }}>
      {/* Chart Control Toolbar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "8px",
          padding: "6px 12px",
          backgroundColor: "var(--bg-app)",
          borderRadius: "var(--radius-sm)",
          border: "1px solid var(--border-subtle)",
          fontSize: "0.76rem",
        }}
      >
        {/* Series Filter Pills */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
          <button
            onClick={() => setShowForecast(!showForecast)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "3px 8px",
              borderRadius: "var(--radius-sm)",
              backgroundColor: showForecast ? "rgba(56, 189, 248, 0.15)" : "transparent",
              color: showForecast ? "var(--sky-400)" : "var(--text-muted)",
              border: `1px solid ${showForecast ? "var(--sky-500)" : "var(--border-subtle)"}`,
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "var(--sky-400)" }} />
            Forecast
          </button>

          <button
            onClick={() => setShowSchedule(!showSchedule)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "3px 8px",
              borderRadius: "var(--radius-sm)",
              backgroundColor: showSchedule ? "rgba(245, 158, 11, 0.15)" : "transparent",
              color: showSchedule ? "var(--amber-400)" : "var(--text-muted)",
              border: `1px solid ${showSchedule ? "var(--amber-500)" : "var(--border-subtle)"}`,
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            <span style={{ width: "8px", height: "8px", borderRadius: "2px", backgroundColor: "var(--amber-400)" }} />
            Schedule
          </button>

          <button
            onClick={() => setShowActual(!showActual)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "3px 8px",
              borderRadius: "var(--radius-sm)",
              backgroundColor: showActual ? "rgba(16, 185, 129, 0.15)" : "transparent",
              color: showActual ? "var(--emerald-400)" : "var(--text-muted)",
              border: `1px solid ${showActual ? "var(--emerald-500)" : "var(--border-subtle)"}`,
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "var(--emerald-400)" }} />
            Actual Telemetry
          </button>

          <button
            onClick={() => setShowToleranceBand(!showToleranceBand)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "3px 8px",
              borderRadius: "var(--radius-sm)",
              backgroundColor: showToleranceBand ? "rgba(245, 158, 11, 0.1)" : "transparent",
              color: showToleranceBand ? "var(--text-secondary)" : "var(--text-muted)",
              border: `1px solid ${showToleranceBand ? "var(--amber-500)" : "var(--border-subtle)"}`,
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            ±{tolerancePct}% Band
          </button>
        </div>

        {/* Scale Toggle: Dynamic Auto-Scale vs Full Capacity */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ color: "var(--text-muted)" }}>Y-Axis Scale:</span>
          <button
            onClick={() => setUseCapacityScale(!useCapacityScale)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
              padding: "4px 9px",
              borderRadius: "var(--radius-sm)",
              backgroundColor: "var(--bg-surface-elevated)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-default)",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            {useCapacityScale ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
            <span>{useCapacityScale ? `Capacity (0 - ${formatKw(capacityKw)})` : `Auto-Scale (0 - ${formatKw(dynamicMax)})`}</span>
          </button>
        </div>
      </div>

      {/* Main Chart Container */}
      <div style={{ width: "100%", height: "400px" }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 15, right: 20, left: 10, bottom: 25 }}
          >
            <defs>
              {/* Shaded DSM Tolerance Zone gradient */}
              <linearGradient id="dsmBandGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#F59E0B" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#F59E0B" stopOpacity={0.03} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />

            <XAxis
              dataKey="timeLabel"
              stroke="var(--text-muted)"
              tick={{ fontSize: 11, fill: "var(--text-secondary)" }}
              tickLine={{ stroke: "var(--border-subtle)" }}
              interval={7}
            />

            <YAxis
              stroke="var(--text-muted)"
              tick={{ fontSize: 11, fill: "var(--text-secondary)" }}
              tickLine={{ stroke: "var(--border-subtle)" }}
              tickFormatter={formatKw}
              domain={yDomain}
            />

            <Tooltip content={<CustomTooltip />} />

            {/* Shaded DSM Tolerance Band */}
            {showToleranceBand && (
              <Area
                type="monotone"
                dataKey="band_upper"
                stroke="transparent"
                fill="url(#dsmBandGradient)"
                name="DSM Tolerance Band"
                isAnimationActive={false}
              />
            )}

            {/* Schedule reference step line */}
            {showSchedule && (
              <Line
                type="stepAfter"
                dataKey="schedule_kw"
                stroke="var(--amber-400)"
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={false}
                name="Committed Schedule"
                isAnimationActive={false}
              />
            )}

            {/* 15-min ML Generation Forecast */}
            {showForecast && (
              <Line
                type="monotone"
                dataKey="forecast_kw"
                stroke="var(--sky-400)"
                strokeWidth={2.5}
                dot={false}
                name="Forecast"
                isAnimationActive={false}
              />
            )}

            {/* Actual Ingested Telemetry */}
            {showActual && (
              <Line
                type="monotone"
                dataKey="actual_kw"
                stroke="var(--emerald-400)"
                strokeWidth={2}
                dot={{ r: 2.5, fill: "var(--emerald-400)" }}
                name="Actual Telemetry"
                isAnimationActive={false}
              />
            )}

            {/* Red warning dots for DSM Breaches */}
            {breachPoints.map((pt, i) => (
              <ReferenceDot
                key={`breach-${i}`}
                x={pt.timeLabel}
                y={pt.forecast_kw ?? 0}
                r={5}
                fill="var(--breach-red)"
                stroke="#FFFFFF"
                strokeWidth={1.5}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* High-visibility Legend */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: "1.5rem",
          marginTop: "0.25rem",
          fontSize: "0.78rem",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ width: "16px", height: "3px", backgroundColor: "var(--sky-400)" }} />
          <span style={{ color: "var(--text-secondary)" }}>LightGBM Forecast</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ width: "16px", height: "3px", backgroundColor: "var(--emerald-400)" }} />
          <span style={{ color: "var(--text-secondary)" }}>Actual Telemetry (MQTT)</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ width: "16px", height: "2px", borderTop: "2px dashed var(--amber-400)" }} />
          <span style={{ color: "var(--text-secondary)" }}>Committed Schedule</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ width: "12px", height: "12px", backgroundColor: "rgba(245, 158, 11, 0.25)", border: "1px solid var(--amber-500)" }} />
          <span style={{ color: "var(--text-secondary)" }}>DSM ±{tolerancePct}% Band</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "var(--breach-red)" }} />
          <span style={{ color: "var(--breach-red)", fontWeight: 700 }}>DSM Breach Block</span>
        </div>
      </div>
    </div>
  );
};
