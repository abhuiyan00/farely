package com.farely.app

import android.accessibilityservice.AccessibilityService
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Handler
import android.os.Looper
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.LinearLayout
import android.widget.TextView

/**
 * Phase 3: the verdict bubble drawn over the ride app. Attached through the
 * running accessibility service via TYPE_ACCESSIBILITY_OVERLAY, so it needs no
 * SYSTEM_ALERT_WINDOW grant. Advisory only — FLAG_NOT_FOCUSABLE keeps the ride
 * app's own Accept/Decline buttons fully usable; tapping the bubble dismisses it.
 */
object OverlayController {

    private const val AUTO_HIDE_MS = 20_000L

    private val main = Handler(Looper.getMainLooper())
    private var view: View? = null
    private var wm: WindowManager? = null
    private var autoHide: Runnable? = null

    // Mirrors the web app's verdict palette (App.tsx C.green/amber/red).
    private val VERDICT_COLOR = mapOf(
        "accept" to 0xFF16A34A.toInt(),
        "marginal" to 0xFFC8790A.toInt(),
        "decline" to 0xFFDC2626.toInt()
    )

    fun show(
        service: AccessibilityService,
        verdict: String,
        net: Double,
        perHr: Double,
        perKm: Double,
        reason: String
    ) {
        main.post {
            hideNow()
            val color = VERDICT_COLOR[verdict] ?: VERDICT_COLOR.getValue("decline")
            fun dp(v: Float) = TypedValue.applyDimension(
                TypedValue.COMPLEX_UNIT_DIP, v, service.resources.displayMetrics
            ).toInt()

            val box = LinearLayout(service).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(dp(14f), dp(10f), dp(14f), dp(10f))
                background = GradientDrawable().apply {
                    cornerRadius = dp(14f).toFloat()
                    setColor(0xF2FFFFFF.toInt())
                    setStroke(dp(2f), color)
                }
                setOnClickListener { hide() }
            }
            box.addView(TextView(service).apply {
                text = String.format("%s   %.2f zł net", verdict.uppercase(), net)
                setTextColor(color)
                setTypeface(Typeface.MONOSPACE, Typeface.BOLD)
                textSize = 16f
            })
            box.addView(TextView(service).apply {
                text = String.format("%.0f zł/h · %.2f zł/km", perHr, perKm)
                setTextColor(0xFF161A20.toInt())
                typeface = Typeface.MONOSPACE
                textSize = 13f
            })
            box.addView(TextView(service).apply {
                text = reason
                setTextColor(0x9E161A20.toInt())
                typeface = Typeface.MONOSPACE
                textSize = 11f
                maxWidth = dp(280f)
            })

            val lp = WindowManager.LayoutParams(
                WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
                PixelFormat.TRANSLUCENT
            ).apply {
                gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
                y = dp(60f)
            }

            val manager = service.getSystemService(WindowManager::class.java) ?: return@post
            runCatching { manager.addView(box, lp) }.onSuccess {
                wm = manager
                view = box
                autoHide = Runnable { hideNow() }.also { main.postDelayed(it, AUTO_HIDE_MS) }
            }
        }
    }

    fun hide() {
        main.post { hideNow() }
    }

    private fun hideNow() {
        autoHide?.let(main::removeCallbacks)
        autoHide = null
        view?.let { v -> runCatching { wm?.removeView(v) } }
        view = null
    }
}
