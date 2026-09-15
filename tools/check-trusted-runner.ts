import { createHash } from "node:crypto";
import { lstat, readFile, realpath, stat } from "node:fs/promises";
import { userInfo } from "node:os";
import { z } from "zod";

const capabilityNames = [
  "prepare_run",
  "verify_phase",
  "apply_migration_local",
  "run_e2e",
  "checkpoint",
  "quarantine_run",
  "promote_ff_only",
  "publish_approved_sha",
] as const;
const policySchema = z
  .object({
    protocolVersion: z.literal("1"),
    uid: z.string().regex(/^(\d+|REPLACE_WITH_RUNNER_UID)$/),
    user: z.string().min(1),
    group: z.string().min(1),
    gid: z.string().regex(/^(\d+|REPLACE_WITH_RUNNER_GID)$/),
    socket: z
      .object({
        path: z.string().min(1),
        owner: z.string().min(1),
        group: z.string().min(1),
        uid: z.string().regex(/^(\d+|REPLACE_WITH_RUNNER_UID)$/),
        gid: z.string().regex(/^(\d+|REPLACE_WITH_RUNNER_GID)$/),
        mode: z.literal("0660"),
      })
      .strict(),
    repositoryRoot: z.string().min(1),
    runRoot: z.string().min(1),
    repositoryAccess: z.literal("read-only"),
    runRootAccess: z.literal("write"),
    forbiddenEnv: z.array(z.string()).min(1),
    capabilities: z
      .object(
        Object.fromEntries(
          capabilityNames.map((name) => [name, z.boolean()]),
        ) as Record<(typeof capabilityNames)[number], z.ZodBoolean>,
      )
      .strict(),
    policyHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .strict();
export type RunnerPolicy = z.infer<typeof policySchema>;
export type CheckerInput = {
  policyPath: string;
  socketPath: string;
  repositoryRoot: string;
  runRoot: string;
};
type FileInfo = {
  mode: number;
  ownerId?: string;
  groupId?: string;
  isSocket?: boolean;
};
export type CheckerIO = {
  read: (path: string) => Promise<string>;
  lstat: (path: string) => Promise<{ isSymbolicLink: () => boolean }>;
  stat: (path: string) => Promise<FileInfo>;
  realpath: (path: string) => Promise<string>;
  identity: () => Promise<{
    uid: string;
    gid: string;
    user: string;
    group?: string;
  }>;
  env: () => NodeJS.ProcessEnv;
};
export type CheckerResult = {
  trustedMode: boolean;
  failures: string[];
  policyHash: string;
};
const digest = (value: string): string =>
  createHash("sha256").update(value, "utf8").digest("hex");
const withoutHash = (
  policy: RunnerPolicy,
): Omit<RunnerPolicy, "policyHash"> => {
  const { policyHash: _policyHash, ...canonical } = policy;
  return canonical;
};
export const canonicalPolicyHash = (policy: RunnerPolicy): string =>
  digest(JSON.stringify(withoutHash(policy)));
const defaults: CheckerIO = {
  read: (path) => readFile(path, "utf8"),
  lstat: async (path) => lstat(path),
  realpath,
  stat: async (path) => {
    const info = await stat(path);
    return {
      mode: info.mode,
      ownerId: String(info.uid),
      groupId: String(info.gid),
      isSocket: info.isSocket(),
    };
  },
  identity: async () => ({
    uid: String(process.getuid?.() ?? ""),
    gid: String(process.getgid?.() ?? ""),
    user: userInfo().username,
  }),
  env: () => process.env,
};
export async function checkTrustedRunner(
  input: CheckerInput,
  io: CheckerIO = defaults,
): Promise<CheckerResult> {
  const failures: string[] = [];
  let policy: RunnerPolicy | undefined;
  let policyHash = "";
  try {
    const parsed: unknown = JSON.parse(await io.read(input.policyPath));
    policy = policySchema.parse(parsed);
    policyHash = canonicalPolicyHash(policy);
    if (policy.policyHash !== policyHash) failures.push("policy hash mismatch");
  } catch {
    failures.push("policy invalid or unreadable");
  }
  if (!policy) return { trustedMode: false, failures, policyHash };
  if (JSON.stringify(policy).includes("REPLACE_WITH_"))
    failures.push("placeholder unresolved");
  if (
    policy.socket.path !== input.socketPath ||
    policy.repositoryRoot !== input.repositoryRoot ||
    policy.runRoot !== input.runRoot
  )
    failures.push("path policy mismatch");
  try {
    const entry = await io.lstat(input.socketPath);
    if (entry.isSymbolicLink()) failures.push("socket symlink");
  } catch {
    failures.push("socket missing");
  }
  try {
    const details = await io.stat(input.socketPath);
    if (details.isSocket !== true) failures.push("socket is not a unix socket");
    if ((details.mode & 0o777) !== 0o660) failures.push("socket mode mismatch");
    if (
      details.ownerId !== policy.socket.uid ||
      details.groupId !== policy.socket.gid
    )
      failures.push("socket ownership mismatch");
  } catch {
    failures.push("socket stat failed");
  }
  try {
    const [repository, run] = await Promise.all([
      io.realpath(input.repositoryRoot),
      io.realpath(input.runRoot),
    ]);
    if (repository !== input.repositoryRoot || run !== input.runRoot)
      failures.push("root realpath mismatch");
    const [repositoryInfo, runInfo] = await Promise.all([
      io.stat(input.repositoryRoot),
      io.stat(input.runRoot),
    ]);
    const identity = await io.identity();
    if (identity.uid === "0" || identity.gid === "0")
      failures.push("root identity is forbidden");
    const ownerWrite =
      (repositoryInfo.mode & 0o200) !== 0 &&
      repositoryInfo.ownerId === identity.uid;
    const groupWrite =
      (repositoryInfo.mode & 0o020) !== 0 &&
      repositoryInfo.groupId === identity.gid;
    const otherWrite = (repositoryInfo.mode & 0o002) !== 0;
    if (ownerWrite || groupWrite || otherWrite)
      failures.push("repository is writable");
    const runWritable =
      ((runInfo.mode & 0o200) !== 0 && runInfo.ownerId === identity.uid) ||
      ((runInfo.mode & 0o020) !== 0 && runInfo.groupId === identity.gid) ||
      (runInfo.mode & 0o002) !== 0;
    if (!runWritable) failures.push("run root is not writable");
  } catch {
    failures.push("root permission or realpath unavailable");
  }
  try {
    const identity = await io.identity();
    if (
      identity.uid !== policy.uid ||
      identity.gid !== policy.gid ||
      identity.user !== policy.user
    )
      failures.push("identity mismatch");
  } catch {
    failures.push("identity unavailable");
  }
  const environment = io.env();
  for (const name of policy.forbiddenEnv)
    if (environment[name] !== undefined)
      failures.push(`forbidden env: ${name}`);
  if (
    policy.capabilities.promote_ff_only !== false ||
    policy.capabilities.publish_approved_sha !== false
  )
    failures.push("promotion capability enabled");
  return { trustedMode: failures.length === 0, failures, policyHash };
}
export async function main(): Promise<number> {
  const root = process.cwd();
  const policyPath = `${root}/codx/trusted-runner/runner-policy.json`;
  let paths: CheckerInput = {
    policyPath,
    socketPath: "",
    repositoryRoot: "",
    runRoot: "",
  };
  try {
    const parsed: unknown = JSON.parse(await readFile(policyPath, "utf8"));
    const policy = policySchema.parse(parsed);
    paths = {
      policyPath,
      socketPath: policy.socket.path,
      repositoryRoot: policy.repositoryRoot,
      runRoot: policy.runRoot,
    };
  } catch {
    /* checker emits the structured failure */
  }
  const result = await checkTrustedRunner(paths);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return result.trustedMode ? 0 : 1;
}
if (import.meta.url === `file://${process.argv[1]}`)
  void main().then((code) => {
    process.exitCode = code;
  });
