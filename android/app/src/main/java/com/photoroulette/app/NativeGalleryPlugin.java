package com.photoroulette.app;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.media.ExifInterface;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.provider.Settings;
import android.util.Base64;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
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
            alias = "media",
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

    private static class MediaRef {
        Uri uri;
        boolean isVideo;
        long id;

        MediaRef(Uri uri, boolean isVideo, long id) {
            this.uri = uri;
            this.isVideo = isVideo;
            this.id = id;
        }
    }

    @PluginMethod
    public void pickRandom20(PluginCall call) {
        if (!hasRequiredPermissions()) {
            if (Build.VERSION.SDK_INT >= 33) {
                requestPermissionForAlias("media", call, "permissionCallbackPickRandom20");
            } else {
                requestPermissionForAlias("storage", call, "permissionCallbackPickRandom20");
            }
            return;
        }
        processRandom20(call);
    }

    @PluginMethod
    public void reroll(PluginCall call) {
        if (!hasRequiredPermissions()) {
            if (Build.VERSION.SDK_INT >= 33) {
                requestPermissionForAlias("media", call, "permissionCallbackPickRandom20");
            } else {
                requestPermissionForAlias("storage", call, "permissionCallbackPickRandom20");
            }
            return;
        }
        processRandom20(call);
    }

    @PluginMethod
    public void checkGalleryPermission(PluginCall call) {
        JSObject res = new JSObject();
        res.put("granted", hasRequiredPermissions());
        call.resolve(res);
    }

    @PluginMethod
    public void requestGalleryPermission(PluginCall call) {
        if (hasRequiredPermissions()) {
            JSObject res = new JSObject();
            res.put("granted", true);
            call.resolve(res);
            return;
        }
        if (Build.VERSION.SDK_INT >= 33) {
            requestPermissionForAlias("media", call, "permissionCallbackDirectRequest");
        } else {
            requestPermissionForAlias("storage", call, "permissionCallbackDirectRequest");
        }
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            Uri uri = Uri.fromParts("package", getContext().getPackageName(), null);
            intent.setData(uri);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    @PermissionCallback
    private void permissionCallbackDirectRequest(PluginCall call) {
        JSObject res = new JSObject();
        res.put("granted", hasRequiredPermissions());
        call.resolve(res);
    }

    @PermissionCallback
    private void permissionCallbackPickRandom20(PluginCall call) {
        if (hasRequiredPermissions()) {
            processRandom20(call);
        } else {
            call.reject("Permission denied to access gallery.");
        }
    }

    @Override
    public boolean hasRequiredPermissions() {
        if (Build.VERSION.SDK_INT >= 33) {
            boolean hasImages = getContext().checkSelfPermission(Manifest.permission.READ_MEDIA_IMAGES) == PackageManager.PERMISSION_GRANTED;
            boolean hasVideos = getContext().checkSelfPermission(Manifest.permission.READ_MEDIA_VIDEO) == PackageManager.PERMISSION_GRANTED;
            if (Build.VERSION.SDK_INT >= 34) {
                boolean hasPartial = getContext().checkSelfPermission("android.permission.READ_MEDIA_VISUAL_USER_SELECTED") == PackageManager.PERMISSION_GRANTED;
                return hasImages || hasVideos || hasPartial;
            }
            return hasImages || hasVideos;
        } else {
            return getContext().checkSelfPermission(Manifest.permission.READ_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED;
        }
    }

    private List<MediaRef> queryAllMediaReferences(String types) {
        List<MediaRef> allItems = new ArrayList<>();
        ContentResolver resolver = getContext().getContentResolver();

        if (!"videos".equalsIgnoreCase(types)) {
            Uri[] imageUris = {
                MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                MediaStore.Images.Media.INTERNAL_CONTENT_URI
            };
            String[] projection = { MediaStore.Images.Media._ID };
            for (Uri collection : imageUris) {
                try (Cursor cursor = resolver.query(collection, projection, null, null, null)) {
                    if (cursor != null) {
                        int idColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media._ID);
                        while (cursor.moveToNext()) {
                            long id = cursor.getLong(idColumn);
                            Uri contentUri = ContentUris.withAppendedId(collection, id);
                            allItems.add(new MediaRef(contentUri, false, id));
                        }
                    }
                } catch (Exception ignored) {}
            }
        }

        if (!"photos".equalsIgnoreCase(types)) {
            Uri[] videoUris = {
                MediaStore.Video.Media.EXTERNAL_CONTENT_URI,
                MediaStore.Video.Media.INTERNAL_CONTENT_URI
            };
            String[] projection = { MediaStore.Video.Media._ID };
            for (Uri collection : videoUris) {
                try (Cursor cursor = resolver.query(collection, projection, null, null, null)) {
                    if (cursor != null) {
                        int idColumn = cursor.getColumnIndexOrThrow(MediaStore.Video.Media._ID);
                        while (cursor.moveToNext()) {
                            long id = cursor.getLong(idColumn);
                            Uri contentUri = ContentUris.withAppendedId(collection, id);
                            allItems.add(new MediaRef(contentUri, true, id));
                        }
                    }
                } catch (Exception ignored) {}
            }
        }

        Collections.shuffle(allItems);
        return allItems;
    }

    private byte[] compressImage(Uri uri, int maxDimension, int quality) {
        ContentResolver resolver = getContext().getContentResolver();
        InputStream is = null;
        try {
            is = resolver.openInputStream(uri);
            if (is == null) return null;

            BitmapFactory.Options boundsOpts = new BitmapFactory.Options();
            boundsOpts.inJustDecodeBounds = true;
            BitmapFactory.decodeStream(is, null, boundsOpts);
            is.close();

            int sampleSize = 1;
            int width = boundsOpts.outWidth;
            int height = boundsOpts.outHeight;
            while (width / 2 >= maxDimension || height / 2 >= maxDimension) {
                width /= 2;
                height /= 2;
                sampleSize *= 2;
            }

            BitmapFactory.Options decodeOpts = new BitmapFactory.Options();
            decodeOpts.inSampleSize = sampleSize;
            is = resolver.openInputStream(uri);
            if (is == null) return null;
            Bitmap bitmap = BitmapFactory.decodeStream(is, null, decodeOpts);
            is.close();
            if (bitmap == null) return null;

            int currentWidth = bitmap.getWidth();
            int currentHeight = bitmap.getHeight();
            float scale = Math.min(1.0f, (float) maxDimension / Math.max(currentWidth, currentHeight));

            Matrix matrix = new Matrix();
            if (scale < 1.0f) matrix.postScale(scale, scale);

            Bitmap scaledBitmap = Bitmap.createBitmap(bitmap, 0, 0, currentWidth, currentHeight, matrix, true);
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            scaledBitmap.compress(Bitmap.CompressFormat.JPEG, quality, baos);
            if (scaledBitmap != bitmap) {
                scaledBitmap.recycle();
            }
            bitmap.recycle();
            return baos.toByteArray();
        } catch (Exception e) {
            return null;
        } finally {
            if (is != null) {
                try { is.close(); } catch (Exception ignored) {}
            }
        }
    }

    private byte[] processVideo(Uri uri, int maxBytes) {
        ContentResolver resolver = getContext().getContentResolver();
        try (InputStream is = resolver.openInputStream(uri)) {
            if (is == null) return null;
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            int total = 0;
            while ((n = is.read(buf)) != -1) {
                if (total + n > maxBytes) {
                    baos.write(buf, 0, maxBytes - total);
                    break;
                }
                baos.write(buf, 0, n);
                total += n;
            }
            return baos.toByteArray();
        } catch (Exception e) {
            return null;
        }
    }

    private void processRandom20(PluginCall call) {
        new Thread(() -> {
            try {
                String types = call.getString("types", "all");
                List<MediaRef> allRefs = queryAllMediaReferences(types);
                int count = Math.min(20, allRefs.size());
                JSArray results = new JSArray();

                for (int i = 0; i < count; i++) {
                    MediaRef ref = allRefs.get(i);
                    JSObject item = new JSObject();
                    item.put("identifier", String.valueOf(ref.id));
                    item.put("type", ref.isVideo ? "video" : "image");

                    if (ref.isVideo) {
                        byte[] videoBytes = processVideo(ref.uri, 10 * 1024 * 1024);
                        if (videoBytes != null && videoBytes.length > 0) {
                            String base64 = Base64.encodeToString(videoBytes, Base64.NO_WRAP);
                            item.put("data", "data:video/mp4;base64," + base64);
                            results.put(item);
                        }
                    } else {
                        byte[] imgBytes = compressImage(ref.uri, 480, 50);
                        if (imgBytes != null && imgBytes.length > 0) {
                            String base64 = Base64.encodeToString(imgBytes, Base64.NO_WRAP);
                            item.put("data", "data:image/jpeg;base64," + base64);
                            results.put(item);
                        }
                    }
                }

                JSObject res = new JSObject();
                res.put("medias", results);
                call.resolve(res);
            } catch (Exception e) {
                call.reject(e.getMessage());
            }
        }).start();
    }
}
