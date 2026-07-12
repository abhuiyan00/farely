package com.farely.app

import android.accessibilityservice.AccessibilityService
import android.content.Context
import android.content.Intent
import android.util.Log
import android.view.accessibility.AccessibilityNodeInfo

/**
 * The on-device half of lib/coordinator.ts — the Mystro chore-runner. Watches
 * what the real Bolt/Uber/FreeNow apps are doing and keeps the "one active trip
 * per active app" rule for the driver:
 *
 *   • accepted a ride on app A  → tap the "pause / go offline" control in B & C
 *   • that trip ended           → tap "resume / go online" in B & C
 *   • an app needs the driver    → bring it to the front (launch intent)
 *
 * Detection is text-heuristic over the accessibility node tree (same tree the
 * offer parser reads) and every tap is best-effort: a control we can't find is
 * skipped, never forced. Farely still NEVER taps Accept — that's the human.
 *
 * IDENTITY CHECKS ARE SACRED. The moment a target app shows a face/selfie
 * verification screen, `frozen` goes true: no taps, no switches, and the verdict
 * overlay is pulled. Farely must never sit between the driver and that camera.
 *
 * All UI actions marshal onto the accessibility service. Mirrors the deterministic
 * transitions in lib/coordinator.ts so web sim and device can't drift.
 */
object MultiAppCoordinator {

    private const val TAG = "FarelyCoord"

    data class Settings(
        val autoPause: Boolean = true,
        val autoResume: Boolean = true,
        val autoSwitch: Boolean = true,
        val allowIdCheck: Boolean = true,
    )

    @Volatile private var settings = Settings()

    // Per-platform activity, mirroring AppActivity in coordinator.ts.
    enum class Activity { ACTIVE, PAUSED, ON_TRIP, VERIFYING, OFFLINE }

    private val activity = HashMap<String, Activity>()
    @Volatile private var verifyingPlatform: String? = null

    /** True while any target app is mid face/ID check — freezes all automation. */
    val frozen: Boolean get() = verifyingPlatform != null

    fun configure(s: Settings) { settings = s }

    // Learned per-app control selectors (Learn-controls flow): platform → role →
    // how to find the control. viewId is stable across locale; text is the
    // fallback. When taught, these beat the heuristic label/hint lists below.
    data class Selector(val viewId: String?, val text: String?)

    @Volatile private var selectors: Map<String, Map<String, Selector>> = emptyMap()

    fun configureSelectors(profile: Map<String, Map<String, Selector>>) { selectors = profile }

    private fun sel(platform: String, role: String): Selector? = selectors[platform]?.get(role)

    // Text that means "this app is verifying the driver's identity right now".
    // Kept broad and multilingual (PL/EN) — a false positive only costs us a
    // brief automation pause, a false negative could cover the camera. Bias safe.
    private val ID_CHECK_HINTS = listOf(
        "real-time id", "identity check", "verify your identity", "verify it's you",
        "take a selfie", "selfie", "photo verification", "face verification",
        "zweryfikuj", "weryfikacja", "zrób selfie", "potwierdź tożsamość", "zrób zdjęcie",
    )
    private val TRIP_HINTS = listOf(
        "navigate", "start trip", "arrived", "start ride", "en route", "drop-off",
        "nawiguj", "rozpocznij", "dojechałem", "w drodze", "zakończ przejazd",
    )
    // No ride app ships a "Pause" button — that framing was wrong. The real lever
    // for the OTHER apps is the online/offline toggle (Mystro takes them fully
    // offline on accept, back online after drop-off). "Stop new requests" is
    // Uber's & Bolt's exact in-trip menu string that halts back-to-back offers on
    // the app you're driving. EN strings below are verified against the live apps;
    // the Polish (pl-PL) strings are UNVERIFIED guesses — confirm the real on-screen
    // labels with an on-device node dump before trusting them (guessing is fragile:
    // the toggle is often an icon/pill with no matchable text at all).
    private val PAUSE_LABELS = listOf(
        "stop new requests", "go offline", "stop receiving requests", "stop orders", "offline",
        "wstrzymaj nowe zamówienia", "zakończ pracę", "wstrzymaj",
    )
    private val RESUME_LABELS = listOf(
        "go online", "resume", "start receiving requests", "take orders", "online",
        "wznów", "rozpocznij pracę", "przyjmuj zamówienia",
    )

    /**
     * Called by the accessibility service on every debounced content change from
     * a target app. Reads the current screen and advances the state machine.
     */
    fun onScreen(service: AccessibilityService, platform: String, root: AccessibilityNodeInfo?) {
        val flat = flatten(root).lowercase()

        // 1) ID check trumps everything. Union of the taught marker and the broad
        //    hint list — bias to false-positive: a needless pause beats a covered camera.
        val learnedId = sel(platform, "idCheck")
        val verifying = (learnedId != null && present(root, flat, learnedId)) ||
            ID_CHECK_HINTS.any { flat.contains(it) }
        if (verifying) {
            if (verifyingPlatform != platform) {
                verifyingPlatform = platform
                setActivity(platform, Activity.VERIFYING)
                OverlayController.hide()
                FarelyBridgePlugin.emitCoord("idCheckStart", platform,
                    "Identity check", "$platform is verifying you — automation frozen, overlay hidden.")
                Log.d(TAG, "$platform ID check → frozen")
            }
            return
        }
        if (verifyingPlatform == platform) {
            // The check screen went away → verification finished.
            verifyingPlatform = null
            setActivity(platform, Activity.ACTIVE)
            FarelyBridgePlugin.emitCoord("idCheckEnd", platform, "Verification done", null)
            Log.d(TAG, "$platform ID check cleared")
        }
        if (frozen) return // another app is still verifying — stay hands-off

        // 2) Trip in progress on this app? Prefer the taught marker, else hints.
        val learnedTrip = sel(platform, "trip")
        val onTrip = if (learnedTrip != null) present(root, flat, learnedTrip)
                     else TRIP_HINTS.any { flat.contains(it) }
        val was = activity[platform]
        if (onTrip && was != Activity.ON_TRIP) {
            setActivity(platform, Activity.ON_TRIP)
            FarelyBridgePlugin.emitCoord("accept", platform, "$platform trip started", null)
            if (settings.autoPause) pauseOthers(service, platform)
            if (settings.autoSwitch) bringToFront(service, platform)
        } else if (!onTrip && was == Activity.ON_TRIP) {
            // Trip screen gone → dropped off.
            setActivity(platform, Activity.ACTIVE)
            FarelyBridgePlugin.emitCoord("tripEnd", platform, "$platform trip finished", null)
            if (settings.autoResume) resumeAll(service)
        }
    }

    fun onServiceGone() {
        activity.clear()
        verifyingPlatform = null
    }

    // --- actions on the real apps -------------------------------------------

    private fun pauseOthers(service: AccessibilityService, active: String) {
        for (pkg in FarelyAccessibilityService.TARGET_PACKAGES.keys) {
            val name = FarelyAccessibilityService.TARGET_PACKAGES.getValue(pkg)
            if (name == active) continue
            if (activity[name] == Activity.OFFLINE) continue
            // We can only tap what's on screen; the coordinator revisits each app
            // as the driver passes through it. Emit intent regardless so the JS
            // board + notifications reflect the Mystro rule immediately.
            val tapped = clickRole(service, name, "offline", PAUSE_LABELS)
            setActivity(name, Activity.PAUSED)
            FarelyBridgePlugin.emitCoord("action", name,
                "$name paused", "You accepted on $active — $name stopped taking orders." +
                    if (tapped) "" else " (open $name once so Farely can toggle it)")
        }
    }

    private fun resumeAll(service: AccessibilityService) {
        val paused = activity.filterValues { it == Activity.PAUSED }.keys.toList()
        if (paused.isEmpty()) return
        var tapped = false
        for (name in paused) {
            if (clickRole(service, name, "online", RESUME_LABELS)) tapped = true
            setActivity(name, Activity.ACTIVE)
        }
        FarelyBridgePlugin.emitCoord("action", paused.joinToString(" & "),
            "Back online", "Trip finished — apps are taking orders again." +
                if (tapped) "" else " (tap resume in each app to confirm)")
    }

    private fun bringToFront(service: AccessibilityService, platform: String) {
        val pkg = FarelyAccessibilityService.TARGET_PACKAGES.entries.firstOrNull { it.value == platform }?.key
            ?: return
        val intent = service.packageManager.getLaunchIntentForPackage(pkg)?.apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
        } ?: return
        runCatching { service.startActivity(intent) }
            .onFailure { Log.w(TAG, "switch to $platform failed: ${it.message}") }
    }

    // --- node helpers --------------------------------------------------------

    private fun setActivity(platform: String, a: Activity) { activity[platform] = a }

    /** Is a learned control on this screen? viewId first (stable), text second. */
    private fun present(root: AccessibilityNodeInfo?, flat: String, s: Selector): Boolean {
        if (s.viewId != null && root != null) {
            val hits = root.findAccessibilityNodeInfosByViewId(s.viewId)
            if (!hits.isNullOrEmpty()) return true
        }
        if (s.text != null && flat.contains(s.text.lowercase())) return true
        return false
    }

    /**
     * Tap a control on the foreground app: the driver's learned selector for this
     * platform+role first (view-id, then its exact text), else the heuristic label
     * list. Only the active window is reachable — a control in a backgrounded app
     * is skipped (the coordinator retries as the driver passes through it; full
     * switch-to-front toggling of a background app is a separate step).
     */
    private fun clickRole(
        service: AccessibilityService,
        platform: String,
        role: String,
        fallback: List<String>,
    ): Boolean {
        val root = service.rootInActiveWindow ?: return false
        val s = sel(platform, role)
        if (s?.viewId != null) {
            root.findAccessibilityNodeInfosByViewId(s.viewId)?.forEach { node ->
                clickableAncestor(node)?.let { if (it.performAction(AccessibilityNodeInfo.ACTION_CLICK)) return true }
            }
        }
        val labels = buildList {
            s?.text?.let { add(it.lowercase()) }
            addAll(fallback)
        }
        for (label in labels) {
            root.findAccessibilityNodeInfosByText(label)?.forEach { node ->
                clickableAncestor(node)?.let { if (it.performAction(AccessibilityNodeInfo.ACTION_CLICK)) return true }
            }
        }
        return false
    }

    private fun clickableAncestor(node: AccessibilityNodeInfo?): AccessibilityNodeInfo? {
        var n = node
        var guard = 0
        while (n != null && guard++ < 8) {
            if (n.isClickable) return n
            n = n.parent
        }
        return null
    }

    private fun flatten(node: AccessibilityNodeInfo?): String {
        if (node == null) return ""
        val sb = StringBuilder()
        fun walk(n: AccessibilityNodeInfo?) {
            n ?: return
            n.text?.let { sb.append(it).append('\n') }
            n.contentDescription?.let { sb.append(it).append('\n') }
            for (i in 0 until n.childCount) walk(n.getChild(i))
        }
        walk(node)
        return sb.toString()
    }

    /** Android's own low-RAM verdict for lite mode (beats browser heuristics). */
    fun isLowRam(context: Context): Boolean {
        val am = context.getSystemService(Context.ACTIVITY_SERVICE) as android.app.ActivityManager
        return am.isLowRamDevice
    }

    fun totalMemGb(context: Context): Double {
        val am = context.getSystemService(Context.ACTIVITY_SERVICE) as android.app.ActivityManager
        val mi = android.app.ActivityManager.MemoryInfo()
        am.getMemoryInfo(mi)
        return (mi.totalMem / 1024.0 / 1024.0 / 1024.0)
    }
}
