"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { AuthResponse, AuthUser, LoginPayload } from "@/services/auth";
import { AuthService } from "@/services/auth";
import { UserService } from "@/services/user";
import { clearTokens, hasStoredTokens } from "@/lib/auth-storage";
import {
  clearStoredDeviceAccess,
  getStoredDeviceAccess,
  storeDeviceAccess,
  type RestrictedDeviceAccess,
} from "@/lib/device-access";
import { DeviceAccessService } from "@/services/device-access";
import { startReportActivitySync } from "@/services/reportActivitySync";

export type AuthContextType = {
  user: AuthUser | null;
  sessionPresent: boolean;
  loading: boolean;
  error: string | null;
  loggingOut: boolean;
  deviceAccess: RestrictedDeviceAccess | null;
  refresh: () => Promise<void>;
  login: (payload: LoginPayload) => Promise<AuthResponse>;
  acceptAuthResponse: (response: AuthResponse) => AuthResponse;
  registerDevice: () => Promise<void>;
  refreshDeviceStatus: () => Promise<void>;
  rerequestDevice: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [sessionPresent, setSessionPresent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [deviceAccess, setDeviceAccess] = useState<RestrictedDeviceAccess | null>(null);
  const statusRequest = useRef<Promise<void> | null>(null);
  useEffect(() => {
    if (!user?._id || loggingOut || deviceAccess) return;
    return startReportActivitySync(user._id);
  }, [user?._id, loggingOut, deviceAccess]);

  const applyResponse = useCallback((data: AuthResponse) => {
    if (data.authState === "authenticated") {
      setUser(data.user);
      setSessionPresent(true);
      setDeviceAccess(null);
      clearStoredDeviceAccess();
    } else {
      setUser(null);
      setSessionPresent(false);
      setDeviceAccess(data);
      storeDeviceAccess(data);
    }
    return data;
  }, []);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const me = await UserService.getMe();
      setUser(me);
      setSessionPresent(true);
      setLoggingOut(false);
    } catch (err: any) {
      setUser(null);
      setSessionPresent(false);
      const restricted = err?.response?.data as RestrictedDeviceAccess | undefined;
      if (restricted?.authState) {
        setDeviceAccess(restricted);
        storeDeviceAccess(restricted);
        clearTokens();
      } else {
        setError(
          err?.response?.data?.message || err?.message || "Unable to load your account"
        );
        clearTokens();
      }
    }
  }, []);

  const login = useCallback(
    async (payload: LoginPayload) => {
      setError(null);
      setLoggingOut(false);
      const data = await AuthService.login(payload);
      return applyResponse(data);
    },
    [applyResponse]
  );

  const exchangeIfApproved = useCallback(async () => {
    const authenticated = await DeviceAccessService.exchange();
    setUser(authenticated.user);
    setSessionPresent(true);
    setDeviceAccess(null);
    setError(null);
  }, []);

  const registerDevice = useCallback(async () => {
    const next = await DeviceAccessService.register();
    if ((next as unknown as { authState?: string }).authState === "approved") {
      await exchangeIfApproved();
      return;
    }
    setDeviceAccess(next);
  }, [exchangeIfApproved]);

  const refreshDeviceStatus = useCallback(() => {
    if (statusRequest.current) return statusRequest.current;
    const request = (async () => {
      const result = await DeviceAccessService.status();
      const status = result.status || result.authState;
      if (status === "approved") {
        await exchangeIfApproved();
        return;
      }
      const next = { ...result, authState: status } as RestrictedDeviceAccess;
      setDeviceAccess(next);
      storeDeviceAccess(next);
    })().finally(() => {
      statusRequest.current = null;
    });
    statusRequest.current = request;
    return request;
  }, [exchangeIfApproved]);

  const rerequestDevice = useCallback(async () => {
    const next = await DeviceAccessService.rerequest();
    setDeviceAccess(next);
  }, []);

  const logout = useCallback(async () => {
    setLoggingOut(true);
    await AuthService.logout();
    setUser(null);
    setSessionPresent(false);
    setDeviceAccess(null);
  }, []);

  useEffect(() => {
    const storedDeviceAccess = getStoredDeviceAccess();
    if (storedDeviceAccess) {
      setDeviceAccess(storedDeviceAccess);
      setUser(null);
      setSessionPresent(false);
      setLoggingOut(false);
      setLoading(false);
    } else if (typeof window !== "undefined" && hasStoredTokens()) {
      setSessionPresent(true);
      refresh().finally(() => setLoading(false));
    } else {
      clearTokens();
      setUser(null);
      setSessionPresent(false);
      setLoggingOut(false);
      setLoading(false);
    }
  }, [refresh]);

  useEffect(() => {
    const onRestricted = (event: Event) => {
      const detail = (event as CustomEvent<RestrictedDeviceAccess>).detail;
      if (!detail?.authState) return;
      clearTokens();
      setUser(null);
      setSessionPresent(false);
      setDeviceAccess(detail);
      storeDeviceAccess(detail);
    };
    window.addEventListener("device-access-restricted", onRestricted);
    return () => window.removeEventListener("device-access-restricted", onRestricted);
  }, []);

  useEffect(() => {
    const onSessionInvalidated = () => {
      clearTokens();
      clearStoredDeviceAccess();
      setUser(null);
      setSessionPresent(false);
      setDeviceAccess(null);
      setLoggingOut(false);
      setError("Your device session is no longer valid. Sign in again to continue.");
    };
    window.addEventListener("auth-session-invalidated", onSessionInvalidated);
    return () => window.removeEventListener("auth-session-invalidated", onSessionInvalidated);
  }, []);

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      sessionPresent,
      loading,
      error,
      loggingOut,
      deviceAccess,
      refresh,
      login,
      acceptAuthResponse: applyResponse,
      registerDevice,
      refreshDeviceStatus,
      rerequestDevice,
      logout,
    }),
    [
      user,
      sessionPresent,
      loading,
      error,
      loggingOut,
      deviceAccess,
      refresh,
      login,
      applyResponse,
      registerDevice,
      refreshDeviceStatus,
      rerequestDevice,
      logout,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuthContext must be used within AuthProvider");
  return ctx;
}
