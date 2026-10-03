/**
 * The background upload line (2026-10-02): order, one upload at a time, the
 * outcome of each attempt, Pause, waiting for signal and the account fence.
 * The real cancellation plumbing (uploadCancellation.ts) is used throughout;
 * only storage, the pre-upload check and the network wait are stand-ins.
 */
import {
  ACCEPTED_NOT_CONFIRMED_LOCALLY_MESSAGE,
  CONNECTION_KEPT_DROPPING_MESSAGE,
  EARLIER_UPLOAD_ACCEPTED_MESSAGE,
  EARLIER_UPLOAD_ACCEPTED_TITLE,
  KEPT_INTERRUPTED_MESSAGE,
  createBackgroundUploadManager,
  describeBackgroundUpload,
  type BackgroundUploadManager,
  type BackgroundUploadRequest,
} from './backgroundUploadManager';
import {
  beginUploadFinalization,
  cancellableUploadRequest,
  createUploadOperation,
  pauseActiveUploads,
  setUploadOwner,
  type UploadOperation,
} from './uploadCancellation';
import { setDraftCaptureMode } from './offlineDraftPolicy';
import OfflineCaptureStore from './offlineCaptureStore';
import OfflineQueueService from './offlineQueueService';
import AutoSaveService, { type OfflineReportDraft } from './autoSaveService';
import { prepareOfflineSubmission } from './offlineSubmissionService';
import { waitForStableConnection } from './uploadAutoResume';
import type { DirectUploadProgressCallback, DirectUploadProgressStage } from './directR2UploadService';

let mockOwner: string | null = 'owner';
jest.mock('@react-native-community/netinfo', () => ({ __esModule: true, default: {
  fetch: jest.fn(async () => ({ isConnected: true })), addEventListener: jest.fn(() => () => undefined),
} }));
jest.mock('./offlineCaptureStore', () => ({ __esModule: true, default: {
  getOwnerId: () => mockOwner, setSubmissionState: jest.fn(async () => undefined),
} }));
jest.mock('./offlineSubmissionService', () => ({ prepareOfflineSubmission: jest.fn(async (draft: unknown) => draft) }));
jest.mock('./offlineQueueService', () => ({ __esModule: true, default: {
  getConnectivityStatus: jest.fn(async () => ({ status: 'online' })),
  // The real wording, so a notice reads as the form's alert would.
  getSubmissionError: jest.fn((error: unknown) => jest.requireActual('./connectivityService').getSubmissionError(error)),
} }));
jest.mock('./autoSaveService', () => ({ __esModule: true, default: { cleanupOrphanedMedia: jest.fn(async () => 0) } }));
// The wait for a steady connection is driven by each test (see signalWaits).
jest.mock('./uploadAutoResume', () => ({
  ...jest.requireActual('./uploadAutoResume'),
  waitForStableConnection: jest.fn(),
}));

const setSubmissionState = jest.mocked(OfflineCaptureStore.setSubmissionState);

/** Lets every pending promise and zero-delay timer run. */
async function flush() {
  for (let round = 0; round < 12; round += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

type Transfer = {
  /** The service's own operation, created with the line's operation as its parent. */
  operation: UploadOperation;
  signal?: AbortSignal;
  progress(completedFiles: number, stage?: DirectUploadProgressStage): void;
  accept(receipt?: Record<string, unknown>): void;
  fail(error: unknown): void;
};

/**
 * Stands in for assetService.createAssetReport with { operation }: the
 * transfer is bound to an operation created with the caller's as parent and
 * is aborted when that operation is paused, as the real services' are.
 */
function service(draftId: string, totalFiles = 160) {
  const transfers: Transfer[] = [];
  const upload = jest.fn((onProgress: DirectUploadProgressCallback, parent: UploadOperation) => {
    const operation = createUploadOperation(parent);
    let settle!: { resolve: (value: unknown) => void; reject: (error: unknown) => void };
    const answer = new Promise((resolve, reject) => { settle = { resolve, reject }; });
    const transfer: Transfer = {
      operation,
      progress: (completedFiles, stage = 'uploading') => {
        const percent = Math.round((completedFiles / totalFiles) * 100);
        onProgress(percent, { percent, stage, message: '', completedFiles, totalFiles, uploadedBytes: completedFiles, totalBytes: totalFiles });
      },
      accept: (receipt = {}) => settle.resolve({ accepted: true, jobId: `job-${draftId}`, reportId: `report-${draftId}`, message: 'Accepted', ...receipt }),
      fail: (error) => settle.reject(error),
    };
    transfers.push(transfer);
    return cancellableUploadRequest(operation, (signal) => { transfer.signal = signal; return answer; });
  });
  return { upload, transfers, last: () => transfers[transfers.length - 1] };
}

function job(name: string) {
  const draftId = `draft-${name}`;
  const fake = service(draftId);
  const request: BackgroundUploadRequest = {
    draftId, type: 'asset', ownerId: 'owner', title: `QA-${name}`, totalFiles: 160,
    draft: { id: draftId, ownerId: 'owner' } as unknown as OfflineReportDraft,
    upload: fake.upload,
  };
  return { draftId, request, ...fake };
}

/** Each wait for a steady connection ends when the test says the signal is back. */
function signalWaits() {
  const waits: Array<{ signal: AbortSignal; ready: (value: boolean) => void }> = [];
  jest.mocked(waitForStableConnection).mockImplementation(({ signal }) => new Promise<boolean>((resolve) => { waits.push({ signal, ready: resolve }); }));
  return waits;
}

const networkError = () => Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' });
const activeReport = () => ({ response: { status: 409, data: { code: 'ACTIVE_REPORT_EXISTS' } }, message: 'Request failed with status code 409' });

let manager: BackgroundUploadManager;
const snapshot = () => manager.getSnapshot();
const activeId = () => snapshot().active!.id;

beforeEach(() => {
  jest.clearAllMocks();
  mockOwner = 'owner';
  setUploadOwner('owner');
  setSubmissionState.mockReset().mockResolvedValue(undefined as any);
  jest.mocked(OfflineQueueService.getConnectivityStatus).mockResolvedValue({ status: 'online' } as any);
  // By default the signal never comes back during a test.
  jest.mocked(waitForStableConnection).mockReset().mockImplementation(() => new Promise<boolean>(() => {}));
  manager = createBackgroundUploadManager();
});
afterEach(() => { manager.resetForTests(); });

describe('the line', () => {
  it('runs one upload at a time, first in, first out', async () => {
    const [a, b, c] = ['a', 'b', 'c'].map(job);
    for (const item of [a, b, c]) expect(manager.enqueue(item.request)).toBe(true);
    await flush();
    expect(snapshot().active).toMatchObject({ draftId: a.draftId, status: 'uploading' });
    expect(snapshot().queued.map((entry) => entry.draftId)).toEqual([b.draftId, c.draftId]);
    expect(snapshot().queued.map(describeBackgroundUpload)).toEqual(['Waiting in line', 'Waiting in line']);
    expect(b.upload).not.toHaveBeenCalled();
    a.last().accept();
    await flush();
    expect(b.upload).toHaveBeenCalledTimes(1);
    expect(c.upload).not.toHaveBeenCalled();
    b.last().accept();
    await flush();
    expect(c.upload).toHaveBeenCalledTimes(1);
    expect(a.upload.mock.invocationCallOrder[0]).toBeLessThan(b.upload.mock.invocationCallOrder[0]);
    expect(b.upload.mock.invocationCallOrder[0]).toBeLessThan(c.upload.mock.invocationCallOrder[0]);
  });

  it('records the upload as ready before the transfer, and as accepted with its report ID after', async () => {
    const accepted = jest.fn();
    manager.onAccepted(accepted);
    const a = job('a');
    manager.enqueue(a.request);
    await flush();
    expect(prepareOfflineSubmission).toHaveBeenCalledWith(a.request.draft);
    expect(setSubmissionState.mock.calls).toEqual([[a.draftId, 'ready']]);
    expect(setSubmissionState.mock.invocationCallOrder[0]).toBeLessThan(a.upload.mock.invocationCallOrder[0]);
    a.last().progress(45);
    expect(snapshot().active).toMatchObject({ completedFiles: 45, totalFiles: 160, percent: 28, canPause: true });
    expect(describeBackgroundUpload(snapshot().active!)).toBe('Uploading 45 of 160');
    a.last().accept();
    await flush();
    expect(setSubmissionState).toHaveBeenLastCalledWith(a.draftId, 'accepted', `report-${a.draftId}`);
    // The default age limit: the person may be taking the next report's photos.
    expect(AutoSaveService.cleanupOrphanedMedia).toHaveBeenCalledWith();
    expect(accepted).toHaveBeenCalledWith({ draftId: a.draftId, type: 'asset', reportId: `report-${a.draftId}` });
    expect(snapshot().notices).toEqual([expect.objectContaining({ kind: 'sent', heading: 'Sent', title: 'QA-a', autoDismiss: true })]);
    expect(snapshot().active).toBeNull();
    expect(manager.isBusy(a.draftId)).toBe(false);
    expect(manager.statusFor(a.draftId)).toBeUndefined();
  });

  it('refuses a draft that is already uploading, waiting in line or waiting for signal', async () => {
    signalWaits();
    const [a, b] = ['a', 'b'].map(job);
    expect(manager.enqueue(a.request)).toBe(true);
    expect(manager.enqueue(a.request)).toBe(false);
    expect(manager.enqueue(b.request)).toBe(true);
    expect(manager.enqueue(b.request)).toBe(false);
    await flush();
    a.last().fail(networkError());
    await flush();
    expect(snapshot().active).toMatchObject({ draftId: a.draftId, status: 'waiting' });
    expect(manager.enqueue(a.request)).toBe(false);
    expect(manager.isBusy(a.draftId) && manager.isBusy(b.draftId)).toBe(true);
    // Once paused, the draft belongs to the person again; a new Submit replaces the paused entry.
    manager.pause(activeId());
    expect(manager.isBusy(a.draftId)).toBe(false);
    expect(manager.enqueue(a.request)).toBe(true);
    expect(snapshot().held).toEqual([]);
    expect(snapshot().queued.map((entry) => entry.draftId)).toEqual([a.draftId]);
  });
});

describe('Pause and Resume in the bar', () => {
  it('stops that upload only; another upload keeps going and the next in line starts', async () => {
    const [a, b] = ['a', 'b'].map(job);
    manager.enqueue(a.request);
    manager.enqueue(b.request);
    await flush();
    // An upload a form runs at the same time (its own operation).
    const formUpload = createUploadOperation();
    a.last().progress(45);
    const transfer = a.last();
    expect(manager.pause(activeId())).toBe(true);
    expect(snapshot().active).toMatchObject({ draftId: a.draftId, pausing: true, canPause: false });
    expect(describeBackgroundUpload(snapshot().active!)).toBe('Pausing');
    expect(transfer.signal?.aborted).toBe(true);
    expect(transfer.operation.isActive()).toBe(false);
    expect(formUpload.isActive()).toBe(true);
    await flush();
    expect(setSubmissionState).toHaveBeenCalledWith(a.draftId, 'paused', undefined, expect.stringContaining('Upload paused'));
    expect(snapshot().held).toEqual([expect.objectContaining({ draftId: a.draftId, status: 'paused', completedFiles: 45 })]);
    expect(snapshot().notices).toEqual([]);
    expect(b.upload).toHaveBeenCalledTimes(1);
    expect(b.last().operation.isActive()).toBe(true);
    expect(formUpload.isActive()).toBe(true);
    expect(waitForStableConnection).not.toHaveBeenCalled();
  });

  it('puts a resumed upload at the end of the line, as the person\'s own action', async () => {
    const [a, b, c] = ['a', 'b', 'c'].map(job);
    for (const item of [a, b, c]) manager.enqueue(item.request);
    await flush();
    manager.pause(activeId());
    await flush();
    expect(snapshot().active).toMatchObject({ draftId: b.draftId });
    const pausedId = snapshot().held[0].id;
    expect(manager.resume(pausedId)).toBe(true);
    expect(snapshot().queued.map((entry) => entry.draftId)).toEqual([c.draftId, a.draftId]);
    b.last().accept();
    await flush();
    c.last().accept();
    await flush();
    expect(a.upload).toHaveBeenCalledTimes(2);
    expect(snapshot().active).toMatchObject({ draftId: a.draftId, status: 'uploading' });
  });

  it('pauses an upload waiting in line without starting it', async () => {
    const [a, b] = ['a', 'b'].map(job);
    manager.enqueue(a.request);
    manager.enqueue(b.request);
    await flush();
    expect(manager.pause(snapshot().queued[0].id)).toBe(true);
    await flush();
    expect(b.upload).not.toHaveBeenCalled();
    expect(setSubmissionState).toHaveBeenCalledWith(b.draftId, 'paused', undefined, expect.stringContaining('Upload paused'));
    expect(snapshot().held).toEqual([expect.objectContaining({ draftId: b.draftId, status: 'paused' })]);
    expect(snapshot().active).toMatchObject({ draftId: a.draftId, status: 'uploading' });
  });

  it('settles a Pause tapped during the checks before the transfer at once', async () => {
    const [a, b] = ['a', 'b'].map(job);
    // A check that does not answer must not keep the bar on "Pausing" or hold the line.
    jest.mocked(prepareOfflineSubmission).mockImplementationOnce(() => new Promise(() => {}));
    manager.enqueue(a.request);
    manager.enqueue(b.request);
    await flush();
    expect(manager.pause(activeId())).toBe(true);
    await flush();
    expect(a.upload).not.toHaveBeenCalled();
    expect(snapshot().held).toEqual([expect.objectContaining({ draftId: a.draftId, status: 'paused' })]);
    expect(b.upload).toHaveBeenCalledTimes(1);
  });

  it('is not held up by a transfer that does not stop when paused', async () => {
    const [a, b] = ['a', 'b'].map(job);
    // Ignores its operation and never answers.
    manager.enqueue({ ...a.request, upload: jest.fn(() => new Promise(() => {})) });
    manager.enqueue(b.request);
    await flush();
    expect(manager.pause(activeId())).toBe(true);
    await flush();
    expect(snapshot().held).toEqual([expect.objectContaining({ draftId: a.draftId, status: 'paused' })]);
    expect(b.upload).toHaveBeenCalledTimes(1);
  });

  // 2026-10-01: pausing during "Finalizing" threw away the server's acceptance.
  it('refuses Pause while the submission is being finalized', async () => {
    const a = job('a');
    manager.enqueue(a.request);
    await flush();
    a.last().progress(160, 'finalizing');
    expect(snapshot().active).toMatchObject({ stage: 'finalizing', canPause: false });
    expect(describeBackgroundUpload(snapshot().active!)).toBe('Finalizing');
    expect(manager.pause(activeId())).toBe(false);
    expect(a.last().operation.isActive()).toBe(true);
    a.last().accept();
    await flush();
    expect(setSubmissionState).toHaveBeenLastCalledWith(a.draftId, 'accepted', `report-${a.draftId}`);
    expect(setSubmissionState).not.toHaveBeenCalledWith(a.draftId, 'paused', expect.anything(), expect.anything());
  });

  it('leaves a finalizing submission alone when Offline is chosen on a new report', async () => {
    const a = job('a');
    manager.enqueue(a.request);
    await flush();
    // As directR2UploadService does before showing "Finalizing".
    const endFinalization = beginUploadFinalization();
    a.last().progress(160, 'finalizing');
    setDraftCaptureMode('new-report', 'offline');
    expect(a.last().operation.isActive()).toBe(true);
    a.last().accept();
    endFinalization();
    await flush();
    expect(a.upload).toHaveBeenCalledTimes(1);
    expect(setSubmissionState).toHaveBeenLastCalledWith(a.draftId, 'accepted', `report-${a.draftId}`);
    expect(snapshot().notices).toEqual([expect.objectContaining({ kind: 'sent' })]);
  });

  it('refuses Pause while any submission is being finalized', async () => {
    const a = job('a');
    manager.enqueue(a.request);
    await flush();
    const endFinalization = beginUploadFinalization();
    expect(manager.pause(activeId())).toBe(false);
    expect(a.last().operation.isActive()).toBe(true);
    endFinalization();
    expect(manager.pause(activeId())).toBe(true);
    await flush();
    expect(snapshot().held).toEqual([expect.objectContaining({ draftId: a.draftId, status: 'paused' })]);
  });
});

describe('outcomes that need the person', () => {
  it('holds an earlier acceptance for review and sends the next Submit to the form', async () => {
    const accepted = jest.fn();
    manager.onAccepted(accepted);
    const [a, b] = ['a', 'b'].map(job);
    manager.enqueue(a.request);
    manager.enqueue(b.request);
    await flush();
    a.last().accept({ alreadyQueued: true });
    await flush();
    expect(setSubmissionState).not.toHaveBeenCalledWith(a.draftId, 'accepted', expect.anything());
    expect(setSubmissionState).not.toHaveBeenCalledWith(a.draftId, 'paused', expect.anything(), expect.anything());
    expect(snapshot().held).toEqual([expect.objectContaining({ draftId: a.draftId, status: 'attention', message: EARLIER_UPLOAD_ACCEPTED_MESSAGE })]);
    expect(snapshot().notices).toEqual([expect.objectContaining({ kind: 'attention', heading: EARLIER_UPLOAD_ACCEPTED_TITLE, draftId: a.draftId })]);
    expect(accepted).not.toHaveBeenCalled();
    expect(AutoSaveService.cleanupOrphanedMedia).not.toHaveBeenCalled();
    expect(manager.prefersForeground(a.draftId)).toBe(true);
    expect(b.upload).toHaveBeenCalledTimes(1);
    manager.consumeForegroundMark(a.draftId);
    expect(manager.prefersForeground(a.draftId)).toBe(false);
  });

  it.each([
    ['a report already processing', activeReport(), 'Report Already Processing'],
    ['changed photos', { response: { status: 409, data: { code: 'SUBMISSION_MANIFEST_CHANGED', data: { accepted: false, canSupersede: true } } } }, 'Upload needs checking'],
    ['a sign-in problem', { response: { status: 401 }, message: 'Unauthorized' }, 'Sign In Required'],
    ['a rejected request', { response: { status: 400, data: { message: 'Contract number is not valid.' } }, message: 'Bad request' }, 'Report Needs Attention'],
  ])('stops for %s, keeps the draft paused and marks it for the form', async (_name, error, heading) => {
    const waits = signalWaits();
    const [a, b] = ['a', 'b'].map(job);
    manager.enqueue(a.request);
    manager.enqueue(b.request);
    await flush();
    a.last().fail(error);
    await flush();
    expect(setSubmissionState).toHaveBeenCalledWith(a.draftId, 'paused', undefined, (error as any).message);
    expect(snapshot().held).toEqual([expect.objectContaining({ draftId: a.draftId, status: 'attention' })]);
    expect(describeBackgroundUpload(snapshot().held[0])).toBe('Needs attention');
    expect(snapshot().notices).toEqual([expect.objectContaining({ kind: 'attention', heading, draftId: a.draftId })]);
    expect(manager.prefersForeground(a.draftId)).toBe(true);
    expect(manager.resume(snapshot().held[0].id)).toBe(false);
    expect(waits).toHaveLength(0);
    expect(a.upload).toHaveBeenCalledTimes(1);
    expect(b.upload).toHaveBeenCalledTimes(1);
  });

  it('does not take an unconfirmed receipt as acceptance', async () => {
    const a = job('a');
    manager.enqueue(a.request);
    await flush();
    a.last().accept({ accepted: false });
    await flush();
    expect(setSubmissionState).not.toHaveBeenCalledWith(a.draftId, 'accepted', expect.anything());
    expect(snapshot().held).toEqual([expect.objectContaining({ draftId: a.draftId, status: 'attention' })]);
    expect(manager.prefersForeground(a.draftId)).toBe(true);
  });

  it('stops when the check before the transfer refuses the draft', async () => {
    jest.mocked(prepareOfflineSubmission).mockRejectedValueOnce(new Error('2 original files are unavailable. Restore or replace them in the draft before submitting.'));
    const a = job('a');
    manager.enqueue(a.request);
    await flush();
    expect(a.upload).not.toHaveBeenCalled();
    expect(snapshot().held).toEqual([expect.objectContaining({ draftId: a.draftId, status: 'attention', message: expect.stringContaining('original files are unavailable') })]);
    expect(manager.prefersForeground(a.draftId)).toBe(true);
  });

  it('reports an acceptance this phone could not record as sent, and never sends it again', async () => {
    setSubmissionState.mockImplementation(async (_id, state) => {
      if (state === 'accepted') throw new Error('Local storage unavailable');
      return undefined as any;
    });
    const accepted = jest.fn();
    manager.onAccepted(accepted);
    const [a, b] = ['a', 'b'].map(job);
    manager.enqueue(a.request);
    manager.enqueue(b.request);
    await flush();
    a.last().accept();
    await flush();
    expect(snapshot().notices).toEqual([expect.objectContaining({
      kind: 'sent', heading: 'Upload accepted', message: ACCEPTED_NOT_CONFIRMED_LOCALLY_MESSAGE, autoDismiss: false,
    })]);
    expect(accepted).toHaveBeenCalledWith(expect.objectContaining({ draftId: a.draftId }));
    expect(manager.statusFor(a.draftId)).toBeUndefined();
    expect(setSubmissionState).not.toHaveBeenCalledWith(a.draftId, 'paused', expect.anything(), expect.anything());
    expect(a.upload).toHaveBeenCalledTimes(1);
    expect(b.upload).toHaveBeenCalledTimes(1);
  });
});

describe('waiting for signal', () => {
  it('waits after a lost connection, keeps its turn, and continues the same upload', async () => {
    const waits = signalWaits();
    const [a, b] = ['a', 'b'].map(job);
    manager.enqueue(a.request);
    manager.enqueue(b.request);
    await flush();
    a.last().progress(64);
    // The automatic pause on a lost connection (offlineQueueService.ts).
    pauseActiveUploads('connection');
    await flush();
    expect(snapshot().active).toMatchObject({ draftId: a.draftId, status: 'waiting', completedFiles: 64, canPause: true });
    expect(describeBackgroundUpload(snapshot().active!)).toBe('Waiting for signal');
    expect(setSubmissionState).toHaveBeenLastCalledWith(a.draftId, 'paused', undefined, expect.any(String));
    expect(b.upload).not.toHaveBeenCalled();
    expect(waits).toHaveLength(1);
    await waits[0].ready(true);
    await flush();
    expect(a.upload).toHaveBeenCalledTimes(2);
    expect(a.upload.mock.calls[1][1]).not.toBe(a.upload.mock.calls[0][1]);
    expect(setSubmissionState).toHaveBeenLastCalledWith(a.draftId, 'ready');
    expect(snapshot().active).toMatchObject({ draftId: a.draftId, status: 'uploading' });
    expect(b.upload).not.toHaveBeenCalled();
  });

  it('waits when there is no connection at all, without starting the transfer', async () => {
    const waits = signalWaits();
    jest.mocked(OfflineQueueService.getConnectivityStatus).mockResolvedValueOnce({ status: 'offline' } as any);
    const a = job('a');
    manager.enqueue(a.request);
    await flush();
    expect(a.upload).not.toHaveBeenCalled();
    expect(snapshot().active).toMatchObject({ status: 'waiting' });
    waits[0].ready(true);
    await flush();
    expect(a.upload).toHaveBeenCalledTimes(1);
  });

  it('Resume now tries at once and stops waiting', async () => {
    const waits = signalWaits();
    const a = job('a');
    manager.enqueue(a.request);
    await flush();
    a.last().fail(networkError());
    await flush();
    expect(manager.resumeNow()).toBe(true);
    expect(waits[0].signal.aborted).toBe(true);
    await flush();
    expect(a.upload).toHaveBeenCalledTimes(2);
    expect(snapshot().active).toMatchObject({ status: 'uploading' });
  });

  it('Pause while waiting keeps it paused, and the signal coming back later starts nothing', async () => {
    const waits = signalWaits();
    const [a, b] = ['a', 'b'].map(job);
    manager.enqueue(a.request);
    manager.enqueue(b.request);
    await flush();
    a.last().fail(networkError());
    await flush();
    expect(manager.pause(activeId())).toBe(true);
    expect(waits[0].signal.aborted).toBe(true);
    expect(snapshot().held).toEqual([expect.objectContaining({ draftId: a.draftId, status: 'paused' })]);
    waits[0].ready(true);
    await flush();
    expect(a.upload).toHaveBeenCalledTimes(1);
    expect(b.upload).toHaveBeenCalledTimes(1);
  });

  it('hands back to the person after three automatic tries that send no new file', async () => {
    const waits = signalWaits();
    const [a, b] = ['a', 'b'].map(job);
    manager.enqueue(a.request);
    manager.enqueue(b.request);
    await flush();
    for (let round = 0; round < 3; round += 1) {
      a.last().fail(networkError());
      await flush();
      expect(waits).toHaveLength(round + 1);
      waits[round].ready(true);
      await flush();
      expect(a.upload).toHaveBeenCalledTimes(round + 2);
    }
    a.last().fail(networkError());
    await flush();
    expect(waits).toHaveLength(3);
    expect(snapshot().held).toEqual([expect.objectContaining({ draftId: a.draftId, status: 'paused', message: CONNECTION_KEPT_DROPPING_MESSAGE })]);
    expect(snapshot().notices).toEqual([expect.objectContaining({ kind: 'attention', message: CONNECTION_KEPT_DROPPING_MESSAGE })]);
    expect(b.upload).toHaveBeenCalledTimes(1);
  });

  it('keeps going while each try sends more files', async () => {
    const waits = signalWaits();
    const a = job('a');
    manager.enqueue(a.request);
    await flush();
    for (let round = 0; round < 5; round += 1) {
      a.last().progress(20 * (round + 1));
      a.last().fail(networkError());
      await flush();
      expect(waits).toHaveLength(round + 1);
      waits[round].ready(true);
      await flush();
    }
    expect(a.upload).toHaveBeenCalledTimes(6);
    expect(snapshot().notices).toEqual([]);
    expect(snapshot().active).toMatchObject({ draftId: a.draftId, status: 'uploading' });
  });

  it('tries again at once after a pause nobody asked of it, counted in the same streak', async () => {
    const waits = signalWaits();
    const [a, b] = ['a', 'b'].map(job);
    manager.enqueue(a.request);
    manager.enqueue(b.request);
    await flush();
    // Choosing Offline on a new report pauses every upload (offlineDraftPolicy.ts).
    for (let round = 0; round < 3; round += 1) {
      setDraftCaptureMode(`new-report-${round}`, 'offline');
      await flush();
      expect(a.upload).toHaveBeenCalledTimes(round + 2);
    }
    setDraftCaptureMode('new-report-3', 'offline');
    await flush();
    expect(waits).toHaveLength(0);
    expect(a.upload).toHaveBeenCalledTimes(4);
    // Each prompt retry left the draft recorded as ready; only the stop records a pause.
    expect(setSubmissionState.mock.calls.filter(([id, state]) => id === a.draftId && state === 'paused'))
      .toEqual([[a.draftId, 'paused', undefined, expect.stringContaining('Upload paused')]]);
    expect(snapshot().held).toEqual([expect.objectContaining({ draftId: a.draftId, status: 'paused', message: KEPT_INTERRUPTED_MESSAGE })]);
    expect(b.upload).toHaveBeenCalledTimes(1);
  });
});

describe('a change of account', () => {
  afterEach(() => { mockOwner = 'owner'; setUploadOwner('owner'); });

  it('empties the line and writes nothing for the old account', async () => {
    const [a, b, c] = ['a', 'b', 'c'].map(job);
    for (const item of [a, b, c]) manager.enqueue(item.request);
    await flush();
    // a uploading, b waiting in line, c paused.
    manager.pause(snapshot().queued[1].id);
    await flush();
    expect(snapshot().held).toHaveLength(1);
    const transfer = a.last();
    const listener = jest.fn();
    manager.subscribe(listener);
    setSubmissionState.mockClear();
    mockOwner = 'other-owner';
    setUploadOwner('other-owner');
    expect(snapshot()).toEqual({ active: null, queued: [], held: [], notices: [] });
    expect(listener).toHaveBeenCalled();
    expect(transfer.operation.isActive()).toBe(false);
    expect(transfer.signal?.aborted).toBe(true);
    // A late answer for the old account changes nothing.
    transfer.accept();
    await flush();
    expect(setSubmissionState).not.toHaveBeenCalled();
    expect(b.upload).not.toHaveBeenCalled();
    expect(snapshot().active).toBeNull();
  });

  it('never starts an upload queued for another account', async () => {
    const a = job('a');
    mockOwner = 'other-owner';
    setUploadOwner('other-owner');
    expect(manager.enqueue(a.request)).toBe(true);
    await flush();
    expect(a.upload).not.toHaveBeenCalled();
    expect(setSubmissionState).not.toHaveBeenCalled();
    expect(snapshot().active).toBeNull();
  });

  it('forgets the needs-attention marks of the old account', async () => {
    const a = job('a');
    manager.enqueue(a.request);
    await flush();
    a.last().fail(activeReport());
    await flush();
    expect(manager.prefersForeground(a.draftId)).toBe(true);
    mockOwner = 'other-owner';
    setUploadOwner('other-owner');
    expect(manager.prefersForeground(a.draftId)).toBe(false);
  });
});

describe('handing a draft back', () => {
  it('forget() drops a held entry and its notice so the form owns the draft, keeping the foreground mark', async () => {
    const a = job('a');
    manager.enqueue(a.request);
    await flush();
    a.last().fail(activeReport());
    await flush();
    expect(snapshot().held).toHaveLength(1);
    expect(snapshot().notices).toHaveLength(1);
    expect(manager.forget(a.draftId)).toBe(true);
    expect(snapshot().held).toEqual([]);
    expect(snapshot().notices).toEqual([]);
    expect(manager.forget(a.draftId)).toBe(false);
    // The form's next Submit still runs in the form, where its prompt appears.
    expect(manager.prefersForeground(a.draftId)).toBe(true);
  });

  it('dismiss() removes one notice', async () => {
    const a = job('a');
    manager.enqueue(a.request);
    await flush();
    a.last().accept();
    await flush();
    manager.dismiss(snapshot().notices[0].id);
    expect(snapshot().notices).toEqual([]);
  });
});
