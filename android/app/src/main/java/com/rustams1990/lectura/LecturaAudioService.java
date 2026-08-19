package com.rustams1990.lectura;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.support.v4.media.session.MediaSessionCompat;
import androidx.core.app.NotificationCompat;

public class LecturaAudioService extends Service {
    public static final String ACTION_PLAY_PAUSE = "com.rustams1990.lectura.ACTION_PLAY_PAUSE";
    public static final String ACTION_SEEK_BACK = "com.rustams1990.lectura.ACTION_SEEK_BACK";
    public static final String ACTION_SEEK_FORWARD = "com.rustams1990.lectura.ACTION_SEEK_FORWARD";
    public static final String ACTION_STOP = "com.rustams1990.lectura.ACTION_STOP";

    private static final String CHANNEL_ID = "lectura_background_audio";
    private static final int NOTIFICATION_ID = 481516;
    private PowerManager.WakeLock wakeLock;
    private MediaSessionCompat mediaSession;
    private boolean isPlaying = true;
    private String currentTitle = "Lectura Audio";
    private String currentArtist = "Playing in background";

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();

        mediaSession = new MediaSessionCompat(this, "LecturaAudioService");
        mediaSession.setActive(true);

        PowerManager powerManager = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (powerManager != null) {
            wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Lectura::AudioWakeLock");
            wakeLock.setReferenceCounted(false);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) return START_STICKY;

        String action = intent.getAction();
        if (ACTION_STOP.equals(action)) {
            stopForegroundAudio();
            stopSelf();
            return START_NOT_STICKY;
        }

        if (ACTION_PLAY_PAUSE.equals(action)) {
            isPlaying = !isPlaying;
            LecturaAudioPlugin.onNativeAction("play_pause");
            updateNotification(currentTitle, currentArtist, isPlaying);
            return START_STICKY;
        } else if (ACTION_SEEK_BACK.equals(action)) {
            LecturaAudioPlugin.onNativeAction("seek_backward");
            return START_STICKY;
        } else if (ACTION_SEEK_FORWARD.equals(action)) {
            LecturaAudioPlugin.onNativeAction("seek_forward");
            return START_STICKY;
        }

        if (intent.hasExtra("title") && intent.getStringExtra("title") != null) {
            currentTitle = intent.getStringExtra("title");
        }
        if (intent.hasExtra("artist") && intent.getStringExtra("artist") != null) {
            currentArtist = intent.getStringExtra("artist");
        }
        if (intent.hasExtra("isPlaying")) {
            isPlaying = intent.getBooleanExtra("isPlaying", true);
        }

        startForegroundAudio(currentTitle, currentArtist, isPlaying);
        return START_STICKY;
    }

    private void startForegroundAudio(String title, String artist, boolean playing) {
        if (wakeLock != null && !wakeLock.isHeld()) {
            wakeLock.acquire(24 * 60 * 60 * 1000L); // Max 24 hours
        }

        Notification notification = buildNotification(title, artist, playing);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    private void updateNotification(String title, String artist, boolean playing) {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            Notification notification = buildNotification(title, artist, playing);
            manager.notify(NOTIFICATION_ID, notification);
        }
    }

    private Notification buildNotification(String title, String artist, boolean playing) {
        Intent openAppIntent = new Intent(this, MainActivity.class);
        openAppIntent.setAction(Intent.ACTION_MAIN);
        openAppIntent.addCategory(Intent.CATEGORY_LAUNCHER);
        openAppIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);

        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                ? PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
                : PendingIntent.FLAG_UPDATE_CURRENT;

        PendingIntent pendingIntent = PendingIntent.getActivity(this, 0, openAppIntent, flags);

        // Action PendingIntents
        Intent backIntent = new Intent(this, LecturaAudioService.class).setAction(ACTION_SEEK_BACK);
        PendingIntent pBackIntent = PendingIntent.getService(this, 1, backIntent, flags);

        Intent playPauseIntent = new Intent(this, LecturaAudioService.class).setAction(ACTION_PLAY_PAUSE);
        PendingIntent pPlayPauseIntent = PendingIntent.getService(this, 2, playPauseIntent, flags);

        Intent fwdIntent = new Intent(this, LecturaAudioService.class).setAction(ACTION_SEEK_FORWARD);
        PendingIntent pFwdIntent = PendingIntent.getService(this, 3, fwdIntent, flags);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle(title)
                .setContentText(artist)
                .setSmallIcon(android.R.drawable.ic_media_play)
                .setContentIntent(pendingIntent)
                .setOngoing(playing)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .addAction(android.R.drawable.ic_media_rew, "-10s", pBackIntent)
                .addAction(playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play, playing ? "Pause" : "Play", pPlayPauseIntent)
                .addAction(android.R.drawable.ic_media_ff, "+10s", pFwdIntent);

        try {
            androidx.media.app.NotificationCompat.MediaStyle mediaStyle = new androidx.media.app.NotificationCompat.MediaStyle()
                    .setShowActionsInCompactView(0, 1, 2)
                    .setMediaSession(mediaSession.getSessionToken());
            builder.setStyle(mediaStyle);
            
            // Set basic playback state so Android 11+ shows the media player correctly
            android.support.v4.media.session.PlaybackStateCompat.Builder stateBuilder = new android.support.v4.media.session.PlaybackStateCompat.Builder()
                    .setActions(android.support.v4.media.session.PlaybackStateCompat.ACTION_PLAY |
                            android.support.v4.media.session.PlaybackStateCompat.ACTION_PAUSE |
                            android.support.v4.media.session.PlaybackStateCompat.ACTION_PLAY_PAUSE |
                            android.support.v4.media.session.PlaybackStateCompat.ACTION_SKIP_TO_NEXT |
                            android.support.v4.media.session.PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS)
                    .setState(playing ? android.support.v4.media.session.PlaybackStateCompat.STATE_PLAYING : android.support.v4.media.session.PlaybackStateCompat.STATE_PAUSED,
                            android.support.v4.media.session.PlaybackStateCompat.PLAYBACK_POSITION_UNKNOWN, 1.0f);
            mediaSession.setPlaybackState(stateBuilder.build());

            // Set metadata so title/artist show up in Android 11+ Quick Settings player
            android.support.v4.media.MediaMetadataCompat.Builder metadataBuilder = new android.support.v4.media.MediaMetadataCompat.Builder()
                    .putString(android.support.v4.media.MediaMetadataCompat.METADATA_KEY_TITLE, title)
                    .putString(android.support.v4.media.MediaMetadataCompat.METADATA_KEY_ARTIST, artist);
            mediaSession.setMetadata(metadataBuilder.build());
        } catch (Throwable ignored) {}

        return builder.build();
    }

    private void stopForegroundAudio() {
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
        stopForeground(true);
    }

    @Override
    public void onDestroy() {
        if (mediaSession != null) {
            mediaSession.release();
        }
        stopForegroundAudio();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Lectura Audio Playback",
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Audio playback controls on lock screen and notification shade");
            channel.setShowBadge(false);
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);

            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }
}
