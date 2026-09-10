import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { classifyWork, startTask, startInputSchema } from "./pr-agent-start.js";
import type { StartInput, StartIO } from "./pr-agent-start.js";
const sha = "a".repeat(40);
const files = (count: number) =>
  Array.from({ length: count }, (_, i) => `file-${i}.ts`);
const assessment = {
  phaseCount: 3,
  plannedFiles: files(13),
  authenticationChanged: false,
  dbModels: [],
  dependentDbModels: false,
  directImplementation: false,
};
function fixture(large = false) {
  const plan = "承認済み計画";
  const input: StartInput = {
    schemaVersion: 1,
    approved: true,
    assessment: { ...assessment, phaseCount: large ? 5 : 3 },
    size: large ? "large" : "medium",
    mode: large ? "pull_request" : "push_only",
    sourceBranch: "feature/v3.2.3",
    head: large ? "feature/task-v3.2.3" : "feature/v3.2.3",
    ...(large ? { slug: "task" } : {}),
    reviewBaseSha: sha,
    plan: {
      path: "docs/plan.md",
      sha256: createHash("sha256").update(plan).digest("hex"),
    },
  };
  const state = {
    dirty: false,
    branch: input.sourceBranch,
    sha,
    local: "",
    remote: "",
    failRemote: false,
    url: "https://github.com/o289/new_schedule_app.git",
  };
  const calls: string[][] = [];
  const io: StartIO = {
    read: async () => plan,
    run: async (args) => {
      calls.push(args);
      switch (args[0]) {
        case "rev-parse":
          return args[1] === "--show-toplevel" ? process.cwd() : state.sha;
        case "remote":
          return state.url;
        case "status":
          return state.dirty ? " M x" : "";
        case "symbolic-ref":
          return state.branch;
        case "check-ref-format":
          return "";
        case "for-each-ref":
          return state.local;
        case "ls-remote":
          if (state.failRemote) throw new Error("network");
          return state.remote;
        case "switch":
          state.branch = input.head;
          return "";
        default:
          throw new Error(`unexpected ${args.join(" ")}`);
      }
    },
  };
  return { input, state, calls, io };
}
describe("work size", () => {
  it.each([
    [4, 99, false, [], false, "medium"],
    [5, 1, false, [], false, "large"],
    [1, 100, false, [], false, "large"],
    [2, 99, true, ["A", "B"], true, "medium"],
    [3, 1, true, [], false, "large"],
    [3, 1, false, ["A", "B"], true, "large"],
    [3, 1, false, ["A", "B"], false, "medium"],
    [3, 1, false, ["A"], false, "medium"],
  ] as const)(
    "classifies phases=%s files=%s auth=%s models=%s dependency=%s",
    (
      phaseCount,
      count,
      authenticationChanged,
      dbModels,
      dependentDbModels,
      expected,
    ) => {
      expect(
        classifyWork({
          ...assessment,
          phaseCount,
          plannedFiles: files(count),
          authenticationChanged,
          dbModels: [...dbModels],
          dependentDbModels,
        }),
      ).toBe(expected);
    },
  );
  it("keeps direct small work without a phase plan", () => {
    expect(
      classifyWork({
        ...assessment,
        phaseCount: 0,
        directImplementation: true,
      }),
    ).toBe("small");
  });
  it("rejects duplicate files, duplicate models and impossible dependencies", () => {
    expect(() =>
      classifyWork({ ...assessment, plannedFiles: ["a", "a"] }),
    ).toThrow();
    expect(() =>
      classifyWork({ ...assessment, dbModels: ["A", "A"] }),
    ).toThrow();
    expect(() =>
      classifyWork({ ...assessment, dependentDbModels: true }),
    ).toThrow();
  });
});
describe("task start", () => {
  it("records medium work without switching branches", async () => {
    const f = fixture();
    expect(await startTask(f.input, f.io)).toEqual({
      ...f.input,
      completed: true,
    });
    expect(f.calls.some((args) => args[0] === "switch")).toBe(false);
  });
  it("creates only the planned feature branch from the recorded SHA", async () => {
    const f = fixture(true);
    const result = await startTask(f.input, f.io);
    expect(result.head).toBe("feature/task-v3.2.3");
    expect(f.calls.filter((args) => args[0] === "switch")).toEqual([
      ["switch", "--no-track", "-c", f.input.head, sha],
    ]);
  });
  it.each([
    "dirty",
    "source",
    "sha",
    "local",
    "remote",
    "network",
    "url",
    "version",
    "size",
    "mode",
    "args",
    "plan",
  ])("rejects %s before branch creation", async (problem) => {
    const f = fixture(true);
    switch (problem) {
      case "dirty":
        f.state.dirty = true;
        break;
      case "source":
        f.state.branch = "main";
        break;
      case "sha":
        f.state.sha = "b".repeat(40);
        break;
      case "local":
        f.state.local = `refs/heads/${f.input.head}`;
        break;
      case "remote":
        f.state.remote = `${sha}\trefs/heads/${f.input.head}`;
        break;
      case "network":
        f.state.failRemote = true;
        break;
      case "url":
        f.state.url = "https://github.com/other/repo.git";
        break;
      case "version":
        f.input.head = "feature/task-v3.2.2";
        break;
      case "size":
        f.input.size = "small";
        break;
      case "mode":
        f.input.mode = "push_only";
        break;
      case "plan":
        f.input.plan.sha256 = "0".repeat(64);
        break;
    }
    await expect(
      startTask(f.input, f.io, problem === "args" ? ["extra"] : []),
    ).rejects.toThrow();
    expect(f.calls.some((args) => args[0] === "switch")).toBe(false);
  });
  it.each(["main", "release", "feature/task-v3.2.3", "HEAD"])(
    "rejects start source %s",
    (sourceBranch) => {
      expect(
        startInputSchema.safeParse({ ...fixture().input, sourceBranch })
          .success,
      ).toBe(false);
    },
  );
});
