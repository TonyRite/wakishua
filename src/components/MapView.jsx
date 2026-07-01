import React, { useEffect, useRef } from 'react';
import L from 'leaflet';

// Read-only map showing an approximate area (a soft circle, not a precise pin).
export default function MapView({ lat, lon, radiusM = 400, label }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    if (!elRef.current || mapRef.current) return;
    const map = L.map(elRef.current, {
      center: [lat, lon],
      zoom: 14,
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      keyboard: false
    });
    mapRef.current = map;

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
    L.circle([lat, lon], {
      radius: radiusM,
      color: '#00A3A6',
      weight: 2,
      fillColor: '#00A3A6',
      fillOpacity: 0.18
    }).addTo(map);

    setTimeout(() => map.invalidateSize(), 200);
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="map-view-wrap">
      <div className="map-canvas map-canvas-sm" ref={elRef} aria-label={label || 'Approximate area'}></div>
      {label && <span className="map-view-label">📍 {label}</span>}
    </div>
  );
}
