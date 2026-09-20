export type PreviewLotPhotoEntry = {
  globalIndex: number | null;
  url: string;
};

const validIndexes = (value: unknown): number[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map(Number)
    .filter(
      (index, position, indexes) =>
        Number.isInteger(index) && index >= 0 && indexes.indexOf(index) === position
    );
};

const validUrls = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((url): url is string => typeof url === "string" && Boolean(url.trim()))
    .map((url) => url.trim());
};

const entriesFromUrls = (
  urls: string[],
  pairedIndexes: number[],
  rootImageUrls: string[]
): PreviewLotPhotoEntry[] =>
  urls.map((url, position) => {
    const pairedIndex = pairedIndexes[position];
    const globalIndex =
      Number.isInteger(pairedIndex)
        ? pairedIndex
        : rootImageUrls.indexOf(url);
    return { url, globalIndex: globalIndex >= 0 ? globalIndex : null };
  });

const entriesFromIndexes = (
  indexes: number[],
  rootImageUrls: string[]
): PreviewLotPhotoEntry[] =>
  indexes.flatMap((globalIndex) => {
    const url = rootImageUrls[globalIndex];
    return url ? [{ globalIndex, url }] : [];
  });

const entriesFromRepresentations = (
  urls: string[],
  indexes: number[],
  rootImageUrls: string[]
): PreviewLotPhotoEntry[] =>
  urls.length
    ? [
        ...entriesFromUrls(urls, indexes, rootImageUrls),
        ...entriesFromIndexes(indexes.slice(urls.length), rootImageUrls),
      ]
    : entriesFromIndexes(indexes, rootImageUrls);

/**
 * Lot-local URLs are the durable association and ordering source. Paired
 * indexes retain deletion identity, while unmatched trailing indexes support
 * partially migrated previews. Conflicting representations are never merged.
 */
export const getPreviewLotPhotoEntries = (
  lot: any,
  rootImageUrlsValue: unknown
): PreviewLotPhotoEntry[] => {
  const rootImageUrls = Array.isArray(rootImageUrlsValue)
    ? rootImageUrlsValue.map((url) =>
        typeof url === "string" ? url.trim() : ""
      )
    : [];
  const mainIndexes = validIndexes(
    Array.isArray(lot?.image_indexes) && lot.image_indexes.length
      ? lot.image_indexes
      : lot?.image_index !== null &&
          lot?.image_index !== undefined &&
          Number.isInteger(Number(lot.image_index))
        ? [Number(lot.image_index)]
        : []
  );
  const extraIndexes = validIndexes(lot?.extra_image_indexes);
  const mainUrls = validUrls(lot?.image_urls);
  const extraUrls = validUrls(lot?.extra_image_urls);
  const scalarMainUrl =
    typeof lot?.image_url === "string" && lot.image_url.trim()
      ? lot.image_url.trim()
      : "";
  const authoritativeMainUrls = mainUrls.length
    ? mainUrls
    : scalarMainUrl
      ? [scalarMainUrl]
      : [];

  const mainEntries = entriesFromRepresentations(
    authoritativeMainUrls,
    mainIndexes,
    rootImageUrls
  );
  const extraEntries = entriesFromRepresentations(extraUrls, extraIndexes, rootImageUrls);
  const entries = [...mainEntries, ...extraEntries];

  return entries.filter(
    (entry, position) => entries.findIndex((candidate) => candidate.url === entry.url) === position
  );
};
