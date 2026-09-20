import API from '@/lib/api';
import { clearTokens, setTokens } from '@/lib/auth-storage';
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

export const AuthService = {
  async signup(payload: SignupPayload): Promise<{ message: string }> {
    const { data } = await API.post<{ message: string }>('/auth/signup', payload);
    return data;
  },

  async login(payload: LoginPayload): Promise<AuthResponse> {
    try {
      const { data } = await API.post<AuthResponse>(
        '/auth/login',
        await deviceAwarePayload(payload),
      );
      return applyAuthResponse(data);
    } catch (err: any) {
      const restricted = err?.response?.data as RestrictedDeviceAccess | undefined;
      if (restricted?.authState) return applyAuthResponse(restricted);
      const serverMsg = err?.response?.data?.message || err?.message || 'Failed to login';
      throw new Error(serverMsg);
    }
  },

  async verifyEmail(payload: VerifyEmailPayload): Promise<AuthResponse & { message?: string }> {
    const { data } = await API.post<AuthResponse & { message?: string }>(
      '/auth/verify-email',
      await deviceAwarePayload(payload),
    );
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
    const { data } = await API.post<AuthResponse & { message?: string }>(
      '/auth/reset-password-code',
      await deviceAwarePayload(payload),
    );
    return applyAuthResponse(data);
  },

  async resetPassword(payload: ResetPasswordPayload): Promise<AuthResponse & { message?: string }> {
    const { data } = await API.post<AuthResponse & { message?: string }>(
      `/auth/reset-password/${payload.token}`,
      await deviceAwarePayload({ password: payload.password }),
    );
    return applyAuthResponse(data);
  },

  async logout() {
    try {
      const { getRefreshToken } = await import('@/lib/auth-storage');
      const refreshToken = getRefreshToken();
      if (refreshToken) {
        await API.post('/auth/logout', { token: refreshToken }).catch(() => {});
      }
    } finally {
      clearTokens();
      clearStoredDeviceAccess();
    }
  },
};
