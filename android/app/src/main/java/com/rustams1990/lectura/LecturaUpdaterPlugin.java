package com.rustams1990.lectura;

import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;

@CapacitorPlugin(name = "LecturaUpdater")
public class LecturaUpdaterPlugin extends Plugin {

    @PluginMethod
    public void downloadAndInstallApk(PluginCall call) {
        String downloadUrl = call.getString("downloadUrl");
        String versionName = call.getString("versionName", "latest");

        if (downloadUrl == null || downloadUrl.isEmpty()) {
            call.reject("downloadUrl parameter is required");
            return;
        }

        Context context = getContext();
        String fileName = "Lectura-" + versionName + ".apk";

        try {
            DownloadManager downloadManager = (DownloadManager) context.getSystemService(Context.DOWNLOAD_SERVICE);
            if (downloadManager == null) {
                call.reject("DownloadManager not available on this device");
                return;
            }

            Uri uri = Uri.parse(downloadUrl);
            DownloadManager.Request request = new DownloadManager.Request(uri);
            request.setTitle("Downloading Lectura Update " + versionName);
            request.setDescription("Downloading latest APK...");
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setMimeType("application/vnd.android.package-archive");
            request.setDestinationInExternalFilesDir(context, Environment.DIRECTORY_DOWNLOADS, fileName);

            long downloadId = downloadManager.enqueue(request);

            BroadcastReceiver onComplete = new BroadcastReceiver() {
                @Override
                public void onReceive(Context ctx, Intent intent) {
                    long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
                    if (id == downloadId) {
                        try {
                            ctx.unregisterReceiver(this);
                        } catch (Exception ignored) {}

                        DownloadManager.Query query = new DownloadManager.Query();
                        query.setFilterById(downloadId);
                        Cursor cursor = downloadManager.query(query);

                        if (cursor != null && cursor.moveToFirst()) {
                            int statusIndex = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS);
                            if (statusIndex != -1 && cursor.getInt(statusIndex) == DownloadManager.STATUS_SUCCESSFUL) {
                                File destinationFile = new File(ctx.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), fileName);
                                installApkFile(ctx, destinationFile);
                            }
                            cursor.close();
                        }
                    }
                }
            };

            ContextCompat.registerReceiver(
                context,
                onComplete,
                new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE),
                ContextCompat.RECEIVER_EXPORTED
            );

            JSObject ret = new JSObject();
            ret.put("downloadId", downloadId);
            ret.put("status", "downloading");
            call.resolve(ret);

        } catch (Exception e) {
            call.reject("Failed to initiate APK download: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void openApk(PluginCall call) {
        String filePath = call.getString("filePath");
        if (filePath == null) {
            call.reject("filePath is required");
            return;
        }

        File file = new File(filePath);
        if (!file.exists()) {
            call.reject("File does not exist: " + filePath);
            return;
        }

        try {
            installApkFile(getContext(), file);
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to open APK installer: " + e.getMessage(), e);
        }
    }

    private void installApkFile(Context context, File file) {
        Intent intent = new Intent(Intent.ACTION_VIEW);
        Uri apkUri = FileProvider.getUriForFile(
                context,
                context.getPackageName() + ".fileprovider",
                file
        );
        intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(intent);
    }
}
