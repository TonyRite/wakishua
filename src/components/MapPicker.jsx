import React, { useEffect, useRef } from 'react';
import L from 'leaflet';

// Fix Leaflet's default marker icon paths under bundlers (use CDN-free inline data not needed —
// we use a simple divIcon pin so there are no missing-image requests).
const pinIcon = L.divIcon({
  className: 'wk-pin',
  html: '<div class="wk-pin-dot"></div>',
  iconSize: [24, 24],
  iconAnchor: [12, 12]
});

// Draggable pin map. Calls onChange({lat, lon}) when the pin or map centre moves.
export default function MapPicker({ lat, lon, onChange }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);

  useEffect(() => {
    if (!elRef.current || mapRef.current) return;

    const map = L.map(elRef.current, {
      center: [lat, lon],
      zoom: 15,
      zoomControl: true,
      attributionControl: true
    });
    mapRef.current = map;

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap'
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

  // Keep marker/view in sync if parent changes coords (e.g. "use my location").
  useEffect(() => {
    if (mapRef.current && markerRef.current) {
      markerRef.current.setLatLng([lat, lon]);
      mapRef.current.setView([lat, lon]);
    }
  }, [lat, lon]);

  return <div className="map-canvas" ref={elRef} aria-label="Pick location on map"></div>;
}
