package expo.modules.backgroundmonitor

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager

// Foreground service whose only job is to keep the app process running and the CPU awake,
// so the JS monitor keeps working with the app in the background and the screen off.
class MonitorService : Service() {
  private var wakeLock: PowerManager.WakeLock? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val notification = buildNotification(
      intent?.getStringExtra(EXTRA_TITLE) ?: "Network Monitor",
      intent?.getStringExtra(EXTRA_TEXT) ?: "Monitoring your connection"
    )
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      // "location" lets outages detected in the background still get a GPS fix, but Android 14+
      // only allows it when location permission is granted.
      var type = ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
      if (hasLocationPermission()) type = type or ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
      startForeground(NOTIFICATION_ID, notification, type)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }

    if (wakeLock == null) {
      // ponytail: a permanent partial wake lock costs battery; switch to exact alarms if drain matters
      wakeLock = getSystemService(PowerManager::class.java)
        .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "NetworkMonitor::monitor")
        .apply {
          setReferenceCounted(false)
          acquire()
        }
    }
    // Not sticky: if Android kills the process, a restarted service would have no JS to run,
    // so it would only show a notification while logging nothing.
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    wakeLock?.release()
    wakeLock = null
    super.onDestroy()
  }

  private fun hasLocationPermission() =
    checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
      checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

  private fun buildNotification(title: String, text: String): Notification {
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      getSystemService(NotificationManager::class.java).createNotificationChannel(
        NotificationChannel(CHANNEL_ID, "Monitoring", NotificationManager.IMPORTANCE_LOW)
      )
      Notification.Builder(this, CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this)
    }
    val openApp = packageManager.getLaunchIntentForPackage(packageName)?.let {
      PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }
    return builder
      .setSmallIcon(android.R.drawable.stat_notify_sync_noanim)
      .setContentTitle(title)
      .setContentText(text)
      .setOngoing(true)
      .setContentIntent(openApp)
      .build()
  }

  companion object {
    const val EXTRA_TITLE = "title"
    const val EXTRA_TEXT = "text"
    private const val CHANNEL_ID = "network-monitor"
    private const val NOTIFICATION_ID = 1
  }
}
