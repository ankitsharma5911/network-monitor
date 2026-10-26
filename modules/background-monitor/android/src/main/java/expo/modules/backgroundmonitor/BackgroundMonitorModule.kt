package expo.modules.backgroundmonitor

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import android.provider.Settings
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

// React Native freezes JS timers while the app is in the background, so the periodic tick
// and the probe's timeout live here, where they keep running under MonitorService.
class BackgroundMonitorModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private val handler = Handler(Looper.getMainLooper())
  private var intervalMs = 30_000L
  private val tick = object : Runnable {
    override fun run() {
      sendEvent("onTick")
      handler.postDelayed(this, intervalMs)
    }
  }

  override fun definition() = ModuleDefinition {
    Name("BackgroundMonitor")

    Events("onTick")

    // Starts the foreground service (keeps the process and CPU alive) and emits onTick every intervalMs.
    Function("start") { interval: Int, title: String, text: String ->
      intervalMs = interval.toLong()
      handler.removeCallbacks(tick)
      handler.postDelayed(tick, intervalMs)
      val intent = Intent(context, MonitorService::class.java)
        .putExtra(MonitorService.EXTRA_TITLE, title)
        .putExtra(MonitorService.EXTRA_TEXT, text)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
      Unit
    }

    Function("stop") {
      handler.removeCallbacks(tick)
      context.stopService(Intent(context, MonitorService::class.java))
    }

    // Round-trip ms for a 204 response, or null on any failure. Real socket timeouts, unlike JS fetch here.
    AsyncFunction("probe") { url: String, timeoutMs: Int, promise: Promise ->
      thread(name = "BackgroundMonitor-probe") {
        promise.resolve(probe(url, timeoutMs))
      }
    }

    Function("isIgnoringBatteryOptimizations") {
      context.getSystemService(PowerManager::class.java).isIgnoringBatteryOptimizations(context.packageName)
    }

    // Shows Android's "Let app always run in background?" dialog.
    Function("requestIgnoreBatteryOptimizations") {
      val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:${context.packageName}"))
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }

    OnDestroy {
      handler.removeCallbacks(tick)
    }
  }

  private fun probe(url: String, timeoutMs: Int): Int? = try {
    val start = SystemClock.elapsedRealtime()
    val conn = URL(url).openConnection() as HttpURLConnection
    try {
      conn.connectTimeout = timeoutMs
      conn.readTimeout = timeoutMs
      conn.useCaches = false
      conn.instanceFollowRedirects = false // a captive portal redirects instead of answering 204
      if (conn.responseCode == 204) (SystemClock.elapsedRealtime() - start).toInt() else null
    } finally {
      conn.disconnect()
    }
  } catch (e: Exception) {
    null
  }
}
