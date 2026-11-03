import React, { useState, useEffect } from "react";
import { getPlantAlerts, getPlantDSM, type AlertItem, type DSMResponse } from "../api/client";
import { LoadingSpinner } from "../components/common/LoadingSpinner";
import { ErrorAlert } from "../components/common/ErrorAlert";
import { EmptyState } from "../components/common/EmptyState";

export const AlertsPage: React.FC<{ plantId: string }> = ({ plantId }) => {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [dsm, setDsm] = useState<DSMResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);

    Promise.all([getPlantAlerts(plantId, 50), getPlantDSM(plantId)])
      .then(([alertsData, dsmData]) => {
        if (!mounted) return;
        setAlerts(alertsData.alerts || []);
        setDsm(dsmData);
        setLoading(false);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err.message || "Failed to load alerts and DSM data");
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [plantId]);

  if (loading) return <LoadingSpinner message="Fetching plant alerts and DSM breach status..." />;
  if (error) return <ErrorAlert title="Alerts Retrieval Error" message={error} />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div
        style={{
          backgroundColor: (dsm?.total_breaches || 0) > 0 ? "#450A0A" : "#064E3B",
          border: `1px solid ${(dsm?.total_breaches || 0) > 0 ? "#DC2626" : "#059669"}`,
          borderRadius: "10px",
          padding: "1.25rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div>
          <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "#FFF" }}>
            DSM Compliance Status: {dsm?.total_breaches || 0} Band Breaches
          </div>
          <div style={{ fontSize: "0.85rem", color: "#E2E8F0", marginTop: "4px" }}>
            Tolerance Band: ±{dsm?.tolerance_pct || 10.0}% | Total Relative Penalty Exposure:{" "}
            {dsm?.relative_exposure_pct.toFixed(2)}%
          </div>
        </div>
        <div style={{ fontSize: "0.8rem", color: "#CBD5E1" }}>
          Suggested Revised Schedule Available ({dsm?.revised_schedule.length || 0} blocks)
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
        <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: "0 0 1rem 0", color: "#F8FAFC" }}>
          Active & Historical Alerts ({alerts.length})
        </h3>

        {alerts.length === 0 ? (
          <EmptyState
            title="All Operational Bands Clear"
            description="No active soiling, DSM breach, or node offline alerts detected."
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {alerts.map((alert, idx) => (
              <div
                key={idx}
                style={{
                  padding: "1rem",
                  borderRadius: "8px",
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
                  gap: "1rem",
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span
                      style={{
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        padding: "2px 6px",
                        borderRadius: "4px",
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
                    <span style={{ fontSize: "0.75rem", color: "#94A3B8" }}>{alert.ts}</span>
                  </div>
                  <div style={{ fontSize: "0.9rem", color: "#F1F5F9", marginTop: "6px" }}>
                    {alert.message}
                  </div>
                </div>
                <div
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    color:
                      alert.severity === "high"
                        ? "#EF4444"
                        : alert.severity === "medium"
                        ? "#F59E0B"
                        : "#10B981",
                  }}
                >
                  {alert.severity} SEVERITY
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
