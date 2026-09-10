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
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.provider.Settings;
import android.util.Base64;
import android.util.Size;
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
import java.util.HashSet;
import java.util.List;
import java.util.Random;
import java.util.Set;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

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

    private static final int TARGET_BOUNDING_BOX = 1080;
    private static final int JPEG_QUALITY = 60;
    private final ExecutorService executor = Executors.newFixedThreadPool(
        Math.min(20, Math.max(4, Runtime.getRuntime().availableProcessors() * 2))
    );

    private static class MediaRef {
        Uri uri;
        boolean isVideo;
        long id;
        long dateTaken;

        MediaRef(Uri uri, boolean isVideo, long id, long dateTaken) {
            this.uri = uri;
            this.isVideo = isVideo;
            this.id = id;
            this.dateTaken = dateTaken;
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

    private List<MediaRef> queryTrueShuffledMedia(String types, int targetCount) {
        List<MediaRef> allCandidates = new ArrayList<>();
        ContentResolver resolver = getContext().getContentResolver();

        boolean includeImages = !"videos".equalsIgnoreCase(types);
        boolean includeVideos = !"photos".equalsIgnoreCase(types);

        if (includeImages) {
            Uri imageCollection = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                ? MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL)
                : MediaStore.Images.Media.EXTERNAL_CONTENT_URI;
            String[] projection = {
                MediaStore.Images.Media._ID,
                MediaStore.Images.Media.DATE_TAKEN
            };
            try (Cursor cursor = resolver.query(imageCollection, projection, null, null, null)) {
                if (cursor != null) {
                    int idCol = cursor.getColumnIndexOrThrow(MediaStore.Images.Media._ID);
                    int dateCol = cursor.getColumnIndex(MediaStore.Images.Media.DATE_TAKEN);
                    while (cursor.moveToNext()) {
                        long id = cursor.getLong(idCol);
                        long date = dateCol != -1 ? cursor.getLong(dateCol) : 0L;
                        allCandidates.add(new MediaRef(ContentUris.withAppendedId(imageCollection, id), false, id, date));
                    }
                }
            } catch (Exception ignored) {}
        }

        if (includeVideos) {
            Uri videoCollection = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                ? MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL)
                : MediaStore.Video.Media.EXTERNAL_CONTENT_URI;
            String[] projection = {
                MediaStore.Video.Media._ID,
                MediaStore.Video.Media.DATE_TAKEN
            };
            try (Cursor cursor = resolver.query(videoCollection, projection, null, null, null)) {
                if (cursor != null) {
                    int idCol = cursor.getColumnIndexOrThrow(MediaStore.Video.Media._ID);
                    int dateCol = cursor.getColumnIndex(MediaStore.Video.Media.DATE_TAKEN);
                    while (cursor.moveToNext()) {
                        long id = cursor.getLong(idCol);
                        long date = dateCol != -1 ? cursor.getLong(dateCol) : 0L;
                        allCandidates.add(new MediaRef(ContentUris.withAppendedId(videoCollection, id), true, id, date));
                    }
                }
            } catch (Exception ignored) {}
        }

        if (allCandidates.isEmpty()) {
            return Collections.emptyList();
        }

        Collections.shuffle(allCandidates, new Random());

        List<MediaRef> deduplicated = new ArrayList<>(targetCount);
        List<MediaRef> skipped = new ArrayList<>();

        for (MediaRef candidate : allCandidates) {
            if (deduplicated.size() >= targetCount) {
                break;
            }
            boolean isBurst = false;
            if (candidate.dateTaken > 0) {
                for (MediaRef picked : deduplicated) {
                    if (picked.dateTaken > 0 && Math.abs(candidate.dateTaken - picked.dateTaken) < 30000L) {
                        isBurst = true;
                        break;
                    }
                }
            }
            if (!isBurst) {
                deduplicated.add(candidate);
            } else {
                skipped.add(candidate);
            }
        }

        if (deduplicated.size() < targetCount && !skipped.isEmpty()) {
            for (MediaRef fallback : skipped) {
                if (deduplicated.size() >= targetCount) {
                    break;
                }
                deduplicated.add(fallback);
            }
        }

        Collections.shuffle(deduplicated);
        return deduplicated;
    }

    private byte[] decodeAndCompressThumbnail(Uri uri, boolean isVideo) {
        ContentResolver resolver = getContext().getContentResolver();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            try {
                Bitmap thumb = resolver.loadThumbnail(uri, new Size(TARGET_BOUNDING_BOX, TARGET_BOUNDING_BOX), null);
                if (thumb != null) {
                    Bitmap scaled = scaleBitmapWithinBox(thumb, TARGET_BOUNDING_BOX);
                    ByteArrayOutputStream stream = new ByteArrayOutputStream();
                    scaled.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, stream);
                    if (scaled != thumb) {
                        scaled.recycle();
                    }
                    thumb.recycle();
                    return stream.toByteArray();
                }
            } catch (Exception ignored) {}
        }

        if (isVideo) {
            MediaMetadataRetriever retriever = new MediaMetadataRetriever();
            try {
                retriever.setDataSource(getContext(), uri);
                Bitmap frame = retriever.getFrameAtTime();
                if (frame != null) {
                    Bitmap scaled = scaleBitmapWithinBox(frame, TARGET_BOUNDING_BOX);
                    ByteArrayOutputStream stream = new ByteArrayOutputStream();
                    scaled.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, stream);
                    if (scaled != frame) {
                        scaled.recycle();
                    }
                    frame.recycle();
                    return stream.toByteArray();
                }
            } catch (Exception ignored) {
            } finally {
                try {
                    retriever.release();
                } catch (Exception ignored) {}
            }
            return null;
        }

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
            while (width / 2 >= TARGET_BOUNDING_BOX && height / 2 >= TARGET_BOUNDING_BOX) {
                width /= 2;
                height /= 2;
                sampleSize *= 2;
            }

            BitmapFactory.Options decodeOpts = new BitmapFactory.Options();
            decodeOpts.inSampleSize = sampleSize;
            decodeOpts.inPreferredConfig = Bitmap.Config.RGB_565;

            is = resolver.openInputStream(uri);
            if (is == null) return null;
            Bitmap rawBitmap = BitmapFactory.decodeStream(is, null, decodeOpts);
            is.close();
            if (rawBitmap == null) return null;

            Bitmap orientedBitmap = adjustOrientation(resolver, uri, rawBitmap);
            Bitmap scaledBitmap = scaleBitmapWithinBox(orientedBitmap, TARGET_BOUNDING_BOX);

            ByteArrayOutputStream stream = new ByteArrayOutputStream();
            scaledBitmap.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, stream);

            if (scaledBitmap != orientedBitmap) {
                scaledBitmap.recycle();
            }
            if (orientedBitmap != rawBitmap) {
                orientedBitmap.recycle();
            }
            rawBitmap.recycle();

            return stream.toByteArray();
        } catch (Exception e) {
            return null;
        } finally {
            if (is != null) {
                try {
                    is.close();
                } catch (Exception ignored) {}
            }
        }
    }

    private Bitmap scaleBitmapWithinBox(Bitmap src, int maxDimension) {
        int w = src.getWidth();
        int h = src.getHeight();
        int longest = Math.max(w, h);
        if (longest <= maxDimension) return src;

        float ratio = (float) maxDimension / (float) longest;
        int targetW = Math.max(1, Math.round(w * ratio));
        int targetH = Math.max(1, Math.round(h * ratio));

        return Bitmap.createScaledBitmap(src, targetW, targetH, true);
    }

    private Bitmap adjustOrientation(ContentResolver resolver, Uri uri, Bitmap bitmap) {
        InputStream is = null;
        try {
            is = resolver.openInputStream(uri);
            if (is == null) return bitmap;
            ExifInterface exif = new ExifInterface(is);
            int orientation = exif.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
            Matrix matrix = new Matrix();
            if (orientation == ExifInterface.ORIENTATION_ROTATE_90) {
                matrix.postRotate(90);
            } else if (orientation == ExifInterface.ORIENTATION_ROTATE_180) {
                matrix.postRotate(180);
            } else if (orientation == ExifInterface.ORIENTATION_ROTATE_270) {
                matrix.postRotate(270);
            } else {
                return bitmap;
            }
            Bitmap rotated = Bitmap.createBitmap(bitmap, 0, 0, bitmap.getWidth(), bitmap.getHeight(), matrix, true);
            if (rotated != bitmap) {
                bitmap.recycle();
            }
            return rotated;
        } catch (Exception e) {
            return bitmap;
        } finally {
            if (is != null) {
                try {
                    is.close();
                } catch (Exception ignored) {}
            }
        }
    }

    private void processRandom20(PluginCall call) {
        executor.execute(() -> {
            try {
                String types = call.getString("types", "all");
                List<MediaRef> refs = queryTrueShuffledMedia(types, 20);
                List<Callable<JSObject>> tasks = new ArrayList<>(refs.size());

                for (MediaRef ref : refs) {
                    tasks.add(() -> {
                        byte[] bytes = decodeAndCompressThumbnail(ref.uri, ref.isVideo);
                        if (bytes == null || bytes.length == 0) return null;
                        String base64 = Base64.encodeToString(bytes, Base64.NO_WRAP);
                        JSObject item = new JSObject();
                        item.put("identifier", String.valueOf(ref.id));
                        item.put("type", ref.isVideo ? "video" : "image");
                        item.put("data", "data:image/jpeg;base64," + base64);
                        return item;
                    });
                }

                List<Future<JSObject>> futures = executor.invokeAll(tasks);
                JSArray results = new JSArray();

                for (Future<JSObject> future : futures) {
                    try {
                        JSObject item = future.get();
                        if (item != null) {
                            results.put(item);
                        }
                    } catch (Exception ignored) {}
                }

                JSObject res = new JSObject();
                res.put("medias", results);
                call.resolve(res);
            } catch (Exception e) {
                call.reject(e.getMessage());
            }
        });
    }

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        executor.shutdown();
    }
}
