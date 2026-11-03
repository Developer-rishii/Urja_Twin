import React from "react";

export const EmptyState: React.FC<{
  title: string;
  description: string;
  icon?: React.ReactNode;
}> = ({ title, description, icon }) => {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "3rem 1.5rem",
        textAlign: "center",
        backgroundColor: "#F8FAFC",
        borderRadius: "8px",
        border: "1px dashed #CBD5E1",
        color: "#64748B",
        margin: "1rem 0",
      }}
    >
      {icon && <div style={{ marginBottom: "0.75rem" }}>{icon}</div>}
      <div style={{ fontSize: "1rem", fontWeight: 600, color: "#334155", marginBottom: "0.25rem" }}>
        {title}
      </div>
      <div style={{ fontSize: "0.875rem", maxWidth: "420px" }}>{description}</div>
    </div>
  );
};
