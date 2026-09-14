import { appendFile, readFile } from "node:fs/promises";
import {
  createEvent,
  eventSchema,
  replayEvents,
  type RunEvent,
  type RunSnapshot,
} from "./state-schema";

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
