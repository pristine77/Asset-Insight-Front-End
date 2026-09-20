import React from 'react';
import { Alert, Platform } from 'react-native';
import { act, cleanup, render, waitFor } from '@testing-library/react-native';
import NativeAuctionCameraScreen from './NativeAuctionCameraScreen';
import LegacyCameraScreen from './CameraScreen';
import { loadNativeAuctionCamera } from './nativeAuctionCameraModule';
import type { MixedLot } from './types';
import { OfflineCaptureStore } from '../../services/offlineCaptureStore';

jest.mock('../../services/offlineCaptureStore', () => ({ OfflineCaptureStore: {
  getPendingCapture: jest.fn(async () => null),
  stageCameraActivity: jest.fn(async () => undefined),
  acknowledgePendingCapture: jest.fn(async () => true),
} }));

jest.mock('./CameraScreen', () => ({ __esModule: true, default: jest.fn(() => null) }));
jest.mock('./nativeAuctionCameraModule', () => ({ loadNativeAuctionCamera: jest.fn() }));

const openAuctionCamera = jest.fn<Promise<string>, [string?]>();

const originalPlatform = Platform.OS;
const lot: MixedLot = {
  id: 'auctioneer-source-1', mode: 'single_lot', files: [], extraFiles: [], coverIndex: 0,
};
const photo = { uri: 'file:///isolated-new-photo.jpg', name: 'photo.jpg', type: 'image/jpeg' };

function props(lockedStructure?: boolean) {
  return {
    visible: true, lockedStructure, lots: [lot], activeLotIdx: 0, sourceLabels: ['Lot 157'],
    onClose: jest.fn(), setLots: jest.fn(), setActiveLotIdx: jest.fn(), onAutoSave: jest.fn(),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
  jest.mocked(loadNativeAuctionCamera).mockResolvedValue({ openAuctionCamera });
  jest.mocked(openAuctionCamera).mockResolvedValue(JSON.stringify([{ ...lot, files: [photo] }]));
});

afterEach(async () => {
  jest.restoreAllMocks();
  await cleanup();
  Object.defineProperty(Platform, 'OS', { value: originalPlatform, configurable: true });
});

it('acknowledges a durable owner-bound journal only after the draft transaction succeeds', async () => {
  const acknowledgeCapture = jest.fn().mockResolvedValue(true);
  const input = { ...props(), captureContext: { ownerId: 'owner', draftId: 'draft', sessionId: 'requested-session' } };
  let finishSave!: () => void;
  input.onAutoSave.mockReturnValue(new Promise<void>((resolve) => { finishSave = resolve; }));
  jest.mocked(loadNativeAuctionCamera).mockResolvedValue({ openAuctionCamera, acknowledgeCapture });
  openAuctionCamera.mockResolvedValue(JSON.stringify({ ownerId: 'owner', draftId: 'draft', sessionId: 'recovered-session', revision: 14, lots: [{ ...lot, files: [photo] }] }));
  await render(<NativeAuctionCameraScreen {...input} />);
  await waitFor(() => expect(input.onAutoSave).toHaveBeenCalled());
  expect(acknowledgeCapture).not.toHaveBeenCalled();
  await act(async () => { finishSave(); });
  await waitFor(() => expect(acknowledgeCapture).toHaveBeenCalledWith('owner', 'draft', 'recovered-session', 14));
  expect(JSON.parse(openAuctionCamera.mock.calls[0][0] || '{}').captureContext).toEqual(input.captureContext);
});

it('keeps the recovery journal when draft persistence fails', async () => {
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  const acknowledgeCapture = jest.fn();
  const input = { ...props(), captureContext: { ownerId: 'owner', draftId: 'draft', sessionId: 'session' } };
  input.onAutoSave.mockRejectedValue(new Error('Storage full'));
  jest.mocked(loadNativeAuctionCamera).mockResolvedValue({ openAuctionCamera, acknowledgeCapture });
  openAuctionCamera.mockResolvedValue(JSON.stringify({ ...input.captureContext, revision: 1, lots: [{ ...lot, files: [photo] }] }));
  await render(<NativeAuctionCameraScreen {...input} />);
  await waitFor(() => expect(input.onClose).toHaveBeenCalled());
  expect(acknowledgeCapture).not.toHaveBeenCalled();
});

it('never imports or acknowledges another account journal', async () => {
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const acknowledgeCapture = jest.fn();
  const input = { ...props(), captureContext: { ownerId: 'owner', draftId: 'draft', sessionId: 'session' } };
  jest.mocked(loadNativeAuctionCamera).mockResolvedValue({ openAuctionCamera, acknowledgeCapture });
  openAuctionCamera.mockResolvedValue(JSON.stringify({ ownerId: 'other', draftId: 'draft', sessionId: 'session', revision: 1, lots: [{ ...lot, files: [photo] }] }));
  await render(<NativeAuctionCameraScreen {...input} />);
  await waitFor(() => expect(input.onClose).toHaveBeenCalled());
  expect(input.setLots).not.toHaveBeenCalled();
  expect(input.onAutoSave).not.toHaveBeenCalled();
  expect(acknowledgeCapture).not.toHaveBeenCalled();
  expect(LegacyCameraScreen).not.toHaveBeenCalled();
});

it('offers owner-scoped recovery on a cold draft reopen without opening the camera', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const acknowledgeCapture = jest.fn().mockResolvedValue(true);
  const getPendingCapture = jest.fn().mockResolvedValue(JSON.stringify({ ownerId: 'owner', draftId: 'draft', sessionId: 'interrupted', revision: 5, lots: [{ ...lot, files: [photo] }] }));
  const input = { ...props(), visible: false, captureContext: { ownerId: 'owner', draftId: 'draft', sessionId: 'new' } };
  jest.mocked(loadNativeAuctionCamera).mockResolvedValue({ openAuctionCamera, getPendingCapture, acknowledgeCapture });
  await render(<NativeAuctionCameraScreen {...input} />);
  await waitFor(() => expect(alert).toHaveBeenCalledWith('Recover camera photos?', expect.stringContaining('1 photos'), expect.any(Array)));
  expect(openAuctionCamera).not.toHaveBeenCalled();
  expect(input.onAutoSave).not.toHaveBeenCalled();
  const recover = alert.mock.calls[0][2]?.find((button) => button.text === 'Recover photos');
  await act(async () => { recover?.onPress?.(); });
  await waitFor(() => expect(acknowledgeCapture).toHaveBeenCalledWith('owner', 'draft', 'interrupted', 5));
  expect(input.onAutoSave).toHaveBeenCalledWith([expect.objectContaining({ id: lot.id })], 0);
});

it('recovers the fallback camera journal on iOS only after the draft save commits', async () => {
  Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const context = { ownerId: 'owner', draftId: 'draft', sessionId: 'session' };
  const recoveredLots = [{ ...lot, files: [{ ...photo, mediaId: 'camera-original', ownership: 'camera' as const }] }];
  const journal = { ...context, revision: 7, lots: recoveredLots };
  jest.mocked(OfflineCaptureStore.getPendingCapture).mockResolvedValueOnce(journal);
  const input = { ...props(), visible: false, captureContext: context };
  let finish!: () => void;
  input.onAutoSave.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
  await render(<NativeAuctionCameraScreen {...input} />);
  await waitFor(() => expect(alert).toHaveBeenCalled());
  await act(async () => { alert.mock.calls[0][2]?.find((button) => button.text === 'Recover photos')?.onPress?.(); });
  expect(input.onAutoSave).toHaveBeenCalledWith(recoveredLots, 0);
  expect(OfflineCaptureStore.acknowledgePendingCapture).not.toHaveBeenCalled();
  await act(async () => { finish(); });
  await waitFor(() => expect(OfflineCaptureStore.acknowledgePendingCapture).toHaveBeenCalledWith(journal, 7));
  expect(loadNativeAuctionCamera).not.toHaveBeenCalled();
});

it('does not overwrite photo edits made while the recovery confirmation was open', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const acknowledgeCapture = jest.fn();
  const getPendingCapture = jest.fn().mockResolvedValue(JSON.stringify({ ownerId: 'owner', draftId: 'draft', sessionId: 'interrupted', revision: 5, lots: [{ ...lot, files: [photo] }] }));
  const input = { ...props(), visible: false, captureContext: { ownerId: 'owner', draftId: 'draft', sessionId: 'new' } };
  jest.mocked(loadNativeAuctionCamera).mockResolvedValue({ openAuctionCamera, getPendingCapture, acknowledgeCapture });
  const view = await render(<NativeAuctionCameraScreen {...input} />);
  await waitFor(() => expect(alert).toHaveBeenCalled());
  const recover = alert.mock.calls[0][2]?.find((button) => button.text === 'Recover photos');
  await view.rerender(<NativeAuctionCameraScreen {...input} lots={[{ ...lot, files: [{ ...photo, uri: 'file:///new-user-photo.jpg' }] }]} />);
  await act(async () => { recover?.onPress?.(); });
  expect(input.onAutoSave).not.toHaveBeenCalled();
  expect(acknowledgeCapture).not.toHaveBeenCalled();
  expect(alert).toHaveBeenLastCalledWith('Draft changed', expect.any(String));
});

it('routes fixed source lots to the structure-safe camera without opening legacy native capture', async () => {
  const input = { ...props(true), manualSubmissionRequired: true };
  await render(<NativeAuctionCameraScreen {...input} />);
  expect(openAuctionCamera).not.toHaveBeenCalled();
  expect(loadNativeAuctionCamera).not.toHaveBeenCalled();
  expect(LegacyCameraScreen).toHaveBeenCalled();
  const received = jest.mocked(LegacyCameraScreen).mock.calls[0][0];
  expect(received).toMatchObject({ lockedStructure: true, lots: input.lots, activeLotIdx: 0, sourceLabels: ['Lot 157'], manualSubmissionRequired: true });
  // The same capture/save callbacks retain photos; there is no native-result
  // normalization, rejected setLots, or automatic close on this path.
  expect(received.setLots).toBe(input.setLots);
  expect(received.onAutoSave).toBe(input.onAutoSave);
  expect(received.onClose).toBe(input.onClose);
  expect(input.setLots).not.toHaveBeenCalled();
  expect(input.onClose).not.toHaveBeenCalled();
});

it.each([undefined, false])('preserves native capture for unlocked work (%s)', async (locked) => {
  const input = props(locked);
  await render(<NativeAuctionCameraScreen {...input} />);
  await waitFor(() => expect(input.onClose).toHaveBeenCalledTimes(1));
  expect(openAuctionCamera).toHaveBeenCalledTimes(1);
  const payload = JSON.parse(jest.mocked(openAuctionCamera).mock.calls[0][0] || '{}');
  expect(payload.lots).toMatchObject([{ id: lot.id, mode: lot.mode }]);
  expect(input.setLots).toHaveBeenCalledWith([expect.objectContaining({ id: lot.id, files: [expect.objectContaining(photo)] })]);
  expect(input.onAutoSave).toHaveBeenCalledWith([expect.objectContaining({ id: lot.id })], 0);
  expect(LegacyCameraScreen).not.toHaveBeenCalled();
});

it('does not open either camera when the form camera is hidden', async () => {
  await render(<NativeAuctionCameraScreen {...props(true)} visible={false} />);
  expect(openAuctionCamera).not.toHaveBeenCalled();
  expect(LegacyCameraScreen).not.toHaveBeenCalled();
});

it('passes the same structure lock to the existing non-Android camera', async () => {
  Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
  await render(<NativeAuctionCameraScreen {...props(true)} />);
  expect(openAuctionCamera).not.toHaveBeenCalled();
  expect(jest.mocked(LegacyCameraScreen).mock.calls[0][0].lockedStructure).toBe(true);
});

it.each(['lock', 'hide', 'unmount'])('does not open a late-resolving native loader after %s', async (change) => {
  let resolveLoader!: (module: { openAuctionCamera: typeof openAuctionCamera }) => void;
  jest.mocked(loadNativeAuctionCamera).mockReturnValue(new Promise((resolve) => { resolveLoader = resolve; }));
  const input = props(false);
  const view = await render(<NativeAuctionCameraScreen {...input} />);
  expect(loadNativeAuctionCamera).toHaveBeenCalledTimes(1);
  if (change === 'unmount') await view.unmount();
  else await view.rerender(<NativeAuctionCameraScreen {...input} visible={change !== 'hide'} lockedStructure={change === 'lock'} />);
  await act(async () => { resolveLoader({ openAuctionCamera }); });
  expect(openAuctionCamera).not.toHaveBeenCalled();
  expect(input.setLots).not.toHaveBeenCalled();
  expect(input.onClose).not.toHaveBeenCalled();
});
