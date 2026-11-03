import React from "react";

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
        borderRadius: "9999px",
        fontSize: "0.75rem",
        fontWeight: 600,
        letterSpacing: "0.025em",
        backgroundColor: isSimulated ? "#FEF3C7" : "#E0F2FE",
        color: isSimulated ? "#92400E" : "#0369A1",
        border: `1px solid ${isSimulated ? "#FCD34D" : "#BAE6FD"}`,
      }}
      className={className}
      title="Data transparency tag complying with SIH Jury presentation honesty guidelines"
    >
      <span
        style={{
          width: "6px",
          height: "6px",
          borderRadius: "50%",
          backgroundColor: isSimulated ? "#D97706" : "#0284C7",
        }}
      />
      Data Source: {isSimulated ? "Simulated Node (Replay)" : "Historical Replay"}
    </div>
  );
};
