import { queryOptions } from "@tanstack/react-query";
import type { GroupCalendarResponse } from "#schemas/group";
import { authApi, categoryApi, groupApi, scheduleApi } from "./api";
import { ApiClientError } from "./apiError";
import { authKeys, categoryKeys, groupKeys, scheduleKeys } from "./queryKeys";

export type GroupCalendarRange = { startDate: string; endDate: string };

export const scheduleQueries = {
  list: () =>
    queryOptions({
      queryKey: scheduleKeys.lists(),
      queryFn: ({ signal }) => scheduleApi.list(signal),
    }),
};

export const categoryQueries = {
  list: () =>
    queryOptions({
      queryKey: categoryKeys.lists(),
      queryFn: ({ signal }) => categoryApi.list(signal),
    }),
};

export function shouldRetryGroupCalendar(
  failureCount: number,
  error: unknown,
): boolean {
  if (failureCount >= 3) return false;
  if (!(error instanceof ApiClientError)) return true;
  return [502, 503, 504].includes(error.status);
}

export function fetchGroupCalendar(
  groupId: string,
  range: GroupCalendarRange,
  signal: AbortSignal,
): Promise<GroupCalendarResponse> {
  return groupApi.calendar(groupId, range, signal);
}

export const groupQueries = {
  list: () =>
    queryOptions({
      queryKey: groupKeys.lists(),
      queryFn: ({ signal }) => groupApi.list(signal),
    }),
  detail: (groupId: string) =>
    queryOptions({
      queryKey: groupKeys.detail(groupId),
      queryFn: ({ signal }) => groupApi.detail(groupId, signal),
    }),
  calendar: (groupId: string, range: GroupCalendarRange) =>
    queryOptions({
      queryKey: groupKeys.calendar(groupId, range.startDate, range.endDate),
      queryFn: ({ signal }) => fetchGroupCalendar(groupId, range, signal),
      enabled: Boolean(groupId && range.startDate && range.endDate),
      retry: shouldRetryGroupCalendar,
    }),
};

export const authQueries = {
  me: () =>
    queryOptions({
      queryKey: authKeys.me(),
      queryFn: ({ signal }) => authApi.me(signal),
    }),
};
