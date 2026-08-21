import type { CategoryCreate, CategoryResponse } from "#schemas/category";
import type {
  PasskeyLoginOptionsResponse,
  PasskeyRegisterOptionsResponse,
  TokenResponse,
} from "#schemas/auth";
import type { AvatarKey, PublicUserProfile, UserResponse } from "#schemas/user";
import type {
  GroupCalendarResponse,
  GroupCreate,
  GroupDetailResponse,
  GroupJoin,
  GroupResponse,
} from "#schemas/group";
import type { ScheduleForm, ScheduleResponse } from "../types/schedule";
import { apiClient } from "./apiClient";

export const categoryApi = {
  list: (signal?: AbortSignal) =>
    apiClient.authenticated<CategoryResponse[]>("/categories", {
      method: "GET",
      ...(signal ? { signal } : {}),
    }),
  create: (category: CategoryCreate) =>
    apiClient.authenticated<CategoryResponse>("/categories", {
      method: "POST",
      body: JSON.stringify(category),
    }),
  update: (id: string, category: CategoryCreate) =>
    apiClient.authenticated<CategoryResponse>(`/categories/${id}`, {
      method: "PUT",
      body: JSON.stringify(category),
    }),
  remove: (id: string) =>
    apiClient.authenticated<void>(`/categories/${id}`, { method: "DELETE" }),
};

export const scheduleApi = {
  list: (signal?: AbortSignal) =>
    apiClient.authenticated<ScheduleResponse[]>("/schedules", {
      method: "GET",
      ...(signal ? { signal } : {}),
    }),
  create: (schedule: ScheduleForm) =>
    apiClient.authenticated<ScheduleResponse>("/schedules", {
      method: "POST",
      body: JSON.stringify(schedule),
    }),
  update: (id: string | undefined, schedule: ScheduleForm) =>
    apiClient.authenticated<ScheduleResponse>(`/schedules/${id}`, {
      method: "PUT",
      body: JSON.stringify(schedule),
    }),
  remove: (id: string | undefined) =>
    apiClient.authenticated<void>(`/schedules/${id}`, { method: "DELETE" }),
};

export const groupApi = {
  list: (signal?: AbortSignal) =>
    apiClient.authenticated<GroupResponse[]>("/groups", {
      method: "GET",
      ...(signal ? { signal } : {}),
    }),
  create: (group: GroupCreate) =>
    apiClient.authenticated<{ group: GroupResponse; joinCode: string }>(
      "/groups",
      { method: "POST", body: JSON.stringify(group) },
    ),
  detail: (groupId: string, signal?: AbortSignal) =>
    apiClient.authenticated<GroupDetailResponse>(`/groups/${groupId}`, {
      method: "GET",
      ...(signal ? { signal } : {}),
    }),
  join: (input: GroupJoin) =>
    apiClient.authenticated<GroupResponse>("/groups/join", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  remove: (groupId: string) =>
    apiClient.authenticated<void>(`/groups/${groupId}`, { method: "DELETE" }),
  kick: (groupId: string, userId: string) =>
    apiClient.authenticated<void>(`/groups/${groupId}/members/${userId}`, {
      method: "DELETE",
    }),
  leave: (groupId: string) =>
    apiClient.authenticated<void>(`/groups/${groupId}/leave`, {
      method: "POST",
    }),
  calendar: (
    groupId: string,
    range: { startDate: string; endDate: string },
    signal?: AbortSignal,
  ) => {
    const query = new URLSearchParams(range).toString();
    return apiClient.authenticated<GroupCalendarResponse>(
      `/groups/${groupId}/calendar?${query}`,
      { method: "GET", ...(signal ? { signal } : {}) },
    );
  },
};

export const authApi = {
  loginOptions: (email: string) =>
    apiClient.public<PasskeyLoginOptionsResponse>(
      "/auth/passkey/login/options",
      { method: "POST", body: JSON.stringify({ email }) },
    ),
  loginVerify: (credential: unknown) =>
    apiClient.public<TokenResponse>("/auth/passkey/login/verify", {
      method: "POST",
      body: JSON.stringify(credential),
    }),
  registerOptions: (profile: {
    email: string;
    name: string;
    avatar: AvatarKey | null;
  }) =>
    apiClient.public<PasskeyRegisterOptionsResponse>(
      "/auth/passkey/register/options",
      { method: "POST", body: JSON.stringify(profile) },
    ),
  registerVerify: (credential: unknown) =>
    apiClient.public<void>("/auth/passkey/register/verify", {
      method: "POST",
      body: JSON.stringify(credential),
    }),
  me: (signal?: AbortSignal) =>
    apiClient.authenticated<UserResponse>("/auth/me", {
      method: "GET",
      ...(signal ? { signal } : {}),
    }),
  updateProfile: (profile: PublicUserProfile) =>
    apiClient.authenticated<UserResponse>("/auth/me", {
      method: "PUT",
      body: JSON.stringify(profile),
    }),
  logout: (refreshToken: string) =>
    apiClient.public<void>("/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refresh_token: refreshToken }),
    }),
};
