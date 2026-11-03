import React, { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  AlertTriangle,
  Cpu,
  FlaskConical,
  ChevronLeft,
  ChevronRight,
  Bell,
} from "lucide-react";
import { DataSourceBadge } from "./common/DataSourceBadge";
import { getPlants, getPlantAlerts, type PlantSummary, type AlertItem } from "../api/client";

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
  const [collapsed, setCollapsed] = useState<boolean>(false);
  const [realAlerts, setRealAlerts] = useState<AlertItem[]>([]);
  const [showAlertMenu, setShowAlertMenu] = useState<boolean>(false);

  // Fetch plants list on mount
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

  // Fetch real alerts for notification bell
  useEffect(() => {
    if (!selectedPlant) return;
    getPlantAlerts(selectedPlant, 5)
      .then((res) => {
        setRealAlerts(res.alerts || []);
      })
      .catch(() => {});
  }, [selectedPlant]);

  const navItems = [
    { path: "/", label: "Dashboard", icon: <LayoutDashboard size={18} /> },
    { path: "/alerts", label: "Alerts & DSM", icon: <AlertTriangle size={18} /> },
    { path: "/twin", label: "Physics Twin", icon: <Cpu size={18} /> },
    { path: "/sandbox", label: "Sandbox What-If", icon: <FlaskConical size={18} /> },
  ];

  const currentPlant = plants.find((p) => p.plant_id === selectedPlant);
  const breachAlertCount = realAlerts.filter((a) => a.type === "dsm_breach").length;

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        backgroundColor: "var(--bg-app)",
        color: "var(--text-primary)",
      }}
    >
      {/* SaaS Collapsible Sidebar */}
      <aside
        style={{
          width: collapsed ? "72px" : "240px",
          backgroundColor: "var(--bg-sidebar)",
          borderRight: "1px solid var(--border-subtle)",
          display: "flex",
          flexDirection: "column",
          transition: "width var(--transition-normal)",
          zIndex: 40,
          flexShrink: 0,
        }}
      >
        {/* Brand Header */}
        <div
          style={{
            height: "64px",
            display: "flex",
            alignItems: "center",
            justifyContent: collapsed ? "center" : "space-between",
            padding: collapsed ? "0" : "0 1.25rem",
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          {!collapsed && (
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div
                style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "var(--radius-sm)",
                  background: "linear-gradient(135deg, var(--sky-500), var(--teal-500))",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#FFF",
                  fontWeight: 900,
                  fontSize: "0.9rem",
                }}
              >
                U
              </div>
              <span style={{ fontSize: "1.1rem", fontWeight: 800, letterSpacing: "-0.02em", color: "var(--text-primary)" }}>
                Urja<span style={{ color: "var(--sky-400)" }}>Twin</span>
              </span>
            </div>
          )}
          {collapsed && (
            <div
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "var(--radius-sm)",
                background: "linear-gradient(135deg, var(--sky-500), var(--teal-500))",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#FFF",
                fontWeight: 900,
              }}
            >
              U
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              padding: "4px",
              display: collapsed ? "none" : "flex",
              alignItems: "center",
              borderRadius: "var(--radius-sm)",
            }}
          >
            <ChevronLeft size={16} />
          </button>
        </div>

        {/* Navigation Links */}
        <nav style={{ padding: "1rem 0.5rem", display: "flex", flexDirection: "column", gap: "4px", flex: 1 }}>
          {navItems.map((item) => {
            const active = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                title={collapsed ? item.label : undefined}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: collapsed ? "10px 0" : "10px 14px",
                  justifyContent: collapsed ? "center" : "flex-start",
                  borderRadius: "var(--radius-md)",
                  textDecoration: "none",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  color: active ? "#FFF" : "var(--text-secondary)",
                  backgroundColor: active ? "var(--sky-500)" : "transparent",
                  boxShadow: active ? "0 2px 8px rgba(14, 165, 233, 0.35)" : "none",
                  transition: "all var(--transition-fast)",
                }}
              >
                <div style={{ color: active ? "#FFF" : "var(--sky-400)" }}>{item.icon}</div>
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Bottom Expand Toggle when collapsed */}
        {collapsed && (
          <div style={{ padding: "1rem 0", display: "flex", justifyContent: "center", borderTop: "1px solid var(--border-subtle)" }}>
            <button
              onClick={() => setCollapsed(false)}
              aria-label="Expand sidebar"
              style={{
                background: "none",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
              }}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        )}
      </aside>

      {/* Main App Container */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* Top Header Bar */}
        <header
          style={{
            height: "64px",
            borderBottom: "1px solid var(--border-subtle)",
            backgroundColor: "var(--bg-surface)",
            padding: "0 1.5rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
            zIndex: 30,
          }}
        >
          {/* Plant Selector & Title */}
          <div style={{ display: "flex", alignItems: "center", gap: "1rem", minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Active Plant:
              </span>
              <div style={{ position: "relative" }}>
                <select
                  value={selectedPlant}
                  onChange={(e) => onSelectPlant(e.target.value)}
                  aria-label="Select renewable power plant"
                  style={{
                    backgroundColor: "var(--bg-app)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border-default)",
                    borderRadius: "var(--radius-sm)",
                    padding: "6px 28px 6px 10px",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    outline: "none",
                    appearance: "none",
                  }}
                >
                  {plants.map((p) => (
                    <option key={p.plant_id} value={p.plant_id}>
                      {p.plant_id === "solar_plant_1"
                        ? "☀️ Solar Plant 1 (32 MW Rajasthan)"
                        : "💨 Wind Plant 1 (3.6 MW SCADA)"}
                    </option>
                  ))}
                </select>
                <div style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "var(--text-muted)" }}>
                  ▾
                </div>
              </div>
            </div>

            <div
              style={{
                display: "none",
                alignItems: "center",
                gap: "6px",
                fontSize: "0.8rem",
                color: "var(--text-muted)",
              }}
              className="lg-flex"
            >
              <span>•</span>
              <span>Capacity: <strong>{currentPlant?.capacity_kw.toLocaleString()} kW</strong></span>
            </div>
          </div>

          {/* Right Header: Alerts Bell & Transparency Badges */}
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <DataSourceBadge source={dataSource} />

            {/* Real Alerts Notification Bell */}
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setShowAlertMenu(!showAlertMenu)}
                aria-label={`Alert notifications: ${realAlerts.length} total, ${breachAlertCount} breaches`}
                style={{
                  background: "var(--bg-app)",
                  border: "1px solid var(--border-default)",
                  borderRadius: "var(--radius-sm)",
                  padding: "6px 8px",
                  color: breachAlertCount > 0 ? "var(--breach-red)" : "var(--text-secondary)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  position: "relative",
                }}
              >
                <Bell size={16} />
                {realAlerts.length > 0 && (
                  <span
                    style={{
                      position: "absolute",
                      top: "-4px",
                      right: "-4px",
                      width: "14px",
                      height: "14px",
                      borderRadius: "50%",
                      backgroundColor: breachAlertCount > 0 ? "var(--breach-red)" : "var(--amber-500)",
                      color: "#FFF",
                      fontSize: "0.6rem",
                      fontWeight: 800,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {realAlerts.length}
                  </span>
                )}
              </button>

              {/* Real Alerts Popover Menu */}
              {showAlertMenu && (
                <div
                  style={{
                    position: "absolute",
                    right: 0,
                    top: "40px",
                    width: "320px",
                    backgroundColor: "var(--bg-surface-elevated)",
                    border: "1px solid var(--border-default)",
                    borderRadius: "var(--radius-md)",
                    boxShadow: "var(--shadow-lg)",
                    zIndex: 50,
                    padding: "10px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border-subtle)", paddingBottom: "6px", marginBottom: "8px" }}>
                    <span style={{ fontSize: "0.8rem", fontWeight: 700 }}>Telemetry Alerts Feed</span>
                    <Link to="/alerts" onClick={() => setShowAlertMenu(false)} style={{ fontSize: "0.72rem", color: "var(--sky-400)", textDecoration: "none" }}>
                      View all
                    </Link>
                  </div>
                  {realAlerts.length === 0 ? (
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", padding: "12px 0", textAlign: "center" }}>
                      No active alerts recorded.
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      {realAlerts.map((a, i) => (
                        <div
                          key={i}
                          style={{
                            padding: "6px 8px",
                            borderRadius: "var(--radius-sm)",
                            backgroundColor: a.type === "dsm_breach" ? "var(--breach-red-bg)" : "var(--bg-app)",
                            border: `1px solid ${a.type === "dsm_breach" ? "var(--breach-red-border)" : "var(--border-subtle)"}`,
                            fontSize: "0.72rem",
                          }}
                        >
                          <div style={{ fontWeight: 700, color: a.type === "dsm_breach" ? "var(--breach-red)" : "var(--amber-400)" }}>
                            {a.type.toUpperCase()}
                          </div>
                          <div style={{ color: "var(--text-secondary)", marginTop: "2px" }}>{a.message}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Content Body */}
        <main
          style={{
            flex: 1,
            padding: "1.5rem",
            maxWidth: "1440px",
            width: "100%",
            margin: "0 auto",
            boxSizing: "border-box",
          }}
        >
          {children}
        </main>
      </div>
    </div>
  );
};
