package com.farely.app

import android.view.accessibility.AccessibilityNodeInfo

/**
 * Cheap path: pull offer fields straight out of the accessibility node tree.
 * No image processing. Works when the app renders text as real Views.
 *
 * WARNING: the token/regex heuristics below are first-guess and MUST be tuned
 * per platform on real devices (Phase 4/5). Ride apps redesign often.
 */
object OfferNodeParser {

    // "23,50 zł" / "23.50 zł" / "23 zł"
    private val MONEY = Regex("""(\d+[.,]?\d*)\s*z[łl]""", RegexOption.IGNORE_CASE)
    // "8,4 km" / "8.4 km"
    private val DISTANCE = Regex("""(\d+[.,]?\d*)\s*km""", RegexOption.IGNORE_CASE)
    // "18 min"
    private val MINUTES = Regex("""(\d+)\s*min""", RegexOption.IGNORE_CASE)
    // "1.4x" / "1,4x"
    private val SURGE = Regex("""(\d+[.,]?\d*)\s*x""", RegexOption.IGNORE_CASE)

    /** Heuristic: is this screen showing an offer at all? */
    fun looksLikeOffer(root: AccessibilityNodeInfo?): Boolean {
        val text = flattenText(root)
        return MONEY.containsMatchIn(text) && DISTANCE.containsMatchIn(text)
    }

    fun parse(root: AccessibilityNodeInfo?, platform: String): RawOffer {
        val lines = collectText(root)
        val blob = lines.joinToString("\n")

        // The fare is the LARGEST amount on the card — smaller money strings are
        // rate hints ("2,50 zł/km"), tips or bonus chips. First-match was wrong.
        val fare = MONEY.findAll(blob).mapNotNull { it.groupValues[1].toNum() }.maxOrNull()

        // Offer cards list the pickup (approach) leg BEFORE the trip leg, e.g.
        // Bolt: "5 min (2,3 km) · pickup" then "18 min (8,4 km) · trip". With two
        // hits: first = deadhead, last = trip. One hit: assume it's the trip.
        val kms = DISTANCE.findAll(blob).mapNotNull { it.groupValues[1].toNum() }.toList()
        val mins = MINUTES.findAll(blob).mapNotNull { it.groupValues[1].toIntOrNull() }.toList()
        val tripKm = kms.lastOrNull()
        val pickupKm = if (kms.size >= 2) kms.first() else null
        val tripMin = mins.lastOrNull()
        val pickupMin = if (mins.size >= 2) mins.first() else null

        val surge = SURGE.find(blob)?.value

        // Pickup/dropoff: best-effort. Many cards label addresses; refine per app.
        val (pickup, dropoff) = guessAddresses(lines)

        return RawOffer(
            platform = platform,
            fare = fare,
            pickupText = pickup,
            dropoffText = dropoff,
            tripKm = tripKm,
            tripMin = tripMin,
            pickupKm = pickupKm,
            pickupMin = pickupMin,
            surgeText = surge,
            source = "node",
            ocrConfidence = null,
            capturedAt = System.currentTimeMillis()
        )
    }

    // --- helpers -------------------------------------------------------------

    private fun String.toNum(): Double? = replace(',', '.').toDoubleOrNull()

    private fun flattenText(root: AccessibilityNodeInfo?): String =
        collectText(root).joinToString(" ")

    /** DFS over the node tree collecting non-empty text/contentDescription. */
    private fun collectText(node: AccessibilityNodeInfo?): List<String> {
        if (node == null) return emptyList()
        val out = ArrayList<String>()
        node.text?.toString()?.trim()?.takeIf { it.isNotEmpty() }?.let(out::add)
        node.contentDescription?.toString()?.trim()?.takeIf { it.isNotEmpty() }?.let(out::add)
        for (i in 0 until node.childCount) out += collectText(node.getChild(i))
        return out
    }

    /**
     * Placeholder address heuristic: the two longest lines that aren't money/
     * distance/time tokens. Replace with per-platform view-id selectors once the
     * real node structure is captured on device.
     */
    private fun guessAddresses(lines: List<String>): Pair<String?, String?> {
        val candidates = lines.filter { l ->
            !MONEY.containsMatchIn(l) && !DISTANCE.containsMatchIn(l) &&
                !MINUTES.containsMatchIn(l) && l.length in 4..60
        }.sortedByDescending { it.length }
        return Pair(candidates.getOrNull(0), candidates.getOrNull(1))
    }
}
