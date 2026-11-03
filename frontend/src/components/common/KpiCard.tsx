import React from "react";

interface KpiCardProps {
  label: string;
  value: string | number;
  subValue?: string;
  icon?: React.ReactNode;
  status?: "default" | "emerald" | "amber" | "breach";
  badge?: string;
  tooltip?: string;
}

export const KpiCard: React.FC<KpiCardProps> = ({
  label,
  value,
  subValue,
  icon,
  status = "default",
  badge,
  tooltip,
}) => {
  const statusColors = {
    default: {
      border: "var(--border-subtle)",
      bg: "var(--bg-surface)",
      valColor: "var(--text-primary)",
      iconBg: "rgba(56, 189, 248, 0.1)",
      iconColor: "var(--sky-400)",
    },
    emerald: {
      border: "var(--emerald-border)",
      bg: "var(--bg-surface)",
      valColor: "var(--emerald-400)",
      iconBg: "rgba(16, 185, 129, 0.15)",
      iconColor: "var(--emerald-400)",
    },
    amber: {
      border: "var(--amber-border)",
      bg: "var(--bg-surface)",
      valColor: "var(--amber-400)",
      iconBg: "rgba(245, 158, 11, 0.15)",
      iconColor: "var(--amber-400)",
    },
    breach: {
      border: "var(--breach-red-border)",
      bg: "var(--breach-red-bg)",
      valColor: "var(--breach-red)",
      iconBg: "rgba(239, 68, 68, 0.2)",
      iconColor: "var(--breach-red)",
    },
  };

  const currentTheme = statusColors[status];

  return (
    <div
      style={{
        backgroundColor: currentTheme.bg,
        border: `1px solid ${currentTheme.border}`,
        borderRadius: "var(--radius-lg)",
        padding: "1.25rem",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        boxShadow: "var(--shadow-sm)",
        transition: "transform var(--transition-fast), box-shadow var(--transition-fast)",
      }}
      title={tooltip}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
        <span
          style={{
            fontSize: "0.72rem",
            fontWeight: 700,
            color: "var(--text-secondary)",
            letterSpacing: "0.05em",
            textTransform: "uppercase",
          }}
        >
          {label}
        </span>
        {icon && (
          <div
            style={{
              padding: "6px",
              borderRadius: "var(--radius-md)",
              backgroundColor: currentTheme.iconBg,
              color: currentTheme.iconColor,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {icon}
          </div>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: "8px", flexWrap: "wrap" }}>
        <span
          style={{
            fontSize: "1.75rem",
            fontWeight: 800,
            letterSpacing: "-0.03em",
            color: currentTheme.valColor,
            lineHeight: 1.15,
          }}
        >
          {value}
        </span>
        {badge && (
          <span
            style={{
              fontSize: "0.7rem",
              fontWeight: 700,
              padding: "2px 6px",
              borderRadius: "var(--radius-sm)",
              backgroundColor: status === "breach" ? "var(--breach-red-bg)" : "var(--emerald-bg)",
              color: status === "breach" ? "var(--breach-red)" : "var(--emerald-400)",
              border: `1px solid ${status === "breach" ? "var(--breach-red-border)" : "var(--emerald-border)"}`,
            }}
          >
            {badge}
          </span>
        )}
      </div>

      {subValue && (
        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.5rem" }}>
          {subValue}
        </div>
      )}
    </div>
  );
};
