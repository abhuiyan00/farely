// ─── Platform ID check (face verification passthrough) ───────────────────────
// Uber's Real-Time ID Check / Bolt's selfie verification can fire any time.
// The rule is absolute: when a platform wants a face photo, it gets the whole
// phone. Farely hides its overlay, freezes every autopilot action, blocks
// nothing — and *says so* (NN/g: automation earns trust by explaining itself).
// On the web this renders a demo of that moment; on device the real camera UI
// is in front and this card only reports Farely's stand-down state.

import { ShieldCheck, Camera, PauseCircle, EyeOff } from "lucide-react";
import type { Platform } from "../lib/engine";
import { T, SANS, MONO } from "../lib/theme";

interface Props {
  platform: Platform;
  isNative: boolean;
  onDone: () => void;
}

export default function IdCheckOverlay({ platform, isNative, onDone }: Props) {
  return (
    <div
      role="dialog"
      aria-label={`${platform} identity check in progress`}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 70,
        background: "rgba(16,18,23,0.78)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 22,
        fontFamily: SANS,
      }}
    >
      <div style={{ width: "100%", maxWidth: 340, background: T.card, borderRadius: 20, overflow: "hidden", boxShadow: T.shadow }}>
        <div style={{ padding: "16px 18px 12px", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ padding: "3px 10px", borderRadius: 8, background: T.black, color: "#fff", fontSize: 12, fontWeight: 800 }}>
            {platform}
          </span>
          <span style={{ fontSize: 15, fontWeight: 800, color: T.ink }}>Identity check</span>
          <ShieldCheck size={18} color={T.green} style={{ marginLeft: "auto" }} />
        </div>

        {/* the platform's camera moment — Farely draws nothing over it */}
        {!isNative && (
          <div
            style={{
              margin: "0 18px",
              borderRadius: 14,
              background: "#101318",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              padding: "26px 0",
            }}
          >
            <div
              style={{
                width: 108,
                height: 132,
                borderRadius: "50% 50% 46% 46%",
                border: "2.5px dashed rgba(255,255,255,0.45)",
              }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: "rgba(255,255,255,0.75)", fontSize: 12, fontWeight: 600 }}>
              <Camera size={14} /> {platform} camera — take a selfie to continue
            </div>
          </div>
        )}

        {/* what Farely did about it, stated plainly */}
        <div style={{ padding: "14px 18px 6px", display: "flex", flexDirection: "column", gap: 9 }}>
          {[
            { icon: <EyeOff size={15} />, text: "Overlay hidden — nothing sits over the camera" },
            { icon: <PauseCircle size={15} />, text: "Autopilot frozen — no taps, no app switches" },
            { icon: <ShieldCheck size={15} />, text: "Verification passes straight through to " + platform },
          ].map((r) => (
            <div key={r.text} style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12.5, color: T.ink2 }}>
              <span style={{ color: T.green, display: "flex" }}>{r.icon}</span>
              {r.text}
            </div>
          ))}
        </div>

        <div style={{ padding: 16 }}>
          {isNative ? (
            <div style={{ textAlign: "center", fontFamily: MONO, fontSize: 11.5, color: T.ink3 }}>
              waiting for {platform} to finish…
            </div>
          ) : (
            <button
              onClick={onDone}
              style={{
                width: "100%",
                padding: "14px 0",
                borderRadius: 13,
                border: "none",
                cursor: "pointer",
                background: T.green,
                color: "#fff",
                fontSize: 15,
                fontWeight: 800,
                fontFamily: SANS,
              }}
            >
              Verification finished
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
