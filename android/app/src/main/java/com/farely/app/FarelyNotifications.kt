package com.farely.app

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

/**
 * Farely's own Android notification channel — the native mirror of the in-app
 * notification feed (lib/session.ts Notice). Autopilot actions, zone drops and
 * let-out heads-ups post here so the driver sees them even with Farely in the
 * background. Deliberately low-importance (NN/g: over-notifying kills trust) so
 * they don't buzz over navigation.
 */
object FarelyNotifications {

    private const val CHANNEL_ID = "farely.assistant"
    private const val CHANNEL_NAME = "Farely assistant"
    private var nextId = 4200

    fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val mgr = context.getSystemService(NotificationManager::class.java) ?: return
        if (mgr.getNotificationChannel(CHANNEL_ID) != null) return
        val channel = NotificationChannel(
            CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "Autopilot actions, demand alerts and let-out heads-ups"
            setShowBadge(true)
        }
        mgr.createNotificationChannel(channel)
    }

    fun post(context: Context, title: String, body: String) {
        ensureChannel(context)
        val n = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_menu_directions)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setAutoCancel(true)
            .build()
        // POST_NOTIFICATIONS (API 33+) is requested at first launch; if the user
        // declined, notify() is a silent no-op rather than a crash.
        runCatching { NotificationManagerCompat.from(context).notify(nextId++, n) }
    }
}
