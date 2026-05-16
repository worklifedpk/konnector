# Plan

## 1. Precise location with confirmation (start.tsx)
- After GPS lock, check `accuracy`. If `> 100m`, show an inline warning + a "Pin location manually" panel.
- Manual entry: text field (address) + lat/lng numeric inputs. Geocode address via free Nominatim (`https://nominatim.openstreetmap.org/search?format=json&q=...`) and snap coords.
- Add an explicit **"Confirm this location"** checkbox/step. `Go Live` button is disabled until user confirms (even at high accuracy, a confirm tick is required).
- Persist `location_accuracy_m` and `location_address`.

## 2. GenZ sliding profile carousel (index.tsx radar preview & live ticker)
- Replace current row: only the circular **DP** slides (auto-marquee + drag), large circles with gradient gold ring, name micro-caption underneath.
- Side-mounted **"Check" pill button** on each card → opens a tiny popover with: social link (Instagram/X/LinkedIn/Telegram) if present, else `mailto:` email.
- Distance chip floats above the DP (uses `formatDist`).
- Style: glassy gold ring, soft shadow, hover scale, springy snap; uses existing tokens.

## 3. Chat readability — gold-white message bubbles (chat.$peer.tsx)
- Every message bubble (mine + theirs) gets the `.btn-gw` gradient base with dark text (`color: #1a1408`) so text is always readable on the cinematic background.
- Differentiate self vs peer with a subtle border-tint + alignment (no transparency).

## 4. Real-time accurate distance
- Live-watch GPS via `navigator.geolocation.watchPosition({ enableHighAccuracy:true, maximumAge:0 })` on `/live`, `/index`, `/chat`. On each fix, upsert `location_lat/lng/accuracy_m` into `konnect_users` (debounced ~5s, or on >15m delta).
- All distance UIs subscribe to local state + realtime `konnect_users` updates → recompute Haversine on every tick → display via `formatDist` (m/km).
- Discard fixes with `accuracy > 200m` to avoid jumpy values.

## 5. Home page: nearby active groups (index.tsx)
- New section "Live groups near you" — query `konnect_groups` joined with member counts, filter `expires_at > now()` AND Haversine ≤ **40 km** from viewer's current coords (or IP-rough fallback before GPS).
- Card shows: name, event_type, member count / max_size, distance, "Request to join" CTA → routes to `/live` with the group preselected.

## 6. Share direct link to event/group
- Add a **Share** icon on every group card + event header.
- Generates `https://<origin>/live?join=<groupId>` (or `?event=<slug>` for solo events) and uses `navigator.share` when available, falls back to clipboard with toast.
- On `/live` mount, if `?join=` present and user is live, auto-open the group dialog with "Request to join" pre-armed.

## 7. Google Sheets integration (form → sheet)
- Connect the **Google Sheets** connector via `standard_connectors--connect`.
- Create a new spreadsheet "Konnect Live Signups" with header row: `timestamp, session_id, name, age, gender, email, mode, event_type, event_name, interests, skills, social, ttl_hours, lat, lng, accuracy_m, address`.
- New server route `src/routes/api/sheets-log.ts` (POST) → validates with zod → calls gateway `https://connector-gateway.lovable.dev/google_sheets/v4/spreadsheets/{id}/values/Sheet1!A:Q:append?valueInputOption=USER_ENTERED`.
- `start.tsx` `submit()` fires this in the background after the Supabase upsert (non-blocking; toast on failure but doesn't block Go Live).

## Technical notes
- Distance watcher: single hook `useLiveLocation()` in `src/lib/useLiveLocation.ts` shared by index/live/chat.
- Manual location uses Nominatim (no key) with a 1-second debounce.
- Sheet ID stored as Supabase secret `KONNECT_SHEETS_ID` (added after sheet is created).
- No schema migration needed — existing columns already cover location fields.

## Files
- edit `src/routes/start.tsx`, `src/routes/index.tsx`, `src/routes/live.tsx`, `src/routes/chat.$peer.tsx`, `src/styles.css`
- create `src/lib/useLiveLocation.ts`, `src/routes/api/sheets-log.ts`
- connect Google Sheets, add `KONNECT_SHEETS_ID` secret

Reply **approve** to build, or tell me what to change (e.g. skip Sheets, different distance radius).