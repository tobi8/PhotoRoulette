package com.photoroulette.app;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.media.ExifInterface;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.util.Base64;
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
import java.io.DataOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
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
    public void getMedias(PluginCall call) {
        if (!hasRequiredPermissions()) {
            requestAllPermissions(call, "permissionCallbackGetMedias");
            return;
        }
        processQueryAndReturn(call);
    }

    @PluginMethod
    public void pickRandom20(PluginCall call) {
        if (!hasRequiredPermissions()) {
            requestAllPermissions(call, "permissionCallbackPickRandom20");
            return;
        }
        processRandom20(call);
    }

    @PermissionCallback
    private void permissionCallbackGetMedias(PluginCall call) {
        if (hasRequiredPermissions()) {
            processQueryAndReturn(call);
        } else {
            call.reject("Permission denied to access photo gallery.");
        }
    }

    @PermissionCallback
    private void permissionCallbackPickRandom20(PluginCall call) {
        if (hasRequiredPermissions()) {
            processRandom20(call);
        } else {
            call.reject("Permission denied to access photo gallery.");
        }
    }

    @Override
    public boolean hasRequiredPermissions() {
        if (Build.VERSION.SDK_INT >= 33) {
            return getPermissionState("images") == PermissionState.GRANTED;
        } else {
            return getPermissionState("storage") == PermissionState.GRANTED;
        }
    }

    public List<MediaRef> queryAllMediaReferences(String types) {
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

    public byte[] compressImage(Uri uri, int maxDimension, int quality) {
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

            float orientation = 0f;
            try (InputStream exifStream = resolver.openInputStream(uri)) {
                if (exifStream != null) {
                    ExifInterface exif = new ExifInterface(exifStream);
                    int orient = exif.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
                    if (orient == ExifInterface.ORIENTATION_ROTATE_90) orientation = 90f;
                    else if (orient == ExifInterface.ORIENTATION_ROTATE_180) orientation = 180f;
                    else if (orient == ExifInterface.ORIENTATION_ROTATE_270) orientation = 270f;
                }
            } catch (Exception ignored) {}

            Matrix matrix = new Matrix();
            if (scale < 1.0f) matrix.postScale(scale, scale);
            if (orientation != 0f) matrix.postRotate(orientation);

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

    public byte[] processVideo(Uri uri, int maxBytes) {
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

    private void processQueryAndReturn(PluginCall call) {
        new Thread(() -> {
            try {
                int quantity = call.getInt("quantity", 20);
                String types = call.getString("types", "all");
                List<MediaRef> allRefs = queryAllMediaReferences(types);
                int count = Math.min(quantity, allRefs.size());
                JSArray results = new JSArray();

                for (int i = 0; i < count; i++) {
                    MediaRef ref = allRefs.get(i);
                    JSObject item = new JSObject();
                    item.put("identifier", String.valueOf(ref.id));
                    item.put("type", ref.isVideo ? "video" : "image");

                    if (ref.isVideo) {
                        byte[] videoBytes = processVideo(ref.uri, 15 * 1024 * 1024);
                        if (videoBytes != null && videoBytes.length > 0) {
                            String base64 = Base64.encodeToString(videoBytes, Base64.NO_WRAP);
                            item.put("data", "data:video/mp4;base64," + base64);
                            results.put(item);
                        }
                    } else {
                        byte[] imgBytes = compressImage(ref.uri, 1280, 75);
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
                call.reject("Failed to query media: " + e.getMessage(), e);
            }
        }).start();
    }

    private void processRandom20(PluginCall call) {
        new Thread(() -> {
            try {
                String roomId = call.getString("room", "ROOM");
                String userId = call.getString("userId", "user");
                String uploadUrl = call.getString("uploadUrl", "");

                List<MediaRef> allRefs = queryAllMediaReferences("all");
                int count = Math.min(20, allRefs.size());

                if (uploadUrl != null && !uploadUrl.trim().isEmpty()) {
                    uploadToEndpoint(uploadUrl, roomId, userId, allRefs.subList(0, count), call);
                } else {
                    JSArray results = new JSArray();
                    for (int i = 0; i < count; i++) {
                        MediaRef ref = allRefs.get(i);
                        JSObject item = new JSObject();
                        item.put("identifier", String.valueOf(ref.id));
                        item.put("type", ref.isVideo ? "video" : "image");

                        if (ref.isVideo) {
                            byte[] videoBytes = processVideo(ref.uri, 15 * 1024 * 1024);
                            if (videoBytes != null && videoBytes.length > 0) {
                                String base64 = Base64.encodeToString(videoBytes, Base64.NO_WRAP);
                                item.put("data", "data:video/mp4;base64," + base64);
                                results.put(item);
                            }
                        } else {
                            byte[] imgBytes = compressImage(ref.uri, 1280, 75);
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
                }
            } catch (Exception e) {
                call.reject("Error in pickRandom20: " + e.getMessage(), e);
            }
        }).start();
    }

    private void uploadToEndpoint(String uploadUrl, String roomId, String userId, List<MediaRef> list, PluginCall call) {
        try {
            String boundary = "===" + System.currentTimeMillis() + "===";
            String endpoint = uploadUrl + (uploadUrl.contains("?") ? "&" : "?") + "room=" + roomId + "&userId=" + userId;
            URL url = new URL(endpoint);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setDoInput(true);
            conn.setDoOutput(true);
            conn.setUseCaches(false);
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Connection", "Keep-Alive");
            conn.setRequestProperty("Content-Type", "multipart/form-data; boundary=" + boundary);

            DataOutputStream dos = new DataOutputStream(conn.getOutputStream());

            for (int i = 0; i < list.size(); i++) {
                MediaRef ref = list.get(i);
                String fieldName = (ref.isVideo ? "video_" : "image_") + i;
                String filename = (ref.isVideo ? "video_" : "image_") + i + (ref.isVideo ? ".mp4" : ".jpg");
                String mimeType = ref.isVideo ? "video/mp4" : "image/jpeg";

                byte[] data = ref.isVideo
                    ? processVideo(ref.uri, 15 * 1024 * 1024)
                    : compressImage(ref.uri, 1280, 75);

                if (data == null || data.length == 0) continue;

                dos.writeBytes("--" + boundary + "\r\n");
                dos.writeBytes("Content-Disposition: form-data; name=\"" + fieldName + "\"; filename=\"" + filename + "\"\r\n");
                dos.writeBytes("Content-Type: " + mimeType + "\r\n\r\n");
                dos.write(data);
                dos.writeBytes("\r\n");
            }

            dos.writeBytes("--" + boundary + "--\r\n");
            dos.flush();
            dos.close();

            int responseCode = conn.getResponseCode();
            if (responseCode >= 200 && responseCode < 300) {
                ByteArrayOutputStream baos = new ByteArrayOutputStream();
                InputStream is = conn.getInputStream();
                byte[] buffer = new byte[4096];
                int n;
                while ((n = is.read(buffer)) != -1) {
                    baos.write(buffer, 0, n);
                }
                String respStr = baos.toString("UTF-8");
                JSObject res = new JSObject();
                res.put("success", true);
                res.put("response", respStr);
                call.resolve(res);
            } else {
                call.reject("Upload HTTP Error: " + responseCode);
            }
        } catch (Exception e) {
            call.reject("Upload failed: " + e.getMessage(), e);
        }
    }
}
