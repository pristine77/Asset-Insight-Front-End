import API, { type RetriableAxiosConfig } from '@/lib/api';
import { advanceAuthSession, assertAuthSessionCurrent, captureAuthSession, clearTokens, getAccessToken, getRefreshToken, setTokens, type AuthSessionSnapshot } from '@/lib/auth-storage';
import {
  buildBasicDeviceContext,
  clearStoredDeviceAccess,
  storeDeviceAccess,
  type RestrictedDeviceAccess,
} from '@/lib/device-access';

export type SignupPayload = {
  email: string;
  password: string;
  username?: string;
  companyName?: string;
  contactEmail?: string;
  contactPhone?: string;
  companyAddress?: string;
};

export type LoginPayload = {
  email: string;
  password: string;
};

export type AuthenticatedResponse = {
  authState: 'authenticated';
  message?: string;
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
  device?: { id: string; status: string; displayName?: string };
};

export type AuthResponse = AuthenticatedResponse | RestrictedDeviceAccess;

export type VerifyEmailPayload = {
  email: string;
  verificationCode: string;
};

export type ForgotPasswordPayload = {
  email: string;
};

export type ResetPasswordPayload = {
  token: string;
  password: string;
};

export type ResetPasswordCodePayload = {
  email: string;
  code: string;
  password: string;
};

export type AuthUser = {
  _id: string;
  id?: string;
  email: string;
  username?: string;
  companyName?: string;
  contactEmail?: string;
  contactPhone?: string;
  companyAddress?: string;
  isVerified?: boolean;
  isReportApprover?: boolean;
  isReleaseManager?: boolean;
  proposalValuationEnabled?: boolean;
  isCrmAgent?: boolean;
  role?: 'user' | 'admin' | 'superadmin';
  crmAddress?: string;
  crmQuadrant?: string;
  crmSpecializations?: string[];
  avatarUrl?: string;
  avatarUploadedAt?: string;
  authProvider?: string;
  createdAt?: string;
  updatedAt?: string;
};

async function deviceAwarePayload<T extends Record<string, unknown>>(payload: T) {
  return { ...payload, deviceContext: await buildBasicDeviceContext() };
}

function applyAuthResponse(data: AuthResponse) {
  if (data.authState === 'authenticated') {
    setTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
    clearStoredDeviceAccess();
  } else {
    clearTokens();
    storeDeviceAccess(data);
  }
  return data;
}

const authOptions = (session: AuthSessionSnapshot): RetriableAxiosConfig => ({ _retry: true, _authSession: session });

export const AuthService = {
  async signup(payload: SignupPayload): Promise<{ message: string }> {
    const { data } = await API.post<{ message: string }>('/auth/signup', payload);
    return data;
  },

  async login(payload: LoginPayload): Promise<AuthResponse> {
    const session = advanceAuthSession();
    try {
      const body = await deviceAwarePayload(payload);
      assertAuthSessionCurrent(session);
      const { data } = await API.post<AuthResponse>(
        '/auth/login',
        body,
        authOptions(session),
      );
      assertAuthSessionCurrent(session);
      return applyAuthResponse(data);
    } catch (err: any) {
      assertAuthSessionCurrent(session);
      const restricted = err?.response?.data as RestrictedDeviceAccess | undefined;
      if (restricted?.authState) return applyAuthResponse(restricted);
      const serverMsg = err?.response?.data?.message || err?.message || 'Failed to login';
      throw new Error(serverMsg);
    }
  },

  async verifyEmail(payload: VerifyEmailPayload): Promise<AuthResponse & { message?: string }> {
    const session = advanceAuthSession();
    const body = await deviceAwarePayload(payload);
    assertAuthSessionCurrent(session);
    const { data } = await API.post<AuthResponse & { message?: string }>(
      '/auth/verify-email',
      body,
      authOptions(session),
    );
    assertAuthSessionCurrent(session);
    return applyAuthResponse(data);
  },

  async resendVerificationCode(email: string): Promise<{ message: string }> {
    const { data } = await API.post<{ message: string }>('/auth/resend-verification-code', { email });
    return data;
  },

  async forgotPassword(payload: ForgotPasswordPayload): Promise<{ message: string }> {
    const { data } = await API.post<{ message: string }>('/auth/forgot-password', {
      ...payload,
      clientType: 'mobile',
    });
    return data;
  },

  async resetPasswordByCode(payload: ResetPasswordCodePayload): Promise<AuthResponse & { message?: string }> {
    const session = advanceAuthSession();
    const body = await deviceAwarePayload(payload);
    assertAuthSessionCurrent(session);
    const { data } = await API.post<AuthResponse & { message?: string }>(
      '/auth/reset-password-code',
      body,
      authOptions(session),
    );
    assertAuthSessionCurrent(session);
    return applyAuthResponse(data);
  },

  async resetPassword(payload: ResetPasswordPayload): Promise<AuthResponse & { message?: string }> {
    const session = advanceAuthSession();
    const body = await deviceAwarePayload({ password: payload.password });
    assertAuthSessionCurrent(session);
    const { data } = await API.post<AuthResponse & { message?: string }>(
      `/auth/reset-password/${payload.token}`,
      body,
      authOptions(session),
    );
    assertAuthSessionCurrent(session);
    return applyAuthResponse(data);
  },

  async logout() {
    const refreshToken = getRefreshToken();
    const accessToken = getAccessToken();
    clearTokens();
    clearStoredDeviceAccess();
    const session = captureAuthSession();
    if (refreshToken) {
      // Logout is locally complete immediately; a late receipt cannot clear a later login.
      await API.post('/auth/logout', { token: refreshToken }, {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
        timeout: 15_000,
        _retry: true,
        _authSession: session,
      } as RetriableAxiosConfig).catch(() => {});
    }
  },
};
