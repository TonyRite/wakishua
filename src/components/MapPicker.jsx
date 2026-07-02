import React, { useEffect, useRef } from 'react';
import L from 'leaflet';

// Simple divIcon pin so there are no missing-image requests under bundlers.
const pinIcon = L.divIcon({
  className: 'wk-pin',
  html: '<div class="wk-pin-dot"></div>',
  iconSize: [24, 24],
  iconAnchor: [12, 12]
});

// Draggable pin map. Calls onChange({lat, lon}) when the pin/map moves.
// `onLocate` (optional) is invoked by the on-map "locate me" button so the parent
// can run a fresh high-accuracy GPS fix and update the lat/lon props.
export default function MapPicker({ lat, lon, onChange, onLocate, locating, locateLabel }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);

  useEffect(() => {
    if (!elRef.current || mapRef.current) return;

    const map = L.map(elRef.current, {
      center: [lat, lon],
      zoom: 16,
      zoomControl: true,
      attributionControl: true
    });
    mapRef.current = map;

    // CARTO Voyager basemap — crisper/retina-aware, no API key required.
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 20,
      subdomains: 'abcd',
      attribution: '© OpenStreetMap © CARTO'
    }).addTo(map);

    const marker = L.marker([lat, lon], { draggable: true, icon: pinIcon }).addTo(map);
    markerRef.current = marker;

    const emit = (ll) => onChange && onChange({ lat: +ll.lat.toFixed(6), lon: +ll.lng.toFixed(6) });

    marker.on('dragend', () => emit(marker.getLatLng()));
    map.on('click', (e) => {
      marker.setLatLng(e.latlng);
      emit(e.latlng);
    });

    // Leaflet sometimes needs a nudge when rendered inside an animating sheet.
    setTimeout(() => map.invalidateSize(), 250);

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep marker/view in sync when parent changes coords (e.g. "locate me").
  useEffect(() => {
    if (mapRef.current && markerRef.current) {
      markerRef.current.setLatLng([lat, lon]);
      mapRef.current.setView([lat, lon], Math.max(mapRef.current.getZoom(), 16));
    }
  }, [lat, lon]);

  return (
    <div className="map-wrap">
      <div className="map-canvas" ref={elRef} aria-label="Pick location on map"></div>
      {onLocate && (
        <button
          type="button"
          className="map-locate-btn"
          onClick={onLocate}
          disabled={locating}
          aria-label={locateLabel || 'Use my location'}
          title={locateLabel || 'Use my location'}
        >
          {locating ? '⏳' : '📍'}
        </button>
      )}
    </div>
  );
}
