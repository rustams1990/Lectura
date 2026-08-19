package com.rustams1990.lectura;

import android.content.Context;
import android.content.Intent;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "LecturaAudio")
public class LecturaAudioPlugin extends Plugin {
    private static LecturaAudioPlugin instance;

    @Override
    public void load() {
        super.load();
        instance = this;
    }

    public static void onNativeAction(String actionName) {
        if (instance != null) {
            JSObject data = new JSObject();
            data.put("action", actionName);
            instance.notifyListeners("onAudioAction", data);
        }
    }

    @PluginMethod
    public void startForegroundAudio(PluginCall call) {
        String title = call.getString("title", "Lectura Audio");
        String artist = call.getString("artist", "Playing in background");
        boolean isPlaying = Boolean.TRUE.equals(call.getBoolean("isPlaying", true));

        Context context = getContext();
        Intent intent = new Intent(context, LecturaAudioService.class);
        intent.putExtra("title", title);
        intent.putExtra("artist", artist);
        intent.putExtra("isPlaying", isPlaying);

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent);
            } else {
                context.startService(intent);
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to start foreground audio service: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void stopForegroundAudio(PluginCall call) {
        Context context = getContext();
        Intent intent = new Intent(context, LecturaAudioService.class);
        intent.setAction(LecturaAudioService.ACTION_STOP);
        try {
            context.startService(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to stop foreground audio service: " + e.getMessage(), e);
        }
    }
}
