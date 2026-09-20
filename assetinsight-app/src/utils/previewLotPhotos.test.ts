import { getPreviewLotPhotoEntries } from './previewLotPhotos';
import { removeLotPhotoReference } from './previewPhotoDeletion';

describe('preview lot photo resolution', () => {
  test('does not mix a previous lot into URL-backed photos when the root list is stale', () => {
    const staleRoot = [
      'lot-1012-a.jpg',
      'deleted.jpg',
      'lot-1013-a.jpg',
      'lot-1013-b.jpg',
      'lot-1014-a.jpg',
      'lot-1014-b.jpg',
    ];

    expect(
      getPreviewLotPhotoEntries(
        {
          image_indexes: [3, 4],
          image_urls: ['lot-1014-a.jpg', 'lot-1014-b.jpg'],
          image_url: 'lot-1013-b.jpg',
        },
        staleRoot
      ).map((entry) => entry.url)
    ).toEqual(['lot-1014-a.jpg', 'lot-1014-b.jpg']);
  });

  test('supports legacy index-only lots', () => {
    expect(
      getPreviewLotPhotoEntries({ image_indexes: [2], extra_image_indexes: [3] }, [
        'zero.jpg',
        'one.jpg',
        'main.jpg',
        'extra.jpg',
      ])
    ).toEqual([
      { globalIndex: 2, url: 'main.jpg' },
      { globalIndex: 3, url: 'extra.jpg' },
    ]);
  });

  test('keeps unmatched trailing indexes in partially migrated URL arrays', () => {
    expect(
      getPreviewLotPhotoEntries(
        {
          image_indexes: [0, 1],
          image_urls: ['main-a.jpg'],
          extra_image_indexes: [2, 3],
          extra_image_urls: ['extra-a.jpg'],
        },
        ['main-a.jpg', 'main-b.jpg', 'extra-a.jpg', 'extra-b.jpg']
      )
    ).toEqual([
      { globalIndex: 0, url: 'main-a.jpg' },
      { globalIndex: 1, url: 'main-b.jpg' },
      { globalIndex: 2, url: 'extra-a.jpg' },
      { globalIndex: 3, url: 'extra-b.jpg' },
    ]);
  });

  test('trusts a scalar URL and its paired index over a stale root URL', () => {
    expect(
      getPreviewLotPhotoEntries({ image_indexes: [], image_index: 0, image_url: 'correct.jpg' }, [
        'foreign.jpg',
        'correct.jpg',
      ])
    ).toEqual([{ globalIndex: 0, url: 'correct.jpg' }]);
  });

  test('keeps the remapped preview index when deleting against a stale root list', () => {
    const lot = {
      image_indexes: [0, 1],
      image_urls: ['lot-1013-a.jpg', 'lot-1013-b.jpg'],
    };
    const entries = getPreviewLotPhotoEntries(lot, [
      'lot-1012-tail.jpg',
      'lot-1013-a.jpg',
      'lot-1013-b.jpg',
    ]);

    expect(entries[0]).toEqual({ globalIndex: 0, url: 'lot-1013-a.jpg' });
    const next = removeLotPhotoReference({ lots: [lot] }, 0, entries[0]);
    expect(next.lots[0].image_indexes).toEqual([1]);
    expect(next.lots[0].image_urls).toEqual(['lot-1013-b.jpg']);
    expect(next.deleted_image_indexes).toEqual([0]);
    expect(next.deleted_image_urls).toEqual(['lot-1013-a.jpg']);
  });
});
