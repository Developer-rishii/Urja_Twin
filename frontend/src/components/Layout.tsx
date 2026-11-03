import React, { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { DataSourceBadge } from "./common/DataSourceBadge";
import { getPlants, type PlantSummary } from "../api/client";

interface LayoutProps {
  children: React.ReactNode;
  selectedPlant: string;
  onSelectPlant: (plantId: string) => void;
}

export const Layout: React.FC<LayoutProps> = ({
  children,
  selectedPlant,
  onSelectPlant,
}) => {
  const location = useLocation();
  const [plants, setPlants] = useState<PlantSummary[]>([]);
  const [dataSource, setDataSource] = useState<string>("simulated_node");

  useEffect(() => {
    getPlants()
      .then((res) => {
        setPlants(res.plants);
        if (res.source) setDataSource(res.source);
        if (res.plants.length > 0 && !selectedPlant) {
          onSelectPlant(res.plants[0].plant_id);
        }
      })
      .catch(() => {
        setPlants([
          {
            plant_id: "solar_plant_1",
            plant_type: "solar_pv",
            location: "Rajasthan, India (Real Kaggle telemetry)",
            capacity_kw: 32000,
            dsm_tolerance_pct: 10,
          },
          {
            plant_id: "wind_plant_1",
            plant_type: "wind_turbine",
            location: "SCADA Wind Turbine (Real SCADA telemetry)",
            capacity_kw: 3600,
            dsm_tolerance_pct: 10,
          },
        ]);
      });
  }, [selectedPlant, onSelectPlant]);

  const navLinks = [
    { path: "/", label: "Dashboard" },
    { path: "/alerts", label: "Alerts & DSM" },
    { path: "/twin", label: "Physics Twin" },
    { path: "/sandbox", label: "Sandbox What-If" },
  ];

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#0B0F19",
        color: "#F1F5F9",
        fontFamily: "Inter, system-ui, -apple-system, sans-serif",
      }}
    >
      <header
        style={{
          borderBottom: "1px solid #1E293B",
          backgroundColor: "#0F172A",
          padding: "0.85rem 1.5rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span
                style={{
                  fontSize: "1.25rem",
                  fontWeight: 800,
                  letterSpacing: "-0.025em",
                  color: "#38BDF8",
                }}
              >
                UrjaTwin
              </span>
              <span
                style={{
                  fontSize: "0.7rem",
                  backgroundColor: "#0284C7",
                  color: "#FFF",
                  padding: "2px 6px",
                  borderRadius: "4px",
                  fontWeight: 700,
                }}
              >
                SIH 2026
              </span>
            </div>
            <div style={{ fontSize: "0.75rem", color: "#94A3B8" }}>
              Digital Twin & DSM Compliance Decision Support
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <label style={{ fontSize: "0.8rem", color: "#94A3B8", fontWeight: 600 }}>
              Plant:
            </label>
            <select
              value={selectedPlant}
              onChange={(e) => onSelectPlant(e.target.value)}
              style={{
                backgroundColor: "#1E293B",
                color: "#F8FAFC",
                border: "1px solid #334155",
                borderRadius: "6px",
                padding: "6px 12px",
                fontSize: "0.85rem",
                fontWeight: 600,
                cursor: "pointer",
                outline: "none",
              }}
            >
              {plants.map((p) => (
                <option key={p.plant_id} value={p.plant_id}>
                  {p.plant_id === "solar_plant_1"
                    ? "☀️ Solar Plant 1 (32 MW)"
                    : "💨 Wind Plant 1 (3.6 MW)"}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
          <nav style={{ display: "flex", gap: "0.5rem" }}>
            {navLinks.map((item) => {
              const active = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  style={{
                    padding: "6px 14px",
                    borderRadius: "6px",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    textDecoration: "none",
                    backgroundColor: active ? "#0284C7" : "transparent",
                    color: active ? "#FFFFFF" : "#94A3B8",
                    border: `1px solid ${active ? "#38BDF8" : "transparent"}`,
                    transition: "all 0.15s ease",
                  }}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <DataSourceBadge source={dataSource} />
        </div>
      </header>

      <main style={{ maxWidth: "1400px", margin: "0 auto", padding: "1.5rem" }}>
        {children}
      </main>
    </div>
  );
};
