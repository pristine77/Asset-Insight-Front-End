import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_IMAGE_WATERMARK, restoreImageWatermarkPreference } from './watermarkPreference';

describe('native image watermark preference', () => {
  it('starts new reports and resets with watermarking off', () => {
    expect(DEFAULT_IMAGE_WATERMARK).toBe(false);
  });

  it.each([undefined, null, false, '', 'true', 'false', 0, 1])('keeps absent or non-opted-in stored value %p off', (stored) => {
    expect(restoreImageWatermarkPreference(stored)).toBe(false);
  });

  it('preserves explicit saved opt-in and opt-out', () => {
    expect(restoreImageWatermarkPreference(true)).toBe(true);
    expect(restoreImageWatermarkPreference(false)).toBe(false);
  });

  it.each([
    ['AssetFormSheet.tsx', 1, 3],
    // Close now uses the same resetForm path instead of duplicating every setter.
    ['LotListingFormSheet.tsx', 2, 2],
  ] as const)('wires %s fresh/reset/restore paths through the default-off policy', (file, resetCount, restoreCount) => {
    const source = fs.readFileSync(path.join(__dirname, '../components/forms', file), 'utf8');
    expect(source).toContain('const [watermarkImages, setWatermarkImages] = useState(DEFAULT_IMAGE_WATERMARK)');
    expect(source.match(/setWatermarkImages\(DEFAULT_IMAGE_WATERMARK\)/g)).toHaveLength(resetCount);
    expect(source.match(/setWatermarkImages\(restoreImageWatermarkPreference\(/g)).toHaveLength(restoreCount);
    expect(source).not.toContain('setWatermarkImages(true)');
    expect(source).not.toContain('watermarkImages !== false');
    expect(source).toContain('watermark_images: watermarkImages');
    expect(source).toContain('For imported, unwatermarked photos only.');
    expect(source).toContain('Off by default.');
  });
});
