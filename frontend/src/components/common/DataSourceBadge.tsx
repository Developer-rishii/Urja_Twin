import React from "react";
import { Database, Radio } from "lucide-react";

interface DataSourceBadgeProps {
  source?: string;
  className?: string;
}

export const DataSourceBadge: React.FC<DataSourceBadgeProps> = ({
  source = "simulated_node",
  className = "",
}) => {
  const isSimulated = source.includes("simulated");

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        padding: "4px 10px",
        borderRadius: "var(--radius-full)",
        fontSize: "0.72rem",
        fontWeight: 600,
        letterSpacing: "0.02em",
        backgroundColor: isSimulated ? "rgba(245, 158, 11, 0.12)" : "rgba(14, 165, 233, 0.12)",
        color: isSimulated ? "var(--amber-400)" : "var(--sky-400)",
        border: `1px solid ${isSimulated ? "rgba(245, 158, 11, 0.3)" : "rgba(14, 165, 233, 0.3)"}`,
      }}
      className={className}
      title="Data transparency tag complying with SIH Jury presentation honesty guidelines"
    >
      {isSimulated ? (
        <Radio size={12} strokeWidth={2.5} style={{ animation: "pulse 2s infinite" }} />
      ) : (
        <Database size={12} strokeWidth={2.5} />
      )}
      <span>Data Source: <strong>{isSimulated ? "Simulated Node (Replay)" : "Historical Replay"}</strong></span>
    </div>
  );
};
