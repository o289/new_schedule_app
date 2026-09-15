import {
  chmod,
  lstat as fsLstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat as fsStat,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  canonicalPolicyHash,
  checkTrustedRunner,
  type CheckerIO,
  type RunnerPolicy,
} from "./check-trusted-runner";

const policy = (root = "/repo", run = "/run"): RunnerPolicy => ({
  protocolVersion: "1",
  uid: "501",
  user: "runner",
  group: "runner",
  gid: "501",
  socket: {
    path: "/socket",
    owner: "runner",
    group: "runner",
    uid: "501",
    gid: "501",
    mode: "0660",
  },
  repositoryRoot: root,
  runRoot: run,
  repositoryAccess: "read-only",
  runRootAccess: "write",
  forbiddenEnv: ["SSH_AUTH_SOCK", "HTTP_PROXY", "HTTPS_PROXY"],
  capabilities: {
    prepare_run: true,
    verify_phase: true,
    apply_migration_local: true,
    run_e2e: true,
    checkpoint: true,
    quarantine_run: true,
    promote_ff_only: false,
    publish_approved_sha: false,
  },
});
const fixture = (
  input: Partial<RunnerPolicy> = {},
  overrides: Partial<CheckerIO> = {},
): {
  input: {
    policyPath: string;
    socketPath: string;
    repositoryRoot: string;
    runRoot: string;
  };
  io: CheckerIO;
  value: RunnerPolicy;
} => {
  const value = {
    ...policy(),
    ...input,
    socket: { ...policy().socket, ...(input.socket ?? {}) },
  };
  const io: CheckerIO = {
    read: async () =>
      JSON.stringify({ ...value, policyHash: canonicalPolicyHash(value) }),
    lstat: async () => ({ isSymbolicLink: () => false }),
    stat: async (path) =>
      path === "/socket"
        ? { mode: 0o660, ownerId: "501", groupId: "501", isSocket: true }
        : path === "/repo"
          ? { mode: 0o555, ownerId: "501", groupId: "501" }
          : { mode: 0o755, ownerId: "501", groupId: "501" },
    realpath: async (path) => path,
    identity: async () => ({
      uid: "501",
      gid: "501",
      user: "runner",
      group: "runner",
    }),
    env: () => ({}),
    ...overrides,
  };
  return {
    input: {
      policyPath: "/policy",
      socketPath: "/socket",
      repositoryRoot: "/repo",
      runRoot: "/run",
    },
    io,
    value,
  };
};
const run = async (
  input: Partial<RunnerPolicy> = {},
  overrides: Partial<CheckerIO> = {},
) => {
  const f = fixture(input, overrides);
  return checkTrustedRunner(f.input, f.io);
};

describe("checkTrustedRunner", () => {
  it("accepts a complete trusted fixture", async () =>
    expect((await run()).trustedMode).toBe(true));
  it.each(["protocolVersion", "uid", "user", "group"] as const)(
    "rejects invalid %s",
    async (key) =>
      expect(
        (
          await run({
            [key]: key === "protocolVersion" ? "2" : "",
          } as Partial<RunnerPolicy>)
        ).trustedMode,
      ).toBe(false),
  );
  it("rejects malformed JSON", async () =>
    expect((await run({}, { read: async () => "{" })).trustedMode).toBe(false));
  it("rejects unknown policy fields", async () =>
    expect(
      (
        await run(
          {},
          { read: async () => JSON.stringify({ ...policy(), extra: true }) },
        )
      ).trustedMode,
    ).toBe(false));
  it.each(["socket", "repositoryRoot", "runRoot"] as const)(
    "rejects %s path mismatch",
    async (key) =>
      expect(
        (
          await run(
            key === "socket"
              ? { socket: { ...policy().socket, path: "/other" } }
              : ({ [key]: "/other" } as Partial<RunnerPolicy>),
          )
        ).trustedMode,
      ).toBe(false),
  );
  it("rejects a symlink socket", async () =>
    expect(
      (await run({}, { lstat: async () => ({ isSymbolicLink: () => true }) }))
        .trustedMode,
    ).toBe(false));
  it("rejects a regular socket path", async () =>
    expect(
      (
        await run(
          {},
          {
            stat: async () => ({
              mode: 0o660,
              ownerId: "501",
              groupId: "501",
              isSocket: false,
            }),
          },
        )
      ).trustedMode,
    ).toBe(false));
  it("rejects socket mode", async () =>
    expect(
      (
        await run(
          {},
          {
            stat: async () => ({
              mode: 0o600,
              ownerId: "501",
              groupId: "501",
              isSocket: true,
            }),
          },
        )
      ).trustedMode,
    ).toBe(false));
  it("rejects socket owner", async () =>
    expect(
      (
        await run(
          {},
          {
            stat: async () => ({
              mode: 0o660,
              ownerId: "999",
              groupId: "501",
              isSocket: true,
            }),
          },
        )
      ).trustedMode,
    ).toBe(false));
  it("rejects socket group", async () =>
    expect(
      (
        await run(
          {},
          {
            stat: async () => ({
              mode: 0o660,
              ownerId: "501",
              groupId: "999",
              isSocket: true,
            }),
          },
        )
      ).trustedMode,
    ).toBe(false));
  it("rejects repository write permission", async () =>
    expect(
      (
        await run(
          {},
          {
            stat: async (path) =>
              path === "/socket"
                ? {
                    mode: 0o660,
                    owner: "runner",
                    group: "runner",
                    isSocket: true,
                  }
                : { mode: 0o755, owner: "runner", group: "runner" },
          },
        )
      ).trustedMode,
    ).toBe(false));
  it("rejects non-writable run root", async () =>
    expect(
      (
        await run(
          {},
          {
            stat: async (path) =>
              path === "/run"
                ? { mode: 0o555, owner: "runner", group: "runner" }
                : {
                    mode: 0o660,
                    owner: "runner",
                    group: "runner",
                    isSocket: true,
                  },
          },
        )
      ).trustedMode,
    ).toBe(false));
  it("rejects repository symlink escape", async () =>
    expect(
      (
        await run(
          {},
          { realpath: async (path) => (path === "/repo" ? "/escaped" : path) },
        )
      ).trustedMode,
    ).toBe(false));
  it("rejects run-root symlink escape", async () =>
    expect(
      (
        await run(
          {},
          { realpath: async (path) => (path === "/run" ? "/escaped" : path) },
        )
      ).trustedMode,
    ).toBe(false));
  it.each(["uid", "gid", "user"] as const)(
    "rejects identity %s mismatch",
    async (key) =>
      expect(
        (
          await run(
            {},
            {
              identity: async () => ({
                uid: "501",
                gid: "501",
                user: "runner",
                group: "runner",
                [key]: "other",
              }),
            },
          )
        ).trustedMode,
      ).toBe(false),
  );
  it.each(["SSH_AUTH_SOCK", "HTTP_PROXY", "HTTPS_PROXY"])(
    "rejects forbidden environment %s",
    async (name) =>
      expect(
        (await run({}, { env: () => ({ [name]: "set" }) })).trustedMode,
      ).toBe(false),
  );
  it("rejects enabled promotion", async () =>
    expect(
      (
        await run({
          capabilities: { ...policy().capabilities, promote_ff_only: true },
        })
      ).trustedMode,
    ).toBe(false));
  it("rejects enabled publish", async () =>
    expect(
      (
        await run({
          capabilities: {
            ...policy().capabilities,
            publish_approved_sha: true,
          },
        })
      ).trustedMode,
    ).toBe(false));
  it("rejects a stale policy hash", async () =>
    expect(
      (
        await run(
          {},
          {
            read: async () =>
              JSON.stringify({ ...policy(), policyHash: "0".repeat(64) }),
          },
        )
      ).trustedMode,
    ).toBe(false));
  it("rejects unreadable socket", async () =>
    expect(
      (
        await run(
          {},
          {
            stat: async () => {
              throw new Error("missing");
            },
          },
        )
      ).trustedMode,
    ).toBe(false));
  it("rejects unreadable roots", async () =>
    expect(
      (
        await run(
          {},
          {
            realpath: async () => {
              throw new Error("missing");
            },
          },
        )
      ).trustedMode,
    ).toBe(false));
  it("fails closed when identity lookup throws", async () =>
    expect(
      (
        await run(
          {},
          {
            identity: async () => {
              throw new Error("lookup");
            },
          },
        )
      ).trustedMode,
    ).toBe(false));
  it("checks a nonprivileged temporary socket fixture", async () => {
    const root = await mkdtemp(join(tmpdir(), "trusted-runner-"));
    const socketPath = join(root, "runner.sock");
    const repositoryRoot = join(root, "repository");
    const runRoot = join(root, "runs");
    const policyPath = join(root, "runner-policy.json");
    await mkdir(repositoryRoot);
    await mkdir(runRoot);
    const server = createServer();
    try {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(socketPath, resolve);
      });
    } catch (error: unknown) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      expect(error instanceof Error && "code" in error && error.code).toBe(
        "EPERM",
      );
      return;
    }
    await chmod(socketPath, 0o660);
    const value = policy(repositoryRoot, runRoot);
    value.socket.path = socketPath;
    value.uid = "501";
    value.gid = "20";
    value.socket.uid = "501";
    value.socket.gid = "20";
    await writeFile(
      policyPath,
      JSON.stringify({ ...value, policyHash: canonicalPolicyHash(value) }),
      "utf8",
    );
    const io: CheckerIO = {
      read: (path) => readFile(path, "utf8"),
      lstat: async (path) => fsLstat(path),
      stat: async (path) =>
        path === socketPath
          ? (async () => {
              const info = await fsStat(path);
              return {
                mode: info.mode,
                ownerId: "501",
                groupId: "20",
                isSocket: info.isSocket(),
              };
            })()
          : {
              mode: path === repositoryRoot ? 0o555 : 0o755,
              ownerId: value.uid,
              groupId: value.gid,
            },
      realpath: async (path) => path,
      identity: async () => ({
        uid: value.uid,
        gid: value.gid,
        user: "runner",
        group: "runner",
      }),
      env: () => ({}),
    };
    try {
      const result = await checkTrustedRunner(
        { policyPath, socketPath, repositoryRoot, runRoot },
        io,
      );
      expect(result.trustedMode).toBe(true);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(root, { recursive: true, force: true });
    }
  });
});
