import {
  isLotRegenerationPending,
  isLotRegenerationPendingError,
  isLotRegenerationTarget,
  lotRegenerationStageText,
  readLotRegeneration,
} from './lotRegeneration';

const record = {
  lot_id: 'lot-a',
  lot_key: 'lot-a',
  lot_number: '7',
  status: 'processing',
  stage: 'looking_up_specs',
  requested_at: '2026-10-11T15:00:00.000Z',
  started_at: '2026-10-11T15:00:05.000Z',
};

it('reads the server record and treats anything unrecognisable as nothing pending', () => {
  expect(readLotRegeneration(record)).toEqual(record);
  expect(readLotRegeneration(null)).toBeNull();
  expect(readLotRegeneration(undefined)).toBeNull();
  expect(readLotRegeneration({ ...record, status: 'done' })).toBeNull();
  expect(readLotRegeneration({ status: 'queued' })).toBeNull();
  // An unknown stage is dropped rather than shown.
  expect(readLotRegeneration({ ...record, stage: 'thinking' })).not.toHaveProperty('stage');
  // A record without lot_key still names its lot.
  expect(readLotRegeneration({ ...record, lot_key: undefined })?.lot_key).toBe('lot-a');
});

it('is pending only while queued or processing', () => {
  expect(isLotRegenerationPending(readLotRegeneration({ ...record, status: 'queued' }))).toBe(true);
  expect(isLotRegenerationPending(readLotRegeneration(record))).toBe(true);
  expect(isLotRegenerationPending(readLotRegeneration({ ...record, status: 'failed', error: 'x' }))).toBe(false);
  expect(isLotRegenerationPending(null)).toBe(false);
});

it('describes each server stage for the progress banner', () => {
  expect(lotRegenerationStageText('reading_photos')).toBe('Reading photos…');
  expect(lotRegenerationStageText('completing_fields')).toBe('Completing fields…');
  expect(lotRegenerationStageText('looking_up_specs')).toBe('Looking up specs…');
  expect(lotRegenerationStageText(undefined)).toBe('');
});

it('recognises only the server lock refusal', () => {
  expect(isLotRegenerationPendingError({ response: { status: 409, data: { code: 'LOT_REGENERATION_PENDING' } } })).toBe(true);
  expect(isLotRegenerationPendingError({ response: { status: 409, data: { code: 'ASSET_GENERATION_ACTIVE' } } })).toBe(false);
  expect(isLotRegenerationPendingError(new Error('offline'))).toBe(false);
  expect(isLotRegenerationPendingError(null)).toBe(false);
});

it('matches the lot by its id, or by its key when the lot has no id', () => {
  const state = readLotRegeneration(record);
  expect(isLotRegenerationTarget(state, { lot_id: 'lot-a' }, 'anything')).toBe(true);
  expect(isLotRegenerationTarget(state, { lot_id: 'lot-b' }, 'lot-a')).toBe(false);
  expect(isLotRegenerationTarget(state, {}, 'lot-a')).toBe(true);
  expect(isLotRegenerationTarget(null, { lot_id: 'lot-a' }, 'lot-a')).toBe(false);
});
