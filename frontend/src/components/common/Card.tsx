import React from "react";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  variant?: "default" | "elevated" | "breach" | "amber";
  padding?: "none" | "sm" | "md" | "lg";
}

export const Card: React.FC<CardProps> = ({
  children,
  className = "",
  style = {},
  variant = "default",
  padding = "md",
}) => {
  const paddingMap = {
    none: "0",
    sm: "1rem",
    md: "1.25rem 1.5rem",
    lg: "1.75rem 2rem",
  };

  const variantStyles: Record<string, React.CSSProperties> = {
    default: {
      backgroundColor: "var(--bg-surface)",
      border: "1px solid var(--border-subtle)",
      boxShadow: "var(--shadow-sm)",
    },
    elevated: {
      backgroundColor: "var(--bg-surface-elevated)",
      border: "1px solid var(--border-default)",
      boxShadow: "var(--shadow-md)",
    },
    breach: {
      backgroundColor: "var(--breach-red-bg)",
      border: "1px solid var(--breach-red-border)",
      boxShadow: "var(--breach-red-glow)",
    },
    amber: {
      backgroundColor: "var(--amber-bg)",
      border: "1px solid var(--amber-border)",
      boxShadow: "var(--shadow-sm)",
    },
  };

  return (
    <div
      className={`urja-card ${className}`}
      style={{
        borderRadius: "var(--radius-lg)",
        padding: paddingMap[padding],
        transition: "transform var(--transition-fast), border-color var(--transition-fast)",
        ...variantStyles[variant],
        ...style,
      }}
    >
      {children}
    </div>
  );
};
