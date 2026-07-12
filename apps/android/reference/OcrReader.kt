package com.farely.app

/**
 * OCR fallback (STUB). Used only when the node tree lacks the offer text
 * (app drew it on a Canvas/SurfaceView). Real implementation:
 *
 *   1. Hold a MediaProjection granted by the user (one consent per session).
 *   2. On readNow(): grab the latest frame from an ImageReader/VirtualDisplay.
 *   3. Run ML Kit TextRecognition on that Bitmap (on-device, no network).
 *   4. Feed the recognized text through the same regex parse as OfferNodeParser.
 *   5. Recycle the bitmap immediately (privacy — never persist frames).
 *
 * Kept as a stub here so the node-parse path can ship first (Phase 2) and OCR
 * be added when a real Canvas-drawn offer is found on device (Phase 4).
 *
 * See docs/ocr-overlay/03-android-permissions-and-legal.md for the
 * MediaProjection consent + privacy constraints.
 */
class OcrReader {

    companion object {
        /** Set once MediaProjection consent is granted and capture is wired. */
        @Volatile var instance: OcrReader? = null
    }

    /**
     * Return a parsed RawOffer from the current screen, or null if capture/OCR
     * isn't available. STUB: returns null until MediaProjection + ML Kit wired.
     */
    fun readNow(platform: String): RawOffer? {
        // TODO(Phase 4): capture frame → ML Kit → text → parse.
        // val bitmap = captureLatestFrame() ?: return null
        // val text = mlKitRecognizeBlocking(bitmap)   // then bitmap.recycle()
        // return OfferTextParser.parse(text, platform, source = "ocr")
        return null
    }
}
