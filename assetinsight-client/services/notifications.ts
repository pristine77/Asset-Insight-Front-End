import API from "@/lib/api";

export type WorkspaceNotification = {
  id: string;
  category?: string;
  type?: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  createdAt: string;
  readAt?: string | null;
  read: boolean;
};

export type NotificationPage = {
  items: WorkspaceNotification[];
  unreadCount: number;
  page: number;
  limit: number;
  total: number;
};

export const notificationCacheKey = (page = 1, limit = 20) =>
  `/notifications?page=${page}&limit=${limit}`;

export const NotificationsService = {
  async list(page = 1, limit = 20): Promise<NotificationPage> {
    const { data } = await API.get<NotificationPage>(
      notificationCacheKey(page, limit)
    );
    return data;
  },

  async markRead(id: string): Promise<void> {
    await API.patch(`/notifications/${id}/read`);
  },

  async markAllRead(): Promise<void> {
    await API.patch("/notifications/read-all");
  },

  async remove(id: string): Promise<void> {
    await API.delete(`/notifications/${id}`);
  },
};
