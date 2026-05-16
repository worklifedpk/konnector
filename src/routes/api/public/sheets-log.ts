// Public endpoint: append a signup row to the Konnect "Konnect Live Signups" sheet.
// Non-blocking from the client — failures are tolerated.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const SHEET_ID = "1pk_RZn4iLLLO9dqxotx5dD0YNwi745rtlUDtX_3PHME";
const GATEWAY = "https://connector-gateway.lovable.dev/google_sheets/v4";

const Schema = z.object({
  session_id: z.string().min(1).max(200),
  name: z.string().min(1).max(60),
  age: z.union([z.number(), z.null()]).optional(),
  gender: z.string().max(40).nullable().optional(),
  email: z.string().email().max(160),
  mode: z.string().max(80),
  event_type: z.string().max(60).nullable().optional(),
  event_name: z.string().max(80).nullable().optional(),
  interests: z.array(z.string()).max(20).optional().default([]),
  skills: z.string().max(120).nullable().optional(),
  social: z.string().max(160).nullable().optional(),
  ttl_hours: z.number().int().min(1).max(48),
  lat: z.number(),
  lng: z.number(),
  accuracy_m: z.number().nullable().optional(),
  address: z.string().max(300).nullable().optional(),
});

export const Route = createFileRoute("/api/public/sheets-log")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        }),
      POST: async ({ request }) => {
        const cors = {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        };
        try {
          const LOVABLE = process.env.LOVABLE_API_KEY;
          const KEY = process.env.GOOGLE_SHEETS_API_KEY;
          if (!LOVABLE || !KEY) {
            return new Response(JSON.stringify({ ok: false, error: "missing keys" }), { status: 500, headers: cors });
          }
          const parsed = Schema.safeParse(await request.json());
          if (!parsed.success) {
            return new Response(JSON.stringify({ ok: false, error: "invalid input" }), { status: 400, headers: cors });
          }
          const d = parsed.data;
          const row = [
            new Date().toISOString(),
            d.session_id,
            d.name,
            d.age ?? "",
            d.gender ?? "",
            d.email,
            d.mode,
            d.event_type ?? "",
            d.event_name ?? "",
            (d.interests ?? []).join(", "),
            d.skills ?? "",
            d.social ?? "",
            d.ttl_hours,
            d.lat,
            d.lng,
            d.accuracy_m ?? "",
            d.address ?? "",
          ];
          const r = await fetch(
            `${GATEWAY}/spreadsheets/${SHEET_ID}/values/Sheet1!A:Q:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${LOVABLE}`,
                "X-Connection-Api-Key": KEY,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ values: [row] }),
            }
          );
          if (!r.ok) {
            const t = await r.text();
            return new Response(JSON.stringify({ ok: false, error: `sheets ${r.status}: ${t.slice(0, 200)}` }), { status: 502, headers: cors });
          }
          return new Response(JSON.stringify({ ok: true }), { status: 200, headers: cors });
        } catch (e: any) {
          return new Response(JSON.stringify({ ok: false, error: e?.message ?? "error" }), { status: 500, headers: cors });
        }
      },
    },
  },
});
