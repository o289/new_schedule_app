import { appendFile, readFile } from "node:fs/promises";
import {
  createEvent,
  eventSchema,
  replayEvents,
  type RunEvent,
  type RunSnapshot,
} from "./state-schema";
import {
  canonicalEventSchema,
  type CanonicalEvent,
  hashCanonicalEvent,
  isCanonicalTransition,
  publicationStateSchema,
  type PublicationState,
  projectLegacyEvents,
} from "./canonical-state";
import { open, unlink } from "node:fs/promises";

export function parseEventLog(content: string): RunEvent[] {
  if (content.trim() === "") return [];
  return content
    .trimEnd()
    .split("\n")
    .map((line) => eventSchema.parse(JSON.parse(line) as unknown));
}

export class StateStore {
  constructor(private readonly path: string) {}

  async readEvents(): Promise<RunEvent[]> {
    try {
      return parseEventLog(await readFile(this.path, "utf8"));
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT")
        return [];
      throw error;
    }
  }

  async snapshot(): Promise<RunSnapshot> {
    return replayEvents(await this.readEvents());
  }

  async append(
    input: Omit<RunEvent, "eventHash" | "sequence" | "previousEventHash">,
  ): Promise<RunEvent> {
    const events = await this.readEvents();
    const current = events.length === 0 ? null : replayEvents(events);
    if (input.from !== (current?.state ?? null))
      throw new Error("現在stateから遷移できません");
    const event = createEvent({
      ...input,
      sequence: events.length + 1,
      previousEventHash: current?.eventHash ?? null,
    });
    replayEvents([...events, event]);
    await appendFile(this.path, `${JSON.stringify(event)}\n`, {
      encoding: "utf8",
      flag: "a",
    });
    return event;
  }
}

export class CanonicalStateStore {
  constructor(private readonly path: string) {}

  async load(): Promise<CanonicalEvent[]> {
    const events = await this.readEvents();
    let previous: CanonicalEvent | undefined;
    let publicationState: PublicationState = "NOT_STARTED";
    const publicationTransitions: Record<string, readonly string[]> = {
      NOT_STARTED: ["PENDING"],
      PENDING: ["BRANCH_PUSHED", "BLOCKED"],
      BRANCH_PUSHED: ["CI_PASSED", "BLOCKED"],
      CI_PASSED: ["PR_CREATED", "BLOCKED"],
      PR_CREATED: [],
      BLOCKED: [],
    };
    const passedPhaseIds = new Set<string>();
    for (const [index, event] of events.entries()) {
      if (event.sequence !== index + 1)
        throw new Error("canonical event sequenceが不正です");
      if (event.previousEventHash !== (previous?.eventHash ?? null))
        throw new Error("canonical event hash chainが不一致です");
      if (
        previous &&
        (event.runId !== previous.runId ||
          event.planHash !== previous.planHash ||
          event.from !== previous.to)
      )
        throw new Error("canonical event contextが不一致です");
      if (event.from && !isCanonicalTransition(event.from, event.to))
        if (!(event.action === "publication_status" && event.from === event.to))
          throw new Error("不正なcanonical state transitionです");
      const nextPublication: PublicationState =
        event.publicationState ?? publicationState;
      if (
        nextPublication !== "NOT_STARTED" &&
        nextPublication !== "PENDING" &&
        !event.publicationEvidence
      )
        throw new Error("公開状態には対応する証跡が必要です");
      if (event.publicationEvidence) {
        const kind = event.publicationEvidence.kind;
        if (
          event.publicationState !== kind ||
          (kind === "CI_PASSED" && event.to !== "COMPLETED")
        )
          throw new Error("公開証跡と状態が不一致です");
      }
      publicationStateSchema.parse(nextPublication);
      if (nextPublication !== publicationState) {
        if (
          !publicationTransitions[publicationState]?.includes(nextPublication)
        )
          throw new Error("不正なpublication state transitionです");
        if (
          event.action !== "publication_status" &&
          !(
            event.action === "verify_pass" &&
            nextPublication === "PENDING" &&
            event.to === "COMPLETED"
          )
        )
          throw new Error("publication stateは専用eventでのみ変更できます");
        if (nextPublication === "PENDING" && event.to !== "COMPLETED")
          throw new Error("PENDINGは実装完了後のみ許可されます");
        publicationState = nextPublication;
      }
      if (event.evidence) {
        if (
          event.action !== "verify_pass" ||
          (event.to !== "RUNNING" && event.to !== "COMPLETED")
        )
          throw new Error("品質証跡のeventが不正です");
        const completedPhaseId =
          event.from === "VERIFYING" && event.to === "RUNNING"
            ? previous?.phaseId
            : event.phaseId;
        if (
          event.evidence.phaseId !== completedPhaseId ||
          passedPhaseIds.has(event.evidence.phaseId)
        )
          throw new Error("Phase品質証跡が重複または不一致です");
        passedPhaseIds.add(event.evidence.phaseId);
      }
      previous = event;
    }
    return events;
  }

  async snapshot() {
    const events = await this.load();
    const last = events.at(-1);
    const evidenceByPhase = Object.fromEntries(
      events
        .filter((event) => event.evidence)
        .map((event) => [event.evidence!.phaseId, event.evidence!]),
    );
    const publicationEvidenceByState = Object.fromEntries(
      events
        .filter((event) => event.publicationEvidence)
        .map((event) => [
          event.publicationEvidence!.kind,
          event.publicationEvidence!,
        ]),
    );
    return {
      runId: last?.runId ?? null,
      planHash: last?.planHash ?? null,
      state: last?.to ?? null,
      phaseId: last?.phaseId ?? null,
      retryCount: last?.retryCount ?? 0,
      publicationState: last?.publicationState ?? "NOT_STARTED",
      publicationEvidence: last?.publicationEvidence,
      publicationEvidenceByState,
      revision: last?.sequence ?? 0,
      eventHash: last?.eventHash ?? null,
      passedPhaseIds: Object.keys(evidenceByPhase),
      evidenceByPhase,
    };
  }

  async readEvents(): Promise<CanonicalEvent[]> {
    try {
      const text = await readFile(this.path, "utf8");
      if (text.trim() === "") return [];
      return text
        .trimEnd()
        .split("\n")
        .map((line) => {
          const raw = JSON.parse(line) as { schemaVersion?: unknown };
          if (raw.schemaVersion !== 2)
            throw new Error("legacy logへのcanonical読込を拒否しました");
          const event = canonicalEventSchema.parse(raw);
          if (
            hashCanonicalEvent({ ...event, eventHash: undefined } as never) !==
            event.eventHash
          )
            throw new Error("canonical event hashが不一致です");
          return event;
        });
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT")
        return [];
      throw error;
    }
  }

  async append(
    input: Omit<CanonicalEvent, "eventHash" | "sequence" | "previousEventHash">,
  ): Promise<CanonicalEvent> {
    const lockPath = `${this.path}.lock`;
    const lock = await open(lockPath, "wx");
    try {
      const existing = await readFile(this.path, "utf8").catch(() => "");
      if (existing.trim()) {
        const first = JSON.parse(existing.split("\n")[0]!) as {
          schemaVersion?: unknown;
        };
        if (first.schemaVersion !== 2)
          throw new Error("legacy logへcanonical eventをappendできません");
      }
      const events = await this.load();
      const current = events.at(-1);
      if (input.from !== (current?.to ?? null))
        throw new Error("canonical state transitionが不一致です");
      if (input.from && !isCanonicalTransition(input.from, input.to))
        if (!(input.action === "publication_status" && input.from === input.to))
          throw new Error("不正なcanonical state transitionです");
      const currentPublication = current?.publicationState ?? "NOT_STARTED";
      const nextPublication = input.publicationState ?? currentPublication;
      if (
        nextPublication !== "NOT_STARTED" &&
        nextPublication !== "PENDING" &&
        !input.publicationEvidence
      )
        throw new Error("公開状態には対応する証跡が必要です");
      if (nextPublication !== currentPublication) {
        const allowed: Record<string, readonly string[]> = {
          NOT_STARTED: ["PENDING"],
          PENDING: ["BRANCH_PUSHED", "BLOCKED"],
          BRANCH_PUSHED: ["CI_PASSED", "BLOCKED"],
          CI_PASSED: ["PR_CREATED", "BLOCKED"],
          PR_CREATED: [],
          BLOCKED: [],
        };
        if (
          !allowed[currentPublication]?.includes(nextPublication) ||
          (input.action !== "publication_status" &&
            !(
              input.action === "verify_pass" &&
              nextPublication === "PENDING" &&
              input.to === "COMPLETED"
            ))
        )
          throw new Error("不正なpublication state transitionです");
        if (nextPublication === "PENDING" && input.to !== "COMPLETED")
          throw new Error("PENDINGは実装完了後のみ許可されます");
      }
      const event = canonicalEventSchema.parse({
        ...input,
        schemaVersion: 2,
        sequence: events.length + 1,
        previousEventHash: current?.eventHash ?? null,
        eventHash: hashCanonicalEvent({
          ...input,
          schemaVersion: 2,
          sequence: events.length + 1,
          previousEventHash: current?.eventHash ?? null,
        } as never),
      });
      await import("node:fs/promises").then(({ appendFile }) =>
        appendFile(this.path, `${JSON.stringify(event)}\n`, {
          encoding: "utf8",
          flag: "a",
        }),
      );
      return event;
    } finally {
      await lock.close();
      await unlink(lockPath).catch(() => undefined);
    }
  }
}

export function projectLegacySnapshot(events: readonly RunEvent[]) {
  return projectLegacyEvents(events);
}
