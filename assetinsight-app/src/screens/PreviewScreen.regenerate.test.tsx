/**
 * Save vs per-lot Re-Generate on the report preview (owner decision
 * 2026-10-11). Save keeps the on-screen edits and rebuilds the files without
 * the AI; Re-Generate asks the AI to re-read one lot's photos, locks the
 * report while the server reads them, and brings the fresh lot back for review.
 */
import React from 'react';
import { Alert, AppState } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import PreviewScreen from './PreviewScreen';
import api from '../services/api';
import assignedApprovalService from '../services/assignedApprovalService';

jest.mock('@expo/vector-icons', () => ({ Feather: () => null }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View }));
jest.mock('react-native/Libraries/Components/RefreshControl/RefreshControl', () => ({
  __esModule: true,
  default: (props: any) => {
    const View = require('react-native').View;
    return <View {...props} />;
  },
}));
jest.mock('@shopify/react-native-skia', () => ({
  Canvas: require('react-native').View,
  Group: require('react-native').View,
  Path: () => null,
  Skia: {},
  ImageFormat: {},
}));
jest.mock('expo-file-system/legacy', () => ({ cacheDirectory: 'file:///cache/' }));
jest.mock('expo-sharing', () => ({}));
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  MediaTypeOptions: { Images: 'Images' },
}));
jest.mock('../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), put: jest.fn(), post: jest.fn() },
}));
// The real Asset and Lot Listing services run, so the request URLs under
// test are the ones the app sends; only their upload transport is stubbed.
jest.mock('../services/directR2UploadService', () => ({ uploadReportFilesDirectToR2: jest.fn() }));
jest.mock('../services/connectivityService', () => ({ isRetryableRequestError: () => false }));
jest.mock('../services/assignedApprovalService', () => ({
  __esModule: true,
  default: { getPreview: jest.fn(), resubmit: jest.fn() },
}));
jest.mock('../components/FarmlandValuationSummary', () => () => null);

const onBack = jest.fn();
const REGENERATE_MESSAGE =
  "The AI will re-read this lot's photos, including any you added, and replace its title, description, condition report, details and value. Your edits on this lot will be replaced. The lot number and photos stay, and your other edits are saved first.";
const SAVE_MESSAGE =
  'Saves your edits exactly as shown and rebuilds the Excel, PDF and Word files. Nothing is re-read by the AI.';

const makeLot = (index: number) => ({
  lot_id: `lot-${index}`,
  lot_number: String(index + 7),
  title: `Original title ${index + 7}`,
  description: `Original description ${index + 7}`,
  details: 'Original details',
  estimated_value: '1000',
  image_indexes: [index],
  image_urls: [`https://assetinsight.pro/lot-${index}.jpg`],
  condition_report_selections: { condition: 'Starts and Runs', completeness: 'Has Keys', legal: 'No Title' },
  condition_report_specs: { Notes: 'Original notes' },
});
const queued = (lotIndex = 0, extra: Record<string, unknown> = {}) => ({
  lot_id: `lot-${lotIndex}`,
  lot_key: `lot-${lotIndex}`,
  lot_number: String(lotIndex + 7),
  status: 'queued',
  requested_at: '2026-10-11T15:00:00.000Z',
  ...extra,
});

// What the server currently holds; every preview GET answers with a copy.
let server: {
  status: string;
  preview_data: { contract_no: string; client_name: string; currency: string; lots: ReturnType<typeof makeLot>[] };
  imageUrls: string[];
  grouping_mode: string;
  lot_regeneration: Record<string, unknown> | null;
};
const previewGets = () =>
  jest.mocked(api.get).mock.calls.filter(([url]) => !String(url).includes('category-specs')).length;
const alertsTitled = (title: string) => jest.mocked(Alert.alert).mock.calls.filter(([t]) => t === title);
const alertButton = (title: string, text: string) =>
  alertsTitled(title).at(-1)![2]!.find((button) => button.text === text)!;
const advance = (ms: number) => act(async () => { await jest.advanceTimersByTimeAsync(ms); });

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  (AppState as any).currentState = 'active';
  server = {
    status: 'preview',
    preview_data: {
      contract_no: '93530',
      client_name: 'Original client',
      currency: 'CAD',
      lots: [makeLot(0), makeLot(1)],
    },
    imageUrls: ['https://assetinsight.pro/lot-0.jpg', 'https://assetinsight.pro/lot-1.jpg'],
    grouping_mode: 'mixed',
    lot_regeneration: null,
  };
  jest.mocked(api.get).mockImplementation(async (url) =>
    String(url).includes('category-specs')
      ? { data: { data: { specs: [] } } }
      : { data: { data: structuredClone(server) } }
  );
  jest.mocked(assignedApprovalService.getPreview).mockImplementation(async () => structuredClone(server));
  jest.mocked(api.post).mockImplementation(async (url, body: any) => {
    if (String(url).endsWith('/regenerate')) {
      server.preview_data = structuredClone(body.preview_data);
      server.lot_regeneration = queued(0);
      return {
        status: 202,
        data: {
          message: 'Re-generating Lot 7. The AI is re-reading its photos.',
          data: {
            preview_data: structuredClone(server.preview_data),
            lot_regeneration: server.lot_regeneration,
            imageUrls: server.imageUrls,
            image_count: server.imageUrls.length,
          },
        },
      };
    }
    return { data: { data: {} } };
  });
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const openPreview = async (
  reportType: 'Asset' | 'LotListing' | 'RealEstate' = 'Asset',
  source: 'owner' | 'assignedApproval' = 'owner'
) => {
  const view = await render(
    <PreviewScreen reportId="rep-1" reportType={reportType} mode="pending" source={source} onBack={onBack} />
  );
  if (reportType === 'RealEstate') await screen.findByText('Real Estate Preview');
  else await screen.findByDisplayValue('93530');
  return view;
};
const confirmRegenerate = async (lotNumber = '7') => {
  await fireEvent.press(screen.getByRole('button', { name: `Re-Generate lot ${lotNumber}` }));
  await act(async () => { await alertButton(`Re-Generate Lot ${lotNumber}?`, 'Re-Generate').onPress?.(); });
};

describe.each(['Asset', 'LotListing'] as const)('%s preview footer', (reportType) => {
  it('shows one Save action whose confirmation says the AI does not run', async () => {
    await openPreview(reportType);
    expect(screen.getAllByRole('button', { name: 'Save' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /^Save & / })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    const [, message, buttons] = alertsTitled('Save').at(-1)!;
    expect(message).toContain(SAVE_MESSAGE);
    expect(buttons!.map((button) => button.text)).toEqual(['Cancel', 'Save']);
    expect(api.post).not.toHaveBeenCalled();
  });

  it('labels the assigned approver action Save & Approve and offers no Re-Generate', async () => {
    await openPreview(reportType, 'assignedApproval');
    expect(screen.getByRole('button', { name: 'Save & Approve' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Re-Generate lot/ })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Save & Approve' }));
    const [, message, buttons] = alertsTitled('Save & Approve').at(-1)!;
    expect(message).toContain(SAVE_MESSAGE);
    expect(message).toContain('approved once the files are rebuilt');
    expect(buttons!.map((button) => button.text)).toEqual(['Cancel', 'Save & Approve']);
  });

  it('confirms, then posts the on-screen preview to the lot regenerate URL and locks the report', async () => {
    await openPreview(reportType);
    expect(screen.getByRole('button', { name: 'Re-Generate lot 7' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Re-Generate lot 8' })).toBeTruthy();
    await fireEvent.changeText(screen.getByDisplayValue('93530'), 'EDITED-93530');
    await fireEvent.press(screen.getByRole('button', { name: 'Re-Generate lot 7' }));

    const [, message, buttons] = alertsTitled('Re-Generate Lot 7?').at(-1)!;
    expect(message).toBe(REGENERATE_MESSAGE);
    expect(buttons!.map(({ text, style }) => ({ text, style }))).toEqual([
      { text: 'Cancel', style: 'cancel' },
      { text: 'Re-Generate', style: 'destructive' },
    ]);
    expect(api.post).not.toHaveBeenCalled();

    await act(async () => { await alertButton('Re-Generate Lot 7?', 'Re-Generate').onPress?.(); });
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith(
      `/${reportType === 'Asset' ? 'asset' : 'lot-listing'}/rep-1/preview/lots/lot-0/regenerate`,
      {
        preview_data: expect.objectContaining({
          contract_no: 'EDITED-93530',
          lots: [
            expect.objectContaining({ lot_id: 'lot-0', title: 'Original title 7' }),
            expect.objectContaining({ lot_id: 'lot-1', title: 'Original title 8' }),
          ],
        }),
      }
    );

    // Locked while the AI reads: banner, busy lot button, everything else disabled.
    expect(screen.getByText('Re-generating Lot 7 — The AI is reading its photos…')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Re-generating lot 7' })).toBeDisabled();
    expect(screen.getByText('Re-generating…')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Re-Generate lot 8' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    screen.getAllByText('Add photos').forEach((label) => expect(label).toBeDisabled());
    if (reportType === 'Asset') {
      expect(screen.getByRole('button', { name: 'Delete lot 7' })).toBeDisabled();
    }
    // The saved edit stays on screen and further typing is ignored.
    expect(screen.getByDisplayValue('EDITED-93530')).toBeTruthy();
    await fireEvent.changeText(screen.getByDisplayValue('EDITED-93530'), 'TYPED WHILE LOCKED');
    expect(screen.getByDisplayValue('EDITED-93530')).toBeTruthy();
  });
});

it('offers no Re-Generate on Real Estate', async () => {
  await openPreview('RealEstate');
  expect(screen.queryByRole('button', { name: /^Re-Generate lot/ })).toBeNull();
  expect(screen.queryByText('Re-Generate')).toBeNull();
});

it('ignores a Re-Generate confirmation after refreshed data replaced its snapshot', async () => {
  await openPreview('Asset');
  await fireEvent.press(screen.getByRole('button', { name: 'Re-Generate lot 7' }));
  const stale = alertButton('Re-Generate Lot 7?', 'Re-Generate');
  await fireEvent(screen.getByTestId('preview-refresh'), 'refresh');
  await screen.findByDisplayValue('93530');
  await act(async () => { await stale.onPress?.(); });
  expect(api.post).not.toHaveBeenCalled();
  expect(screen.queryByText(/^Re-generating Lot/)).toBeNull();
});

it('polls every 4 seconds while the lot is read, then applies the fresh lot and asks for a Save', async () => {
  jest.useFakeTimers();
  // Reopening the screen with a pending record resumes the wait.
  server.lot_regeneration = { ...queued(0), status: 'processing', stage: 'reading_photos' };
  await openPreview('LotListing');
  expect(screen.getByText('Re-generating Lot 7 — Reading photos…')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  expect(previewGets()).toBe(1);

  await advance(3_000);
  expect(previewGets()).toBe(1);
  server.lot_regeneration = { ...queued(0), status: 'processing', stage: 'completing_fields' };
  await advance(1_000);
  expect(previewGets()).toBe(2);
  expect(screen.getByText('Re-generating Lot 7 — Completing fields…')).toBeTruthy();

  server.lot_regeneration = null;
  server.preview_data.lots[0] = { ...server.preview_data.lots[0], title: 'Fresh AI title' };
  await advance(4_000);
  expect(previewGets()).toBe(3);
  expect(screen.getByDisplayValue('Fresh AI title')).toBeTruthy();
  expect(Alert.alert).toHaveBeenCalledWith('Lot 7 re-generated', 'Review it, then tap Save to rebuild the files.');
  expect(screen.queryByText(/^Re-generating Lot/)).toBeNull();
  expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled();
  expect(screen.getByRole('button', { name: 'Re-Generate lot 7' })).not.toBeDisabled();

  // Polling stops once the record clears.
  await advance(20_000);
  expect(previewGets()).toBe(3);
});

it('starts polling after the 202 and stops when the screen closes', async () => {
  jest.useFakeTimers();
  const view = await openPreview('Asset');
  await confirmRegenerate('7');
  expect(previewGets()).toBe(1);
  await advance(4_000);
  expect(previewGets()).toBe(2);
  await view.unmount();
  await advance(20_000);
  expect(previewGets()).toBe(2);
});

it('keeps one request in flight and pauses in the background', async () => {
  jest.useFakeTimers();
  server.lot_regeneration = queued(0);
  await openPreview('Asset');
  let release!: () => void;
  jest.mocked(api.get).mockImplementation((url) =>
    String(url).includes('category-specs')
      ? Promise.resolve({ data: { data: { specs: [] } } })
      : new Promise((resolve) => { release = () => resolve({ data: { data: structuredClone(server) } }); })
  );
  await advance(4_000);
  expect(previewGets()).toBe(2);
  // A slow answer is never overlapped by the next tick.
  await advance(20_000);
  expect(previewGets()).toBe(2);
  await act(async () => { release(); });
  await advance(0);

  // In the background nothing is fetched...
  (AppState as any).currentState = 'background';
  const listener = jest.mocked(AppState.addEventListener).mock.calls.at(-1)![1] as (state: string) => void;
  await act(async () => { listener('background'); });
  await advance(20_000);
  expect(previewGets()).toBe(2);
  // ...and coming back checks straight away.
  (AppState as any).currentState = 'active';
  await act(async () => { listener('active'); });
  await advance(0);
  expect(previewGets()).toBe(3);
});

it('shows a failed Re-Generate once, marks the lot in red and keeps the screen data', async () => {
  jest.useFakeTimers();
  server.lot_regeneration = { ...queued(0), status: 'processing' };
  await openPreview('Asset');
  server.lot_regeneration = {
    ...queued(0),
    status: 'failed',
    failed_at: '2026-10-11T15:02:00.000Z',
    error: 'The AI could not read the photos.',
  };
  // A failure changes nothing on the lot, so the screen keeps what it shows.
  server.preview_data.lots[0] = { ...server.preview_data.lots[0], title: 'Not applied' };
  await advance(4_000);
  expect(alertsTitled('Re-Generate failed')).toEqual([
    ['Re-Generate failed', 'The AI could not read the photos.'],
  ]);
  expect(screen.getByText('Re-Generate failed: The AI could not read the photos.')).toBeTruthy();
  expect(screen.getByDisplayValue('Original title 7')).toBeTruthy();
  expect(screen.queryByDisplayValue('Not applied')).toBeNull();
  expect(screen.queryByText(/^Re-generating Lot/)).toBeNull();
  expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled();
  expect(screen.getByRole('button', { name: 'Re-Generate lot 7' })).not.toBeDisabled();

  await advance(20_000);
  expect(alertsTitled('Re-Generate failed')).toHaveLength(1);
  expect(previewGets()).toBe(2);
});

it('reloads into the lock when Save is refused because a lot is being re-generated', async () => {
  await openPreview('Asset');
  server.lot_regeneration = queued(1);
  jest.mocked(api.post).mockRejectedValueOnce({
    response: {
      status: 409,
      data: { code: 'LOT_REGENERATION_PENDING', message: 'Lot 8 is being re-generated. Wait for it to finish, then save.' },
    },
  });
  await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
  await act(async () => { await alertButton('Save', 'Save').onPress?.(); });
  expect(Alert.alert).toHaveBeenCalledWith(
    'Re-Generate in progress',
    'Lot 8 is being re-generated. Wait for it to finish, then save.'
  );
  expect(await screen.findByText('Re-generating Lot 8 — The AI is reading its photos…')).toBeTruthy();
  expect(previewGets()).toBe(2);
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Re-generating lot 8' })).toBeDisabled();
  expect(onBack).not.toHaveBeenCalled();
});

it('reports a refused Re-Generate request and unlocks the report', async () => {
  await openPreview('LotListing');
  jest.mocked(api.post).mockRejectedValueOnce({
    response: { status: 400, data: { message: 'Save the report once before re-generating this lot.' } },
  });
  await confirmRegenerate('7');
  expect(Alert.alert).toHaveBeenCalledWith('Error', 'Save the report once before re-generating this lot.');
  expect(screen.queryByText(/^Re-generating Lot/)).toBeNull();
  expect(screen.getByRole('button', { name: 'Re-Generate lot 7' })).not.toBeDisabled();
  expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled();

  jest.mocked(api.post).mockRejectedValueOnce(new Error('offline'));
  await confirmRegenerate('8');
  expect(Alert.alert).toHaveBeenLastCalledWith('Error', 'Could not start Re-Generate.');
});
