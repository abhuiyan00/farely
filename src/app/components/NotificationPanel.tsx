// ─── Farely's own notification feed ───────────────────────────────────────────
// The app's internal notification center: autopilot actions, zone drops, venue
// let-outs, ID checks. Kept deliberately quiet (NN/g: over-notifying kills
// trust) — only state changes the driver would otherwise miss land here. On
// Android the same notices also go out through Farely's notification channel.

import { useEffect } from "react";
import { X, Repeat, MapPin, CalendarDays, ShieldCheck, Info, BellOff } from "lucide-react";
import { useSession, type Notice, type NoticeKind } from "../lib/session";
import { T, SANS, MONO } from "../lib/theme";

const KIND_META: Record<NoticeKind, { icon: React.ReactNode; color: string; bg: string }> = {
  coord: { icon: <Repeat size={15} />, color: T.blue, bg: T.blueBg },
  zone: { icon: <MapPin size={15} />, color: T.marginal, bg: T.marginalBg },
  event: { icon: <CalendarDays size={15} />, color: T.green, bg: T.greenBg },
  idcheck: { icon: <ShieldCheck size={15} />, color: "#8b5cf6", bg: "#f1ecfe" },
  system: { icon: <Info size={15} />, color: T.ink2, bg: T.bg },
};

const timeOf = (n: Notice) => {
  const d = new Date(n.ts);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
};

export default function NotificationPanel({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useSession();

  // Opening the panel is reading it.
  useEffect(() => {
    dispatch({ type: "NOTICES_SEEN" });
  }, [dispatch]);

  return (
    <div
      role="dialog"
      aria-label="Notifications"
      style={{ position: "absolute", inset: 0, zIndex: 65, background: "rgba(16,18,23,0.45)", fontFamily: SANS }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "absolute",
          top: "calc(env(safe-area-inset-top, 0px) + 10px)",
          left: 10,
          right: 10,
          maxHeight: "72%",
          background: T.card,
          borderRadius: 18,
          boxShadow: T.shadow,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 16px 10px" }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: T.ink }}>Notifications</span>
          <span style={{ fontFamily: MONO, fontSize: 11, color: T.ink3 }}>{state.notices.length}</span>
          {state.notices.length > 0 && (
            <button
              onClick={() => dispatch({ type: "CLEAR_NOTICES" })}
              style={{ marginLeft: "auto", border: "none", background: "none", color: T.ink3, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: SANS }}
            >
              Clear all
            </button>
          )}
          <button
            onClick={onClose}
            aria-label="Close notifications"
            style={{ marginLeft: state.notices.length > 0 ? 4 : "auto", border: "none", background: T.bg, borderRadius: "50%", width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: T.ink2 }}
          >
            <X size={16} />
          </button>
        </div>

        {state.notices.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "34px 0 40px", color: T.ink3 }}>
            <BellOff size={22} />
            <span style={{ fontSize: 12.5 }}>Quiet for now — that's on purpose.</span>
          </div>
        ) : (
          <div style={{ overflowY: "auto", padding: "0 10px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
            {state.notices.map((n) => {
              const meta = KIND_META[n.kind];
              const unread = n.ts > state.noticesReadAt;
              return (
                <div key={n.id} style={{ display: "flex", gap: 10, padding: "10px 10px", borderRadius: 12, background: unread ? T.bg : "transparent" }}>
                  <div style={{ width: 32, height: 32, borderRadius: 10, background: meta.bg, color: meta.color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {meta.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{n.title}</span>
                      <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 10.5, color: T.ink4, flexShrink: 0 }}>{timeOf(n)}</span>
                    </div>
                    {n.body && <div style={{ fontSize: 11.5, color: T.ink2, marginTop: 2 }}>{n.body}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
