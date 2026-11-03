import React, { useState, useEffect } from "react";
import { getPlantState, getPlantAccuracy, type PlantStateResponse, type AccuracyResponse } from "../api/client";
import { LoadingSpinner } from "../components/common/LoadingSpinner";
import { ErrorAlert } from "../components/common/ErrorAlert";

export const TwinPage: React.FC<{ plantId: string }> = ({ plantId }) => {
  const [state, setState] = useState<PlantStateResponse | null>(null);
  const [accuracy, setAccuracy] = useState<AccuracyResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);

    Promise.all([getPlantState(plantId), getPlantAccuracy(plantId)])
      .then(([stateData, accuracyData]) => {
        if (!mounted) return;
        setState(stateData);
        setAccuracy(accuracyData);
        setLoading(false);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err.message || "Failed to load digital twin parameters");
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [plantId]);

  if (loading) return <LoadingSpinner message="Loading digital twin parameters and model metrics..." />;
  if (error) return <ErrorAlert title="Twin Model Error" message={error} />;

  const metrics = accuracy?.accuracy.test_metrics;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div
        style={{
          backgroundColor: "#131C31",
          borderRadius: "10px",
          border: "1px solid #1E293B",
          padding: "1.5rem",
        }}
      >
        <h2 style={{ fontSize: "1.1rem", fontWeight: 700, margin: 0, color: "#F8FAFC" }}>
          Digital Twin Parameters & Sensor Calibration Loop
        </h2>
        <p style={{ fontSize: "0.8rem", color: "#94A3B8", margin: "4px 0 1.25rem 0" }}>
          Physical conversion equations coupled with continuous telemetry feedback
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "1rem",
          }}
        >
          <div style={statBox}>
            <div style={statLabel}>NAMEPLATE CAPACITY</div>
            <div style={statValue}>{state?.capacity_kw.toLocaleString()} kW</div>
          </div>
          <div style={statBox}>
            <div style={statLabel}>INSTANTANEOUS EXPECTED</div>
            <div style={statValue}>{state?.expected_kw.toLocaleString()} kW</div>
          </div>
          <div style={statBox}>
            <div style={statLabel}>INSTANTANEOUS ACTUAL</div>
            <div style={statValue}>{state?.actual_kw.toLocaleString()} kW</div>
          </div>
          <div style={statBox}>
            <div style={statLabel}>ACTIVE SOILING RATIO</div>
            <div style={statValue}>{state?.soiling_loss_pct.toFixed(2)}%</div>
          </div>
        </div>
      </div>

      <div
        style={{
          backgroundColor: "#131C31",
          borderRadius: "10px",
          border: "1px solid #1E293B",
          padding: "1.5rem",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: 0, color: "#F8FAFC" }}>
              Empirical Accuracy Benchmarks ({accuracy?.accuracy.selected_model})
            </h3>
            <p style={{ fontSize: "0.8rem", color: "#94A3B8", margin: "4px 0 1rem 0" }}>
              Rigorous time-based train/test split: Split Date {accuracy?.accuracy.split_date}
            </p>
          </div>
        </div>

        {metrics && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "1rem",
              marginBottom: "1.5rem",
            }}
          >
            <div style={metricBox}>
              <div style={statLabel}>OUR MODEL MAE (PROXY)</div>
              <div style={{ ...statValue, color: "#10B981" }}>
                {metrics.our_model_proxy_mae_kw?.toFixed(1)} kW
              </div>
              <div style={statSub}>
                {metrics.our_model_mae_pct_capacity?.toFixed(2)}% of capacity
              </div>
            </div>

            <div style={metricBox}>
              <div style={statLabel}>PERSISTENCE BASELINE</div>
              <div style={statValue}>{metrics.persistence_mae_kw?.toFixed(1)} kW</div>
              <div style={statSub}>Naïve block t carry-forward</div>
            </div>

            <div style={metricBox}>
              <div style={statLabel}>PHYSICS ONLY (NO ML)</div>
              <div style={statValue}>{metrics.physics_only_mae_kw?.toFixed(1)} kW</div>
              <div style={statSub}>Pure thermodynamic formula</div>
            </div>

            <div style={metricBox}>
              <div style={statLabel}>IMPROVEMENT VS BASELINE</div>
              <div style={{ ...statValue, color: "#38BDF8" }}>
                +{metrics.improvement_vs_best_baseline_pct?.toFixed(1)}%
              </div>
              <div style={statSub}>Error reduction</div>
            </div>
          </div>
        )}

        <div
          style={{
            padding: "0.85rem 1rem",
            backgroundColor: "#1E293B",
            borderRadius: "6px",
            borderLeft: "4px solid #38BDF8",
            fontSize: "0.8rem",
            color: "#CBD5E1",
          }}
        >
          <strong>Honesty Note for Jury: </strong>
          {accuracy?.accuracy.caveat}
        </div>
      </div>
    </div>
  );
};

const statBox: React.CSSProperties = {
  backgroundColor: "#0F172A",
  padding: "1rem",
  borderRadius: "8px",
  border: "1px solid #1E293B",
};

const metricBox: React.CSSProperties = {
  backgroundColor: "#0F172A",
  padding: "1rem",
  borderRadius: "8px",
  border: "1px solid #334155",
};

const statLabel: React.CSSProperties = {
  fontSize: "0.7rem",
  fontWeight: 700,
  color: "#94A3B8",
  marginBottom: "0.35rem",
};

const statValue: React.CSSProperties = {
  fontSize: "1.35rem",
  fontWeight: 800,
  color: "#F8FAFC",
};

const statSub: React.CSSProperties = {
  fontSize: "0.7rem",
  color: "#64748B",
  marginTop: "0.25rem",
};
