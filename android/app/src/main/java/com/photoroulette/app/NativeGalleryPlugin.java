package com.photoroulette.app;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Size;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

@CapacitorPlugin(
    name = "NativeGallery",
    permissions = {
        @Permission(
            alias = "images",
            strings = {
                Manifest.permission.READ_MEDIA_IMAGES,
                Manifest.permission.READ_MEDIA_VIDEO
            }
        ),
        @Permission(
            alias = "storage",
            strings = {
                Manifest.permission.READ_EXTERNAL_STORAGE
            }
        )
    }
)
public class NativeGalleryPlugin extends Plugin {

    @PluginMethod
    public void getMedias(PluginCall call) {
        if (!hasRequiredPermissions()) {
            requestAllPermissions(call, "permissionCallback");
            return;
        }

        queryMedia(call);
    }

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        if (hasRequiredPermissions()) {
            queryMedia(call);
        } else {
            call.reject("Permission denied to access photo gallery.");
        }
    }

    private boolean hasRequiredPermissions() {
        if (Build.VERSION.SDK_INT >= 33) { // Android 13+
            return getPermissionState("images") == PermissionState.GRANTED;
        } else {
            return getPermissionState("storage") == PermissionState.GRANTED;
        }
    }

    private void queryMedia(PluginCall call) {
        int quantity = call.getInt("quantity", 15);
        String types = call.getString("types", "all");

        try {
            ContentResolver resolver = getContext().getContentResolver();
            List<JSObject> allItems = new ArrayList<>();

            // 1. Query Images
            if (!"videos".equals(types)) {
                String[] projection = {
                    MediaStore.Images.Media._ID,
                    MediaStore.Images.Media.DATE_ADDED
                };
                Uri collection = MediaStore.Images.Media.EXTERNAL_CONTENT_URI;
                String sortOrder = MediaStore.Images.Media.DATE_ADDED + " DESC LIMIT 60";

                try (Cursor cursor = resolver.query(collection, projection, null, null, sortOrder)) {
                    if (cursor != null) {
                        int idColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media._ID);
                        while (cursor.moveToNext()) {
                            long id = cursor.getLong(idColumn);
                            Uri contentUri = ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id);
                            
                            JSObject item = new JSObject();
                            item.put("identifier", String.valueOf(id));
                            item.put("uri", contentUri.toString());
                            item.put("type", "image");
                            allItems.add(item);
                        }
                    }
                }
            }

            // 2. Query Videos
            if (!"photos".equals(types)) {
                String[] projection = {
                    MediaStore.Video.Media._ID,
                    MediaStore.Video.Media.DATE_ADDED,
                    MediaStore.Video.Media.DURATION
                };
                Uri collection = MediaStore.Video.Media.EXTERNAL_CONTENT_URI;
                String sortOrder = MediaStore.Video.Media.DATE_ADDED + " DESC LIMIT 40";

                try (Cursor cursor = resolver.query(collection, projection, null, null, sortOrder)) {
                    if (cursor != null) {
                        int idColumn = cursor.getColumnIndexOrThrow(MediaStore.Video.Media._ID);
                        int durationColumn = cursor.getColumnIndex(MediaStore.Video.Media.DURATION);
                        while (cursor.moveToNext()) {
                            long id = cursor.getLong(idColumn);
                            long duration = durationColumn != -1 ? cursor.getLong(durationColumn) : 5000;
                            Uri contentUri = ContentUris.withAppendedId(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, id);
                            
                            JSObject item = new JSObject();
                            item.put("identifier", String.valueOf(id));
                            item.put("uri", contentUri.toString());
                            item.put("type", "video");
                            item.put("duration", (int)(duration / 1000));
                            allItems.add(item);
                        }
                    }
                }
            }

            // 3. Shuffle and pick `quantity` items
            Collections.shuffle(allItems);
            int count = Math.min(quantity, allItems.size());
            JSArray results = new JSArray();

            for (int i = 0; i < count; i++) {
                JSObject item = allItems.get(i);
                Uri uri = Uri.parse(item.getString("uri"));
                String type = item.getString("type");

                try {
                    Bitmap thumbnail = null;
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                        thumbnail = resolver.loadThumbnail(uri, new Size(800, 800), null);
                    } else {
                        InputStream in = resolver.openInputStream(uri);
                        BitmapFactory.Options opts = new BitmapFactory.Options();
                        opts.inSampleSize = 4;
                        thumbnail = BitmapFactory.decodeStream(in, null, opts);
                        if (in != null) in.close();
                    }

                    if (thumbnail != null) {
                        ByteArrayOutputStream baos = new ByteArrayOutputStream();
                        thumbnail.compress(Bitmap.CompressFormat.JPEG, 75, baos);
                        byte[] bytes = baos.toByteArray();
                        String base64 = Base64.encodeToString(bytes, Base64.NO_WRAP);
                        
                        item.put("data", "data:image/jpeg;base64," + base64);
                        results.put(item);
                    }
                } catch (Exception e) {
                    // Skip any unreadable media
                }
            }

            JSObject response = new JSObject();
            response.put("medias", results);
            call.resolve(response);

        } catch (Exception e) {
            call.reject("Failed to query media gallery: " + e.getMessage(), e);
        }
    }
}
