/**
 * Standard camera photo size (owner, 2026-10-02).
 *
 * A standard photo fits inside a 1200 x 900 box, width x height. The box is not
 * turned for portrait photos, the photo keeps its shape, and nothing is
 * enlarged. These are the office's own resize settings: "Fit", 1200 x 900 px,
 * "Do not enlarge if smaller", "Maintain aspect ratio", and "Reverse width and
 * height by orientation" left off. A landscape photo is therefore at most
 * 1200 x 900, and a 3:4 portrait photo at most 675 x 900.
 *
 * The JPEG is then stepped down from quality 95 until it is at most 300 KB.
 * That keeps photos about where installed builds sent them (1200 px, around
 * 235 KB) before the camera's limit had been raised to 3000 px and 700 KB.
 * Measured on 17 full-size originals: 232 KB on average, 164 to 293 KB.
 *
 * The Android camera applies the same rule in CameraViewEngine.kt
 * (fitInsideBox, STANDARD_PHOTO_MAX_WIDTH / _HEIGHT / _BYTES). These tests pin
 * the arithmetic; keep the two in step.
 */
export const CAMERA_PHOTO_BOX = Object.freeze({ width: 1200, height: 900 });
export const CAMERA_PHOTO_MAX_BYTES = 300 * 1024;

/** JPEG qualities tried in order until the photo fits: the Android camera's own ladder. */
export const CAMERA_PHOTO_QUALITY_LADDER: readonly number[] = Object.freeze([95, 85, 75, 65, 55, 45]);

/** The size that fits width x height inside the box, keeping the shape and never enlarging. */
export function fitInsideBox(
  width: number,
  height: number,
  box: { width: number; height: number } = CAMERA_PHOTO_BOX
): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) return { width, height };
  const scale = Math.min(1, box.width / width, box.height / height);
  if (scale >= 1) return { width, height };
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
