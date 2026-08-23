import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import type { GroupCalendarResponse } from "#schemas/group";
import { groupApi } from "#frontend/lib/api";
import { ApiClientError } from "#frontend/lib/apiError";
import { groupKeys } from "#frontend/lib/queryKeys";
import {
  aggregateGroupBusyEvents,
  findAvailableHalfHourSlots,
} from "./groupCalendarSegments";
import {
  canUseSnapshotForAvailability,
  deriveGroupCalendarDisplayState,
} from "./groupCalendarState";

export type GroupCalendarRange = { startDate: string; endDate: string };

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

export function useGroupCalendar(groupId: string, range: GroupCalendarRange) {
  const query = useQuery({
    queryKey: groupKeys.calendar(groupId, range.startDate, range.endDate),
    queryFn: ({ signal }) => fetchGroupCalendar(groupId, range, signal),
    enabled: Boolean(groupId && range.startDate && range.endDate),
    retry: shouldRetryGroupCalendar,
  });
  const state = deriveGroupCalendarDisplayState(query);
  const dailyBusySegments = useMemo(
    () => aggregateGroupBusyEvents(query.data?.events ?? []),
    [query.data?.events],
  );
  const availableSlots = (day: string) => {
    if (!canUseSnapshotForAvailability(state, query.data) || !query.data) {
      return [];
    }
    return findAvailableHalfHourSlots(query.data, day);
  };

  return { ...query, state, dailyBusySegments, availableSlots };
}
