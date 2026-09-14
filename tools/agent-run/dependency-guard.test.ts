import { describe, expect, it } from "vitest";
import { inspectDependencies } from "./dependency-guard";
const sha = "a".repeat(40),
  old = { name: "app", dependencies: {} },
  lock = "lock";
const approval = (x: Record<string, unknown> = {}) => ({
  status: "APPROVED" as const,
  description: "approved",
  name: "pkg",
  version: "2.0.0",
  reason: "needed",
  license: "MIT",
  ...x,
});
const fact = (x: Record<string, unknown> = {}) => ({
  name: "pkg",
  version: "2.0.0",
  reason: "needed",
  license: "MIT",
  ...x,
});
const fx = (
  after: unknown = { ...old, dependencies: { pkg: "2.0.0" } },
  before = JSON.stringify(old),
  afterLock = lock,
) => ({
  run: async () => before,
  read: async (p: string) =>
    p.endsWith("package.json") ? JSON.stringify(after) : afterLock,
});
const base = {
  root: "/repo",
  startSha: sha,
  dependencyChanges: [approval()],
  facts: [fact()],
};
describe("dependency guard", () => {
  it("unchanged CLEAN", async () => {
    const r = await inspectDependencies(
      {
        ...base,
        dependencyChanges: [{ ...approval(), status: "NOT_APPLICABLE" }],
        facts: [],
      },
      {
        run: async () => JSON.stringify(old),
        read: async () => JSON.stringify(old),
      },
    );
    expect(r.classification).toBe("CLEAN");
    expect(r.reason).toContain("unchanged");
  });
  it("N/A pair REPLAN", async () => {
    const r = await inspectDependencies(
      {
        ...base,
        dependencyChanges: [{ ...approval(), status: "NOT_APPLICABLE" }],
        facts: [],
      },
      fx(),
    );
    expect(r.classification).toBe("REPLAN_REQUIRED");
    expect(r.reason).toContain("approved");
  });
  it("approved add CLEAN", async () => {
    const r = await inspectDependencies(base, fx());
    expect(r.classification).toBe("CLEAN");
  });
  it("approved update CLEAN", async () => {
    const r = await inspectDependencies(
      {
        ...base,
        dependencyChanges: [approval({ version: "3" })],
        facts: [fact({ version: "3" })],
      },
      fx({ ...old, dependencies: { pkg: "3" } }),
    );
    expect(r.classification).toBe("CLEAN");
  });
  it("approved remove CLEAN", async () => {
    const r = await inspectDependencies(
      {
        ...base,
        dependencyChanges: [approval({ version: "<removed>" })],
        facts: [fact({ version: "<removed>" })],
      },
      {
        run: async (a) =>
          a[1]!.endsWith("pnpm-lock.yaml") ? lock : JSON.stringify(old),
        read: async (p) =>
          p.endsWith("package.json") ? JSON.stringify(old) : lock,
      },
    );
    expect(r.classification).toBe("CLEAN");
  });
  for (const [n, x] of [
    ["unknown name", { name: "x" }],
    ["version mismatch", { version: "9" }],
    ["reason mismatch", { reason: "x" }],
    ["license mismatch", { license: "GPL" }],
  ] as const)
    it(n, async () => {
      const r = await inspectDependencies({ ...base, facts: [fact(x)] }, fx());
      expect(r.classification).toBe("REPLAN_REQUIRED");
      expect(r.reason).toContain("mismatch");
    });
  it("missing fact REPLAN", async () => {
    const r = await inspectDependencies({ ...base, facts: [] }, fx());
    expect(r.classification).toBe("REPLAN_REQUIRED");
  });
  it("extra fact REPLAN", async () => {
    const r = await inspectDependencies(
      { ...base, facts: [fact(), fact({ name: "x" })] },
      fx(),
    );
    expect(r.classification).toBe("REPLAN_REQUIRED");
  });
  it("extra approval REPLAN", async () => {
    const r = await inspectDependencies(
      { ...base, dependencyChanges: [approval(), approval({ name: "x" })] },
      fx(),
    );
    expect(r.classification).toBe("REPLAN_REQUIRED");
  });
  it("duplicate approval SAFETY", async () => {
    const r = await inspectDependencies(
      { ...base, dependencyChanges: [approval(), approval()] },
      fx(),
    );
    expect(r.classification).toBe("SAFETY_VIOLATION");
  });
  it("duplicate fact SAFETY", async () => {
    const r = await inspectDependencies(
      { ...base, facts: [fact(), fact()] },
      fx(),
    );
    expect(r.classification).toBe("SAFETY_VIOLATION");
  });
  it("manifest-only SAFETY", async () => {
    const r = await inspectDependencies(base, {
      run: async (a) =>
        a[1]!.endsWith("pnpm-lock.yaml") ? lock : JSON.stringify(old),
      read: async (p) =>
        p.endsWith("package.json")
          ? JSON.stringify({ ...old, dependencies: { pkg: "2.0.0" } })
          : lock,
    });
    expect(r.classification).toBe("SAFETY_VIOLATION");
  });
  it("lock-only SAFETY", async () => {
    const r = await inspectDependencies(
      base,
      fx(old, JSON.stringify(old), "changed"),
    );
    expect(r.classification).toBe("SAFETY_VIOLATION");
  });
  it("scripts SAFETY", async () => {
    const r = await inspectDependencies(
      base,
      fx({ ...old, dependencies: { pkg: "2.0.0" }, scripts: { x: "y" } }),
    );
    expect(r.classification).toBe("SAFETY_VIOLATION");
  });
  it("invalid before SAFETY", async () => {
    const r = await inspectDependencies(base, fx(undefined, "{"));
    expect(r.classification).toBe("SAFETY_VIOLATION");
  });
  it("invalid after SAFETY", async () => {
    const r = await inspectDependencies(base, {
      run: async () => JSON.stringify(old),
      read: async () => "{",
    });
    expect(r.classification).toBe("SAFETY_VIOLATION");
  });
  it("invalid dependency value SAFETY", async () => {
    const r = await inspectDependencies(base, fx({ ...old, dependencies: [] }));
    expect(r.classification).toBe("SAFETY_VIOLATION");
  });
  it("read failure SAFETY", async () => {
    const r = await inspectDependencies(base, {
      run: async () => JSON.stringify(old),
      read: async () => {
        throw new Error("read failure");
      },
    });
    expect(r.classification).toBe("SAFETY_VIOLATION");
  });
  it("show failure SAFETY", async () => {
    const r = await inspectDependencies(base, {
      run: async () => {
        throw new Error("show failure");
      },
      read: async () => "",
    });
    expect(r.classification).toBe("SAFETY_VIOLATION");
  });
  it("ambiguous scope SAFETY", async () => {
    const r = await inspectDependencies(
      base,
      fx({
        ...old,
        dependencies: { pkg: "2.0.0" },
        devDependencies: { pkg: "1" },
      }),
    );
    expect(r.classification).toBe("SAFETY_VIOLATION");
  });
  it("canonical exact CLEAN", async () => {
    const r = await inspectDependencies(base, fx());
    expect(r.classification).toBe("CLEAN");
  });
});
