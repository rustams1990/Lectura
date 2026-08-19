package com.rustams1990.lectura;

import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "LecturaAudio")
public class LecturaAudioPlugin extends Plugin {
    private static LecturaAudioPlugin instance;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    @Override
    public void load() {
        super.load();
        instance = this;
    }

    /** Called by LecturaAudioService when a notification button is pressed. */
    public static void onNativeAction(String actionName) {
        if (instance != null) {
            JSObject data = new JSObject();
            data.put("action", actionName);
            instance.notifyListeners("onAudioAction", data);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // startForegroundAudio – called when track changes or play state changes
    // ─────────────────────────────────────────────────────────────────────────
    @PluginMethod
    public void startForegroundAudio(PluginCall call) {
        String title    = call.getString("title",    "Lectura Audio");
        String artist   = call.getString("artist",   "Playing");
        boolean playing = Boolean.TRUE.equals(call.getBoolean("isPlaying", true));
        String coverUrl = call.getString("coverUrl");
        int position    = call.getInt("position", 0);
        int dur         = call.getInt("duration", 0);

        Context context = getContext();

        if (coverUrl != null && !coverUrl.isEmpty()) {
            // Download cover on background thread, then start service
            executor.execute(() -> {
                Bitmap bmp = downloadBitmap(coverUrl);
                LecturaAudioService.pendingCover = bmp;
                startService(context, title, artist, playing, position, dur);
            });
        } else {
            LecturaAudioService.pendingCover = null;
            startService(context, title, artist, playing, position, dur);
        }
        call.resolve();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // updatePosition – called every ~3 seconds while playing
    // ─────────────────────────────────────────────────────────────────────────
    @PluginMethod
    public void updatePosition(PluginCall call) {
        int position = call.getInt("position", 0);
        int dur      = call.getInt("duration", 0);
        boolean playing = Boolean.TRUE.equals(call.getBoolean("isPlaying", true));

        LecturaAudioService service = LecturaAudioService.getInstance();
        if (service != null) {
            service.onPositionUpdate(position, dur, playing);
        }
        call.resolve();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // stopForegroundAudio
    // ─────────────────────────────────────────────────────────────────────────
    @PluginMethod
    public void stopForegroundAudio(PluginCall call) {
        Context context = getContext();
        Intent intent = new Intent(context, LecturaAudioService.class);
        intent.setAction(LecturaAudioService.ACTION_STOP);
        try {
            context.startService(intent);
        } catch (Exception e) {
            call.reject("Failed to stop: " + e.getMessage(), e);
            return;
        }
        call.resolve();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────────
    private void startService(Context context, String title, String artist,
                               boolean playing, int position, int duration) {
        Intent intent = new Intent(context, LecturaAudioService.class);
        intent.putExtra("title",    title);
        intent.putExtra("artist",   artist);
        intent.putExtra("isPlaying", playing);
        intent.putExtra("position", position);
        intent.putExtra("duration", duration);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent);
            } else {
                context.startService(intent);
            }
        } catch (Exception e) {
            android.util.Log.e("LecturaAudioPlugin", "startService failed: " + e.getMessage());
        }
    }

    private Bitmap downloadBitmap(String urlStr) {
        try {
            URL url = new URL(urlStr);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setConnectTimeout(5000);
            conn.setReadTimeout(8000);
            conn.setDoInput(true);
            conn.connect();
            InputStream in = conn.getInputStream();
            Bitmap bmp = BitmapFactory.decodeStream(in);
            in.close();
            conn.disconnect();
            return bmp;
        } catch (Exception e) {
            android.util.Log.w("LecturaAudioPlugin", "Cover download failed: " + e.getMessage());
            return null;
        }
    }
}
