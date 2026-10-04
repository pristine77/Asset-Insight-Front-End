/**
 * Standard camera photo size (restored by the owner, 2026-10-03).
 *
 * A standard photo is at most 3000 px on its longest side, keeps its shape and
 * is never enlarged, and this camera saves it as JPEG at quality 95. These are
 * the values the camera used before 2026-10-02.
 *
 * Why restored: on 2026-10-02 both cameras were cut to fit inside 1200 x 900 at
 * most 300 KB (the office's resize setting), on the understanding that
 * installed builds already sent 1200 x 900 photos. They did not: the installed
 * build used a 3000 px longest side. The 1200 x 900 figure came from photos
 * already resized after upload. The cut left about a sixth of the detail, the
 * owner saw it on a real phone, and asked for the old setting back.
 *
 * The Android camera applies the same longest side in CameraViewEngine.kt
 * (STANDARD_PHOTO_MAX_SIDE, with its own 700 KB JPEG ladder); keep the two in
 * step.
 */
export const CAMERA_PHOTO_MAX_SIDE = 3000;
export const CAMERA_PHOTO_BOX = Object.freeze({ width: CAMERA_PHOTO_MAX_SIDE, height: CAMERA_PHOTO_MAX_SIDE });

/** The JPEG quality this camera saves at, as before 2026-10-02. */
export const CAMERA_PHOTO_JPEG_QUALITY = 95;

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
