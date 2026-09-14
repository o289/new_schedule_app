import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createEvent,
  hashEvent,
  replayEvents,
  type RunEvent,
  type RunState,
} from "./state-schema";

const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const planHash = digest("plan");
const targetSha = "b".repeat(40);
function event(
  sequence: number,
  from: RunState | null,
  to: RunState,
  previousEventHash: string | null,
  phaseId: string | null = null,
  retryCount = 0,
): RunEvent {
  return createEvent({
    schemaVersion: 1,
    sequence,
    previousEventHash,
    runId: "run-1",
    planHash,
    actor: "luna",
    occurredAt: "2026-09-14T00:00:00.000Z",
    targetSha,
    from,
    to,
    phaseId,
    retryCount,
  });
}

describe("state event chain", () => {
  it("replays the canonical happy path", () => {
    const events: RunEvent[] = [];
    let previous: string | null = null;
    let from: RunState | null = null;
    for (const to of [
      "PREPARED",
      "PLAN_APPROVED",
      "WORKTREE_READY",
      "PHASE_RUNNING",
      "VERIFYING",
      "PHASE_PASSED",
      "CHECKPOINTED",
      "PUBLISH_READY",
    ] as const) {
      const next = event(
        events.length + 1,
        from,
        to,
        previous,
        [
          "PHASE_RUNNING",
          "VERIFYING",
          "PHASE_PASSED",
          "CHECKPOINTED",
          "PUBLISH_READY",
        ].includes(to)
          ? "phase-1"
          : null,
      );
      events.push(next);
      previous = next.eventHash;
      from = to;
    }
    expect(replayEvents(events).state).toBe("PUBLISH_READY");
  });
  it.each([
    [
      "missing sequence",
      (events: RunEvent[]) => [
        { ...events[0], sequence: 2 },
        ...events.slice(1),
      ],
    ],
    [
      "tampered payload",
      (events: RunEvent[]) => [
        { ...events[0], actor: "attacker" },
        ...events.slice(1),
      ],
    ],
    [
      "broken previous hash",
      (events: RunEvent[]) => [
        events[0],
        { ...events[1], previousEventHash: digest("wrong") },
      ],
    ],
    [
      "invalid transition",
      (events: RunEvent[]) => [
        events[0],
        event(2, "PREPARED", "PUBLISH_READY", events[0]!.eventHash),
      ],
    ],
  ])("rejects %s", (_name, mutate) => {
    const first = event(1, null, "PREPARED", null);
    expect(() =>
      replayEvents(
        mutate([first, event(2, "PREPARED", "PLAN_APPROVED", first.eventHash)]),
      ),
    ).toThrow();
  });
  it("rejects a second start inserted into an existing history", () => {
    const first = event(1, null, "PREPARED", null);
    const secondStart = event(2, null, "PREPARED", first.eventHash);
    expect(() => replayEvents([first, secondStart])).toThrow();
  });
  it("increments retries exactly and rejects the fourth retry", () => {
    const events: RunEvent[] = [];
    let previous: string | null = null;
    const add = (
      from: RunState | null,
      to: RunState,
      phaseId: string | null,
      retryCount: number,
    ) => {
      const next = event(
        events.length + 1,
        from,
        to,
        previous,
        phaseId,
        retryCount,
      );
      events.push(next);
      previous = next.eventHash;
    };
    add(null, "PREPARED", null, 0);
    add("PREPARED", "PLAN_APPROVED", null, 0);
    add("PLAN_APPROVED", "WORKTREE_READY", null, 0);
    add("WORKTREE_READY", "PHASE_RUNNING", "phase-1", 0);
    add("PHASE_RUNNING", "REWORK", "phase-1", 0);
    add("REWORK", "PHASE_RUNNING", "phase-1", 1);
    add("PHASE_RUNNING", "REWORK", "phase-1", 1);
    add("REWORK", "PHASE_RUNNING", "phase-1", 2);
    add("PHASE_RUNNING", "REWORK", "phase-1", 2);
    add("REWORK", "PHASE_RUNNING", "phase-1", 3);
    expect(replayEvents(events).revision).toBe(10);
    const fourth = event(11, "PHASE_RUNNING", "REWORK", previous, "phase-1", 3);
    const retryFourInput = {
      ...fourth,
      sequence: 12,
      previousEventHash: fourth.eventHash,
      from: "REWORK" as const,
      to: "PHASE_RUNNING" as const,
      retryCount: 4,
    };
    const retryFour = {
      ...retryFourInput,
      eventHash: hashEvent(retryFourInput),
    };
    expect(() => replayEvents([...events, fourth, retryFour])).toThrow();
  });
  it("rejects missing phase identity and metadata in phase-external states", () => {
    const first = event(1, null, "PREPARED", null);
    const approved = event(2, "PREPARED", "PLAN_APPROVED", first.eventHash);
    const ready = event(
      3,
      "PLAN_APPROVED",
      "WORKTREE_READY",
      approved.eventHash,
    );
    expect(() =>
      replayEvents([
        ...[first, approved, ready],
        event(4, "WORKTREE_READY", "PHASE_RUNNING", ready.eventHash),
      ]),
    ).toThrow();
    expect(() =>
      replayEvents([
        first,
        event(2, "PREPARED", "PLAN_APPROVED", first.eventHash, "phase-1"),
      ]),
    ).toThrow();
  });
  it("does not reuse a completed phase, but allows a new phase after checkpoint", () => {
    const events: RunEvent[] = [];
    let previous: string | null = null;
    const add = (
      from: RunState | null,
      to: RunState,
      phaseId: string | null,
      retryCount = 0,
    ) => {
      const next = event(
        events.length + 1,
        from,
        to,
        previous,
        phaseId,
        retryCount,
      );
      events.push(next);
      previous = next.eventHash;
    };
    add(null, "PREPARED", null);
    add("PREPARED", "PLAN_APPROVED", null);
    add("PLAN_APPROVED", "WORKTREE_READY", null);
    add("WORKTREE_READY", "PHASE_RUNNING", "phase-1");
    add("PHASE_RUNNING", "VERIFYING", "phase-1");
    add("VERIFYING", "PHASE_PASSED", "phase-1");
    add("PHASE_PASSED", "CHECKPOINTED", "phase-1");
    const samePhase = event(
      8,
      "CHECKPOINTED",
      "PHASE_RUNNING",
      previous,
      "phase-1",
    );
    expect(() => replayEvents([...events, samePhase])).toThrow();
    add("CHECKPOINTED", "PHASE_RUNNING", "phase-2");
    expect(replayEvents(events).phaseId).toBe("phase-2");
  });
  it("preserves phase information when INFRA_FAIL occurs during a phase", () => {
    const first = event(1, null, "PREPARED", null);
    const approved = event(2, "PREPARED", "PLAN_APPROVED", first.eventHash);
    const ready = event(
      3,
      "PLAN_APPROVED",
      "WORKTREE_READY",
      approved.eventHash,
    );
    const running = event(
      4,
      "WORKTREE_READY",
      "PHASE_RUNNING",
      ready.eventHash,
      "phase-1",
    );
    const failed = event(
      5,
      "PHASE_RUNNING",
      "INFRA_FAIL",
      running.eventHash,
      "phase-1",
    );
    const resumed = event(
      6,
      "INFRA_FAIL",
      "PHASE_RUNNING",
      failed.eventHash,
      "phase-1",
    );
    expect(
      replayEvents([first, approved, ready, running, failed, resumed]).phaseId,
    ).toBe("phase-1");
    expect(() =>
      replayEvents([
        first,
        approved,
        ready,
        running,
        event(5, "PHASE_RUNNING", "INFRA_FAIL", running.eventHash, "phase-2"),
      ]),
    ).toThrow();
  });
  it("hashes the exact event body", () => {
    const first = event(1, null, "PREPARED", null);
    expect(first.eventHash).toBe(hashEvent(first));
  });
});
