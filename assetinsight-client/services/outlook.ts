import API from "@/lib/api";

export type OutlookCalendarStatus = {
  connected: boolean;
  email?: string;
  connectedAt?: string | null;
  configured?: boolean;
};

export const OutlookService = {
  async getStatus(): Promise<OutlookCalendarStatus> {
    const { data } = await API.get<OutlookCalendarStatus>(
      "/crm/calendar/ms/outlook/status"
    );
    return {
      connected: Boolean(data?.connected),
      email: data?.email || undefined,
      connectedAt: data?.connectedAt ?? null,
      configured: data?.configured ?? false,
    };
  },

  async getAuthUrl(): Promise<string> {
    const { data } = await API.get<{ authUrl?: string }>(
      "/crm/calendar/ms/outlook/auth-url"
    );
    return String(data?.authUrl || "").trim();
  },

  async disconnect(): Promise<void> {
    await API.delete("/crm/calendar/ms/outlook/disconnect");
  },
};
