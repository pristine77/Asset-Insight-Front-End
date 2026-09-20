package com.assetinsight.app;

import android.app.Instrumentation;
import android.app.Activity;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.os.Bundle;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.nio.file.Files;
import java.util.Arrays;
import expo.modules.auctioncamera.utils.CameraPhotoWatermark;
import expo.modules.auctioncamera.utils.PhotoWatermarkReceipt;

/** Offline native-pixel/receipt smoke test. No login, API calls or report writes. */
public class PhotoWatermarkInstrumentation extends Instrumentation {
    @Override public void onCreate(Bundle arguments) { super.onCreate(arguments); start(); }
    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
    @Override public void onStart() {
        Bundle result = new Bundle();
        try {
            CaptureJournalAssertions.run(getTargetContext());
            ContentUriUploaderAssertions.run(getTargetContext());
            File directory = new File(getTargetContext().getExternalFilesDir(null), "watermark-qa");
            directory.mkdirs();
            for (String type : new String[]{"jpeg", "webp"}) {
                Bitmap source = Bitmap.createBitmap(1000, 800, Bitmap.Config.ARGB_8888);
                source.eraseColor(Color.LTGRAY);
                Bitmap stamped = CameraPhotoWatermark.INSTANCE.stamp(getTargetContext(), source);
                check(stamped.getPixel(50, 50) == Color.LTGRAY, "Stamp changed pixels outside the logo region");
                int changed = 0;
                for (int y = 500; y < 780; y++) for (int x = 700; x < 990; x++) {
                    if (stamped.getPixel(x, y) != Color.LTGRAY) changed++;
                }
                check(changed > 300, "No visible camera logo");
                ByteArrayOutputStream stream = new ByteArrayOutputStream();
                stamped.compress(type.equals("jpeg") ? Bitmap.CompressFormat.JPEG : Bitmap.CompressFormat.WEBP, 90, stream);
                stamped.recycle();
                byte[] original = stream.toByteArray();
                byte[] marked = PhotoWatermarkReceipt.INSTANCE.add(original);
                check(PhotoWatermarkReceipt.INSTANCE.has(marked), "Receipt did not verify");
                check(Arrays.equals(marked, PhotoWatermarkReceipt.INSTANCE.add(marked)), "Receipt applied twice");
                Bitmap decoded = BitmapFactory.decodeByteArray(marked, 0, marked.length);
                check(decoded != null && decoded.getWidth() == 1000 && decoded.getHeight() == 800, "Native decoder rejected marked photo");
                decoded.recycle();
                Files.write(new File(directory, "camera." + type).toPath(), marked);
                Files.write(new File(directory, "encoded-without-receipt." + type).toPath(), original);
            }
            result.putString("stream", "PASS: native ContentURI HTTPS exact bytes/length/progress, active and queued cancellation, four-worker bound, capture journal revisions, JPEG/WebP logo pixels, receipt idempotency and Android decoding. Fixtures: " + directory);
            finish(Activity.RESULT_OK, result);
        } catch (Throwable error) {
            result.putString("stream", "FAIL: " + error.toString());
            finish(Activity.RESULT_CANCELED, result);
        }
    }
}
