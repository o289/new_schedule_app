import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  groupQueries,
  type GroupCalendarRange,
} from "#frontend/lib/queryOptions";
import {
  aggregateGroupBusyEvents,
  findAvailableHalfHourSlots,
} from "./groupCalendarSegments";
import {
  canUseSnapshotForAvailability,
  deriveGroupCalendarDisplayState,
} from "./groupCalendarState";

export type { GroupCalendarRange } from "#frontend/lib/queryOptions";

export function useGroupCalendar(groupId: string, range: GroupCalendarRange) {
  const query = useQuery(groupQueries.calendar(groupId, range));
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
