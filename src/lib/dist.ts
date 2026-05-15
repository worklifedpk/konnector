// Distance helpers (Haversine) + human-friendly formatting.
export function distKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371; // km
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/** Show meters under 1 km, otherwise km with 1–2 decimals. */
export function formatDist(km: number): string {
  if (!isFinite(km) || km < 0) return "—";
  if (km < 0.02) return "Same spot";
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(2)} km`;
  return `${km.toFixed(1)} km`;
}

/** Reverse-geocode lat/lng to a human-readable address using a free, no-key service. */
export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const r = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`
    );
    if (!r.ok) return "";
    const j: any = await r.json();
    return [j.locality, j.city, j.principalSubdivision, j.countryName]
      .filter(Boolean)
      .join(", ");
  } catch {
    return "";
  }
}
