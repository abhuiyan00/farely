# Contributing to Farely

Farely is a private, single-driver tool, but it's built to be coherent and
demonstrable. If you're picking it up (or an AI assistant is), these are the rules
that keep it consistent.

## Setup & builds

```bash
pnpm install                      # pnpm matches the workspace design (see note below)
npm run dev                       # web UI tester → localhost:5173
npm run build                     # apps/tester/dist  (must stay green)
npm run apk                       # web build → cap copy → gradlew assembleDebug
```

There is **no** test runner, linter, or typecheck script — do not invent
`npm test`/`npm run lint`. Correctness is gated by:
- `npm run build` (web) — green, MapLibre still split into its own chunk;
- `apps/android/android/gradlew assembleDebug` — `BUILD SUCCESSFUL`;
- runtime checks in the browser / on a device.

> **pnpm vs npm:** the repo declares a pnpm workspace, so `pnpm install` places
> `@capacitor/android` under `apps/android/node_modules` where the gradle project's
> `../node_modules` reference expects it. With plain npm's hoisting you may need to
> ensure that path exists before building the APK.

## Conventions

- **Business logic is pure.** New domain logic goes in `apps/tester/src/app/lib/`
  (UI-free, side-effect-free, unit-testable). Screens read it via `useSession()` +
  `useMemo` — no hardcoded arrays.
- **`App.tsx` and screens use inline `style={{}}` + hex** with the design tokens in
  `lib/theme.ts` (`T`, `MONO`, `SANS`). Do **not** refactor them to Tailwind/shadcn.
  The shadcn set under `components/ui/` exists but is currently unused by the app.
- **Dependencies are exact-pinned** (no `^`/`~`), and `pnpm-workspace.yaml` refuses
  packages published < 7 days ago (`minimumReleaseAge: 10080`). Keep both.
- **Native Kotlin is mirrored.** The compiled source lives in
  `apps/android/android/app/src/main/java/com/farely/app/`; a reference copy lives in
  `apps/android/reference/`. Keep the two in sync when you edit native code.
- **Safety boundaries are non-negotiable** (see `docs/VISION.md`): Farely never taps
  a ride offer's Accept, and never gets between the driver and an identity/face
  check (which is never routed to cloud vision).
- **Keys and secrets never get committed.** `.gitignore` excludes `.env*` and
  keystores; user API keys live in on-device storage only.

## Commits
- Conventional, imperative subject lines; explain the *why* in the body.
- Keep the build green at each commit.
