/**
 * The Android camera sizes standard photos by the same rule as the JS camera
 * (src/utils/cameraPhotoSize.ts): fit inside 1200 x 900, never enlarged, then
 * at most 300 KB. There is no Kotlin test runner in this project, so the
 * native source is pinned here, as nativeCaptureWatermark.test.ts does.
 */
import fs from 'node:fs';
import path from 'node:path';

const engine = fs
  .readFileSync(
    path.join(
      path.resolve(__dirname, '../..'),
      'modules/auction-camera/android/src/main/java/expo/modules/auctioncamera/viewextensions/CameraViewEngine.kt'
    ),
    'utf8'
  )
  .replace(/\r\n/g, '\n');

/** Code only: line comments removed, so a comment cannot satisfy a check. */
const code = engine
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('//'))
  .join('\n');

function section(start: string, end: string): string {
  const startIndex = code.indexOf(start);
  const endIndex = code.indexOf(end, startIndex + start.length);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return code.slice(startIndex, endIndex);
}

describe('Android standard photo size', () => {
  it("declares the office's 1200 x 900 box and the 300 KB target", () => {
    expect(code).toContain('internal const val STANDARD_PHOTO_MAX_WIDTH = 1200');
    expect(code).toContain('internal const val STANDARD_PHOTO_MAX_HEIGHT = 900');
    expect(code).toContain('internal const val STANDARD_PHOTO_MAX_BYTES = 300 * 1024');
  });

  it('fits inside the box with the same arithmetic as the JS camera', () => {
    const fit = section('internal fun fitInsideBox(', 'class CameraViewEngine(');
    expect(fit).toContain('if (width <= 0 || height <= 0) return Pair(width, height)');
    expect(fit).toContain('val scale = minOf(1.0, boxWidth.toDouble() / width, boxHeight.toDouble() / height)');
    expect(fit).toContain('if (scale >= 1.0) return Pair(width, height)');
    expect(fit).toContain('Math.round(width * scale).toInt().coerceAtLeast(1)');
    expect(fit).toContain('Math.round(height * scale).toInt().coerceAtLeast(1)');
  });

  it('applies the box and the target to every captured photo, and keeps the 12 MP option', () => {
    const processing = section('private fun processCapturedFile(', 'private fun applyBitmapEffects(');
    expect(processing).toContain(
      'fitInsideBox(bitmap.width, bitmap.height, STANDARD_PHOTO_MAX_WIDTH, STANDARD_PHOTO_MAX_HEIGHT)'
    );
    expect(processing).toContain('fitInsideBox(bitmap.width, bitmap.height, 6000, 6000)');
    expect(processing).toContain('else -> STANDARD_PHOTO_MAX_BYTES');
    expect(processing).toContain('use12MPOutput -> 1 * 1024 * 1024');
    // The 3000 px longest side and the 700 KB JPEG target are gone.
    expect(processing).not.toContain('MAX_SIDE');
    expect(processing).not.toContain('700 * 1024');
    // Resized before the watermark is drawn, so the logo is sized to the final photo.
    expect(processing.indexOf('STANDARD_PHOTO_MAX_HEIGHT)')).toBeLessThan(
      processing.indexOf('CameraPhotoWatermark.stamp(context, bitmap)')
    );
  });
});
