import { execFile } from "node:child_process";
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
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import {
  canonicalPolicyHash,
  checkTrustedRunner,
  parseRunnerPolicy,
  type CheckerIO,
  type RunnerPolicy,
} from "./check-trusted-runner";

const execFileAsync = promisify(execFile);
const hasHostGit = await execFileAsync("git", ["--version"], {
  encoding: "utf8",
  env: { PATH: process.env.PATH ?? "" },
})
  .then(() => true)
  .catch(() => false);
const terminalIntegration =
  hasHostGit && process.getuid?.() !== 0 && process.getgid?.() !== 0
    ? it
    : it.skip;

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
  publication: {
    remote: "origin",
    repository: "github.com/o289/new_schedule_app",
    remoteUrl: "https://github.com/o289/new_schedule_app.git",
    branch: "feature/v3.2.3",
    fastForwardOnly: true,
  },
  capabilities: {
    prepare_run: true,
    verify_phase: true,
    apply_migration_local: true,
    run_e2e: true,
    checkpoint: true,
    quarantine_run: true,
    promote_ff_only: true,
    publish_approved_sha: true,
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
    git: async (_repositoryRoot, args) => {
      if (args[0] === "branch") return "feature/v3.2.3\n";
      return "https://github.com/o289/new_schedule_app.git\n";
    },
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
  it("rejects disabled promotion", async () =>
    expect(
      (
        await run({
          capabilities: { ...policy().capabilities, promote_ff_only: false },
        })
      ).trustedMode,
    ).toBe(false));
  it("rejects disabled publish", async () =>
    expect(
      (
        await run({
          capabilities: {
            ...policy().capabilities,
            publish_approved_sha: false,
          },
        })
      ).trustedMode,
    ).toBe(false));
  it("rejects an unresolved identity placeholder", async () =>
    expect((await run({ uid: "REPLACE_WITH_RUNNER_UID" })).trustedMode).toBe(
      false,
    ));
  it("rejects a non-fast-forward publication policy", async () =>
    expect(
      (
        await run(
          {},
          {
            read: async () =>
              JSON.stringify({
                ...policy(),
                publication: {
                  ...policy().publication,
                  fastForwardOnly: false,
                },
              }),
          },
        )
      ).trustedMode,
    ).toBe(false));
  it("rejects a publication remote outside the fixed repository", async () =>
    expect(
      (
        await run(
          {},
          { git: async () => "https://example.invalid/other.git\n" },
        )
      ).trustedMode,
    ).toBe(false));
  it("rejects a publication branch other than the policy branch", async () =>
    expect(
      (
        await run({
          publication: { ...policy().publication, branch: "feature/v3.2.4" },
        })
      ).trustedMode,
    ).toBe(false));
  it("rejects an unavailable publication repository", async () =>
    expect(
      (await run({}, { git: async () => Promise.reject(new Error("missing")) }))
        .trustedMode,
    ).toBe(false));
  it("keeps the repository policy fixed to the trusted publication target", async () => {
    const raw: unknown = JSON.parse(
      await readFile("codx/trusted-runner/runner-policy.json", "utf8"),
    );
    const stored = parseRunnerPolicy(raw);
    expect(stored.protocolVersion).toBe("1");
    expect(stored.publication).toEqual({
      remote: "origin",
      repository: "github.com/o289/new_schedule_app",
      remoteUrl: "https://github.com/o289/new_schedule_app.git",
      branch: "feature/v3.2.3",
      fastForwardOnly: true,
    });
    expect(stored.capabilities.promote_ff_only).toBe(true);
    expect(stored.capabilities.publish_approved_sha).toBe(true);
    expect(stored.policyHash).toBe(canonicalPolicyHash(stored));
  });
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
      git: async (_repository, args) =>
        args[0] === "branch"
          ? "feature/v3.2.3\n"
          : "https://github.com/o289/new_schedule_app.git\n",
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

  terminalIntegration(
    "checks a host Git repository and a temporary unix socket",
    async (context) => {
      const root = await mkdtemp(join(tmpdir(), "trusted-runner-terminal-"));
      const socketPath = join(root, "runner.sock");
      const repositoryRoot = join(root, "repository");
      const runRoot = join(root, "runs");
      const policyPath = join(root, "runner-policy.json");
      const uid = String(process.getuid?.());
      const gid = String(process.getgid?.());
      const user = userInfo().username;
      const server = createServer();
      let socketIsListening = false;
      let repositoryMode: number | undefined;
      const runGit = async (args: readonly string[]): Promise<string> => {
        const { stdout } = await execFileAsync(
          "git",
          ["-C", repositoryRoot, ...args],
          {
            encoding: "utf8",
            env: { PATH: process.env.PATH ?? "" },
          },
        );
        return stdout;
      };
      try {
        await mkdir(repositoryRoot);
        await mkdir(runRoot);
        await runGit(["init", "--initial-branch", "feature/v3.2.3"]);
        await runGit([
          "remote",
          "add",
          "origin",
          "https://github.com/o289/new_schedule_app.git",
        ]);
        try {
          await new Promise<void>((resolve, reject) => {
            server.once("error", reject);
            server.listen(socketPath, resolve);
          });
          socketIsListening = true;
        } catch (error: unknown) {
          if (
            error instanceof Error &&
            "code" in error &&
            error.code === "EPERM"
          ) {
            context.skip();
            return;
          }
          throw error;
        }
        repositoryMode = (await fsStat(repositoryRoot)).mode & 0o777;
        await Promise.all([
          chmod(repositoryRoot, 0o555),
          chmod(socketPath, 0o660),
        ]);
        const value = policy(repositoryRoot, runRoot);
        value.uid = uid;
        value.gid = gid;
        value.user = user;
        value.socket.path = socketPath;
        value.socket.uid = uid;
        value.socket.gid = gid;
        value.socket.owner = user;
        await writeFile(
          policyPath,
          JSON.stringify({ ...value, policyHash: canonicalPolicyHash(value) }),
          "utf8",
        );
        const io: CheckerIO = {
          read: (path) => readFile(path, "utf8"),
          lstat: async (path) => fsLstat(path),
          stat: async (path) => {
            const info = await fsStat(path);
            return {
              mode: info.mode,
              ownerId: String(info.uid),
              groupId: String(info.gid),
              isSocket: info.isSocket(),
            };
          },
          realpath: async (path) => path,
          identity: async () => ({ uid, gid, user }),
          env: () => ({}),
          git: async (repository, args) => {
            const { stdout } = await execFileAsync(
              "git",
              ["-C", repository, ...args],
              {
                encoding: "utf8",
                env: { PATH: process.env.PATH ?? "" },
              },
            );
            return stdout;
          },
        };
        const result = await checkTrustedRunner(
          { policyPath, socketPath, repositoryRoot, runRoot },
          io,
        );
        expect(result).toMatchObject({ trustedMode: true, failures: [] });
      } finally {
        try {
          if (socketIsListening)
            await new Promise<void>((resolve) => server.close(() => resolve()));
        } finally {
          try {
            if (repositoryMode !== undefined)
              await chmod(repositoryRoot, repositoryMode);
          } finally {
            await rm(root, { recursive: true, force: true });
          }
        }
      }
    },
  );
});
