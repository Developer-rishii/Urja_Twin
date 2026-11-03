import React from "react";

export const ErrorAlert: React.FC<{
  title?: string;
  message: string;
  onRetry?: () => void;
}> = ({ title = "Error Encountered", message, onRetry }) => {
  return (
    <div
      style={{
        padding: "1rem 1.25rem",
        backgroundColor: "#FEF2F2",
        border: "1px solid #FCA5A5",
        borderRadius: "8px",
        color: "#991B1B",
        margin: "1rem 0",
      }}
    >
      <div style={{ fontWeight: 600, fontSize: "0.875rem", marginBottom: "0.25rem" }}>{title}</div>
      <div style={{ fontSize: "0.875rem", color: "#B91C1C", marginBottom: onRetry ? "0.75rem" : 0 }}>
        {message}
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            padding: "4px 12px",
            fontSize: "0.75rem",
            fontWeight: 600,
            backgroundColor: "#EF4444",
            color: "#FFF",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          Retry
        </button>
      )}
    </div>
  );
};
