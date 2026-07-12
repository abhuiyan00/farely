// ─── Map (two rendering tiers) ────────────────────────────────────────────────
// FULL: MapLibre GL + OpenFreeMap vector tiles (free, no key) — the real
// Wrocław street grid like the Uber/Bolt driver apps. The GL engine is
// dynamic-imported so potato phones never even parse it.
// LITE: a flat DOM/SVG projection of the same data (zone heat, zł/hr pills,
// driver, route) — no WebGL, no tile fetch, no animation. This is what
// low-RAM devices get automatically (see lib/device.ts).
// Both tiers render identical information; only the paint budget differs.

import { useEffect, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Map as MLMap, Marker, GeoJSONSource, LngLatBounds } from "maplibre-gl";
import type { Place, ZoneSignal } from "../lib/engine";
import { T, MONO, SANS } from "../lib/theme";

const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

// Load the GL engine at most once, and only when a full-tier map mounts.
let glModule: Promise<typeof import("maplibre-gl")> | null = null;
const loadGl = () => (glModule ??= import("maplibre-gl"));

// MapLibre's control container defaults to z-index 2, which would paint the
// attribution over our cards/sheets (they sit at z-index 2+ as siblings).
if (typeof document !== "undefined" && !document.getElementById("farely-map-css")) {
  const s = document.createElement("style");
  s.id = "farely-map-css";
  s.textContent = `.maplibregl-control-container .maplibregl-ctrl-bottom-right,
.maplibregl-control-container .maplibregl-ctrl-bottom-left { z-index: 1; }`;
  document.head.appendChild(s);
}

export interface RouteSpec {
  from: Place;
  to: Place;
  driver: Place;
}

interface Props {
  center: [number, number]; // [lng, lat]
  zoom?: number;
  driver: Place;
  zones?: ZoneSignal[];
  target?: number;
  route?: RouteSpec | null;
  interactive?: boolean;
  lite?: boolean;
}

function ephColor(eph: number, target: number): string {
  if (eph >= target) return T.accept;
  if (eph >= target * 0.85) return T.marginal;
  return T.decline;
}

/** Quadratic-bezier arc between two points — reads as a "route" without routing. */
function arc(a: [number, number], b: [number, number], bend = 0.18): [number, number][] {
  const mx = (a[0] + b[0]) / 2;
  const my = (a[1] + b[1]) / 2;
  // perpendicular offset for the control point
  const cx = mx - (b[1] - a[1]) * bend;
  const cy = my + (b[0] - a[0]) * bend;
  const pts: [number, number][] = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    const x = (1 - t) ** 2 * a[0] + 2 * (1 - t) * t * cx + t ** 2 * b[0];
    const y = (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * cy + t ** 2 * b[1];
    pts.push([x, y]);
  }
  return pts;
}

const CAR_SVG = `<svg width="34" height="34" viewBox="0 0 34 34" xmlns="http://www.w3.org/2000/svg">
  <circle cx="17" cy="17" r="15" fill="#111318" stroke="#ffffff" stroke-width="2.5"/>
  <path d="M17 8.5 L23 22 L17 18.6 L11 22 Z" fill="#ffffff"/>
</svg>`;

export default function MapView(props: Props) {
  return props.lite ? <LiteMap {...props} /> : <GlMap {...props} />;
}

// ─── LITE tier: DOM/SVG equirectangular projection, zero WebGL ────────────────

// Fixed frame that covers every engine place + venue with margin.
const B = { w: 16.84, e: 17.13, s: 51.05, n: 51.175 };
const px = (lng: number) => ((lng - B.w) / (B.e - B.w)) * 100;
const py = (lat: number) => ((B.n - lat) / (B.n - B.s)) * 100;

function LiteMap({ driver, zones, target = 60, route }: Props) {
  const pt = (p: { lat: number; lng: number }): [number, number] => [px(p.lng), py(p.lat)];

  return (
    <div
      aria-label="Live Wrocław map (lite)"
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        background:
          `repeating-linear-gradient(0deg, transparent 0 23px, rgba(22,24,29,0.045) 23px 24px),` +
          `repeating-linear-gradient(90deg, transparent 0 23px, rgba(22,24,29,0.045) 23px 24px), ${T.mapFallback}`,
      }}
    >
      {/* zone heat blobs */}
      {zones?.map((z) => {
        const col = ephColor(z.eph, target);
        const r = 26 + z.heat * 46;
        const [x, y] = pt(z);
        return (
          <div
            key={`blob-${z.zone}`}
            style={{
              position: "absolute",
              left: `${x}%`,
              top: `${y}%`,
              width: r * 2,
              height: r * 2,
              marginLeft: -r,
              marginTop: -r,
              borderRadius: "50%",
              background: `radial-gradient(circle, ${col}44 0%, ${col}18 55%, transparent 72%)`,
              pointerEvents: "none",
            }}
          />
        );
      })}

      {/* route (dashed deadhead + solid trip) */}
      {route && (
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
        >
          <polyline
            points={[pt(route.driver), pt(route.from)].map(([x, y]) => `${x},${y}`).join(" ")}
            fill="none"
            stroke="#9aa3ad"
            strokeWidth="0.7"
            strokeDasharray="1.4 1.6"
            vectorEffect="non-scaling-stroke"
            strokeLinecap="round"
          />
          <polyline
            points={arc(pt(route.from), pt(route.to))
              .map(([x, y]) => `${x},${y}`)
              .join(" ")}
            fill="none"
            stroke="#2f56d6"
            strokeWidth="1.1"
            vectorEffect="non-scaling-stroke"
            strokeLinecap="round"
          />
          <circle cx={pt(route.from)[0]} cy={pt(route.from)[1]} r="1.4" fill={T.green} stroke="#fff" strokeWidth="0.5" />
          <rect x={pt(route.to)[0] - 1.2} y={pt(route.to)[1] - 1.2} width="2.4" height="2.4" fill={T.black} stroke="#fff" strokeWidth="0.5" />
        </svg>
      )}

      {/* zł/hr pills */}
      {zones?.map((z) => {
        const col = ephColor(z.eph, target);
        const [x, y] = pt(z);
        return (
          <div
            key={`pill-${z.zone}`}
            style={{
              position: "absolute",
              left: `${x}%`,
              top: `${y}%`,
              transform: "translate(-50%, -100%)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                background: col,
                color: "#fff",
                padding: "3px 9px",
                borderRadius: 999,
                fontFamily: MONO,
                fontSize: 11,
                fontWeight: 600,
                whiteSpace: "nowrap",
                boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
              }}
            >
              {z.eph} zł/h
            </div>
            <div
              style={{
                fontFamily: SANS,
                fontSize: 9,
                fontWeight: 600,
                color: "rgba(22,24,29,0.65)",
                textShadow: "0 1px 2px #fff",
                marginTop: 2,
              }}
            >
              {z.name}
            </div>
          </div>
        );
      })}

      {/* driver */}
      <div
        style={{
          position: "absolute",
          left: `${px(driver.lng)}%`,
          top: `${py(driver.lat)}%`,
          transform: "translate(-50%, -50%)",
          filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.35))",
        }}
        dangerouslySetInnerHTML={{ __html: CAR_SVG }}
      />

      <div
        style={{
          position: "absolute",
          right: 6,
          bottom: 4,
          fontFamily: MONO,
          fontSize: 8.5,
          color: T.ink4,
        }}
      >
        LITE MAP · © OpenStreetMap
      </div>
    </div>
  );
}

// ─── FULL tier: MapLibre GL (dynamic import) ──────────────────────────────────

function GlMap({ center, zoom = 12, driver, zones, target = 60, route, interactive = true }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const glRef = useRef<typeof import("maplibre-gl") | null>(null);
  const [ready, setReady] = useState(false);
  const zoneMarkersRef = useRef<Marker[]>([]);
  const routeMarkersRef = useRef<Marker[]>([]);
  const driverMarkerRef = useRef<Marker | null>(null);

  // init once (after the GL engine arrives)
  useEffect(() => {
    let cancelled = false;
    let ro: ResizeObserver | undefined;

    loadGl().then((mod) => {
      const gl = (mod as { default?: typeof import("maplibre-gl") }).default ?? mod;
      if (cancelled || !containerRef.current || mapRef.current) return;
      glRef.current = gl;

      const map = new gl.Map({
        container: containerRef.current,
        style: STYLE_URL,
        center,
        zoom,
        attributionControl: { compact: true },
        interactive,
      });
      map.on("load", () => {
        if (!cancelled) setReady(true);
      });
      map.on("error", () => {
        /* offline tiles — flat backdrop + DOM markers still work */
      });
      mapRef.current = map;

      const el = document.createElement("div");
      el.innerHTML = CAR_SVG;
      el.style.filter = "drop-shadow(0 2px 4px rgba(0,0,0,0.35))";
      driverMarkerRef.current = new gl.Marker({ element: el })
        .setLngLat([driver.lng, driver.lat])
        .addTo(map);

      ro = new ResizeObserver(() => map.resize());
      ro.observe(containerRef.current);
    });

    return () => {
      cancelled = true;
      ro?.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // driver position
  useEffect(() => {
    driverMarkerRef.current?.setLngLat([driver.lng, driver.lat]);
    if (!route && mapRef.current) {
      mapRef.current.easeTo({ center: [driver.lng, driver.lat], duration: 800 });
    }
  }, [driver.lng, driver.lat, route]);

  // demand zones: heat blobs (circle layer) + zł/hr pills (DOM markers)
  useEffect(() => {
    const map = mapRef.current;
    const gl = glRef.current;

    zoneMarkersRef.current.forEach((m) => m.remove());
    zoneMarkersRef.current = [];
    if (!map || !gl || !zones || zones.length === 0) return;

    for (const z of zones) {
      const col = ephColor(z.eph, target);
      const el = document.createElement("div");
      el.style.cssText = `display:flex;align-items:center;gap:4px;background:${col};color:#fff;` +
        `padding:3px 9px;border-radius:999px;font-family:${MONO};font-size:11px;font-weight:600;` +
        `box-shadow:0 2px 8px rgba(0,0,0,0.25);white-space:nowrap;`;
      el.textContent = `${z.eph} zł/h`;
      const label = document.createElement("div");
      label.style.cssText = `text-align:center;font-family:${SANS};font-size:9px;font-weight:600;` +
        `color:rgba(22,24,29,0.65);text-shadow:0 1px 2px #fff;margin-top:2px;`;
      label.textContent = z.name;
      const wrap = document.createElement("div");
      wrap.style.cssText = "display:flex;flex-direction:column;align-items:center;";
      wrap.appendChild(el);
      wrap.appendChild(label);
      // anchored above the point so the pill never covers the driver marker
      zoneMarkersRef.current.push(
        new gl.Marker({ element: wrap, anchor: "bottom", offset: [0, -14] })
          .setLngLat([z.lng, z.lat])
          .addTo(map),
      );
    }

    if (!ready) return;
    const fc = {
      type: "FeatureCollection" as const,
      features: zones.map((z) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [z.lng, z.lat] },
        properties: { heat: z.heat, color: ephColor(z.eph, target) },
      })),
    };
    const src = map.getSource("farely-zones") as GeoJSONSource | undefined;
    if (src) {
      src.setData(fc);
    } else {
      map.addSource("farely-zones", { type: "geojson", data: fc });
      map.addLayer({
        id: "farely-zone-heat",
        type: "circle",
        source: "farely-zones",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["get", "heat"], 0, 26, 1, 72],
          "circle-color": ["get", "color"],
          "circle-opacity": 0.18,
          "circle-blur": 0.65,
        },
      });
    }
  }, [zones, target, ready]);

  // offer route
  useEffect(() => {
    const map = mapRef.current;
    const gl = glRef.current;

    routeMarkersRef.current.forEach((m) => m.remove());
    routeMarkersRef.current = [];
    if (!map || !gl) return;

    const clearLayers = () => {
      for (const id of ["farely-trip", "farely-deadhead"]) {
        if (map.getLayer(id)) map.removeLayer(id);
      }
      if (map.getSource("farely-route")) map.removeSource("farely-route");
    };

    if (!route) {
      if (ready) clearLayers();
      return;
    }

    // pickup / dropoff DOM markers (Bolt style: green dot, dark pin)
    const mk = (html: string) => {
      const el = document.createElement("div");
      el.innerHTML = html;
      return el;
    };
    routeMarkersRef.current.push(
      new gl.Marker({
        element: mk(
          `<div style="width:16px;height:16px;border-radius:50%;background:${T.green};border:3px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,0.3)"></div>`,
        ),
      })
        .setLngLat([route.from.lng, route.from.lat])
        .addTo(map),
      new gl.Marker({
        element: mk(
          `<div style="width:16px;height:16px;background:${T.black};border:3px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,0.3)"></div>`,
        ),
      })
        .setLngLat([route.to.lng, route.to.lat])
        .addTo(map),
    );

    if (ready) {
      clearLayers();
      const trip = arc([route.from.lng, route.from.lat], [route.to.lng, route.to.lat]);
      const dead = [
        [route.driver.lng, route.driver.lat],
        [route.from.lng, route.from.lat],
      ] as [number, number][];
      map.addSource("farely-route", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [
            { type: "Feature", geometry: { type: "LineString", coordinates: dead }, properties: { kind: "dead" } },
            { type: "Feature", geometry: { type: "LineString", coordinates: trip }, properties: { kind: "trip" } },
          ],
        },
      });
      map.addLayer({
        id: "farely-deadhead",
        type: "line",
        source: "farely-route",
        filter: ["==", ["get", "kind"], "dead"],
        paint: { "line-color": "#9aa3ad", "line-width": 3.5, "line-dasharray": [1.2, 1.6] },
      });
      map.addLayer({
        id: "farely-trip",
        type: "line",
        source: "farely-route",
        filter: ["==", ["get", "kind"], "trip"],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#2f56d6", "line-width": 5.5 },
      });
    }

    const b: LngLatBounds = new gl.LngLatBounds();
    for (const p of [route.from, route.to, route.driver]) b.extend([p.lng, p.lat]);
    map.fitBounds(b, { padding: { top: 90, bottom: 320, left: 60, right: 60 }, duration: 700, maxZoom: 14.5 });
  }, [route, ready]);

  return (
    <div
      ref={containerRef}
      style={{ position: "absolute", inset: 0, background: T.mapFallback }}
      aria-label="Live Wrocław map"
    />
  );
}
