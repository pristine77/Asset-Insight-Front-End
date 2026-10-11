"use client";

/**
 * Tracks a per-lot Re-Generate for an open report preview (see
 * lib/lotRegeneration.ts). While the server reports a pending reading, the
 * preview re-reads the report every few seconds (skipping hidden tabs) until
 * the record clears, which means the fresh lot has been written into the
 * saved preview, or reports a failure.
 */

import { useEffect, useRef, useState } from "react";
import {
  LOT_REGENERATION_POLL_MS,
  isLotRegenerationPending,
  readLotRegeneration,
  type LotRegeneration,
} from "@/lib/lotRegeneration";

export function useLotRegeneration(options: {
  /** False for drafts and assigned approvers, which have no Re-Generate. */
  enabled: boolean;
  reportId: string;
  /** Reads the preview (the same request the modal loads with). */
  load: (reportId: string) => Promise<any>;
  /** The reading finished; `response` is the preview read that showed it. */
  onFinished: (response: any, finished: LotRegeneration) => void;
  onFailed: (failed: LotRegeneration) => void;
}) {
  const [lotRegeneration, setLotRegeneration] = useState<LotRegeneration | null>(null);
  const pending = options.enabled && isLotRegenerationPending(lotRegeneration);
  const latest = useRef(options);
  latest.current = options;
  const stateRef = useRef(lotRegeneration);
  stateRef.current = lotRegeneration;

  useEffect(() => {
    if (!pending) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      timer = setTimeout(() => void check(), LOT_REGENERATION_POLL_MS);
    };
    const check = async () => {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.hidden) {
        schedule();
        return;
      }
      try {
        const response = await latest.current.load(latest.current.reportId);
        if (cancelled) return;
        const data = response?.data ?? response;
        const next = readLotRegeneration(data?.lot_regeneration);
        const previous = stateRef.current;
        if (!next) {
          setLotRegeneration(null);
          if (previous) latest.current.onFinished(response, previous);
          return;
        }
        setLotRegeneration(next);
        if (next.status === "failed") {
          latest.current.onFailed(next);
          return;
        }
      } catch {
        // A dropped check is retried on the next tick; the reading continues
        // on the server either way.
      }
      schedule();
    };
    schedule();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [pending, options.reportId]);

  return {
    lotRegeneration: options.enabled ? lotRegeneration : null,
    lotRegenerationPending: pending,
    setLotRegeneration,
  };
}
