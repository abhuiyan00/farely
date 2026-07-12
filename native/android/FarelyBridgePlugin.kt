package com.farely.app

import android.content.Intent
import android.provider.CalendarContract
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * Capacitor bridge: pushes captured offers + coordinator events into the
 * WebView and lets JS drive the native overlay, autopilot config, calendar
 * export, notifications and device profiling.
 *
 * JS usage (see docs/ocr-overlay/04-accessibility-service.md §7):
 *   FarelyBridge.addListener("farely:rawOffer", cb)
 *   FarelyBridge.addListener("farely:coord", cb)   // accept | tripEnd | idCheck | action
 *   FarelyBridge.showOverlay({ verdict, net, perHr, perKm, reason })
 *   FarelyBridge.hideOverlay()
 *   FarelyBridge.status() → { captureEnabled }
 *   FarelyBridge.configureCoordinator({ autoPause, autoResume, autoSwitch, allowIdCheck })
 *   FarelyBridge.deviceProfile() → { lowRam, totalMemGb }
 *   FarelyBridge.addToCalendar({ title, location, notes, beginMs, endMs })
 *   FarelyBridge.notify({ title, body })
 *   FarelyBridge.addListener("farely:controlDump", cb)   // Learn-controls node tree
 *   FarelyBridge.dumpControls() → { ok, platform, count } (tree arrives on the event)
 *   FarelyBridge.configureSelectors({ Uber: { offline: {viewId, text}, ... }, ... })
 */
@CapacitorPlugin(name = "FarelyBridge")
class FarelyBridgePlugin : Plugin() {

    override fun load() {
        active = this
        FarelyNotifications.ensureChannel(context)
    }

    /** Phase 3: draw the ACCEPT/MARGINAL/DECLINE bubble over the ride app. */
    @PluginMethod
    fun showOverlay(call: PluginCall) {
        val service = FarelyAccessibilityService.instance
        if (service == null) {
            call.resolve(JSObject().put("shown", false))
            return
        }
        OverlayController.show(
            service,
            call.getString("verdict") ?: "decline",
            call.getDouble("net") ?: 0.0,
            call.getDouble("perHr") ?: 0.0,
            call.getDouble("perKm") ?: 0.0,
            call.getString("reason") ?: ""
        )
        call.resolve(JSObject().put("shown", true))
    }

    @PluginMethod
    fun hideOverlay(call: PluginCall) {
        OverlayController.hide()
        call.resolve()
    }

    /** Is the accessibility capture service currently connected? */
    @PluginMethod
    fun status(call: PluginCall) {
        call.resolve(JSObject().put("captureEnabled", FarelyAccessibilityService.instance != null))
    }

    /** Push the driver's autopilot switches down to the coordinator. */
    @PluginMethod
    fun configureCoordinator(call: PluginCall) {
        MultiAppCoordinator.configure(
            MultiAppCoordinator.Settings(
                autoPause = call.getBoolean("autoPause") ?: true,
                autoResume = call.getBoolean("autoResume") ?: true,
                autoSwitch = call.getBoolean("autoSwitch") ?: true,
                allowIdCheck = call.getBoolean("allowIdCheck") ?: true,
            )
        )
        call.resolve()
    }

    /** Android's hardware verdict for lite-mode auto-detect. */
    @PluginMethod
    fun deviceProfile(call: PluginCall) {
        call.resolve(
            JSObject()
                .put("lowRam", MultiAppCoordinator.isLowRam(context))
                .put("totalMemGb", MultiAppCoordinator.totalMemGb(context))
        )
    }

    /**
     * Open the phone's calendar insert screen prefilled with the positioning
     * window for a venue let-out. Uses the ACTION_INSERT intent so no calendar
     * permission is needed — the driver reviews and saves it themselves.
     */
    @PluginMethod
    fun addToCalendar(call: PluginCall) {
        val intent = Intent(Intent.ACTION_INSERT).apply {
            data = CalendarContract.Events.CONTENT_URI
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            putExtra(CalendarContract.Events.TITLE, call.getString("title") ?: "Farely let-out")
            putExtra(CalendarContract.Events.EVENT_LOCATION, call.getString("location") ?: "")
            putExtra(CalendarContract.Events.DESCRIPTION, call.getString("notes") ?: "")
            // JS numbers cross the bridge as doubles; ms timestamps fit exactly.
            call.getDouble("beginMs")?.let { putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, it.toLong()) }
            call.getDouble("endMs")?.let { putExtra(CalendarContract.EXTRA_EVENT_END_TIME, it.toLong()) }
        }
        runCatching { context.startActivity(intent) }
            .onSuccess { call.resolve(JSObject().put("opened", true)) }
            .onFailure { call.resolve(JSObject().put("opened", false)) }
    }

    /** Post through Farely's own notification channel. */
    @PluginMethod
    fun notify(call: PluginCall) {
        FarelyNotifications.post(
            context,
            call.getString("title") ?: "Farely",
            call.getString("body") ?: ""
        )
        call.resolve()
    }

    /**
     * Learn-controls: dump the node tree of the foreground target app. Resolves
     * immediately with a count; the full tree is delivered on `farely:controlDump`
     * so a large tree never blocks the bridge call.
     */
    @PluginMethod
    fun dumpControls(call: PluginCall) {
        val captured = FarelyAccessibilityService.instance?.captureControls()
        if (captured == null) {
            call.resolve(JSObject().put("ok", false))
            return
        }
        val (platform, nodes) = captured
        emitControlDump(platform, nodes)
        call.resolve(JSObject().put("ok", true).put("platform", platform).put("count", nodes.size))
    }

    /**
     * Push the driver's learned control selectors into the coordinator so it taps
     * and reads the real per-app buttons (view-id first) instead of guessing from
     * label heuristics. The whole call payload is the SelectorProfile object:
     *   { Uber: { offline: { viewId, text }, online: {…}, trip: {…}, idCheck: {…} }, … }
     */
    @PluginMethod
    fun configureSelectors(call: PluginCall) {
        val profile = HashMap<String, Map<String, MultiAppCoordinator.Selector>>()
        val data = call.data
        val platforms = data.keys()
        while (platforms.hasNext()) {
            val platform = platforms.next()
            val roles = data.getJSObject(platform) ?: continue
            val roleMap = HashMap<String, MultiAppCoordinator.Selector>()
            val roleKeys = roles.keys()
            while (roleKeys.hasNext()) {
                val role = roleKeys.next()
                val sel = roles.getJSObject(role) ?: continue
                roleMap[role] = MultiAppCoordinator.Selector(
                    viewId = sel.getString("viewId"),
                    text = sel.getString("text"),
                )
            }
            profile[platform] = roleMap
        }
        MultiAppCoordinator.configureSelectors(profile)
        call.resolve()
    }

    companion object {
        @Volatile private var active: FarelyBridgePlugin? = null

        /** Called from the accessibility service (any thread). */
        fun emitRawOffer(offer: RawOffer) {
            val plugin = active ?: return
            val payload = JSObject().apply { put("raw", offer.toJson()) }
            plugin.notifyListeners("farely:rawOffer", payload)
        }

        /** Coordinator → JS: accept | tripEnd | idCheckStart | idCheckEnd | action. */
        fun emitCoord(type: String, platform: String, title: String?, body: String?) {
            val plugin = active ?: return
            val payload = JSObject().apply {
                put("type", type)
                put("platform", platform)
                title?.let { put("title", it) }
                body?.let { put("body", it) }
            }
            plugin.notifyListeners("farely:coord", payload)
        }

        /** Learn-controls: push a captured node tree to the JS Learn screen. */
        fun emitControlDump(platform: String, nodes: List<FarelyAccessibilityService.NodeCap>) {
            val plugin = active ?: return
            val arr = JSArray()
            for (n in nodes) {
                arr.put(
                    JSObject()
                        .put("text", n.text)
                        .put("desc", n.desc)
                        .put("viewId", n.viewId)
                        .put("cls", n.cls)
                        .put("clickable", n.clickable)
                        .put("bounds", n.bounds)
                )
            }
            val payload = JSObject()
                .put("platform", platform)
                .put("capturedAt", System.currentTimeMillis())
                .put("source", "device")
                .put("nodes", arr)
            plugin.notifyListeners("farely:controlDump", payload)
        }
    }
}
