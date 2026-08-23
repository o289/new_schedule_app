import type { GroupCalendarResponse } from "#schemas/group";

export type GroupCalendarQueryState = {
  data?: GroupCalendarResponse | undefined;
  isPending: boolean;
  isFetching: boolean;
  isError: boolean;
};

export type GroupCalendarDisplayState =
  "loading" | "error" | "refreshing" | "stale" | "success";

export function isCompleteSnapshot(
  data: GroupCalendarResponse | undefined,
): data is GroupCalendarResponse {
  return (
    data?.completeness === "complete" &&
    data.requestedMemberCount === data.fetchedMemberCount
  );
}

export function deriveGroupCalendarDisplayState(
  query: GroupCalendarQueryState,
): GroupCalendarDisplayState {
  if (query.isPending && !query.data) return "loading";
  if (query.isError && query.data) return "stale";
  if (query.isError || !isCompleteSnapshot(query.data)) return "error";
  if (query.isFetching) return "refreshing";
  return "success";
}

export function canUseSnapshotForAvailability(
  state: GroupCalendarDisplayState,
  data: GroupCalendarResponse | undefined,
): boolean {
  return state === "success" && isCompleteSnapshot(data);
}
