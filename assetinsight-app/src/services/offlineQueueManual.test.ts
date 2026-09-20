import NetInfo from '@react-native-community/netinfo';
import service from './offlineQueueService';
import asset from './assetService';
import listing from './lotListingService';
import { pauseActiveUploads } from './uploadCancellation';

jest.mock('@react-native-async-storage/async-storage', () => ({ __esModule: true, default: { getItem: jest.fn(), setItem: jest.fn() } }));
jest.mock('@react-native-community/netinfo', () => ({ __esModule: true, default: { addEventListener: jest.fn(() => jest.fn()) } }));
jest.mock('./assetService', () => ({ __esModule: true, default: { createAssetReport: jest.fn() } }));
jest.mock('./lotListingService', () => ({ __esModule: true, default: { createLotListing: jest.fn() } }));
jest.mock('./autoSaveService', () => ({ __esModule: true, default: {} }));
jest.mock('./offlineCaptureStore', () => ({ __esModule: true, default: { getOwnerId: () => 'owner' } }));
jest.mock('./localMediaStore', () => ({ LocalMediaStore: {} }));
jest.mock('./connectivityService', () => ({}));
jest.mock('./uploadCancellation', () => ({ pauseActiveUploads: jest.fn() }));
jest.mock('expo-file-system/legacy', () => ({ documentDirectory: 'file:///isolated/' }));

test('startup, reconnect and refresh never submit queued photos; disconnect cancels active work', async () => {
  service.init();
  const networkChanged = jest.mocked(NetInfo.addEventListener).mock.calls[0][0];
  networkChanged({ isConnected: true, isInternetReachable: true } as any);
  await service.forceSyncOnce();
  expect(asset.createAssetReport).not.toHaveBeenCalled();
  expect(listing.createLotListing).not.toHaveBeenCalled();
  networkChanged({ isConnected: false } as any);
  expect(pauseActiveUploads).toHaveBeenCalled();
  service.cleanup();
});
