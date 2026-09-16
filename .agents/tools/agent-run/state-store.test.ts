import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { StateStore, parseEventLog } from "./state-store";

const input = (from: null | "PREPARED", to: "PREPARED" | "PLAN_APPROVED") => ({
  schemaVersion: 1 as const,
  runId: "run-1",
  planHash: "a".repeat(64),
  actor: "runner",
  occurredAt: "2026-09-14T00:00:00.000Z",
  targetSha: "b".repeat(40),
  from,
  to,
  phaseId: null,
  retryCount: 0,
});

describe("StateStore", () => {
  it("appends JSONL and derives state by replay", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agent-state-"));
    const store = new StateStore(join(directory, "events.jsonl"));
    await store.append(input(null, "PREPARED"));
    await store.append(input("PREPARED", "PLAN_APPROVED"));
    expect((await store.snapshot()).state).toBe("PLAN_APPROVED");
    expect(
      parseEventLog(await readFile(join(directory, "events.jsonl"), "utf8")),
    ).toHaveLength(2);
  });
  it("fails closed on a malformed or invalid log", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agent-state-"));
    const store = new StateStore(join(directory, "events.jsonl"));
    await store.append(input(null, "PREPARED"));
    await expect(store.append(input(null, "PREPARED"))).rejects.toThrow();
  });
});
