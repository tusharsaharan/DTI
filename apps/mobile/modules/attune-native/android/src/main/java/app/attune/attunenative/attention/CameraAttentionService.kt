package app.attune.attunenative.attention

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.ImageFormat
import android.hardware.camera2.CameraCaptureSession
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraDevice
import android.hardware.camera2.CameraManager
import android.hardware.camera2.CaptureRequest
import android.media.ImageReader
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import app.attune.attunenative.AttuneEventHub

private const val CAMERA_FRAME_EVENT_INTERVAL_MS = 10_000L

data class CameraRuntimeStatus(
  val running: Boolean = false,
  val permissionGranted: Boolean = false,
  val frontCameraAvailable: Boolean = false,
  val framesObserved: Long = 0L,
  val error: String? = null,
  val state: String = "stopped"
) {
  fun toMap(): Map<String, Any?> = mapOf(
    "running" to running,
    "state" to state,
    "permissionGranted" to permissionGranted,
    "frontCameraAvailable" to frontCameraAvailable,
    "framesObserved" to framesObserved,
    "error" to error,
    "status" to "no_gaze_model",
    "source" to "camera_frame",
    "confidence" to null
  )
}

object CameraAttentionRuntime {
  @Volatile var status: CameraRuntimeStatus = CameraRuntimeStatus()
}

data class CameraFrameObservation(
  val timestampMs: Long,
  val frameNumber: Long,
  val source: String = "camera_frame",
  val confidence: Float? = null,
  val status: String = "no_gaze_model"
) {
  fun toMap(): Map<String, Any?> = mapOf(
    "timestampMs" to timestampMs,
    "frameNumber" to frameNumber,
    "source" to source,
    "confidence" to confidence,
    "status" to status,
    "environment" to null
  )
}

/** Keeps the camera/frame boundary explicit until a real on-device gaze model is integrated. */
object CameraFrameBoundary {
  fun observe(timestampMs: Long, frameNumber: Long): CameraFrameObservation =
    CameraFrameObservation(timestampMs = timestampMs, frameNumber = frameNumber)
}

interface CameraAttentionSource {
  fun start(): Boolean
  fun stop()
}

/** Opens the front camera and drains frames without storing or exporting image data. */
class AndroidCameraAttentionSource(private val context: Context) : CameraAttentionSource {
  private val manager = context.getSystemService(Context.CAMERA_SERVICE) as? CameraManager
  private val lifecycleLock = Any()
  private var thread: HandlerThread? = null
  private var camera: CameraDevice? = null
  private var session: CameraCaptureSession? = null
  private var reader: ImageReader? = null
  private var generation = 0L
  private var lastEventMs = 0L
  private var started = false

  override fun start(): Boolean {
    synchronized(lifecycleLock) {
      if (started) return true
    }
    val permission = context.checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
    if (!permission) {
      CameraAttentionRuntime.status = CameraRuntimeStatus(permissionGranted = false, error = "camera_permission_required")
      return false
    }

    val cameraManager = manager
    if (cameraManager == null) {
      CameraAttentionRuntime.status = CameraRuntimeStatus(permissionGranted = true, error = "camera_manager_unavailable")
      return false
    }
    val cameraId = runCatching {
      cameraManager.cameraIdList.firstOrNull { id ->
        cameraManager.getCameraCharacteristics(id).get(CameraCharacteristics.LENS_FACING) == CameraCharacteristics.LENS_FACING_FRONT
      }
    }.getOrNull()
    if (cameraId == null) {
      CameraAttentionRuntime.status = CameraRuntimeStatus(permissionGranted = true, error = "front_camera_unavailable")
      return false
    }

    val requestGeneration: Long
    val cameraHandler: Handler
    val output: android.view.Surface
    synchronized(lifecycleLock) {
      if (started) return true
      generation += 1
      requestGeneration = generation
      started = true
      lastEventMs = 0L
      val cameraThread = HandlerThread("attune-camera-$requestGeneration").also { it.start() }
      thread = cameraThread
      cameraHandler = Handler(cameraThread.looper)
      val imageReader = ImageReader.newInstance(320, 240, ImageFormat.YUV_420_888, 2)
      reader = imageReader
      imageReader.setOnImageAvailableListener({ source ->
        val image = source.acquireLatestImage() ?: return@setOnImageAvailableListener
        try {
          synchronized(lifecycleLock) {
            if (!isCurrent(requestGeneration) || CameraAttentionRuntime.status.state != "running") return@synchronized
            val frames = CameraAttentionRuntime.status.framesObserved + 1
            CameraAttentionRuntime.status = CameraAttentionRuntime.status.copy(framesObserved = frames)
            val now = System.currentTimeMillis()
            if (now - lastEventMs >= CAMERA_FRAME_EVENT_INTERVAL_MS) {
              lastEventMs = now
              AttuneEventHub.publish(
                "onAttentionFrame",
                CameraFrameBoundary.observe(now, frames).toMap()
              )
            }
          }
        } finally {
          image.close()
        }
      }, cameraHandler)
      output = imageReader.surface
      CameraAttentionRuntime.status = CameraRuntimeStatus(
        running = false,
        permissionGranted = true,
        frontCameraAvailable = true,
        framesObserved = 0L,
        error = null,
        state = "starting"
      )
    }

    return runCatching {
      cameraManager.openCamera(cameraId, object : CameraDevice.StateCallback() {
        override fun onOpened(device: CameraDevice) {
          synchronized(lifecycleLock) {
            if (!isCurrent(requestGeneration)) {
              device.close()
              return
            }
            camera = device
            runCatching {
              device.createCaptureSession(listOf(output), object : CameraCaptureSession.StateCallback() {
                override fun onConfigured(captureSession: CameraCaptureSession) {
                  synchronized(lifecycleLock) {
                    if (!isCurrent(requestGeneration)) {
                      captureSession.close()
                      return
                    }
                    runCatching {
                      val request = device.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW).apply {
                        addTarget(output)
                        set(CaptureRequest.CONTROL_AE_TARGET_FPS_RANGE, android.util.Range(5, 10))
                      }.build()
                      captureSession.setRepeatingRequest(request, null, cameraHandler)
                      session = captureSession
                      CameraAttentionRuntime.status = CameraAttentionRuntime.status.copy(
                        running = true,
                        state = "running",
                        error = null
                      )
                    }.onFailure {
                      captureSession.close()
                      failCurrent(requestGeneration, "camera_request_failed")
                    }
                  }
                }

                override fun onConfigureFailed(captureSession: CameraCaptureSession) {
                  captureSession.close()
                  failCurrent(requestGeneration, "camera_session_failed")
                }
              }, cameraHandler)
            }.onFailure {
              failCurrent(requestGeneration, "camera_session_failed")
            }
          }
        }

        override fun onDisconnected(device: CameraDevice) {
          device.close()
          failCurrent(requestGeneration, "camera_disconnected")
        }

        override fun onError(device: CameraDevice, error: Int) {
          device.close()
          failCurrent(requestGeneration, "camera_error_$error")
        }
      }, cameraHandler)
      true
    }.getOrElse {
      synchronized(lifecycleLock) {
        if (isCurrent(requestGeneration)) {
          generation += 1
          closeResourcesLocked()
          CameraAttentionRuntime.status = CameraRuntimeStatus(
            permissionGranted = true,
            frontCameraAvailable = true,
            error = "camera_open_failed"
          )
        }
      }
      false
    }
  }

  override fun stop() {
    synchronized(lifecycleLock) {
      generation += 1
      closeResourcesLocked()
      val previous = CameraAttentionRuntime.status
      CameraAttentionRuntime.status = previous.copy(running = false, state = "stopped")
    }
  }

  private fun isCurrent(requestGeneration: Long): Boolean = generation == requestGeneration

  private fun failCurrent(requestGeneration: Long, error: String) {
    synchronized(lifecycleLock) {
      if (!isCurrent(requestGeneration)) return
      generation += 1
      closeResourcesLocked()
      val previous = CameraAttentionRuntime.status
      CameraAttentionRuntime.status = previous.copy(running = false, state = "stopped", error = error)
    }
  }

  private fun closeResourcesLocked() {
    started = false
    session?.close()
    camera?.close()
    reader?.close()
    thread?.quitSafely()
    session = null
    camera = null
    reader = null
    thread = null
  }
}

class AttuneAttentionCameraService : Service() {
  private var source: AndroidCameraAttentionSource? = null

  override fun onCreate() {
    super.onCreate()
    createChannel()
    val notification = (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this)
    })
      .setContentTitle(getString(app.attune.attunenative.R.string.attune_service_name))
      .setContentText("Attention sensing is on-device; gaze model unavailable")
      .setSmallIcon(android.R.drawable.ic_menu_camera)
      .setOngoing(true)
      .build()
    val foregroundStarted = runCatching {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        startForeground(NOTIFICATION_ID, notification, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA)
      } else {
        startForeground(NOTIFICATION_ID, notification)
      }
    }.isSuccess
    if (!foregroundStarted) {
      CameraAttentionRuntime.status = CameraRuntimeStatus(error = "foreground_camera_start_rejected")
      stopSelf()
      return
    }
    val localSource = AndroidCameraAttentionSource(this)
    source = localSource
    if (!localSource.start()) stopSelf()
  }

  override fun onStartCommand(intent: android.content.Intent?, flags: Int, startId: Int): Int = START_NOT_STICKY

  override fun onDestroy() {
    source?.stop()
    source = null
    runCatching { stopForeground(true) }
    super.onDestroy()
  }

  override fun onBind(intent: android.content.Intent?): IBinder? = null

  private fun createChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      manager.createNotificationChannel(NotificationChannel(CHANNEL_ID, getString(app.attune.attunenative.R.string.attune_sensing_channel), NotificationManager.IMPORTANCE_LOW))
    }
  }

  companion object {
    private const val CHANNEL_ID = "attune-sensing"
    private const val NOTIFICATION_ID = 7401
  }
}
