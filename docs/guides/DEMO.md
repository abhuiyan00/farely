# Farely — Web Demo Guide

Run the full Farely experience in a browser in under two minutes — no phone, no
Android SDK. The web build is a **live simulation**: realistic Wrocław offers are
generated, scored by the real cost engine, and every accept/decline feeds the same
shared state the APK uses.

> Want it on a device instead? See [ANDROID-INSTALL.md](ANDROID-INSTALL.md) (real
> phone) or [EMULATOR.md](EMULATOR.md) (virtual phone).

---

## 1 · Start the demo

**Option A — one click (Windows):** double-click **`Open-Farely.bat`** in the repo
root. A terminal opens, the dev server starts, and your browser opens automatically.
Keep the terminal window open; close it to stop.

**Option B — command line:**

```bash
# from the repo root (first time only)
pnpm install        # or: npm install

npm run dev         # → http://localhost:5173 opens automatically
```

On a desktop-sized window the app renders inside a phone frame; below ~640 px wide
(or on a real device) it goes full-bleed.

## 2 · A guided tour (5 minutes)

Follow this once and you have seen every feature:

1. **Home (map)** — the real Wrocław street map with demand zones as colored
   `zł/h` pills: **green** clears your hourly target, **amber** is close, **red**
   is below it. Your car is the black arrow. The bottom sheet shows today's net,
   net zł/h, trips, acceptance, plus *Opportunities* (flight waves, last trains,
   event let-outs) and a *move suggestion* when leaving your zone is worth it.
2. **Wait ~5 seconds** — an offer pops up Bolt-style: route on the map, big **NET**
   price (fare minus fuel, wear and deadhead), an ACCEPT/MARGINAL/DECLINE verdict
   with a one-line reason, and per-hour / per-km / per-minute rates. **Accept** it —
   your position moves to the dropoff and the earnings chip updates. **Decline**
   the next one — the self-tuning threshold nudges accordingly.
3. **Rides** — every scored offer lands here with its outcome badge and the verdict
   it was given. Filter All / Completed / Skipped. The undo chip (top-left of Home)
   reverts the last decision.
4. **Car** — type any car, e.g. `skoda octavia` + year `2019`, and tap a result:
   consumption, fuel type, fuel price, and age-based wear costs are filled in
   automatically. Try `toyota prius` + `2012` to see live per-trim EPA data.
   Details in step 3 below.
5. **Settings** — set your **net zł/h target** (default 63). Watch verdict colors
   shift on the next offers: the whole app re-scores against your number. Toggle
   platforms (Uber/Bolt/FreeNow) to change which apps the simulator draws from.
6. **Go offline** (orange pill) — the offer stream stops; go online to resume.
   Useful while you edit settings.

## 3 · Car search — what to expect

| You type | Source | Result |
|---|---|---|
| `skoda octavia` · 2019 | built-in EU dataset | European-cycle L/100km (Škoda is not sold in the US, so EPA has no data) |
| `toyota prius` · 2012 | fueleconomy.gov (live) | per-trim EPA data, hybrid/plug-in detected, MPG converted to L/100km |
| anything exotic | estimator | sane consumption from fuel type + year — never an empty form |

Everything a search fills in stays **editable** under *Running costs* (fuel price,
consumption, and the advanced wear costs behind the fold).

Your car, targets, and platforms **persist** across restarts (localStorage).

## 4 · What is simulated vs. real

| Real | Simulated (web only) |
|---|---|
| Map tiles (OpenFreeMap/OSM), geography, distances | The offers themselves |
| Cost engine, verdicts, self-tuning thresholds | Trip timing (time-compressed) |
| Car data (fueleconomy.gov + EU dataset) | Rider names/ratings |
| Demand-curve shape (from open taxi datasets) | Exact zone EpH values |

On the phone, the accessibility service replaces the simulator with **real offers
read off the Bolt/Uber screen** — same engine, same UI.

## 5 · Troubleshooting

- **Blank grey map** — no internet or the tile CDN is blocked; markers and all
  logic still work. Check the browser console for blocked requests.
- **Car search says "online lookup unreachable"** — fueleconomy.gov is proxied
  through the dev server (`/fe-api`); make sure you ran `npm run dev` (the proxy
  does not exist in `npm run preview` of a static build). Built-in dataset and
  estimator still work offline.
- **Port already in use** — another dev server is running; close it or run
  `npx vite --port 5174` inside `apps/tester`.
