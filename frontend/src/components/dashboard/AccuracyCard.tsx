/**
 * Accuracy Benchmark Card complying with SIH Jury Honesty Guidelines:
 * - Compares Persistence MAE, Yesterday MAE, and Physics-only baseline vs Our Model MAE
 * - Explicitly lists Dataset Name & strict time-based test split
 * - States Future-Weather Proxy caveat upfront
 */

import React from "react";
import { type AccuracyResponse } from "../../api/client";

interface AccuracyCardProps {
  accuracy: AccuracyResponse | null;
}

export const AccuracyCard: React.FC<AccuracyCardProps> = ({ accuracy }) => {
  if (!accuracy) return null;

  const { plant_type, selected_model, split_date, test_metrics, caveat } = accuracy.accuracy;

  const datasetName =
    plant_type === "solar_pv"
      ? "Kaggle India Solar Power Generation (Plant 1 & 2)"
      : "Kaggle Wind Turbine SCADA Dataset (10-min resampled)";

  return (
    <div
      style={{
        backgroundColor: "#131C31",
        borderRadius: "10px",
        border: "1px solid #1E293B",
        padding: "1.25rem 1.5rem",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.5rem" }}>
        <div>
          <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: 0, color: "#F8FAFC" }}>
            Model Accuracy Benchmark: {selected_model}
          </h3>
          <p style={{ fontSize: "0.75rem", color: "#94A3B8", margin: "2px 0 0 0" }}>
            Dataset: <strong>{datasetName}</strong> | Strict time-based test split (Test start: {split_date})
          </p>
        </div>

        <span
          style={{
            fontSize: "0.7rem",
            backgroundColor: "#065F46",
            color: "#6EE7B7",
            padding: "3px 8px",
            borderRadius: "4px",
            fontWeight: 700,
          }}
        >
          +{test_metrics.improvement_vs_best_baseline_pct?.toFixed(1)}% vs Best Baseline
        </span>
      </div>

      {/* Metrics Row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "0.75rem",
          marginTop: "1rem",
        }}
      >
        <div style={boxStyle}>
          <div style={metricTitle}>OUR MODEL MAE (PROXY)</div>
          <div style={{ ...metricVal, color: "#38BDF8" }}>
            {test_metrics.our_model_proxy_mae_kw?.toFixed(1)} kW
          </div>
          <div style={metricSub}>
            {test_metrics.our_model_mae_pct_capacity?.toFixed(2)}% of capacity
          </div>
        </div>

        <div style={boxStyle}>
          <div style={metricTitle}>PERSISTENCE BASELINE</div>
          <div style={metricVal}>{test_metrics.persistence_mae_kw?.toFixed(1)} kW</div>
          <div style={metricSub}>Naïve lag t carry-forward</div>
        </div>

        <div style={boxStyle}>
          <div style={metricTitle}>PHYSICS ONLY (NO ML)</div>
          <div style={metricVal}>{test_metrics.physics_only_mae_kw?.toFixed(1)} kW</div>
          <div style={metricSub}>Pure PV / Wind equation</div>
        </div>

        <div style={boxStyle}>
          <div style={metricTitle}>NO-FUTURE-WEATHER VARIANT</div>
          <div style={{ ...metricVal, color: "#F59E0B" }}>
            {test_metrics.no_future_weather_mae_kw?.toFixed(1)} kW
          </div>
          <div style={metricSub}>Lags + hour sin/cos only</div>
        </div>
      </div>

      {/* Transparency Note */}
      <div
        style={{
          marginTop: "0.85rem",
          padding: "8px 12px",
          backgroundColor: "#0F172A",
          borderRadius: "6px",
          borderLeft: "3px solid #38BDF8",
          fontSize: "0.75rem",
          color: "#CBD5E1",
        }}
      >
        <strong>Jury Transparency Note: </strong>
        {caveat} (Tested with ±10% and ±20% synthetic weather noise in `ml/results.md`).
      </div>
    </div>
  );
};

const boxStyle: React.CSSProperties = {
  backgroundColor: "#0F172A",
  padding: "0.75rem 1rem",
  borderRadius: "6px",
  border: "1px solid #1E293B",
};

const metricTitle: React.CSSProperties = {
  fontSize: "0.68rem",
  fontWeight: 700,
  color: "#94A3B8",
  marginBottom: "0.25rem",
};

const metricVal: React.CSSProperties = {
  fontSize: "1.25rem",
  fontWeight: 800,
  color: "#F8FAFC",
};

const metricSub: React.CSSProperties = {
  fontSize: "0.68rem",
  color: "#64748B",
  marginTop: "0.2rem",
};
