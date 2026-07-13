// ─── Live events feed (Ticketmaster Discovery API) ───────────────────────────
// The calendar is seeded with Wrocław venues + typical schedules, but the real
// signal is what's actually announced. On app open Farely pulls the latest
// Wrocław listings from the Ticketmaster Discovery API and merges them in (live >
// listing > typical, see events.ts). Same transport as carLookup.feGet:
// CapacitorHttp on device (no CORS), the Vite dev proxy /tm-api in `npm run dev`,
// direct fetch otherwise. Needs the driver's free Ticketmaster consumer key
// (Settings) — with no key it no-ops and the seeded + typical events still show.

import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { VENUES, type Venue, type VenueEvent, type EventKind } from "./events";

const IS_NATIVE = Capacitor.isNativePlatform();
const IS_DEV = import.meta.env.DEV;
const TM_BASE = "https://app.ticketmaster.com/discovery/v2";
const DAY = 86_400_000;

async function tmGet(path: string): Promise<unknown> {
  if (IS_NATIVE) {
    const res = await CapacitorHttp.get({
      url: TM_BASE + path,
      headers: { Accept: "application/json" },
      connectTimeout: 12000,
      readTimeout: 12000,
    });
    if (res.status !== 200) throw new Error(`ticketmaster ${res.status}`);
    return typeof res.data === "string" ? JSON.parse(res.data) : res.data;
  }
  const base = IS_DEV ? "/tm-api/discovery/v2" : TM_BASE; // dev proxy dodges CORS
  const res = await fetch(base + path, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`ticketmaster ${res.status}`);
  return res.json();
}

// ── Ticketmaster event → Farely VenueEvent ───────────────────────────────────

const norm = (s: string) =>
  s.toLowerCase().replace(/ł/g, "l").normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** The engine zone of the nearest known Wrocław venue (keeps zoneEph valid). */
function nearestVenueZone(lat: number, lng: number): string {
  let best = VENUES[0];
  let bestD = Infinity;
  for (const v of VENUES) {
    const d = haversineKm(lat, lng, v.lat, v.lng);
    if (d < bestD) {
      bestD = d;
      best = v;
    }
  }
  return best.zone;
}

/** Reuse a known venue when the name lines up, else synthesize one from TM geo. */
function resolveVenue(name: string, lat: number, lng: number): Venue {
  const n = norm(name);
  const known = VENUES.find((v) => n.includes(norm(v.name)) || n.includes(norm(v.short)) || norm(v.name).includes(n));
  if (known) return known;
  const hasGeo = Number.isFinite(lat) && Number.isFinite(lng);
  return {
    id: `tm-venue-${n.replace(/[^a-z0-9]+/g, "-").slice(0, 24)}`,
    name,
    short: name.length > 16 ? name.slice(0, 15) + "…" : name,
    kind: "hall",
    lat: hasGeo ? lat : 51.107,
    lng: hasGeo ? lng : 17.038,
    zone: hasGeo ? nearestVenueZone(lat, lng) : "City Centre",
  };
}

const KIND_BY_SEGMENT: Record<string, EventKind> = {
  music: "concert",
  sports: "sport",
  "arts & theatre": "opera",
  "arts & theater": "opera",
  film: "family",
  miscellaneous: "family",
};
const DURATION: Record<EventKind, number> = {
  concert: 150,
  opera: 165,
  sport: 130,
  family: 120,
  festival: 300,
};

const BIG_VENUE = /(arena|stadion|stadium|hala|tauron)/i;

function crowdFor(venueName: string, segment: string): 1 | 2 | 3 {
  if (BIG_VENUE.test(venueName)) return 3;
  if (norm(segment) === "music") return 2;
  return 1;
}

interface TmEvent {
  id: string;
  name: string;
  dates?: { start?: { dateTime?: string; localDate?: string; localTime?: string } };
  classifications?: Array<{ segment?: { name?: string } }>;
  _embedded?: { venues?: Array<{ name?: string; location?: { latitude?: string; longitude?: string } }> };
}

function mapEvent(ev: TmEvent): VenueEvent | null {
  const start = ev.dates?.start;
  const iso =
    start?.dateTime ??
    (start?.localDate ? `${start.localDate}T${start.localTime ?? "20:00:00"}` : null);
  if (!iso) return null;
  const startMs = Date.parse(iso);
  if (!Number.isFinite(startMs)) return null;

  const tv = ev._embedded?.venues?.[0];
  const lat = parseFloat(tv?.location?.latitude ?? "");
  const lng = parseFloat(tv?.location?.longitude ?? "");
  const segment = ev.classifications?.[0]?.segment?.name ?? "";
  const kind = KIND_BY_SEGMENT[norm(segment)] ?? "concert";
  const venue = resolveVenue(tv?.name ?? "Venue", lat, lng);

  return {
    id: `tm-${ev.id}`,
    venue,
    title: ev.name,
    startMs,
    durationMin: DURATION[kind],
    crowd: crowdFor(tv?.name ?? "", segment),
    kind,
    verified: true,
    source: "live",
  };
}

export interface LiveEventsResult {
  events: VenueEvent[];
  error: string | null;
}

/**
 * Pull upcoming Wrocław events from Ticketmaster. Resolves with an empty list +
 * an error string on any failure (no key, offline, bad response) so the caller
 * can log it and fall back to the seeded calendar without a crash.
 */
export async function fetchLiveEvents(apiKey?: string, now = new Date()): Promise<LiveEventsResult> {
  if (!apiKey) return { events: [], error: "no Ticketmaster API key" };
  const startISO = new Date(now.getTime() - 3_600_000).toISOString().slice(0, 19) + "Z";
  const endISO = new Date(now.getTime() + 21 * DAY).toISOString().slice(0, 19) + "Z";
  const path =
    `/events.json?apikey=${encodeURIComponent(apiKey)}` +
    `&city=Wroclaw&countryCode=PL&locale=*&size=100&sort=date,asc` +
    `&startDateTime=${startISO}&endDateTime=${endISO}`;
  try {
    const data = (await tmGet(path)) as { _embedded?: { events?: TmEvent[] } };
    const raw = data?._embedded?.events ?? [];
    const events = raw.map(mapEvent).filter((e): e is VenueEvent => e !== null);
    return { events, error: null };
  } catch (e) {
    return { events: [], error: e instanceof Error ? e.message : "network error" };
  }
}
