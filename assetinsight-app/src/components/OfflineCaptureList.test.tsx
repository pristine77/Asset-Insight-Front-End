import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import OfflineCaptureList from './OfflineCaptureList';
import OfflineCaptureStore from '../services/offlineCaptureStore';

jest.mock('../context/ThemeContext', () => ({ useAppTheme: () => ({ colors: { text: '#111', textSecondary: '#555', warning: '#a50', accent: '#c00' } }) }));
jest.mock('../services/offlineCaptureStore', () => ({ __esModule: true, default: {
  getOwnerId: () => 'owner', listSummaries: jest.fn(), listLegacyDrafts: jest.fn(async () => []), listLegacyJobs: jest.fn(async () => []),
} }));
jest.mock('../services/autoSaveService', () => ({ __esModule: true, default: { deleteDraft: jest.fn() } }));

afterEach(async () => { await cleanup(); jest.clearAllMocks(); });

it.each(['ready', 'uploading', 'paused'])('shows explicit resume guidance for an interrupted %s capture', async (submissionState) => {
  jest.mocked(OfflineCaptureStore.listSummaries).mockResolvedValue([{
    id: 'draft-a', type: 'asset', contractNo: 'QA-157', captureMode: 'offline', submissionState,
    updatedAt: '2026-09-17T10:00:00.000Z', counts: { lots: 1, images: 2, extraImages: 1, missingImages: 0, perLot: [] },
  }] as any);
  const open = jest.fn();
  await render(<OfflineCaptureList onOpen={open} />);
  await waitFor(() => expect(screen.getByText('Upload needs your confirmation — open the draft, then tap Resume upload. Nothing uploads automatically.')).toBeTruthy());
  expect(screen.getByText('1 lots · 2 photos · 1 report-only')).toBeTruthy();
  expect(open).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Open and submit' }));
  expect(open).toHaveBeenCalledWith('draft-a', 'asset');
});

it('does not label an ordinary unsubmitted saved draft as an interrupted upload', async () => {
  jest.mocked(OfflineCaptureStore.listSummaries).mockResolvedValue([{
    id: 'draft-a', type: 'asset', captureMode: 'offline', submissionState: 'local',
    updatedAt: '2026-09-17T10:00:00.000Z', counts: { lots: 0, images: 0, extraImages: 0, missingImages: 0, perLot: [] },
  }] as any);
  await render(<OfflineCaptureList onOpen={jest.fn()} />);
  await waitFor(() => expect(screen.getByText('Offline captures · 1')).toBeTruthy());
  expect(screen.queryByText(/Upload needs your confirmation/)).toBeNull();
});
