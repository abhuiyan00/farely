// ─── Venue events calendar (demand you can see coming) ───────────────────────
// Zoo closings, Hala Stulecia concerts, Opera curtain calls, NFM recitals,
// stadium match days: every one ends with a crowd standing on a curb wanting a
// ride. This module knows Wrocław's venues, the published events we could
// verify (July 2026 listings), and each venue's *typical* recurring schedule —
// and prices the let-out with the same zoneEph model the live map uses.
//
// `verified: true` = a real published listing (Songkick / venue calendars at
// build time). Everything else is the venue's typical pattern, labeled so in
// the UI — Farely stays honest about what it actually knows.
//
// Drivers can export any let-out to the phone's calendar: `eventToIcs()` emits
// a standard VCALENDAR (web download), and on-device the bridge opens the
// Android calendar insert screen prefilled (no permission needed).

import { roadKm, zoneEph, type Place } from "./engine";

export type VenueKind = "zoo" | "hall" | "opera" | "philharmonic" | "stadium" | "club";

export interface Venue {
  id: string;
  name: string;
  short: string;
  kind: VenueKind;
  lat: number;
  lng: number;
  /** Engine zone key when the venue sits in one (prices the let-out); else a label. */
  zone: string;
}

export const VENUES: Venue[] = [
  { id: "zoo", name: "ZOO Wrocław / Afrykarium", short: "Zoo", kind: "zoo", lat: 51.1049, lng: 17.0745, zone: "Biskupin" },
  { id: "hala", name: "Hala Stulecia", short: "Hala Stulecia", kind: "hall", lat: 51.1069, lng: 17.0770, zone: "Biskupin" },
  { id: "opera", name: "Opera Wrocławska", short: "Opera", kind: "opera", lat: 51.1030, lng: 17.0290, zone: "City Centre" },
  { id: "nfm", name: "Narodowe Forum Muzyki", short: "NFM", kind: "philharmonic", lat: 51.1075, lng: 17.0245, zone: "City Centre" },
  { id: "arena", name: "Tarczyński Arena", short: "Arena", kind: "stadium", lat: 51.1411, lng: 16.9430, zone: "Pilczyce" },
  { id: "a2", name: "A2 Centrum Koncertowe", short: "A2", kind: "club", lat: 51.1180, lng: 16.9800, zone: "Popowice" },
  { id: "impart", name: "IMPART", short: "Impart", kind: "hall", lat: 51.1000, lng: 17.0450, zone: "City Centre" },
  { id: "rewiry", name: "Zaklęte Rewiry", short: "Zakl. Rewiry", kind: "club", lat: 51.0870, lng: 17.0630, zone: "Przedm. Oławskie" },
];

const byId = Object.fromEntries(VENUES.map((v) => [v.id, v]));

export type EventKind = "concert" | "opera" | "family" | "sport" | "festival";

/** Where an event came from: live web feed, seeded published listing, or the venue's typical pattern. */
export type EventSource = "live" | "listing" | "typical";

export interface VenueEvent {
  id: string;
  venue: Venue;
  title: string;
  startMs: number;
  durationMin: number;
  /** 1 = hundreds, 2 = low thousands, 3 = arena-scale crowd. */
  crowd: 1 | 2 | 3;
  kind: EventKind;
  /** True when this is a real published listing, not the venue's typical pattern. */
  verified: boolean;
  /** Provenance for the UI badge; filled in by upcomingEvents / the live fetch. */
  source?: EventSource;
}

export const letOutMs = (e: VenueEvent) => e.startMs + e.durationMin * 60_000;

const at = (y: number, mo: number, d: number, h: number, mi = 0) =>
  new Date(y, mo - 1, d, h, mi).getTime();

// Real listings found for July–August 2026 (Songkick Wrocław + venue calendars).
const REAL_EVENTS: Omit<VenueEvent, "venue">[] = [
  { id: "vega", title: "Suzanne Vega", startMs: at(2026, 7, 13, 19), durationMin: 120, crowd: 2, kind: "concert", verified: true },
  { id: "inflames", title: "In Flames + Bleed From Within", startMs: at(2026, 7, 16, 19), durationMin: 180, crowd: 2, kind: "concert", verified: true },
  { id: "wrosound1", title: "WROsound Festival — day 1", startMs: at(2026, 7, 17, 16), durationMin: 420, crowd: 2, kind: "festival", verified: true },
  { id: "wrosound2", title: "WROsound Festival — day 2", startMs: at(2026, 7, 18, 16), durationMin: 420, crowd: 2, kind: "festival", verified: true },
  { id: "rewiry1", title: "Czarne Rewiry — day 1", startMs: at(2026, 7, 24, 17), durationMin: 360, crowd: 1, kind: "festival", verified: true },
  { id: "rewiry2", title: "Czarne Rewiry — day 2", startMs: at(2026, 7, 25, 17), durationMin: 360, crowd: 1, kind: "festival", verified: true },
  { id: "gogol", title: "Gogol Bordello", startMs: at(2026, 8, 15, 19), durationMin: 180, crowd: 2, kind: "concert", verified: true },
  // Announced for 2026 at Hala Stulecia, exact dates typical-slotted:
  { id: "mrozu", title: "Mrozu", startMs: at(2026, 7, 21, 20), durationMin: 150, crowd: 3, kind: "concert", verified: false },
  { id: "kizo", title: "Kizo", startMs: at(2026, 8, 8, 20), durationMin: 150, crowd: 3, kind: "concert", verified: false },
];

const REAL_VENUE: Record<string, string> = {
  vega: "nfm", inflames: "a2", wrosound1: "impart", wrosound2: "impart",
  rewiry1: "rewiry", rewiry2: "rewiry", gogol: "a2", mrozu: "hala", kizo: "hala",
};

// ── Freshness deadline ────────────────────────────────────────────────────────
// The verified listings above are hand-researched and cover a fixed window. There
// is no free city-wide events API to keep them current (Ticketmaster needs a key;
// Bandsintown is artist-only), so past this date the calendar falls back to the
// venues' *typical* patterns + annual anchors only. `seedFreshness` lets the app
// warn the driver when that has happened, rather than pretending the seed is live.
export const VERIFIED_THROUGH = at(2026, 8, 31, 23, 59);

export interface SeedFreshness {
  verifiedThrough: number;
  stale: boolean;
  daysPast: number;
}

export function seedFreshness(now = new Date()): SeedFreshness {
  const ms = now.getTime();
  const stale = ms > VERIFIED_THROUGH;
  return {
    verifiedThrough: VERIFIED_THROUGH,
    stale,
    daysPast: stale ? Math.floor((ms - VERIFIED_THROUGH) / 86_400_000) : 0,
  };
}

// ── Annual anchors ────────────────────────────────────────────────────────────
// Marquee Wrocław events that recur on roughly the same date every year. Emitting
// them from the recurring generator (below) means a multi-year lookahead still
// surfaces the big festivals — labeled "typical", since the exact 2027+ dates
// aren't confirmed — instead of only weekly opera/philharmonic patterns.
interface AnnualAnchor {
  key: string;
  venueId: string;
  title: string;
  month: number;
  day: number;
  hour: number;
  durationMin: number;
  crowd: 1 | 2 | 3;
  kind: EventKind;
}
const ANNUAL_ANCHORS: AnnualAnchor[] = [
  { key: "wrosound", venueId: "impart", title: "WROsound Festival", month: 7, day: 17, hour: 16, durationMin: 420, crowd: 2, kind: "festival" },
  { key: "rewiry", venueId: "rewiry", title: "Czarne Rewiry Festival", month: 7, day: 24, hour: 17, durationMin: 360, crowd: 1, kind: "festival" },
  { key: "nye", venueId: "impart", title: "New Year's Eve city crowd", month: 12, day: 31, hour: 22, durationMin: 180, crowd: 3, kind: "festival" },
  { key: "newyear", venueId: "hala", title: "New Year's concert", month: 1, day: 1, hour: 18, durationMin: 120, crowd: 2, kind: "concert" },
];

const OPERA_TITLES = ["Carmen", "La Traviata", "Nabucco", "Halka", "Straszny dwór", "Eugeniusz Oniegin"];
const NFM_TITLES = ["NFM Filharmonia Wrocławska", "Wieczór kameralny", "Jazz w NFM", "Recital organowy", "Lutosławski Quartet"];

const dayOfYear = (d: Date) =>
  Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86_400_000);

/** The venue's typical recurring schedule for one calendar day (deterministic). */
function recurringFor(day: Date): VenueEvent[] {
  const y = day.getFullYear();
  const mo = day.getMonth() + 1;
  const d = day.getDate();
  const dow = day.getDay(); // 0 = Sunday
  const doy = dayOfYear(day);
  const out: VenueEvent[] = [];

  // Zoo: closes 19:00 in summer season (Apr–Sep), 16:00 off-season. The last
  // hour is a steady family exodus — small but reliable, bigger on weekends.
  const summer = mo >= 4 && mo <= 9;
  out.push({
    id: `zoo-${y}${mo}${d}`,
    venue: byId.zoo,
    title: "Zoo closing wave",
    startMs: at(y, mo, d, summer ? 18 : 15, 15),
    durationMin: 45,
    crowd: dow === 0 || dow === 6 ? 2 : 1,
    kind: "family",
    verified: false,
  });

  // Opera repertoire: Tue/Thu/Fri/Sat 19:00, Sunday 17:00 matinee.
  if ([2, 4, 5, 6].includes(dow) || dow === 0) {
    out.push({
      id: `opera-${y}${mo}${d}`,
      venue: byId.opera,
      title: OPERA_TITLES[doy % OPERA_TITLES.length],
      startMs: at(y, mo, d, dow === 0 ? 17 : 19),
      durationMin: 165,
      crowd: 2,
      kind: "opera",
      verified: false,
    });
  }

  // NFM concert calendar: Wed/Fri 19:00, Sat 18:00.
  if ([3, 5, 6].includes(dow)) {
    out.push({
      id: `nfm-${y}${mo}${d}`,
      venue: byId.nfm,
      title: NFM_TITLES[doy % NFM_TITLES.length],
      startMs: at(y, mo, d, dow === 6 ? 18 : 19),
      durationMin: 120,
      crowd: 2,
      kind: "concert",
      verified: false,
    });
  }

  // Ekstraklasa home match: every other Sunday 17:30 during the season (Jul–Nov, Feb–May).
  const season = (mo >= 7 && mo <= 11) || (mo >= 2 && mo <= 5);
  if (dow === 0 && season && Math.floor(doy / 7) % 2 === 0) {
    out.push({
      id: `arena-${y}${mo}${d}`,
      venue: byId.arena,
      title: "Śląsk Wrocław — home match",
      startMs: at(y, mo, d, 17, 30),
      durationMin: 135,
      crowd: 3,
      kind: "sport",
      verified: false,
    });
  }

  // Annual marquee anchors (festivals etc.) so a multi-year lookahead keeps the big
  // crowd nights, not just the weekly patterns.
  for (const a of ANNUAL_ANCHORS) {
    if (a.month === mo && a.day === d) {
      out.push({
        id: `${a.key}-${y}`,
        venue: byId[a.venueId],
        title: a.title,
        startMs: at(y, mo, d, a.hour),
        durationMin: a.durationMin,
        crowd: a.crowd,
        kind: a.kind,
        verified: false,
      });
    }
  }

  return out;
}

/**
 * Every event whose let-out falls inside [now − 1h, now + days]. Verified
 * listings first when they collide with a typical slot at the same venue.
 */
/** Two events at the same venue within 6 h are treated as the same show. */
const sameShow = (list: VenueEvent[], e: VenueEvent) =>
  list.some((r) => r.venue.id === e.venue.id && Math.abs(r.startMs - e.startMs) < 6 * 3_600_000);

/**
 * Every event whose let-out falls inside [now − 1h, now + days], merged by
 * provenance: live (Ticketmaster) wins over a seeded listing, which wins over the
 * venue's typical pattern — so a real announcement always replaces a guess.
 */
export function upcomingEvents(now: Date, days = 14, live: VenueEvent[] = []): VenueEvent[] {
  const from = now.getTime() - 3_600_000;
  const to = now.getTime() + days * 86_400_000;
  const inWindow = (e: VenueEvent) => letOutMs(e) >= from && e.startMs <= to;

  const out: VenueEvent[] = live.filter(inWindow).map((e) => ({ ...e, source: "live" as const }));

  const listings = REAL_EVENTS.map((e) => ({ ...e, venue: byId[REAL_VENUE[e.id]], source: "listing" as const }));
  for (const e of listings) {
    if (inWindow(e) && !sameShow(out, e)) out.push(e);
  }

  for (let i = 0; i <= days; i++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    for (const e of recurringFor(day)) {
      if (inWindow(e) && !sameShow(out, e)) out.push({ ...e, source: "typical" as const });
    }
  }

  return out.sort((a, b) => a.startMs - b.startMs);
}

// Crowd size → surge multiplier applied to the venue zone's EpH at let-out time.
const CROWD_SURGE: Record<VenueEvent["crowd"], number> = { 1: 1.2, 2: 1.45, 3: 1.7 };
export const CROWD_LABEL: Record<VenueEvent["crowd"], string> = { 1: "small", 2: "big", 3: "huge" };

/** Expected net zł/hr near the venue right as the crowd walks out. */
export function letOutEph(e: VenueEvent): number {
  return zoneEph(e.venue.zone, new Date(letOutMs(e)), CROWD_SURGE[e.crowd]);
}

export interface EventSignal {
  id: string;
  kind: "events";
  title: string;
  detail: string;
  zone: string;
  etaMin: number;
  eph: number;
  distKm: number;
}

const hhmm = (ms: number) => {
  const d = new Date(ms);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
};

/**
 * Let-outs close enough to position for (next 3 h, or spilling out right now) as
 * live demand signals — merged into the Home "Opportunities" feed.
 */
export function eventSignals(now: Date, position: Place, events?: VenueEvent[]): EventSignal[] {
  const evs = events ?? upcomingEvents(now, 1);
  const nowMs = now.getTime();
  return evs
    .filter((e) => {
      const out = letOutMs(e);
      return out >= nowMs - 20 * 60_000 && out <= nowMs + 180 * 60_000;
    })
    .slice(0, 3)
    .map((e) => {
      const out = letOutMs(e);
      const v = e.venue;
      return {
        id: `ev-${e.id}`,
        kind: "events" as const,
        title: `${v.short} let-out`,
        detail: `${e.title} ends ~${hhmm(out)} · ${CROWD_LABEL[e.crowd]} crowd`,
        zone: v.zone,
        etaMin: Math.max(1, Math.round((out - nowMs) / 60_000)),
        eph: letOutEph(e),
        distKm: Math.round(roadKm(position, v) * 10) / 10, // Venue is Place-shaped
      };
    });
}

// ─── Phone-calendar export (.ics / native insert) ─────────────────────────────

const pad = (n: number) => n.toString().padStart(2, "0");

/** UTC basic format an .ics file wants: 20260713T170000Z */
function icsUtc(ms: number): string {
  const d = new Date(ms);
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`
  );
}

const icsEscape = (s: string) => s.replace(/\\/g, "\\\\").replace(/[,;]/g, (m) => `\\${m}`);

/** The calendar block a driver actually wants: the positioning window, not the show. */
export function eventCalendarEntry(e: VenueEvent) {
  const out = letOutMs(e);
  return {
    title: `🚗 ${e.venue.short} let-out — ${e.title}`,
    beginMs: out - 30 * 60_000, // be in position half an hour before doors open outward
    endMs: out + 45 * 60_000,
    location: `${e.venue.name}, Wrocław`,
    notes:
      `${e.title} ends ~${hhmm(out)} at ${e.venue.name}. ` +
      `${CROWD_LABEL[e.crowd]} crowd expected — position nearby by ${hhmm(out - 30 * 60_000)}. ` +
      `(Farely driver assistant)`,
  };
}

function vevent(e: VenueEvent, stampMs: number): string[] {
  const c = eventCalendarEntry(e);
  return [
    "BEGIN:VEVENT",
    `UID:farely-${e.id}@farely.app`,
    `DTSTAMP:${icsUtc(stampMs)}`,
    `DTSTART:${icsUtc(c.beginMs)}`,
    `DTEND:${icsUtc(c.endMs)}`,
    `SUMMARY:${icsEscape(c.title)}`,
    `LOCATION:${icsEscape(c.location)}`,
    `DESCRIPTION:${icsEscape(c.notes)}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT15M",
    "ACTION:DISPLAY",
    `DESCRIPTION:${icsEscape(`Head towards ${e.venue.short} — let-out soon`)}`,
    "END:VALARM",
    "END:VEVENT",
  ];
}

/** One event (or a whole day) as a standards-compliant VCALENDAR. */
export function eventsToIcs(events: VenueEvent[], nowMs = Date.now()): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Farely//Driver Events//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...events.flatMap((e) => vevent(e, nowMs)),
    "END:VCALENDAR",
  ].join("\r\n");
}

/** Browser path: hand the .ics to the OS via a download. */
export function downloadIcs(filename: string, ics: string) {
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
