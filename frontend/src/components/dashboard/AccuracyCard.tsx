import React from "react";
import { type AccuracyResponse } from "../../api/client";
import { Card } from "../common/Card";
import { Award, CheckCircle, HelpCircle } from "lucide-react";

interface AccuracyCardProps {
  accuracy: AccuracyResponse | null;
}

export const AccuracyCard: React.FC<AccuracyCardProps> = ({ accuracy }) => {
  // Gracefully handle either null response, or direct/nested accuracy payload
  const accData = (accuracy as any)?.accuracy || accuracy;
  if (!accData || !accData.test_metrics) return null;

  const {
    plant_type = "solar_pv",
    selected_model = "Benchmark Forecaster",
    split_date = "N/A",
    test_metrics = {},
    caveat = "Benchmark evaluation against historical test telemetry.",
  } = accData;

  const datasetName =
    plant_type === "solar_pv"
      ? "Kaggle India Solar Power Generation (Plant 1 & 2)"
      : "Kaggle Wind Turbine SCADA Dataset (10-min resampled)";

  return (
    <Card variant="elevated" padding="md">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.75rem" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Award size={18} color="var(--sky-400)" />
            <h3 style={{ fontSize: "1.05rem", fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
              Model Accuracy Benchmark: {selected_model}
            </h3>
          </div>
          <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", margin: "4px 0 0 0" }}>
            Dataset: <strong>{datasetName}</strong> | Strict chronological test split (Cut-off date: {split_date})
          </p>
        </div>

        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "5px",
            fontSize: "0.75rem",
            backgroundColor: "var(--emerald-bg)",
            color: "var(--emerald-400)",
            padding: "4px 10px",
            borderRadius: "var(--radius-full)",
            fontWeight: 700,
            border: "1px solid var(--emerald-border)",
          }}
        >
          <CheckCircle size={14} />
          +{test_metrics.improvement_vs_best_baseline_pct?.toFixed(1)}% vs Best Baseline
        </div>
      </div>

      {/* Metrics Row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "0.75rem",
          marginTop: "1.25rem",
        }}
      >
        <div style={metricBox}>
          <div style={metricTitle}>OUR MODEL MAE (PROXY)</div>
          <div style={{ ...metricVal, color: "var(--sky-400)" }}>
            {test_metrics.our_model_proxy_mae_kw?.toFixed(1)} kW
          </div>
          <div style={metricSub}>
            {test_metrics.our_model_mae_pct_capacity?.toFixed(2)}% of capacity
          </div>
        </div>

        <div style={metricBox}>
          <div style={metricTitle}>PERSISTENCE BASELINE</div>
          <div style={metricVal}>{test_metrics.persistence_mae_kw?.toFixed(1)} kW</div>
          <div style={metricSub}>Naïve lag t carry-forward</div>
        </div>

        <div style={metricBox}>
          <div style={metricTitle}>PHYSICS ONLY (NO ML)</div>
          <div style={metricVal}>{test_metrics.physics_only_mae_kw?.toFixed(1)} kW</div>
          <div style={metricSub}>Pure PV / Wind equation</div>
        </div>

        <div style={metricBox}>
          <div style={metricTitle}>NO-FUTURE-WEATHER VARIANT</div>
          <div style={{ ...metricVal, color: "var(--amber-400)" }}>
            {test_metrics.no_future_weather_mae_kw?.toFixed(1)} kW
          </div>
          <div style={metricSub}>Lags + hour sin/cos only</div>
        </div>
      </div>

      {/* Transparency Note */}
      <div
        style={{
          marginTop: "1rem",
          padding: "10px 14px",
          backgroundColor: "var(--bg-app)",
          borderRadius: "var(--radius-sm)",
          borderLeft: "3px solid var(--sky-400)",
          fontSize: "0.76rem",
          color: "var(--text-secondary)",
          display: "flex",
          gap: "8px",
          alignItems: "flex-start",
        }}
      >
        <HelpCircle size={15} style={{ flexShrink: 0, marginTop: "2px", color: "var(--sky-400)" }} />
        <div>
          <strong style={{ color: "var(--text-primary)" }}>Jury Transparency Note: </strong>
          {caveat} (Tested with ±10% and ±20% synthetic weather noise in `ml/results.md`).
        </div>
      </div>
    </Card>
  );
};

const metricBox: React.CSSProperties = {
  backgroundColor: "var(--bg-app)",
  padding: "0.85rem 1rem",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border-subtle)",
};

const metricTitle: React.CSSProperties = {
  fontSize: "0.68rem",
  fontWeight: 700,
  color: "var(--text-muted)",
  marginBottom: "0.3rem",
  letterSpacing: "0.04em",
};

const metricVal: React.CSSProperties = {
  fontSize: "1.35rem",
  fontWeight: 800,
  letterSpacing: "-0.02em",
  color: "var(--text-primary)",
};

const metricSub: React.CSSProperties = {
  fontSize: "0.7rem",
  color: "var(--text-muted)",
  marginTop: "0.25rem",
};
