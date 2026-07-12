package com.farely.app

import android.accessibilityservice.AccessibilityService
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.accessibility.AccessibilityEvent

/**
 * Event-triggered capture service. Sleeps until a target ride app changes its
 * screen content, then reads the offer from the node tree (cheap) and, if that
 * fails, hands off to the OCR fallback. Never scores — emits RawOffer to JS.
 *
 * See docs/ocr-overlay/04-accessibility-service.md.
 */
class FarelyAccessibilityService : AccessibilityService() {

    companion object {
        private const val TAG = "FarelyA11y"
        private const val DEBOUNCE_MS = 300L
        private const val DEDUP_WINDOW_MS = 30_000L
        private const val UNKNOWN_MIN_GAP_MS = 5 * 60_000L
        // Cheap gate: only spend a cloud-vision call on screens that plausibly need
        // a decision (updates / promos / consent) — never the map, menus or lists.
        // Deliberately excludes verification/selfie terms: identity checks are
        // detected on-device by the coordinator and NEVER routed to cloud vision.
        private val NOVELTY_HINTS = listOf(
            "update", "aktualiz", "zaktualizuj", "version", "wersj", "what's new", "nowość",
            "install", "zainstaluj", "continue", "kontynuuj", "accept terms", "regulamin",
        )

        val TARGET_PACKAGES = mapOf(
            "ee.mtakso.driver" to "Bolt",
            "com.ubercab.driver" to "Uber",
            "taxi.android.driver" to "FreeNow", // FreeNow driver app (ex-mytaxi id)
            "com.mytaxi.driver" to "FreeNow"    // legacy id, kept just in case
        )

        /** Non-null while the service is connected — the JS `status()` signal. */
        @Volatile var instance: FarelyAccessibilityService? = null
            private set
    }

    private val main = Handler(Looper.getMainLooper())
    private var pending: Runnable? = null
    private var lastHash: Int = 0
    private var lastEmitAt: Long = 0L
    private var lastWasStateChange = false
    private val unknownLastAt = HashMap<String, Long>()

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        event ?: return
        val platform = TARGET_PACKAGES[event.packageName?.toString()] ?: return

        when (event.eventType) {
            AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED,
            AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED,
            AccessibilityEvent.TYPE_NOTIFICATION_STATE_CHANGED -> Unit
            else -> return
        }
        lastWasStateChange = event.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED

        // Debounce bursts of content-changed events; process the latest.
        pending?.let(main::removeCallbacks)
        pending = Runnable { process(platform) }.also { main.postDelayed(it, DEBOUNCE_MS) }
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
    }

    override fun onDestroy() {
        instance = null
        OverlayController.hide()
        MultiAppCoordinator.onServiceGone()
        pending?.let(main::removeCallbacks)
        super.onDestroy()
    }

    private fun process(platform: String) {
        val root = rootInActiveWindow ?: return

        // Feed the multi-app coordinator first: it decides trip start/end + ID
        // check state and does the pause/resume/switch chores. It also flips the
        // `frozen` flag we honour below.
        MultiAppCoordinator.onScreen(this, platform, root)
        if (MultiAppCoordinator.frozen) return // ID check on screen — hands off

        if (!OfferNodeParser.looksLikeOffer(root)) {
            OverlayController.hide() // offer card gone → drop the bubble
            maybeEmitUnknown(platform, root) // novel non-offer screen → cloud vision
            return
        }

        var raw = OfferNodeParser.parse(root, platform)

        // Fallback to OCR only when node parse is short on data.
        if (raw.incomplete) {
            OcrReader.instance?.readNow(platform)?.let { ocr ->
                if (ocr.valid) raw = ocr
            }
        }
        if (!raw.valid) return

        // De-dup: same offer re-firing as the card animates.
        val hash = listOf(raw.platform, raw.fare, raw.pickupText, raw.dropoffText).hashCode()
        val now = System.currentTimeMillis()
        if (hash == lastHash && now - lastEmitAt < DEDUP_WINDOW_MS) return
        lastHash = hash
        lastEmitAt = now

        Log.d(TAG, "offer: $raw")
        FarelyBridgePlugin.emitRawOffer(raw)   // → WebView → scoreOffer()
    }

    /**
     * Learn-controls: snapshot the visible node tree of the foreground target app
     * so the driver can tag which node is which control. Keeps only nodes with a
     * label, a view-id, or that are clickable (layout noise dropped) and caps the
     * count so a huge tree can't stall the bridge. Read-only — taps nothing.
     */
    fun captureControls(): Pair<String, List<NodeCap>>? {
        val root = rootInActiveWindow ?: return null
        val platform = TARGET_PACKAGES[root.packageName?.toString()] ?: return null
        val out = ArrayList<NodeCap>()
        val rect = android.graphics.Rect()
        fun walk(n: android.view.accessibility.AccessibilityNodeInfo?) {
            n ?: return
            if (out.size >= 400) return
            val text = n.text?.toString()?.takeIf { it.isNotBlank() }
            val desc = n.contentDescription?.toString()?.takeIf { it.isNotBlank() }
            val viewId = n.viewIdResourceName?.takeIf { it.isNotBlank() }
            if (text != null || desc != null || viewId != null || n.isClickable) {
                n.getBoundsInScreen(rect)
                out.add(NodeCap(text, desc, viewId, n.className?.toString(), n.isClickable, rect.toShortString()))
            }
            for (i in 0 until n.childCount) walk(n.getChild(i))
        }
        walk(root)
        return platform to out
    }

    /** The target-app platform currently in the foreground, if any. */
    fun foregroundPlatform(): String? =
        TARGET_PACKAGES[rootInActiveWindow?.packageName?.toString()]

    /**
     * A screen Farely couldn't place (not an offer, not a trip/ID-check the
     * coordinator handles). On a genuinely new screen whose text hints it may need
     * a decision, grab a screenshot and hand it to the WebView's vision classifier
     * (`farely:unknownScreen`). Hard-throttled per platform to bound vision calls.
     */
    private fun maybeEmitUnknown(platform: String, root: android.view.accessibility.AccessibilityNodeInfo) {
        if (!lastWasStateChange) return
        if (MultiAppCoordinator.frozen) return
        val now = System.currentTimeMillis()
        if (now - (unknownLastAt[platform] ?: 0L) < UNKNOWN_MIN_GAP_MS) return
        val hint = flatTextHint(root)
        if (NOVELTY_HINTS.none { hint.contains(it, ignoreCase = true) }) return
        unknownLastAt[platform] = now
        captureScreenB64 { b64 -> FarelyBridgePlugin.emitUnknownScreen(platform, b64, hint) }
    }

    /** First handful of visible strings, joined — a cheap text summary of a screen. */
    private fun flatTextHint(root: android.view.accessibility.AccessibilityNodeInfo): String {
        val parts = ArrayList<String>()
        fun walk(n: android.view.accessibility.AccessibilityNodeInfo?) {
            n ?: return
            if (parts.size >= 16) return
            (n.text?.toString() ?: n.contentDescription?.toString())
                ?.trim()?.takeIf { it.isNotBlank() }?.let { parts.add(it) }
            for (i in 0 until n.childCount) walk(n.getChild(i))
        }
        walk(root)
        return parts.joinToString(" · ").take(600)
    }

    /**
     * Screenshot the foreground app as a downscaled base64 PNG for the vision
     * classifier. API 30+ only; calls back null on older devices or on failure.
     * Read-only — it captures pixels, never taps.
     */
    fun captureScreenB64(onResult: (String?) -> Unit) {
        if (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.R) {
            onResult(null)
            return
        }
        try {
            takeScreenshot(
                android.view.Display.DEFAULT_DISPLAY,
                mainExecutor,
                object : AccessibilityService.TakeScreenshotCallback {
                    override fun onSuccess(result: AccessibilityService.ScreenshotResult) {
                        val b64 = try {
                            val hw = result.hardwareBuffer
                            val bmp = android.graphics.Bitmap.wrapHardwareBuffer(hw, result.colorSpace)
                            hw.close()
                            bmp?.let { encodeScaledPng(it) }
                        } catch (t: Throwable) {
                            null
                        }
                        onResult(b64)
                    }

                    override fun onFailure(errorCode: Int) = onResult(null)
                },
            )
        } catch (t: Throwable) {
            onResult(null)
        }
    }

    private fun encodeScaledPng(src: android.graphics.Bitmap): String {
        val soft = if (src.config == android.graphics.Bitmap.Config.HARDWARE)
            src.copy(android.graphics.Bitmap.Config.ARGB_8888, false) else src
        val maxW = 820
        val scaled = if (soft.width > maxW) {
            val h = (soft.height.toLong() * maxW / soft.width).toInt().coerceAtLeast(1)
            android.graphics.Bitmap.createScaledBitmap(soft, maxW, h, true)
        } else soft
        val stream = java.io.ByteArrayOutputStream()
        scaled.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, stream)
        return android.util.Base64.encodeToString(stream.toByteArray(), android.util.Base64.NO_WRAP)
    }

    override fun onInterrupt() { pending?.let(main::removeCallbacks) }

    /** One captured control node (mirrors NodeCapture in lib/controls.ts). */
    data class NodeCap(
        val text: String?,
        val desc: String?,
        val viewId: String?,
        val cls: String?,
        val clickable: Boolean,
        val bounds: String,
    )
}
