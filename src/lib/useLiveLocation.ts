// Live GPS watcher. Pushes updates into konnect_users with debouncing so
// every viewer sees accurate, real-time distances.
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getSessionId } from "@/lib/session";

export type LiveCoords = {
  lat: number;
  lng: number;
  accuracy: number;
  ts: number;
};

const MIN_DELTA_M = 15;        // only persist when moved 15m+
const MIN_INTERVAL_MS = 5000;  // or 5s have elapsed
const MAX_ACCURACY_M = 250;    // drop noisy fixes (keep these — 100m is too strict for indoor GPS)

function distM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export function useLiveLocation(enabled = true) {
  const [coords, setCoords] = useState<LiveCoords | null>(null);
  const lastPushed = useRef<LiveCoords | null>(null);

  useEffect(() => {
    if (!enabled || typeof navigator === "undefined" || !navigator.geolocation) return;
    const me = getSessionId();

    const id = navigator.geolocation.watchPosition(
      async (pos) => {
        if (pos.coords.accuracy > MAX_ACCURACY_M) return;
        const next: LiveCoords = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          ts: Date.now(),
        };
        setCoords(next);

        const prev = lastPushed.current;
        const moved = prev ? distM(prev, next) : Infinity;
        const elapsed = prev ? next.ts - prev.ts : Infinity;
        if (!prev || moved > MIN_DELTA_M || elapsed > MIN_INTERVAL_MS * 6) {
          if (elapsed < MIN_INTERVAL_MS && moved < MIN_DELTA_M) return;
          lastPushed.current = next;
          if (me) {
            await (supabase as any)
              .from("konnect_users")
              .update({
                location_lat: next.lat,
                location_lng: next.lng,
                location_accuracy_m: next.accuracy,
              })
              .eq("session_id", me);
          }
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
    );

    return () => navigator.geolocation.clearWatch(id);
  }, [enabled]);

  return coords;
}
