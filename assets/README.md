# assets/

Screenshots used in the top-level [README](../README.md). Every image is a **real
capture of the running app** — the Vite web UI tester (the same pure decision engine
that ships inside the APK's WebView), driven end-to-end through a simulated Wrocław
shift with Playwright in a real browser. On desktop the app renders inside a phone
frame with a "live simulation · Wrocław" label; nothing here is a mockup or a staged
render.

| File | Screen | Notes |
|---|---|---|
| `offer-verdict.jpg` | Offer overlay | The README hero — a live offer scored ACCEPT/MARGINAL/DECLINE with net-in-pocket, zł/h·zł/km·zł/min, and the accept timer. |
| `home-map.jpg` | Home | Live Wrocław demand map, zone zł/h pills, position, today's net/acceptance. |
| `events.jpg` | Events | Venue let-outs with crowd size, let-out time, distance, and expected zł/h. |
| `earnings.jpg` | Rides | Every offer scored this session — taken or skipped — with its verdict. |
| `settings.jpg` | Settings | Earnings targets + income-tax normalization + platform toggles. |
| `id-check.jpg` | Safety | A platform ID/face check freezing all automation. |

Capture settings: desktop phone-frame view, downscaled to 1080px wide, progressive
JPEG q90. Re-shoot by running the tester (`npm run dev`) and driving it with Playwright.
