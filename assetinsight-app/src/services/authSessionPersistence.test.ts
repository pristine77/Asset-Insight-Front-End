import AsyncStorage from '@react-native-async-storage/async-storage';
import api from './api';
import authService from './authService';
import deviceAccessService from './deviceAccessService';
import * as storage from './deviceAccessStorage';
import { invalidateAuthOperations } from './authSessionOperation';

jest.mock('@react-native-async-storage/async-storage', () => ({ multiRemove: jest.fn(), setItem: jest.fn(), getItem: jest.fn() }));
jest.mock('./api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() }, STORAGE_KEYS: { USER: 'cached-user', SESSION_EXPIRED: 'expired' } }));
jest.mock('./deviceMetadataService', () => ({ buildNativeDeviceContext: jest.fn(async () => ({})), collectVerifiedNativeDeviceContext: jest.fn(async () => ({})) }));
jest.mock('./deviceAccessStorage', () => ({
  clearDeviceAccess: jest.fn(), clearSecureSession: jest.fn(), getMemoryAccessToken: jest.fn(),
  getRefreshToken: jest.fn(async () => 'old-refresh'), migrateLegacyTokens: jest.fn(), persistDeviceAccess: jest.fn(),
  setMemoryAccessToken: jest.fn(), setRefreshToken: jest.fn(), getDeviceKey: jest.fn(async () => 'device'),
  getPersistedDeviceAccess: jest.fn(async () => ({ challengeToken: 'fixture-challenge' })),
}));
const session = { authState: 'authenticated' as const, accessToken: 'fixture-access', refreshToken: 'fixture-refresh', user: { _id: 'owner-a', email: 'fixture@example.test', isVerified: true } };
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>((yes) => { resolve = yes; }); return { promise, resolve }; };
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
beforeEach(() => { jest.clearAllMocks(); invalidateAuthOperations(); jest.mocked(api.post).mockResolvedValue({ data: {} }); jest.mocked(storage.setRefreshToken).mockResolvedValue(undefined); });

it.each(['login', 'exchange'] as const)('rejects a late %s response before it can persist credentials after logout', async (action) => {
  const response = deferred<any>(); jest.mocked(api.post).mockReturnValueOnce(response.promise);
  const pending = action === 'login' ? authService.login({ email: 'fixture@example.test', password: 'fixture' }) : deviceAccessService.exchange();
  const rejected = expect(pending).rejects.toMatchObject({ code: 'ERR_CANCELED' });
  await flush(); invalidateAuthOperations(); await authService.logout();
  response.resolve({ data: session }); await rejected;
  expect(storage.setMemoryAccessToken).not.toHaveBeenCalled(); expect(storage.setRefreshToken).not.toHaveBeenCalled();
  expect(AsyncStorage.setItem).not.toHaveBeenCalled();
});

it('serializes logout behind an in-flight secure write so that write cannot resurrect credentials', async () => {
  const secureWrite = deferred<void>(); let token: string | null = 'old-refresh';
  jest.mocked(storage.setRefreshToken).mockImplementationOnce(async (value) => { await secureWrite.promise; token = value; });
  jest.mocked(storage.clearSecureSession).mockImplementationOnce(async () => { token = null; });
  const persisting = authService.acceptAuthenticatedResponse(session);
  const rejected = expect(persisting).rejects.toMatchObject({ code: 'ERR_CANCELED' });
  await flush(); expect(storage.setRefreshToken).toHaveBeenCalled();
  invalidateAuthOperations(); const logout = authService.logout(); await flush();
  expect(storage.clearSecureSession).not.toHaveBeenCalled();
  secureWrite.resolve(); await rejected; await logout;
  expect(token).toBeNull(); expect(AsyncStorage.setItem).not.toHaveBeenCalled();
});

it('does not restore a late profile response to the offline cache', async () => {
  const response = deferred<any>(); jest.mocked(api.get).mockReturnValueOnce(response.promise);
  const profile = authService.refreshCurrentUser();
  invalidateAuthOperations(); await authService.logout(); response.resolve({ data: session.user });
  expect(await profile).toBeNull(); expect(AsyncStorage.setItem).not.toHaveBeenCalled();
});

it('rejects an incomplete authenticated response before changing the stored session', async () => {
  await expect(authService.acceptAuthenticatedResponse({ ...session, user: null } as any)).rejects.toThrow('incomplete');
  expect(storage.setMemoryAccessToken).not.toHaveBeenCalled(); expect(storage.setRefreshToken).not.toHaveBeenCalled();
  expect(api.get).not.toHaveBeenCalled(); expect(AsyncStorage.multiRemove).not.toHaveBeenCalled();
});
