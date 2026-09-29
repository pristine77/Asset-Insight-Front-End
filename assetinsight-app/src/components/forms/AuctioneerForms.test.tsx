import React, { useState } from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AssetFormSheet from './AssetFormSheet';
import LotListingFormSheet from './LotListingFormSheet';
import AuctioneerFormBoundary from './AuctioneerFormBoundary';
import auctioneerService, { type AuctioneerReportType, type AuctioneerWorkItemSetup } from '../../services/auctioneerService';
import assetService from '../../services/assetService';
import lotListingService from '../../services/lotListingService';
import AutoSaveService from '../../services/autoSaveService';
import OfflineQueueService from '../../services/offlineQueueService';
import OfflineCaptureStore from '../../services/offlineCaptureStore';
import reportDraftService from '../../services/reportDraftService';
import { prepareOfflineSubmission } from '../../services/offlineSubmissionService';
import { pauseActiveUploads, setUploadOwner } from '../../services/uploadCancellation';

let mockOwner: string | null = 'owner';
jest.mock('expo-crypto', () => ({ randomUUID: () => require('node:crypto').randomUUID() }));

jest.mock('@react-native-community/netinfo', () => ({ __esModule: true, default: { fetch: jest.fn(async () => ({ isConnected: true, isInternetReachable: true })) } }));
jest.mock('../../services/offlineCaptureStore', () => ({ __esModule: true, default: { getOwnerId: () => mockOwner, setSubmissionState: jest.fn(async () => undefined), recordDraftOpened: jest.fn(async () => undefined) } }));
jest.mock('../../services/offlineSubmissionService', () => ({ prepareOfflineSubmission: jest.fn(async draft => draft) }));

jest.mock('@expo/vector-icons', () => ({ Feather: () => null }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View }));
jest.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { username: 'Inspector', companyName: 'QA' } }) }));
jest.mock('../../context/ThemeContext', () => ({ useAppTheme: () => ({ colors: { background: '#101010', surface: '#202020', text: '#ffffff', textSecondary: '#cccccc', borderStrong: '#777777', accent: '#ff3344' } }) }));
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'en-CA', regionCode: 'CA' }] }));
jest.mock('./CameraCapture', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return { __esModule: true, default: ({ visible, lockedStructure, sourceLabels }: any) => visible ? <Text testID="camera-locked" accessibilityLabel={sourceLabels?.[0]}>{String(Boolean(lockedStructure))}</Text> : null };
});
jest.mock('../camera/NativeAuctionCameraScreen', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return { __esModule: true, default: ({ visible, lockedStructure, sourceLabels }: any) => visible ? <Text testID="camera-locked" accessibilityLabel={sourceLabels?.[0]}>{String(Boolean(lockedStructure))}</Text> : null };
});
jest.mock('./LotManager', () => {
  const React = require('react');
  const { View, Text, TouchableOpacity } = require('react-native');
  return { __esModule: true, default: ({ lots, lockedStructure, onOpenCamera }: any) => <View>
    <Text testID="mock-lot-count">{lots.length}</Text>
    <Text testID="mock-photo-count">{lots.reduce((sum: number, lot: any) => sum + lot.files.length, 0)}</Text>
    <Text testID="mock-restored-lots">{JSON.stringify(lots)}</Text>
    <Text testID="mock-locked">{String(Boolean(lockedStructure))}</Text>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open mock lot camera" onPress={() => onOpenCamera(0)}><Text>Camera</Text></TouchableOpacity>
  </View> };
});
jest.mock('../../services/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
jest.mock('../../services/auctioneerService', () => ({
  ...jest.requireActual('../../services/auctioneerService'),
  __esModule: true,
  default: { getSetup: jest.fn(), continueWorkItem: jest.fn() },
}));
jest.mock('../../services/assetService', () => ({ __esModule: true, default: { createAssetReport: jest.fn() } }));
jest.mock('../../services/lotListingService', () => ({ __esModule: true, default: { createLotListing: jest.fn() } }));
jest.mock('../../services/savedInputService', () => ({ __esModule: true, default: { create: jest.fn() } }));
jest.mock('../../services/reportDraftService', () => ({ __esModule: true, default: { upsertFromLocalDraft: jest.fn(), processPreview: jest.fn() }, getDuplicateLotWarning: () => null }));
jest.mock('../../services/offlineQueueService', () => ({ __esModule: true, default: {
  getConnectivityStatus: jest.fn(), shouldQueueAfterError: jest.fn(), getSubmissionError: jest.fn(),
  enqueueAssetReport: jest.fn(), enqueueLotListing: jest.fn(),
} }));
jest.mock('../../services/autoSaveService', () => ({ __esModule: true, default: {
  getDraft: jest.fn(), saveDraft: jest.fn(), removeDraftRecordOnly: jest.fn(), deleteDraft: jest.fn(),
  deleteAutoSave: jest.fn(), cleanupOrphanedMedia: jest.fn(), migrateLegacyAutoSaveIfNeeded: jest.fn(),
} }));
jest.mock('../../utils/mobileLocation', () => ({
  normalizeHiddenLocation: (location?: string) => ({ location: location || 'Not provided' }),
  getHiddenCurrentLocation: jest.fn(async () => ({ location: 'Not provided' })),
}));

function setup(type: AuctioneerReportType = 'asset'): AuctioneerWorkItemSetup {
  return {
    workItemId: 'work-parent', cycleKey: 'cycle-parent', kind: 'scheduleA', reportType: type,
    clientSubmissionId: 'submission-parent', status: 'claimed', reportId: null,
    contract: { id: 'contract-id', contractNo: '93530.3-A', customerName: 'Incoming customer', eventTitle: 'Fall sale', eventDate: '2026-09-20', location: 'Auction yard' },
    lots: [{ sourceKey: 'upstream-key', lotId: 'upstream-lot', submissionId: 'upstream-submission', lotNumber: '157' }],
  };
}

function successor(previous: AuctioneerWorkItemSetup): AuctioneerWorkItemSetup {
  return { ...previous, workItemId: 'work-next', cycleKey: 'cycle-next', clientSubmissionId: 'submission-next', kind: 'unknown', lots: [] };
}

function draft(type: AuctioneerReportType) {
  return {
    id: 'local-parent', ownerId: 'owner', type, title: 'Incoming capture', contractNo: '93530.3-A', createdAt: '2026-09-14', updatedAt: '2026-09-14',
    formData: { auctioneerWorkItemId: 'work-parent', clientSubmissionId: 'submission-parent', contractNo: '93530.3-A', clientName: 'Incoming customer', appraisalPurpose: 'Auction listing and condition report', appraiser: 'Inspector', currency: 'CAD', language: 'en' as const },
    lots: [{ id: 'auctioneer-work-parent-1', mode: 'single_lot' as const, mainImages: [{ uri: 'file:///isolated-photo.jpg', name: 'photo.jpg', type: 'image/jpeg' }], extraImages: [], videoFiles: [], coverIndex: 0 }],
    activeLotIdx: 0,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockOwner = 'owner';
  setUploadOwner(mockOwner);
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.mocked(OfflineQueueService.getConnectivityStatus).mockReset().mockResolvedValue({ status: 'online' } as any);
  jest.mocked(OfflineQueueService.shouldQueueAfterError).mockResolvedValue(false);
  jest.mocked(OfflineQueueService.getSubmissionError).mockReturnValue({ title: 'Upload failed', message: 'Retry this submission.' } as any);
  jest.mocked(AutoSaveService.saveDraft).mockImplementation(async (input) => ({ ...input, ownerId: 'owner', id: 'local-parent' }) as any);
  jest.mocked(OfflineCaptureStore.recordDraftOpened).mockReset().mockResolvedValue(undefined);
  jest.mocked(AutoSaveService.removeDraftRecordOnly).mockResolvedValue(undefined);
  jest.mocked(assetService.createAssetReport).mockResolvedValue({ jobId: 'job-parent', reportId: 'report-parent', message: 'Queued' });
  jest.mocked(lotListingService.createLotListing).mockResolvedValue({ jobId: 'job-parent', reportId: 'report-parent', message: 'Queued' });
});

afterEach(async () => { await cleanup(); jest.restoreAllMocks(); });

describe.each(['asset', 'lotListing'] as const)('%s offline save then review', type => {
  const Form = type === 'asset' ? AssetFormSheet : LotListingFormSheet;
  const upload = type === 'asset' ? assetService.createAssetReport : lotListingService.createLotListing;
  const saveLabel = type === 'asset' ? 'Save offline asset report' : 'Save offline lot listing';
  function savedDraft(state = 'local') {
    const value = draft(type);
    delete (value.formData as any).auctioneerWorkItemId;
    return { ...value, captureMode: 'offline', manualSubmissionRequired: true, submissionState: state,
      formData: { ...value.formData, captureMode: 'offline', watermarkImages: true, appraiser: 'Saved appraiser', appraisalCompany: 'Saved company', factorsAnalysis: 'Saved line one\nSaved line two' },
      lots: [{ ...value.lots[0], lotNumber: 'X-9', title: 'Saved lot', coverIndex: 1, mainImages: [
        { uri: 'content://photos/second', originalUri: 'content://photos/second', name: 'second.jpg', type: 'image/jpeg', mediaId: 'photo-b' },
        { uri: 'content://photos/first', originalUri: 'content://photos/first', name: 'first.jpg', type: 'image/jpeg', mediaId: 'photo-a' },
      ], extraImages: [{ uri: 'content://photos/report', name: 'report.jpg', type: 'image/jpeg', mediaId: 'report-only' }] }] };
  }
  it.each(['local', 'paused'])('restores a camera video in %s work and submits its original reference with the correct lot', async state => {
    const saved = savedDraft(state);
    const clip = { uri: 'content://media/external/video/media/720', name: 'walkthrough.mp4', type: 'video/mp4', size: 8_000_000,
      mediaId: 'stable-video', ownership: 'gallery' as const, captureOrder: 7, originalOrder: 7 };
    (saved.lots[0].videoFiles as any[]) = [clip];
    jest.mocked(AutoSaveService.getDraft).mockResolvedValue(saved as any);
    await render(<Form visible draftIdToLoad="local-parent" onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByTestId('mock-photo-count').props.children).toBe(2));
    expect(JSON.parse(screen.getByTestId('mock-restored-lots').props.children)[0].videoFile).toMatchObject(clip);
    expect(upload).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: state === 'paused' ? 'Resume upload' : type === 'asset' ? 'Submit asset report' : 'Submit lot listing' }));
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    const [details, serviceLots] = jest.mocked(upload).mock.calls[0];
    expect(details.client_submission_id).toBe('submission-parent');
    expect(details.mixed_lots).toEqual([expect.objectContaining({ count: 2, extra_count: 1, video_count: 1, cover_index: 1 })]);
    expect(serviceLots[0]).toMatchObject({ id: saved.lots[0].id, videoFile: { uri: clip.uri, name: clip.name, type: clip.type, size: clip.size } });
    expect(serviceLots[0].files).toHaveLength(2);
    expect(serviceLots[0].extraFiles).toHaveLength(1);
  });
  it('shows Save for new offline work, accepts incomplete details and never uploads', async () => {
    const closed = jest.fn();
    await render(<Form visible onClose={closed} />);
    await fireEvent.press(screen.getByRole('radio', { name: 'Offline capture' }));
    expect(screen.queryByText(type === 'asset' ? 'Submit Report' : 'Submit')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: saveLabel }));
    await waitFor(() => expect(closed).toHaveBeenCalledTimes(1));
    expect(AutoSaveService.saveDraft).toHaveBeenCalledWith(expect.objectContaining({
      captureMode: 'offline', explicitActivitySave: true, formData: expect.objectContaining({ captureMode: 'offline', manualSubmissionRequired: true }),
    }));
    expect(upload).not.toHaveBeenCalled();
    expect(reportDraftService.upsertFromLocalDraft).not.toHaveBeenCalled();
    expect(OfflineCaptureStore.setSubmissionState).not.toHaveBeenCalled();
  });
  it('keeps the form open when local Save fails and supports retry', async () => {
    const closed = jest.fn();
    jest.mocked(AutoSaveService.saveDraft).mockRejectedValueOnce(new Error('Storage full'));
    await render(<Form visible onClose={closed} />);
    await fireEvent.press(screen.getByRole('radio', { name: 'Offline capture' }));
    await fireEvent.press(screen.getByRole('button', { name: saveLabel }));
    await waitFor(() => expect(screen.getByText('Storage full')).toBeTruthy());
    expect(closed).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: saveLabel }));
    await waitFor(() => expect(closed).toHaveBeenCalledTimes(1));
  });
  it('does not enable submission just because an offline autosave has an identity', async () => {
    await render(<Form visible onClose={jest.fn()} />);
    await fireEvent.press(screen.getByRole('radio', { name: 'Offline capture' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Save on device' }));
    await waitFor(() => expect(screen.getByRole('button', { name: saveLabel })).toBeTruthy());
    expect(screen.queryByText(type === 'asset' ? 'Submit Report' : 'Submit')).toBeNull();
    expect(upload).not.toHaveBeenCalled();
  });
  it('restores saved details, photo positions, cover and report-only photos before explicit Submit', async () => {
    const saved = savedDraft();
    jest.mocked(AutoSaveService.getDraft).mockResolvedValue(saved as any);
    await render(<Form visible draftIdToLoad="local-parent" onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByTestId('mock-photo-count').props.children).toBe(2));
    expect(OfflineCaptureStore.recordDraftOpened).toHaveBeenCalledTimes(1);
    expect(OfflineCaptureStore.recordDraftOpened).toHaveBeenCalledWith('local-parent', expect.any(String));
    const restored = JSON.parse(screen.getByTestId('mock-restored-lots').props.children);
    expect(restored[0]).toMatchObject({ id: saved.lots[0].id, lotNumber: 'X-9', title: 'Saved lot', coverIndex: 1 });
    expect(restored[0].files.map((photo: any) => photo.mediaId)).toEqual(['photo-b', 'photo-a']);
    expect(restored[0].extraFiles.map((photo: any) => photo.mediaId)).toEqual(['report-only']);
    expect(screen.getByRole('radio', { name: 'Offline capture' }).props.accessibilityState.checked).toBe(true);
    expect(upload).not.toHaveBeenCalled();
    expect(OfflineCaptureStore.setSubmissionState).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: saveLabel })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: type === 'asset' ? 'Submit asset report' : 'Submit lot listing' }));
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    expect(prepareOfflineSubmission).toHaveBeenCalled();
    expect(jest.mocked(upload).mock.calls[0][0]).toMatchObject({ contract_no: saved.contractNo, client_submission_id: 'submission-parent', watermark_images: true });
    if (type === 'asset') expect(jest.mocked(upload).mock.calls[0][0]).toMatchObject({ appraiser: 'Saved appraiser', appraisal_company: 'Saved company', factors_analysis: 'Saved line one\nSaved line two' });
    expect(OfflineCaptureStore.setSubmissionState).toHaveBeenCalledWith('local-parent', 'ready');
  });
  it.each(['ready', 'uploading', 'paused'])('opens interrupted %s work with explicit Resume, never auto-upload', async state => {
    jest.mocked(AutoSaveService.getDraft).mockResolvedValue(savedDraft(state) as any);
    await render(<Form visible draftIdToLoad="local-parent" onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Resume upload' })).toBeTruthy());
    expect(upload).not.toHaveBeenCalled();
    expect(OfflineCaptureStore.setSubmissionState).not.toHaveBeenCalled();
  });
  it('blocks hydration until durable review activity succeeds, then retries without a blank report', async () => {
    jest.mocked(AutoSaveService.getDraft).mockResolvedValue(savedDraft() as any);
    jest.mocked(OfflineCaptureStore.recordDraftOpened).mockRejectedValueOnce(new Error('Local storage unavailable'));
    await render(<Form visible draftIdToLoad="local-parent" onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByText('Local storage unavailable')).toBeTruthy());
    expect(screen.queryByTestId('mock-photo-count')).toBeNull();
    expect(AutoSaveService.saveDraft).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Retry opening draft' }));
    await waitFor(() => expect(screen.getByTestId('mock-photo-count').props.children).toBe(2));
    expect(jest.mocked(OfflineCaptureStore.recordDraftOpened).mock.calls[0]).toEqual(jest.mocked(OfflineCaptureStore.recordDraftOpened).mock.calls[1]);
    expect(upload).not.toHaveBeenCalled();
  });
});

describe.each(['asset', 'lotListing'] as const)('%s incoming generate-and-next', (type) => {
  async function mount(submissionState?: 'ready' | 'uploading' | 'paused') {
    const current = setup(type);
    jest.mocked(auctioneerService.getSetup).mockResolvedValue(current);
    jest.mocked(AutoSaveService.getDraft).mockResolvedValue({ ...draft(type), submissionState } as any);
    jest.mocked(auctioneerService.continueWorkItem).mockResolvedValue(successor(current));
    const Form = type === 'asset' ? AssetFormSheet : LotListingFormSheet;
    const changed = jest.fn();
    const closed = jest.fn();
    await render(<Form visible auctioneer={current} draftIdToLoad="local-parent" onClose={closed} onAuctioneerSetupChange={changed} />);
    await waitFor(() => expect(screen.getByTestId('mock-photo-count').props.children).toBe(1));
    return { current, changed, closed, upload: type === 'asset' ? assetService.createAssetReport : lotListingService.createLotListing };
  }

  it('passes the source structure lock through the real form camera boundary', async () => {
    await mount();
    await fireEvent.press(screen.getByRole('button', { name: 'Open mock lot camera' }));
    expect(screen.getByTestId('camera-locked').props.children).toBe('true');
    expect(screen.getByTestId('camera-locked').props.accessibilityLabel).toBe('Lot 157');
  });

  it('switches an Online saved Incoming draft to local Save when Offline is newly selected', async () => {
    const { upload, closed } = await mount();
    await fireEvent.press(screen.getByRole('radio', { name: 'Offline capture' }));
    expect(screen.queryByRole('button', { name: 'Generate files & new lot' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: type === 'asset' ? 'Save offline asset report' : 'Save offline lot listing' }));
    await waitFor(() => expect(closed).toHaveBeenCalledTimes(1));
    expect(upload).not.toHaveBeenCalled();
    expect(auctioneerService.continueWorkItem).not.toHaveBeenCalled();
    expect(reportDraftService.upsertFromLocalDraft).not.toHaveBeenCalled();
  });

  it('waits for actual server acceptance, carries only the contract, and mounts an empty next form', async () => {
    const { current, changed, closed, upload } = await mount();
    let accept!: (value: any) => void;
    jest.mocked(upload).mockReturnValueOnce(new Promise((resolve) => { accept = resolve; }));
    await fireEvent.press(screen.getByRole('button', { name: 'Generate files & new lot' }));
    expect(auctioneerService.continueWorkItem).not.toHaveBeenCalled();
    expect(changed).not.toHaveBeenCalled();
    expect(upload).toHaveBeenCalledTimes(1);
    expect(jest.mocked(upload).mock.calls[0][0]).toMatchObject({
      auctioneer_work_item_id: current.workItemId, client_submission_id: current.clientSubmissionId,
      contract_no: current.contract.contractNo,
      mixed_lots: [expect.objectContaining({ source_key: 'upstream-key', source_lot_id: 'upstream-lot', source_submission_id: 'upstream-submission' })],
    });
    await act(async () => { accept({ jobId: 'job-parent', reportId: 'report-parent', message: 'Accepted' }); });
    await waitFor(() => expect(changed).toHaveBeenCalledWith(successor(current)));
    expect(auctioneerService.continueWorkItem).toHaveBeenCalledWith('work-parent', 'report-parent');
    expect(closed).not.toHaveBeenCalled();
    expect(AutoSaveService.removeDraftRecordOnly).toHaveBeenCalledWith('local-parent');
    expect(AutoSaveService.cleanupOrphanedMedia).not.toHaveBeenCalled();
    expect(screen.getByLabelText(type === 'asset' ? 'Contract number' : 'Contract number, required').props.value).toBe('93530.3-A');
    expect(screen.getByRole('button', { name: 'Generate files & new lot' }).props.accessibilityState?.disabled).toBe(true);
  });

  it('retries only continuation after acceptance, without uploading or clearing the original form twice', async () => {
    const { changed, upload } = await mount();
    jest.mocked(auctioneerService.continueWorkItem).mockRejectedValueOnce(new Error('Connection lost during continuation'));
    await fireEvent.press(screen.getByRole('button', { name: 'Generate files & new lot' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Retry new lot' })).toBeTruthy());
    expect(changed).not.toHaveBeenCalled();
    expect(AutoSaveService.removeDraftRecordOnly).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Retry new lot' }));
    await waitFor(() => expect(changed).toHaveBeenCalledTimes(1));
    expect(upload).toHaveBeenCalledTimes(1);
    expect(auctioneerService.continueWorkItem).toHaveBeenCalledTimes(2);
    expect(jest.mocked(auctioneerService.continueWorkItem).mock.calls).toEqual([['work-parent', 'report-parent'], ['work-parent', 'report-parent']]);
  });

  it('does not call continue or queue an upload when generate-and-next is offline', async () => {
    const { changed, upload } = await mount();
    jest.mocked(OfflineQueueService.getConnectivityStatus).mockResolvedValue({ status: 'offline' } as any);
    await fireEvent.press(screen.getByRole('button', { name: 'Generate files & new lot' }));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Connection required', expect.any(String)));
    expect(upload).not.toHaveBeenCalled();
    expect(OfflineQueueService.enqueueAssetReport).not.toHaveBeenCalled();
    expect(OfflineQueueService.enqueueLotListing).not.toHaveBeenCalled();
    expect(auctioneerService.continueWorkItem).not.toHaveBeenCalled();
    expect(changed).not.toHaveBeenCalled();
    expect(screen.getByTestId('mock-photo-count').props.children).toBe(1);
  });

  it('keeps the same report submission identity and photos after a pre-acceptance failure', async () => {
    const { upload, changed } = await mount();
    jest.mocked(upload).mockRejectedValueOnce(new Error('Upload interrupted'));
    await fireEvent.press(screen.getByRole('button', { name: 'Generate files & new lot' }));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Upload failed', expect.any(String)));
    expect(auctioneerService.continueWorkItem).not.toHaveBeenCalled();
    expect(screen.getByTestId('mock-photo-count').props.children).toBe(1);
    await fireEvent.press(screen.getByRole('button', { name: 'Generate files & new lot' }));
    await waitFor(() => expect(changed).toHaveBeenCalledTimes(1));
    expect(jest.mocked(upload).mock.calls.map(([details]) => details.client_submission_id)).toEqual(['submission-parent', 'submission-parent']);
  });

  it.each([null, 'other-owner'])('does not start an old form upload after owner changes to %s during connectivity checking', async (nextOwner) => {
    const { upload } = await mount();
    let resolveConnectivity!: (value: any) => void;
    jest.mocked(OfflineQueueService.getConnectivityStatus).mockReturnValueOnce(new Promise((resolve) => { resolveConnectivity = resolve; }));
    await fireEvent.press(screen.getByRole('button', { name: 'Generate files & new lot' }));
    await waitFor(() => expect(OfflineQueueService.getConnectivityStatus).toHaveBeenCalledTimes(1));
    mockOwner = nextOwner;
    setUploadOwner(nextOwner);
    await act(async () => { resolveConnectivity({ status: 'online' }); });
    expect(upload).not.toHaveBeenCalled();
    expect(jest.mocked(OfflineCaptureStore.setSubmissionState).mock.calls).toEqual([['local-parent', 'ready']]);
    expect(auctioneerService.continueWorkItem).not.toHaveBeenCalled();
  });

  it('honours Pause while pre-upload connectivity is pending without starting transport', async () => {
    const { upload } = await mount();
    let resolveConnectivity!: (value: any) => void;
    jest.mocked(OfflineQueueService.getConnectivityStatus).mockReturnValueOnce(new Promise((resolve) => { resolveConnectivity = resolve; }));
    await fireEvent.press(screen.getByRole('button', { name: 'Generate files & new lot' }));
    await waitFor(() => expect(OfflineQueueService.getConnectivityStatus).toHaveBeenCalledTimes(1));
    pauseActiveUploads();
    await act(async () => { resolveConnectivity({ status: 'online' }); });
    expect(upload).not.toHaveBeenCalled();
    expect(OfflineCaptureStore.setSubmissionState).toHaveBeenCalledWith('local-parent', 'paused', undefined, expect.any(String));
  });

  it('persists explicit submission intent before starting any upload with the original identity', async () => {
    const { upload } = await mount();
    let saveReady!: () => void;
    jest.mocked(OfflineCaptureStore.setSubmissionState).mockImplementationOnce(() => new Promise((resolve) => { saveReady = () => resolve(undefined as any); }));
    await fireEvent.press(screen.getByRole('button', { name: 'Generate files & new lot' }));
    await waitFor(() => expect(OfflineCaptureStore.setSubmissionState).toHaveBeenCalledWith('local-parent', 'ready'));
    expect(upload).not.toHaveBeenCalled();
    await act(async () => { saveReady(); });
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    expect(jest.mocked(upload).mock.calls[0][0].client_submission_id).toBe('submission-parent');
  });

  it.each(['ready', 'uploading', 'paused'] as const)('restores %s as explicit Resume without automatically uploading', async (state) => {
    const { upload } = await mount(state);
    expect(screen.getByText('Resume upload')).toBeTruthy();
    expect(upload).not.toHaveBeenCalled();
    expect(OfflineQueueService.getConnectivityStatus).not.toHaveBeenCalled();
    expect(OfflineCaptureStore.setSubmissionState).not.toHaveBeenCalled();
  });
});

it.each(['asset', 'lotListing'] as const)('%s does not process a cloud preview after its owner changes during cloud save', async (type) => {
  const ordinary = draft(type);
  delete (ordinary.formData as any).auctioneerWorkItemId;
  jest.mocked(AutoSaveService.getDraft).mockResolvedValue(ordinary as any);
  let resolveCloud!: (value: any) => void;
  jest.mocked(reportDraftService.upsertFromLocalDraft).mockReturnValueOnce(new Promise((resolve) => { resolveCloud = resolve; }));
  const Form = type === 'asset' ? AssetFormSheet : LotListingFormSheet;
  await render(<Form visible draftIdToLoad="local-parent" onClose={jest.fn()} />);
  await waitFor(() => expect(screen.getByTestId('mock-photo-count').props.children).toBe(1));
  await fireEvent.press(type === 'asset' ? screen.getByText('Draft') : screen.getByRole('button', { name: 'Save lot listing draft' }));
  await waitFor(() => expect(reportDraftService.upsertFromLocalDraft).toHaveBeenCalledTimes(1));
  mockOwner = 'other-owner';
  setUploadOwner(mockOwner);
  await act(async () => { resolveCloud({ id: 'cloud-owner-a' }); });
  expect(reportDraftService.processPreview).not.toHaveBeenCalled();
});

function BoundaryHarness({ current, draftId }: { current: AuctioneerWorkItemSetup; draftId?: string }) {
  return <AuctioneerFormBoundary visible type={current.reportType} setup={current} draftIdToLoad={draftId} onClose={jest.fn()}>
    {(control) => <View><Text testID="editable-work-item">{control?.setup.workItemId}</Text>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Accept without report ID" onPress={() => void control?.acceptAndContinue({ jobId: 'job-parent' })}><Text>Accept</Text></TouchableOpacity>
    </View>}
  </AuctioneerFormBoundary>;
}

it.each(['report_created', 'sent', 'abandoned'] as const)('does not mount an empty editable form for %s setup', async (status) => {
  const current = { ...setup(), status, reportId: status === 'abandoned' ? null : 'report-parent' };
  jest.mocked(auctioneerService.getSetup).mockResolvedValue(current);
  await render(<BoundaryHarness current={current} />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy());
  expect(screen.queryByTestId('editable-work-item')).toBeNull();
  expect(auctioneerService.continueWorkItem).not.toHaveBeenCalled();
});

it('reconciles a missing acceptance report ID through setup before continuing, never from a job ID', async () => {
  const current = setup();
  jest.mocked(auctioneerService.getSetup).mockResolvedValueOnce(current).mockResolvedValueOnce({ ...current, status: 'report_created', reportId: 'report-parent' });
  jest.mocked(auctioneerService.continueWorkItem).mockResolvedValue(successor(current));
  await render(<BoundaryHarness current={current} />);
  await waitFor(() => expect(screen.getByTestId('editable-work-item')).toBeTruthy());
  await fireEvent.press(screen.getByRole('button', { name: 'Accept without report ID' }));
  await waitFor(() => expect(auctioneerService.continueWorkItem).toHaveBeenCalledWith('work-parent', 'report-parent'));
  expect(auctioneerService.getSetup).toHaveBeenCalledTimes(2);
});

it('rejects a draft from another work item before mounting its saved media', async () => {
  const current = setup();
  jest.mocked(AutoSaveService.getDraft).mockResolvedValue({ ...draft('asset'), formData: { ...draft('asset').formData, auctioneerWorkItemId: 'other-work' } } as any);
  await render(<BoundaryHarness current={current} draftId="local-parent" />);
  await waitFor(() => expect(screen.getByText('This draft belongs to a different Auctioneer work item.')).toBeTruthy());
  expect(screen.queryByTestId('editable-work-item')).toBeNull();
  expect(auctioneerService.getSetup).not.toHaveBeenCalled();
});

it.each([true, false, undefined])('resumes an exact saved upload only when server capability is %s', async (canResumeUpload) => {
  const current = { ...setup(), status: 'report_created' as const, reportId: 'placeholder-report', canResumeUpload };
  jest.mocked(auctioneerService.getSetup).mockResolvedValue(current);
  jest.mocked(AutoSaveService.getDraft).mockResolvedValue(draft('asset') as any);
  await render(<BoundaryHarness current={current} draftId="local-parent" />);
  if (canResumeUpload === true) {
    await waitFor(() => expect(screen.getByTestId('editable-work-item')).toBeTruthy());
  } else {
    await waitFor(() => expect(screen.getByText('Report already created')).toBeTruthy());
    expect(screen.queryByTestId('editable-work-item')).toBeNull();
  }
});

it('does not permit a fresh form for a resumable placeholder without its original draft', async () => {
  const current = { ...setup(), status: 'report_created' as const, reportId: 'placeholder-report', canResumeUpload: true };
  jest.mocked(auctioneerService.getSetup).mockResolvedValue(current);
  await render(<BoundaryHarness current={current} />);
  await waitFor(() => expect(screen.getByText('Resume the original draft')).toBeTruthy());
  expect(screen.queryByTestId('editable-work-item')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Continue with new lot' })).toBeNull();
});

it('keeps modern draft identity after the parent clears its consumed draft pointer', async () => {
  const current = setup('lotListing');
  jest.mocked(auctioneerService.getSetup).mockResolvedValue(current);
  jest.mocked(auctioneerService.continueWorkItem).mockResolvedValue(successor(current));
  jest.mocked(AutoSaveService.getDraft).mockResolvedValue(draft('lotListing') as any);
  function DraftNavigation() {
    const [draftId, setDraftId] = useState<string | null>('local-parent');
    return <LotListingFormSheet visible draftIdToLoad={draftId} onDraftLoaded={() => setDraftId(null)} onClose={jest.fn()} />;
  }
  await render(<DraftNavigation />);
  await waitFor(() => expect(screen.getByTestId('mock-photo-count').props.children).toBe(1));
  expect(screen.getByRole('button', { name: 'Generate files & new lot' })).toBeTruthy();
  expect(auctioneerService.getSetup).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByRole('button', { name: 'Generate files & new lot' }));
  await waitFor(() => expect(auctioneerService.continueWorkItem).toHaveBeenCalledWith('work-parent', 'report-parent'));
  expect(jest.mocked(lotListingService.createLotListing).mock.calls[0][0].auctioneer_work_item_id).toBe('work-parent');
});

it('keeps an accepted form blocked when the successor was already used elsewhere', async () => {
  const current = setup();
  jest.mocked(auctioneerService.getSetup).mockResolvedValueOnce(current).mockResolvedValueOnce({ ...current, status: 'report_created', reportId: 'report-parent' });
  jest.mocked(auctioneerService.continueWorkItem).mockResolvedValue({ ...successor(current), status: 'report_created', reportId: 'report-next' });
  await render(<BoundaryHarness current={current} />);
  await waitFor(() => expect(screen.getByTestId('editable-work-item')).toBeTruthy());
  await fireEvent.press(screen.getByRole('button', { name: 'Accept without report ID' }));
  await waitFor(() => expect(screen.getByText(/next work item already has report report-next/)).toBeTruthy());
  expect(screen.queryByRole('button', { name: 'Retry new lot' })).toBeNull();
  expect(screen.queryByText('work-next')).toBeNull();
});

it('does not replace a missing requested draft with a blank ordinary form', async () => {
  jest.mocked(AutoSaveService.getDraft).mockResolvedValue(null);
  await render(<BoundaryHarness current={setup()} draftId="missing-draft" />);
  await waitFor(() => expect(screen.getByText(/requested saved draft is unavailable/)).toBeTruthy());
  expect(screen.queryByTestId('editable-work-item')).toBeNull();
  expect(screen.getByTestId('auctioneer-handoff-scroll')).toBeTruthy();
});
