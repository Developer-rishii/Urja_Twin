/**
 * UrjaTwin Hero Chart Component.
 *
 * Visualizes:
 * - 96-block 15-minute resolution LightGBM forecast
 * - Recent actual generation readings from simulator telemetry
 * - Default committed schedule with shaded DSM tolerance band (±10%)
 * - Highlighted DSM breach blocks in prominent red
 * - Interactive tooltip showing deviation and compliance status
 */

import React from "react";
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
  if (!data || data.length === 0) {
    return (
      <div
        style={{
          height: "360px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0F172A",
          borderRadius: "8px",
          color: "#64748B",
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
            backgroundColor: "#0B0F19",
            border: `1px solid ${item.isBreach ? "#EF4444" : "#334155"}`,
            borderRadius: "8px",
            padding: "10px 14px",
            boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.5)",
            fontSize: "0.8rem",
            color: "#F8FAFC",
            minWidth: "220px",
          }}
        >
          <div style={{ fontWeight: 700, borderBottom: "1px solid #1E293B", paddingBottom: "4px", marginBottom: "6px" }}>
            ⏱ {item.ts}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", margin: "3px 0" }}>
            <span style={{ color: "#38BDF8" }}>Forecast:</span>
            <span style={{ fontWeight: 700 }}>
              {item.forecast_kw !== null ? `${item.forecast_kw.toLocaleString()} kW` : "N/A"}
            </span>
          </div>

          {item.actual_kw !== null && (
            <div style={{ display: "flex", justifyContent: "space-between", margin: "3px 0" }}>
              <span style={{ color: "#10B981" }}>Actual Telemetry:</span>
              <span style={{ fontWeight: 700 }}>{item.actual_kw.toLocaleString()} kW</span>
            </div>
          )}

          {item.schedule_kw !== null && (
            <div style={{ display: "flex", justifyContent: "space-between", margin: "3px 0" }}>
              <span style={{ color: "#F59E0B" }}>Committed Schedule:</span>
              <span style={{ fontWeight: 700 }}>{item.schedule_kw.toLocaleString()} kW</span>
            </div>
          )}

          {item.band_upper !== null && item.band_lower !== null && (
            <div style={{ display: "flex", justifyContent: "space-between", margin: "3px 0", color: "#94A3B8" }}>
              <span>DSM ±{tolerancePct}% Band:</span>
              <span>{Math.round(item.band_lower)} - {Math.round(item.band_upper)} kW</span>
            </div>
          )}

          {item.isBreach && (
            <div
              style={{
                marginTop: "6px",
                padding: "4px 6px",
                backgroundColor: "#7F1D1D",
                color: "#FCA5A5",
                borderRadius: "4px",
                fontWeight: 700,
                textAlign: "center",
              }}
            >
              ⚠ DSM BAND BREACH ({item.deviation_pct ? `${item.deviation_pct > 0 ? "+" : ""}${item.deviation_pct.toFixed(1)}%` : "Exceeded"})
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div style={{ width: "100%", height: "380px" }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={data}
          margin={{ top: 15, right: 20, left: 10, bottom: 25 }}
        >
          <defs>
            {/* Shaded DSM Tolerance Zone gradient */}
            <linearGradient id="dsmBandGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#F59E0B" stopOpacity={0.18} />
              <stop offset="100%" stopColor="#F59E0B" stopOpacity={0.04} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />

          <XAxis
            dataKey="timeLabel"
            stroke="#64748B"
            tick={{ fontSize: 11, fill: "#94A3B8" }}
            tickLine={{ stroke: "#334155" }}
            interval={8}
          />

          <YAxis
            stroke="#64748B"
            tick={{ fontSize: 11, fill: "#94A3B8" }}
            tickLine={{ stroke: "#334155" }}
            tickFormatter={formatKw}
            domain={[0, Math.ceil(capacityKw * 1.05)]}
          />

          <Tooltip content={<CustomTooltip />} />

          {/* Shaded DSM Tolerance Band: Render band_upper line and fill towards base */}
          <Area
            type="monotone"
            dataKey="band_upper"
            stroke="transparent"
            fill="url(#dsmBandGradient)"
            name="DSM Tolerance Band"
            isAnimationActive={false}
          />

          {/* Schedule reference line */}
          <Line
            type="stepAfter"
            dataKey="schedule_kw"
            stroke="#F59E0B"
            strokeWidth={2}
            strokeDasharray="4 4"
            dot={false}
            name="Schedule"
            isAnimationActive={false}
          />

          {/* 15-min ML Generation Forecast */}
          <Line
            type="monotone"
            dataKey="forecast_kw"
            stroke="#38BDF8"
            strokeWidth={2.5}
            dot={false}
            name="Forecast"
            isAnimationActive={false}
          />

          {/* Actual Ingested Telemetry */}
          <Line
            type="monotone"
            dataKey="actual_kw"
            stroke="#10B981"
            strokeWidth={2}
            dot={{ r: 2, fill: "#10B981" }}
            name="Actual Telemetry"
            isAnimationActive={false}
          />

          {/* Red warning dots for DSM Breaches */}
          {breachPoints.map((pt, i) => (
            <ReferenceDot
              key={`breach-${i}`}
              x={pt.timeLabel}
              y={pt.forecast_kw ?? 0}
              r={4.5}
              fill="#EF4444"
              stroke="#FFF"
              strokeWidth={1.5}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>

      {/* High-visibility Legend */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: "1.5rem",
          marginTop: "0.5rem",
          fontSize: "0.8rem",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ width: "16px", height: "3px", backgroundColor: "#38BDF8" }} />
          <span style={{ color: "#E2E8F0" }}>Forecast (LightGBM)</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ width: "16px", height: "3px", backgroundColor: "#10B981" }} />
          <span style={{ color: "#E2E8F0" }}>Actual Telemetry (Simulator)</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ width: "16px", height: "2px", borderTop: "2px dashed #F59E0B" }} />
          <span style={{ color: "#E2E8F0" }}>Committed Schedule</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ width: "12px", height: "12px", backgroundColor: "rgba(245, 158, 11, 0.25)", border: "1px solid #F59E0B" }} />
          <span style={{ color: "#E2E8F0" }}>DSM ±{tolerancePct}% Band</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "#EF4444" }} />
          <span style={{ color: "#EF4444", fontWeight: 700 }}>DSM Breach Block</span>
        </div>
      </div>
    </div>
  );
};
