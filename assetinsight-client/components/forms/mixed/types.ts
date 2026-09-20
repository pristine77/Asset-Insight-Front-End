import type { AnnBox } from "./ImageAnnotator";

export type MixedMode = "single_lot" | "per_item" | "per_photo";

export type CameraLens = {
  id: string;
  label: string;
  type: "ultrawide" | "main" | "telephoto";
  zoom: number;
};

export type MixedLot = {
  id: string;
  /** Opaque upstream identity used to preserve an integration lot mapping. */
  source?: {
    key: string;
    lotId?: string;
    submissionId?: string;
    lotNumber?: string;
    label?: string;
    title?: string;
    description?: string;
    locked?: boolean;
  };
  /** Main images sent through the analysis workflow. */
  files: File[];
  /** Report-only images that are not analyzed. */
  extraFiles: File[];
  /** Zero-based index within `files`. */
  coverIndex: number;
  mode?: MixedMode;
  /** Optional report-only videos. */
  videoFiles?: File[];
  /** Normalized focus boxes, keyed by the persisted file signature. */
  annotations?: Record<string, AnnBox[]>;
};

/**
 * Persistable identity for media and annotation records. This intentionally
 * does not rely on object identity so it survives draft serialization.
 */
export function getMixedFileKey(file: File): string {
  return `${file.name}|${file.size}|${file.lastModified || 0}`;
}
