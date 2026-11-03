import React, { useState, useEffect } from "react";
import { getPlantState, getPlantForecast, type PlantStateResponse, type ForecastBlock } from "../api/client";
import { LoadingSpinner } from "../components/common/LoadingSpinner";
import { ErrorAlert } from "../components/common/ErrorAlert";

export const Dashboard: React.FC<{ plantId: string }> = ({ plantId }) => {
  const [state, setState] = useState<PlantStateResponse | null>(null);
  const [forecast, setForecast] = useState<ForecastBlock[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);

    Promise.all([getPlantState(plantId), getPlantForecast(plantId)])
      .then(([stateData, forecastData]) => {
        if (!mounted) return;
        setState(stateData);
        setForecast(forecastData.forecast || []);
        setLoading(false);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err.message || "Failed to load dashboard data");
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [plantId]);

  if (loading) return <LoadingSpinner message="Loading live digital twin dashboard..." />;
  if (error) return <ErrorAlert title="Dashboard Error" message={error} />;

  const gapPct = state?.gap_pct ?? 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* KPI Cards Row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "1rem",
        }}
      >
        <div style={kpiCardStyle}>
          <div style={kpiLabelStyle}>ACTUAL GENERATION</div>
          <div style={kpiValueStyle}>{state?.actual_kw.toLocaleString()} kW</div>
          <div style={kpiSubStyle}>Last reading: {state?.last_ts || "N/A"}</div>
        </div>

        <div style={kpiCardStyle}>
          <div style={kpiLabelStyle}>PHYSICS EXPECTED</div>
          <div style={kpiValueStyle}>{state?.expected_kw.toLocaleString()} kW</div>
          <div style={kpiSubStyle}>Real-time PV / Wind model output</div>
        </div>

        <div style={kpiCardStyle}>
          <div style={kpiLabelStyle}>TWIN GAP</div>
          <div
            style={{
              ...kpiValueStyle,
              color: Math.abs(gapPct) > 10 ? "#EF4444" : "#10B981",
            }}
          >
            {gapPct > 0 ? `+${gapPct}%` : `${gapPct}%`}
          </div>
          <div style={kpiSubStyle}>Tolerance threshold: ±10.0%</div>
        </div>

        <div style={kpiCardStyle}>
          <div style={kpiLabelStyle}>ESTIMATED SOILING LOSS</div>
          <div style={{ ...kpiValueStyle, color: (state?.soiling_loss_pct || 0) > 10 ? "#F59E0B" : "#38BDF8" }}>
            {state?.soiling_loss_pct.toFixed(1)}%
          </div>
          <div style={kpiSubStyle}>Status: {state?.node_status.toUpperCase()}</div>
        </div>
      </div>

      {/* Main Chart Placeholder / Hero Area */}
      <div
        style={{
          backgroundColor: "#131C31",
          borderRadius: "10px",
          border: "1px solid #1E293B",
          padding: "1.5rem",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem" }}>
          <div>
            <h2 style={{ fontSize: "1.1rem", fontWeight: 700, margin: 0, color: "#F8FAFC" }}>
              24-Hour Horizon Power Dispatch & DSM Bands
            </h2>
            <p style={{ fontSize: "0.8rem", color: "#94A3B8", margin: "4px 0 0 0" }}>
              15-minute resolution LightGBM forecast vs Scheduled commitments
            </p>
          </div>
          <div style={{ fontSize: "0.85rem", color: "#38BDF8", fontWeight: 600 }}>
            {forecast.length} Blocks Loaded
          </div>
        </div>

        <div
          style={{
            height: "260px",
            backgroundColor: "#0F172A",
            borderRadius: "8px",
            border: "1px dashed #334155",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#64748B",
            fontSize: "0.95rem",
          }}
        >
          [Main Forecast vs Actual vs Schedule Recharts visualization loaded in Task T10]
        </div>
      </div>
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
  fontSize: "0.75rem",
  fontWeight: 700,
  color: "#94A3B8",
  letterSpacing: "0.05em",
  marginBottom: "0.5rem",
};

const kpiValueStyle: React.CSSProperties = {
  fontSize: "1.75rem",
  fontWeight: 800,
  color: "#F8FAFC",
  letterSpacing: "-0.025em",
  marginBottom: "0.25rem",
};

const kpiSubStyle: React.CSSProperties = {
  fontSize: "0.75rem",
  color: "#64748B",
};
