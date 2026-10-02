import { CAMERA_PHOTO_BOX, CAMERA_PHOTO_MAX_BYTES, CAMERA_PHOTO_QUALITY_LADDER, fitInsideBox } from './cameraPhotoSize';

describe('standard camera photo size', () => {
  it("uses the office's 1200 x 900 box and a 300 KB target", () => {
    expect(CAMERA_PHOTO_BOX).toEqual({ width: 1200, height: 900 });
    expect(CAMERA_PHOTO_MAX_BYTES).toBe(300 * 1024);
    expect(CAMERA_PHOTO_QUALITY_LADDER).toEqual([95, 85, 75, 65, 55, 45]);
  });

  it.each([
    ['a 12 MP landscape photo', 4032, 3024, 1200, 900],
    ['a 4000 x 3000 landscape photo', 4000, 3000, 1200, 900],
    ['a 16:9 landscape photo', 1920, 1080, 1200, 675],
    ['a 3:4 portrait photo', 3024, 4032, 675, 900],
    ['a 9:16 portrait photo', 1080, 1920, 506, 900],
    ['a photo already exactly the size', 1200, 900, 1200, 900],
    ['a photo one pixel too wide', 1201, 900, 1200, 899],
  ])('fits %s inside 1200 x 900 without changing its shape', (_label, w, h, expectedW, expectedH) => {
    expect(fitInsideBox(w, h)).toEqual({ width: expectedW, height: expectedH });
  });

  it('never enlarges a smaller photo', () => {
    expect(fitInsideBox(1000, 700)).toEqual({ width: 1000, height: 700 });
    expect(fitInsideBox(640, 480)).toEqual({ width: 640, height: 480 });
  });

  it('passes an unreadable size through unchanged rather than inventing one', () => {
    expect(fitInsideBox(0, 900)).toEqual({ width: 0, height: 900 });
    expect(fitInsideBox(Number.NaN, 900)).toEqual({ width: Number.NaN, height: 900 });
  });

  it('accepts another box, as the 12 MP option uses on Android', () => {
    expect(fitInsideBox(8000, 6000, { width: 6000, height: 6000 })).toEqual({ width: 6000, height: 4500 });
  });
});
