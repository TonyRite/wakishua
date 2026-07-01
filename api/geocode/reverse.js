// Reverse-geocode proxy (OpenStreetMap Nominatim) — Vercel serverless function.
// GET /api/geocode/reverse?lat=..&lon=..  → { location_name, address }
//
// Proxied server-side to keep a proper User-Agent and add a small warm-instance
// cache. Nominatim's usage policy asks for <= 1 req/s and an identifying UA.
const cache = new Map(); // key: "lat,lon" (rounded) → { location_name, address }

export default async function handler(req, res) {
  const { lat, lon } = req.query;
  if (!lat || !lon) return res.status(400).json({ error: 'lat and lon are required' });

  const key = `${parseFloat(lat).toFixed(4)},${parseFloat(lon).toFixed(4)}`;
  if (cache.has(key)) return res.json(cache.get(key));

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=14&addressdetails=1`;
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Wakishua/1.0 (local help platform)',
        'Accept-Language': 'en'
      }
    });
    if (!r.ok) throw new Error(`Nominatim ${r.status}`);
    const data = await r.json();
    const a = data.address || {};
    const location_name =
      a.suburb || a.neighbourhood || a.village || a.town ||
      a.city_district || a.city || a.county || data.name || 'Selected area';
    const out = { location_name, address: data.display_name || '' };

    cache.set(key, out);
    if (cache.size > 500) cache.delete(cache.keys().next().value);
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate');
    return res.json(out);
  } catch (err) {
    console.error('geocode error:', err);
    // Non-fatal: the client treats the area field as editable.
    return res.json({ location_name: '', address: '' });
  }
}
