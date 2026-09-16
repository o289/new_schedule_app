import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { createEvent } from "./state-schema";
import {
  CanonicalStateStore,
  parseEventLog,
  projectLegacySnapshot,
} from "./state-store";
import { canonicalEventSchema, hashCanonicalEvent } from "./canonical-state";

const sha = "a".repeat(40),
  digest = "b".repeat(64);
function legacy(
  to: Parameters<typeof createEvent>[0]["to"],
  from: Parameters<typeof createEvent>[0]["from"],
  sequence: number,
) {
  return createEvent({
    schemaVersion: 1,
    sequence,
    previousEventHash: null,
    runId: "run-a",
    planHash: digest,
    actor: "test",
    occurredAt: "2026-01-01T00:00:00Z",
    targetSha: sha,
    from,
    to,
    phaseId: null,
    retryCount: 0,
  });
}

describe("canonical state store", () => {
  it("folds three canonical events and preserves chain metadata", async () => {
    const dir = await mkdtemp(join(tmpdir(), "canonical-fold-"));
    const store = new CanonicalStateStore(join(dir, "events.jsonl"));
    await store.append({
      schemaVersion: 2,
      runId: "run-a",
      planHash: digest,
      from: null,
      to: "DRAFT",
      phaseId: null,
      retryCount: 0,
    });
    await store.append({
      schemaVersion: 2,
      runId: "run-a",
      planHash: digest,
      from: "DRAFT",
      to: "APPROVED",
      phaseId: null,
      retryCount: 0,
    });
    await store.append({
      schemaVersion: 2,
      runId: "run-a",
      planHash: digest,
      from: "APPROVED",
      to: "READY",
      phaseId: null,
      retryCount: 0,
    });
    const events = await store.load();
    expect(events).toHaveLength(3);
    expect(events.at(-1)).toMatchObject({
      sequence: 3,
      from: "APPROVED",
      to: "READY",
      runId: "run-a",
      planHash: digest,
    });
    expect(events[1]!.previousEventHash).toBe(events[0]!.eventHash);
  });

  it.each([
    [
      "sequence",
      (event: Record<string, unknown>) => ({ ...event, sequence: 9 }),
    ],
    [
      "previous hash",
      (event: Record<string, unknown>) => ({
        ...event,
        previousEventHash: "0".repeat(64),
      }),
    ],
    [
      "event hash",
      (event: Record<string, unknown>) => ({
        ...event,
        eventHash: "0".repeat(64),
      }),
    ],
    [
      "runId",
      (event: Record<string, unknown>) => ({ ...event, runId: "run-b" }),
    ],
    [
      "planHash",
      (event: Record<string, unknown>) => ({
        ...event,
        planHash: "c".repeat(64),
      }),
    ],
    ["from", (event: Record<string, unknown>) => ({ ...event, from: "READY" })],
  ])("rejects tampered canonical %s", async (_name, mutate) => {
    const dir = await mkdtemp(join(tmpdir(), "canonical-tamper-"));
    const path = join(dir, "events.jsonl");
    const store = new CanonicalStateStore(path);
    await store.append({
      schemaVersion: 2,
      runId: "run-a",
      planHash: digest,
      from: null,
      to: "DRAFT",
      phaseId: null,
      retryCount: 0,
    });
    const event = JSON.parse((await readFile(path, "utf8")).trim()) as Record<
      string,
      unknown
    >;
    await writeFile(path, JSON.stringify(mutate(event)) + "\n");
    await expect(store.load()).rejects.toThrow();
  });

  it("rejects an illegal canonical transition and an existing lock", async () => {
    const dir = await mkdtemp(join(tmpdir(), "canonical-lock-"));
    const path = join(dir, "events.jsonl");
    const store = new CanonicalStateStore(path);
    await store.append({
      schemaVersion: 2,
      runId: "run-a",
      planHash: digest,
      from: null,
      to: "DRAFT",
      phaseId: null,
      retryCount: 0,
    });
    await expect(
      store.append({
        schemaVersion: 2,
        runId: "run-a",
        planHash: digest,
        from: "DRAFT",
        to: "COMPLETED",
        phaseId: null,
        retryCount: 0,
      }),
    ).rejects.toThrow();
    await writeFile(`${path}.lock`, "stale");
    await expect(
      store.append({
        schemaVersion: 2,
        runId: "run-a",
        planHash: digest,
        from: "DRAFT",
        to: "APPROVED",
        phaseId: null,
        retryCount: 0,
      }),
    ).rejects.toThrow();
  });
  it("projects a verified legacy event without changing its content", async () => {
    const first = legacy("PREPARED", null, 1);
    const content = JSON.stringify(first) + "\n";
    expect(projectLegacySnapshot(parseEventLog(content)).state).toBe("DRAFT");
    expect(content).toBe(JSON.stringify(first) + "\n");
  });
  it("rejects a legacy event in the canonical log and appends strict canonical events", async () => {
    const dir = await mkdtemp(join(tmpdir(), "canonical-state-"));
    const path = join(dir, "events.jsonl");
    const store = new CanonicalStateStore(path);
    const input = {
      schemaVersion: 2 as const,
      runId: "run-a",
      planHash: digest,
      from: null,
      to: "DRAFT" as const,
      phaseId: null,
      retryCount: 0,
    };
    const event = await store.append(input);
    expect(canonicalEventSchema.parse(event).to).toBe("DRAFT");
    expect(
      hashCanonicalEvent({ ...event, eventHash: undefined } as never),
    ).toBe(event.eventHash);
    await expect(
      store.append({ ...input, from: "DRAFT", to: "APPROVED" }),
    ).resolves.toBeTruthy();
    await writeFile(
      path,
      JSON.stringify({ ...event, schemaVersion: 1 }) + "\n",
    );
    await expect(store.append(input)).rejects.toThrow("legacy log");
    expect(await readFile(path, "utf8")).toContain('"schemaVersion":1');
  });
});
