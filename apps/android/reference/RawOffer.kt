package com.farely.app

import org.json.JSONObject

/**
 * A ride offer read off the screen. Deliberately shallow: only what a card
 * actually shows. Geocoding + missing-field estimation happen JS-side, where the
 * engine (engine.ts) lives. See docs/ocr-overlay/01-architecture.md §4.
 */
data class RawOffer(
    val platform: String,        // "Bolt" | "Uber" | "FreeNow"
    val fare: Double?,           // parsed from "23,50 zł" — null if not found
    val pickupText: String?,     // free text; resolved to a Place JS-side
    val dropoffText: String?,
    val tripKm: Double?,         // null if the card omits it
    val tripMin: Int?,           // null if the card omits it
    val pickupKm: Double?,       // approach (deadhead) leg, when the card shows it
    val pickupMin: Int?,
    val surgeText: String?,      // e.g. "1.4x" — optional
    val source: String,          // "node" | "ocr"
    val ocrConfidence: Double?,  // 0..1 when source == "ocr"
    val capturedAt: Long
) {
    /** Enough to score: platform + fare present. Missing km/min estimated JS-side. */
    val valid: Boolean get() = fare != null && fare > 0.0

    /** Missing fields the JS side may need to estimate from geo. */
    val incomplete: Boolean get() = fare == null || pickupText.isNullOrBlank()

    fun toJson(): JSONObject = JSONObject().apply {
        put("platform", platform)
        put("fare", fare ?: JSONObject.NULL)
        put("pickupText", pickupText ?: JSONObject.NULL)
        put("dropoffText", dropoffText ?: JSONObject.NULL)
        put("tripKm", tripKm ?: JSONObject.NULL)
        put("tripMin", tripMin ?: JSONObject.NULL)
        put("pickupKm", pickupKm ?: JSONObject.NULL)
        put("pickupMin", pickupMin ?: JSONObject.NULL)
        put("surgeText", surgeText ?: JSONObject.NULL)
        put("source", source)
        put("ocrConfidence", ocrConfidence ?: JSONObject.NULL)
        put("capturedAt", capturedAt)
    }
}
