package com.rustams1990.lectura;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.content.pm.ServiceInfo;
import android.support.v4.media.MediaBrowserCompat;
import android.support.v4.media.MediaDescriptionCompat;
import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.media.MediaBrowserServiceCompat;
import androidx.media.app.NotificationCompat.MediaStyle;
import java.util.ArrayList;
import java.util.List;

public class LecturaAudioService extends MediaBrowserServiceCompat {

    public static final String ACTION_PLAY_PAUSE   = "com.rustams1990.lectura.ACTION_PLAY_PAUSE";
    public static final String ACTION_SEEK_BACK    = "com.rustams1990.lectura.ACTION_SEEK_BACK";
    public static final String ACTION_SEEK_FORWARD = "com.rustams1990.lectura.ACTION_SEEK_FORWARD";
    public static final String ACTION_STOP         = "com.rustams1990.lectura.ACTION_STOP";

    private static final String CHANNEL_ID      = "lectura_background_audio";
    private static final int    NOTIFICATION_ID = 481516;
    private static final String ROOT_ID         = "lectura_media_root";

    private MediaSessionCompat mediaSession;
    private PowerManager.WakeLock wakeLock;

    private boolean isPlaying    = true;
    private String  currentTitle  = "Lectura Audio";
    private String  currentArtist = "Playing";

    // ─────────────────────────────────────────────────────────────────────────
    // Lifecycle
    // ─────────────────────────────────────────────────────────────────────────

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();

        // Build MediaSession
        mediaSession = new MediaSessionCompat(this, "LecturaAudioService");
        mediaSession.setFlags(
                MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS |
                MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS
        );
        mediaSession.setCallback(new MediaSessionCompat.Callback() {
            @Override public void onPlay()  { dispatchAction("play_pause"); }
            @Override public void onPause() { dispatchAction("play_pause"); }
            @Override public void onSkipToNext()     { dispatchAction("seek_forward"); }
            @Override public void onSkipToPrevious() { dispatchAction("seek_backward"); }
            @Override public void onFastForward()    { dispatchAction("seek_forward"); }
            @Override public void onRewind()         { dispatchAction("seek_backward"); }
            @Override public void onStop()  { stopSelf(); }
        });
        mediaSession.setActive(true);

        // Required: link MediaBrowserServiceCompat token to MediaSession
        setSessionToken(mediaSession.getSessionToken());

        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        if (pm != null) {
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Lectura::AudioWakeLock");
            wakeLock.setReferenceCounted(false);
        }
    }

    private void dispatchAction(String action) {
        LecturaAudioPlugin.onNativeAction(action);
        if ("play_pause".equals(action)) {
            isPlaying = !isPlaying;
            updatePlaybackState();
            updateNotification();
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) return START_STICKY;

        String action = intent.getAction();
        if (ACTION_STOP.equals(action)) {
            stopSelf();
            return START_NOT_STICKY;
        }
        if (ACTION_PLAY_PAUSE.equals(action)) {
            dispatchAction("play_pause");
            return START_STICKY;
        }
        if (ACTION_SEEK_BACK.equals(action)) {
            dispatchAction("seek_backward");
            return START_STICKY;
        }
        if (ACTION_SEEK_FORWARD.equals(action)) {
            dispatchAction("seek_forward");
            return START_STICKY;
        }

        // Regular start (called from JS)
        if (intent.hasExtra("title"))    currentTitle  = intent.getStringExtra("title");
        if (intent.hasExtra("artist"))   currentArtist = intent.getStringExtra("artist");
        if (intent.hasExtra("isPlaying"))isPlaying     = intent.getBooleanExtra("isPlaying", true);

        updateMetadata();
        updatePlaybackState();
        startForegroundWithNotification();
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        if (mediaSession != null) {
            mediaSession.setActive(false);
            mediaSession.release();
        }
        stopForeground(true);
        super.onDestroy();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MediaBrowserServiceCompat – required overrides (browse tree not used)
    // ─────────────────────────────────────────────────────────────────────────

    @Override
    public BrowserRoot onGetRoot(@NonNull String clientPackageName,
                                 int clientUid,
                                 @Nullable Bundle rootHints) {
        return new BrowserRoot(ROOT_ID, null);
    }

    @Override
    public void onLoadChildren(@NonNull String parentId,
                               @NonNull Result<List<MediaBrowserCompat.MediaItem>> result) {
        result.sendResult(new ArrayList<>());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Internal helpers
    // ─────────────────────────────────────────────────────────────────────────

    private void updateMetadata() {
        if (mediaSession == null) return;
        mediaSession.setMetadata(new MediaMetadataCompat.Builder()
                .putString(MediaMetadataCompat.METADATA_KEY_TITLE,  currentTitle)
                .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, currentArtist)
                .putString(MediaMetadataCompat.METADATA_KEY_ALBUM,  "Lectura")
                .build());
    }

    private void updatePlaybackState() {
        if (mediaSession == null) return;
        long actions = PlaybackStateCompat.ACTION_PLAY |
                       PlaybackStateCompat.ACTION_PAUSE |
                       PlaybackStateCompat.ACTION_PLAY_PAUSE |
                       PlaybackStateCompat.ACTION_SKIP_TO_NEXT |
                       PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS |
                       PlaybackStateCompat.ACTION_FAST_FORWARD |
                       PlaybackStateCompat.ACTION_REWIND |
                       PlaybackStateCompat.ACTION_STOP;
        int state = isPlaying
                ? PlaybackStateCompat.STATE_PLAYING
                : PlaybackStateCompat.STATE_PAUSED;
        mediaSession.setPlaybackState(new PlaybackStateCompat.Builder()
                .setActions(actions)
                .setState(state, PlaybackStateCompat.PLAYBACK_POSITION_UNKNOWN, 1.0f)
                .build());
    }

    private void startForegroundWithNotification() {
        if (wakeLock != null && !wakeLock.isHeld()) {
            wakeLock.acquire(24 * 60 * 60 * 1000L);
        }
        Notification n = buildNotification();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(NOTIFICATION_ID, n);
        }
    }

    private void updateNotification() {
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) nm.notify(NOTIFICATION_ID, buildNotification());
    }

    private Notification buildNotification() {
        int piFlags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                ? PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
                : PendingIntent.FLAG_UPDATE_CURRENT;

        // Tap notification → open app
        Intent openApp = new Intent(this, MainActivity.class);
        openApp.setAction(Intent.ACTION_MAIN);
        openApp.addCategory(Intent.CATEGORY_LAUNCHER);
        openApp.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent openIntent = PendingIntent.getActivity(this, 0, openApp, piFlags);

        // Action intents
        PendingIntent piBack  = PendingIntent.getService(this, 1,
                new Intent(this, LecturaAudioService.class).setAction(ACTION_SEEK_BACK), piFlags);
        PendingIntent piPP    = PendingIntent.getService(this, 2,
                new Intent(this, LecturaAudioService.class).setAction(ACTION_PLAY_PAUSE), piFlags);
        PendingIntent piFwd   = PendingIntent.getService(this, 3,
                new Intent(this, LecturaAudioService.class).setAction(ACTION_SEEK_FORWARD), piFlags);

        int ppIcon  = isPlaying ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play;
        String ppLabel = isPlaying ? "Pause" : "Play";

        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle(currentTitle)
                .setContentText(currentArtist)
                .setSmallIcon(android.R.drawable.ic_media_play)
                .setContentIntent(openIntent)
                .setOngoing(isPlaying)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .addAction(android.R.drawable.ic_media_rew,  "-10s",   piBack)
                .addAction(ppIcon, ppLabel, piPP)
                .addAction(android.R.drawable.ic_media_ff,   "+10s",   piFwd)
                .setStyle(new MediaStyle()
                        .setMediaSession(mediaSession.getSessionToken())
                        .setShowActionsInCompactView(0, 1, 2))
                .build();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(
                    CHANNEL_ID, "Lectura Audio Playback", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Playback controls");
            ch.setShowBadge(false);
            ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(ch);
        }
    }
}
