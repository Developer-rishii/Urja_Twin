import React from "react";

export const LoadingSpinner: React.FC<{ message?: string }> = ({ message = "Loading twin telemetry..." }) => {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "3rem",
        color: "#64748B",
      }}
    >
      <div
        style={{
          width: "36px",
          height: "36px",
          border: "3px solid #E2E8F0",
          borderTop: "3px solid #0284C7",
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
          marginBottom: "1rem",
        }}
      />
      <span style={{ fontSize: "0.875rem", fontWeight: 500 }}>{message}</span>
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};
