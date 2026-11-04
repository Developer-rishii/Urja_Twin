import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Card } from "./common/Card";
import { DataSourceBadge } from "./common/DataSourceBadge";
import { MapPin, WifiOff } from "lucide-react";
import type { PlantStateResponse } from "../api/client";

interface PlantGeoMapProps {
  plantId: string;
  plantState: PlantStateResponse | null;
  latitude?: number;
  longitude?: number;
  zoom?: number;
  locationLabel?: string;
  locationBasis?: string;
  compact?: boolean;
  dsmBreachCount?: number;
  lastSyncTime?: string;
  height?: number | string;
}

export const PlantGeoMap: React.FC<PlantGeoMapProps> = ({
  plantId: _plantId,
  plantState,
  latitude = 22.0,
  longitude = 79.0,
  zoom = 5,
  locationLabel = "India (Plant 1)",
  locationBasis: _locationBasis = "assumption",
  compact = false,
  dsmBreachCount = 0,
  lastSyncTime,
  height = 360,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  const [tileError, setTileError] = useState<boolean>(false);

  const isOnline = plantState?.node_status === "online";
  const hasBreaches = dsmBreachCount > 0;
  const isSolar = plantState?.plant_type === "solar_pv";

  // Create custom DOM/SVG divIcon avoiding broken Vite asset links
  const createCustomIcon = (online: boolean, breachCount: number) => {
    // Emerald = online, Amber = stale/offline (Rule 3: Red reserved strictly for DSM breach)
    const markerColor = online ? "var(--emerald-400)" : "var(--amber-400)";
    const markerBg = online ? "rgba(16, 185, 129, 0.2)" : "rgba(245, 158, 11, 0.2)";

    const breachBadgeHtml =
      breachCount > 0
        ? `<div style="
            position: absolute;
            top: -8px;
            right: -10px;
            background-color: var(--breach-red);
            color: #FFFFFF;
            font-size: 10px;
            font-weight: 800;
            padding: 1px 5px;
            border-radius: 9999px;
            border: 1px solid rgba(255, 255, 255, 0.6);
            box-shadow: var(--breach-red-glow);
            line-height: 14px;
            pointer-events: none;
          ">${breachCount}</div>`
        : "";

    const html = `
      <div class="urja-map-pin-wrapper" style="position: relative; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;">
        <div class="urja-marker-pulse" style="
          position: absolute;
          width: 30px;
          height: 30px;
          border-radius: 50%;
          background: ${markerBg};
          border: 1.5px solid ${markerColor};
          pointer-events: none;
        "></div>
        <div style="
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: ${markerColor};
          border: 2px solid #080B11;
          box-shadow: 0 0 10px ${markerColor};
          position: relative;
          z-index: 2;
        "></div>
        ${breachBadgeHtml}
      </div>
    `;

    return L.divIcon({
      className: "urja-custom-marker",
      html,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
      popupAnchor: [0, -18],
    });
  };

  // Build honest HTML popup showing only fields that exist (Rule 4)
  const buildPopupContent = () => {
    const powerKw = plantState?.actual_kw !== undefined ? `${plantState.actual_kw.toLocaleString()} kW` : null;
    const expKw = plantState?.expected_kw !== undefined ? `${plantState.expected_kw.toLocaleString()} kW` : null;
    const gap = plantState?.gap_pct !== undefined ? `${plantState.gap_pct > 0 ? "+" : ""}${plantState.gap_pct}%` : null;
    const soiling = plantState?.soiling_loss_pct !== undefined && plantState.soiling_loss_pct > 0
      ? `${plantState.soiling_loss_pct}%`
      : null;

    let rowsHtml = "";
    if (powerKw) rowsHtml += `<div><span style="color:var(--text-muted);">Output:</span> <strong style="color:var(--text-primary);">${powerKw}</strong></div>`;
    if (expKw) rowsHtml += `<div><span style="color:var(--text-muted);">Expected:</span> <strong style="color:var(--text-secondary);">${expKw}</strong></div>`;
    if (gap) rowsHtml += `<div><span style="color:var(--text-muted);">Twin Gap:</span> <strong style="color:${isOnline ? 'var(--sky-400)' : 'var(--amber-400)'};">${gap}</strong></div>`;
    if (soiling && isSolar) rowsHtml += `<div><span style="color:var(--text-muted);">Soiling Loss:</span> <strong style="color:var(--amber-400);">${soiling}</strong></div>`;

    return `
      <div style="
        font-family: var(--font-sans);
        font-size: 12px;
        color: var(--text-primary);
        line-height: 1.5;
        min-width: 190px;
        padding: 4px 2px;
      ">
        <div style="font-weight: 800; font-size: 13px; margin-bottom: 4px; color: var(--text-primary);">
          ${locationLabel}
        </div>
        <div style="font-size: 10px; color: var(--text-muted); margin-bottom: 8px;">
          Latest reading: ${plantState?.last_ts || "N/A"}
        </div>
        <div style="display: flex; flex-direction: column; gap: 3px; margin-bottom: 8px;">
          ${rowsHtml || '<div style="color:var(--text-muted);">Awaiting telemetry uplink</div>'}
        </div>
        <div style="border-top: 1px solid var(--border-subtle); padding-top: 6px; display: flex; justify-content: space-between; align-items: center; font-size: 10px;">
          <span style="color: ${isOnline ? 'var(--emerald-400)' : 'var(--amber-400)'}; font-weight: 700;">
            ● ${isOnline ? 'Node Online' : 'Node Stale/Offline'}
          </span>
          <span style="color: var(--text-muted); font-size: 9px;">${lastSyncTime || 'Synced'}</span>
        </div>
      </div>
    `;
  };

  // Initialize Map Once (Never remount on polling refreshes)
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [latitude, longitude],
      zoom,
      zoomControl: !compact,
      attributionControl: true,
      scrollWheelZoom: false,
    });

    // CartoDB requires a paid commercial API key as of late 2024 to remove "API KEY REQUIRED" watermarks.
    // If VITE_CARTO_API_KEY is present in .env, use it; otherwise use Esri Dark Gray / OpenStreetMap (100% free, zero watermark).
    const cartoKey = import.meta.env.VITE_CARTO_API_KEY;
    const tileUrl = cartoKey
      ? `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?api_key=${cartoKey}`
      : "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}";

    const tileAttrib = cartoKey
      ? '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener noreferrer">CARTO</a>'
      : '&copy; <a href="https://www.esri.com" target="_blank" rel="noopener noreferrer">Esri</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors';

    const tileLayer = L.tileLayer(tileUrl, {
      attribution: tileAttrib,
      maxZoom: 16,
      subdomains: cartoKey ? "abcd" : [],
    });

    tileLayer.on("tileerror", () => {
      setTileError(true);
    });

    tileLayer.addTo(map);

    // Initial marker
    const marker = L.marker([latitude, longitude], {
      icon: createCustomIcon(isOnline, dsmBreachCount),
    }).addTo(map);

    marker.bindPopup(buildPopupContent(), {
      className: "urja-leaflet-popup",
    });

    markerRef.current = marker;
    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      markerRef.current = null;
    };
  }, []); // Run once on mount

  // Update Map Center/Zoom on Plant Switch
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    mapInstanceRef.current.setView([latitude, longitude], zoom, { animate: true });
  }, [latitude, longitude, zoom]);

  // Update Marker & Popup in place without remounting or re-animating
  useEffect(() => {
    if (!markerRef.current) return;

    markerRef.current.setLatLng([latitude, longitude]);
    markerRef.current.setIcon(createCustomIcon(isOnline, dsmBreachCount));
    markerRef.current.setPopupContent(buildPopupContent());
  }, [plantState, isOnline, dsmBreachCount, lastSyncTime, locationLabel]);

  // Window resize & sidebar invalidateSize listener
  useEffect(() => {
    const handleResize = () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
      }
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener("layout-sidebar-toggle", handleResize);

    const timer = setTimeout(handleResize, 350);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("layout-sidebar-toggle", handleResize);
      clearTimeout(timer);
    };
  }, []);

  return (
    <Card
      variant="default"
      padding="none"
      className="urja-map-card"
      style={{
        position: "relative",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        height: typeof height === "number" ? `${height}px` : height,
      }}
    >
      {/* Map Header Toolbar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "8px",
          padding: compact ? "8px 12px" : "12px 16px",
          backgroundColor: "var(--bg-surface-elevated)",
          borderBottom: "1px solid var(--border-subtle)",
          zIndex: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <MapPin size={16} style={{ color: "var(--cyan-400)" }} />
          <div>
            <div style={{ fontSize: "0.85rem", fontWeight: 800, color: "var(--text-primary)" }}>
              {locationLabel}
            </div>
            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
              Illustrative location: dataset does not publish plant coordinates
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {hasBreaches && (
            <span
              style={{
                fontSize: "0.7rem",
                fontWeight: 700,
                color: "var(--breach-red)",
                backgroundColor: "var(--breach-red-bg)",
                border: "1px solid var(--breach-red-border)",
                padding: "2px 8px",
                borderRadius: "var(--radius-sm)",
              }}
            >
              ⚠ {dsmBreachCount} Breach Blocks
            </span>
          )}
          <DataSourceBadge source={plantState?.source || "simulated_node"} />
        </div>
      </div>

      {/* Map Container */}
      <div
        ref={mapContainerRef}
        style={{
          width: "100%",
          height: "100%",
          backgroundColor: "var(--bg-app)",
          flex: 1,
          position: "relative",
          zIndex: 1,
        }}
      />

      {/* Offline Tile Overlay Fallback */}
      {tileError && (
        <div
          style={{
            position: "absolute",
            bottom: "12px",
            left: "12px",
            right: "12px",
            backgroundColor: "rgba(13, 19, 31, 0.92)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-sm)",
            padding: "8px 12px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            fontSize: "0.75rem",
            color: "var(--text-secondary)",
            zIndex: 1000,
            backdropFilter: "blur(6px)",
          }}
        >
          <WifiOff size={14} style={{ color: "var(--amber-400)", flexShrink: 0 }} />
          <span>
            Map tiles unavailable (offline). Illustrative position: lat {latitude.toFixed(1)}, lon {longitude.toFixed(1)}
          </span>
        </div>
      )}
    </Card>
  );
};
