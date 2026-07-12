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

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        event ?: return
        val platform = TARGET_PACKAGES[event.packageName?.toString()] ?: return

        when (event.eventType) {
            AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED,
            AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED,
            AccessibilityEvent.TYPE_NOTIFICATION_STATE_CHANGED -> Unit
            else -> return
        }

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
