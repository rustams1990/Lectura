package com.rustams1990.lectura;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.support.v4.media.MediaBrowserCompat;
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

    // Shared state (set by Plugin before startForegroundService)
    public static volatile Bitmap pendingCover = null;

    private static LecturaAudioService instance;
    public static LecturaAudioService getInstance() { return instance; }

    private MediaSessionCompat mediaSession;
    private PowerManager.WakeLock wakeLock;

    private boolean isPlaying     = true;
    private String  currentTitle  = "Lectura Audio";
    private String  currentArtist = "Playing";
    private long    currentPositionMs = 0;
    private long    durationMs        = 0;
    private Bitmap  coverBitmap       = null;

    // ─────────────────────────────────────────────────────────────────────────
    // Lifecycle
    // ─────────────────────────────────────────────────────────────────────────

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        createNotificationChannel();

        mediaSession = new MediaSessionCompat(this, "LecturaAudioService");
        mediaSession.setFlags(
                MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS |
                MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS
        );
        mediaSession.setCallback(new MediaSessionCompat.Callback() {
            @Override public void onPlay()           { togglePlayPause(); }
            @Override public void onPause()          { togglePlayPause(); }
            @Override public void onFastForward()    { seekAction("seek_forward"); }
            @Override public void onRewind()         { seekAction("seek_backward"); }
            @Override public void onSkipToNext()     { seekAction("seek_forward"); }
            @Override public void onSkipToPrevious() { seekAction("seek_backward"); }
            @Override public void onStop()           { stopSelf(); }
            @Override public void onCustomAction(String action, Bundle extras) {
                if (ACTION_SEEK_BACK.equals(action)) {
                    seekAction("seek_backward");
                } else if (ACTION_SEEK_FORWARD.equals(action)) {
                    seekAction("seek_forward");
                }
            }
            @Override public void onSeekTo(long pos) {
                currentPositionMs = pos;
                LecturaAudioPlugin.onNativeAction("seek_to:" + (pos / 1000));
                updatePlaybackState();
                updateNotification();
            }
        });
        mediaSession.setActive(true);
        setSessionToken(mediaSession.getSessionToken());

        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        if (pm != null) {
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Lectura::AudioWakeLock");
            wakeLock.setReferenceCounted(false);
        }
    }

    private void togglePlayPause() {
        isPlaying = !isPlaying;
        LecturaAudioPlugin.onNativeAction("play_pause");
        updatePlaybackState();
        updateNotification();
    }

    private void seekAction(String action) {
        LecturaAudioPlugin.onNativeAction(action);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) return START_STICKY;

        String action = intent.getAction();
        if (ACTION_STOP.equals(action))         { stopSelf(); return START_NOT_STICKY; }
        if (ACTION_PLAY_PAUSE.equals(action))   { togglePlayPause(); return START_STICKY; }
        if (ACTION_SEEK_BACK.equals(action))    { seekAction("seek_backward"); return START_STICKY; }
        if (ACTION_SEEK_FORWARD.equals(action)) { seekAction("seek_forward");  return START_STICKY; }

        // Normal start with metadata from JS
        if (intent.hasExtra("title"))    currentTitle  = intent.getStringExtra("title");
        if (intent.hasExtra("artist"))   currentArtist = intent.getStringExtra("artist");
        if (intent.hasExtra("isPlaying"))isPlaying     = intent.getBooleanExtra("isPlaying", true);
        if (intent.hasExtra("position")) currentPositionMs = intent.getIntExtra("position", 0) * 1000L;
        if (intent.hasExtra("duration")) durationMs        = intent.getIntExtra("duration", 0) * 1000L;

        // Pick up cover set by Plugin (downloaded on background thread)
        if (pendingCover != null) {
            coverBitmap = pendingCover;
            pendingCover = null;
        }

        updateMetadata();
        updatePlaybackState();
        startForegroundWithNotification();
        return START_STICKY;
    }

    /** Called from LecturaAudioPlugin.updatePosition() every ~3 seconds */
    public void onPositionUpdate(int positionSec, int durationSec, boolean playing) {
        currentPositionMs = positionSec * 1000L;
        durationMs        = durationSec * 1000L;
        isPlaying         = playing;
        updatePlaybackState();
    }

    @Override
    public void onDestroy() {
        instance = null;
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        if (mediaSession != null) {
            mediaSession.setActive(false);
            mediaSession.release();
        }
        stopForeground(true);
        super.onDestroy();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MediaBrowserServiceCompat
    // ─────────────────────────────────────────────────────────────────────────

    @Override
    public BrowserRoot onGetRoot(@NonNull String clientPackageName, int clientUid,
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
        MediaMetadataCompat.Builder b = new MediaMetadataCompat.Builder()
                .putString(MediaMetadataCompat.METADATA_KEY_TITLE,  currentTitle)
                .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, currentArtist)
                .putString(MediaMetadataCompat.METADATA_KEY_ALBUM,  "Lectura");
        if (durationMs > 0) {
            b.putLong(MediaMetadataCompat.METADATA_KEY_DURATION, durationMs);
        }
        if (coverBitmap != null) {
            b.putBitmap(MediaMetadataCompat.METADATA_KEY_ART, coverBitmap);
            b.putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, coverBitmap);
            b.putBitmap(MediaMetadataCompat.METADATA_KEY_DISPLAY_ICON, coverBitmap);
        }
        mediaSession.setMetadata(b.build());
    }

    private void updatePlaybackState() {
        if (mediaSession == null) return;
        long actions = PlaybackStateCompat.ACTION_PLAY |
                       PlaybackStateCompat.ACTION_PAUSE |
                       PlaybackStateCompat.ACTION_PLAY_PAUSE |
                       PlaybackStateCompat.ACTION_FAST_FORWARD |
                       PlaybackStateCompat.ACTION_REWIND |
                       PlaybackStateCompat.ACTION_SEEK_TO |
                       PlaybackStateCompat.ACTION_STOP;
        int state = isPlaying ? PlaybackStateCompat.STATE_PLAYING
                              : PlaybackStateCompat.STATE_PAUSED;
        
        PlaybackStateCompat.Builder stateBuilder = new PlaybackStateCompat.Builder()
                .setActions(actions)
                .setState(state, currentPositionMs, isPlaying ? 1.0f : 0.0f)
                .addCustomAction(new PlaybackStateCompat.CustomAction.Builder(
                        ACTION_SEEK_BACK, "-10s", R.drawable.ic_replay_10).build())
                .addCustomAction(new PlaybackStateCompat.CustomAction.Builder(
                        ACTION_SEEK_FORWARD, "+10s", R.drawable.ic_forward_10).build());

        mediaSession.setPlaybackState(stateBuilder.build());
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

        Intent openApp = new Intent(this, MainActivity.class);
        openApp.setAction(Intent.ACTION_MAIN);
        openApp.addCategory(Intent.CATEGORY_LAUNCHER);
        openApp.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent openIntent = PendingIntent.getActivity(this, 0, openApp, piFlags);

        PendingIntent piBack = PendingIntent.getService(this, 1,
                new Intent(this, LecturaAudioService.class).setAction(ACTION_SEEK_BACK), piFlags);
        PendingIntent piPP   = PendingIntent.getService(this, 2,
                new Intent(this, LecturaAudioService.class).setAction(ACTION_PLAY_PAUSE), piFlags);
        PendingIntent piFwd  = PendingIntent.getService(this, 3,
                new Intent(this, LecturaAudioService.class).setAction(ACTION_SEEK_FORWARD), piFlags);

        int ppIcon    = isPlaying ? R.drawable.ic_pause : R.drawable.ic_play_arrow;
        String ppLabel = isPlaying ? "Pause" : "Play";

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_play_arrow)
                .setContentTitle(currentTitle)
                .setContentText(currentArtist)
                .setOngoing(isPlaying)
                .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setOnlyAlertOnce(true)
                .setContentIntent(openIntent)
                .addAction(R.drawable.ic_replay_10,  "-10s",  piBack)
                .addAction(ppIcon, ppLabel, piPP)
                .addAction(R.drawable.ic_forward_10,  "+10s",  piFwd)
                .setStyle(new MediaStyle()
                        .setMediaSession(mediaSession.getSessionToken())
                        .setShowActionsInCompactView(0, 1, 2));

        if (coverBitmap != null) {
            builder.setLargeIcon(coverBitmap);
        }

        return builder.build();
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
