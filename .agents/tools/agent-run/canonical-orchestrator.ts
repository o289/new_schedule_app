import {
  classifyFailure,
  toCanonicalFailureOutcome,
  type FailureInput,
} from "./failure-classifier";
import {
  isPublicationEligible,
  resolveCanonicalTransition,
  type CanonicalAction,
  type CanonicalSnapshot,
} from "./canonical-orchestration";
import { CanonicalStateStore } from "./state-store";
import type { CanonicalEvent, PublicationEvidence } from "./canonical-state";
import { canonicalStateSchema } from "./canonical-state";

export type CanonicalPhase = { id: string };

export type CanonicalOrchestratorOptions = {
  planHash: string;
  phases: readonly CanonicalPhase[];
  mode?: "push_only" | "pull_request";
};

type PhaseEvidence = {
  phaseId: string;
  evidenceHash: string;
  verifiedSha: string;
  gatesPassed: true;
};

const initialSnapshot: CanonicalSnapshot = {
  state: "DRAFT",
  phaseId: null,
  retryCount: 0,
  publicationState: "NOT_STARTED",
};

export class CanonicalOrchestrator {
  constructor(
    private readonly store: CanonicalStateStore,
    private readonly runId: string,
    private readonly options: CanonicalOrchestratorOptions,
  ) {
    if (options.phases.length === 0) {
      throw new Error("canonical planには1つ以上のPhaseが必要です");
    }
    for (const phase of options.phases) {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(phase.id)) {
        throw new Error("phaseIdが不正です");
      }
    }
  }

  async snapshot(): Promise<CanonicalSnapshot> {
    const events = await this.store.load();
    const event = events.at(-1);
    if (!event) return initialSnapshot;
    return {
      state: canonicalStateSchema.parse(event.to),
      phaseId: event.phaseId,
      retryCount: event.retryCount,
      publicationState: event.publicationState ?? "NOT_STARTED",
      publicationEvidence: event.publicationEvidence,
    };
  }

  private async transition(
    action: CanonicalAction,
    phaseId: string | null = null,
    outcome?: "REPLAN" | "FAILED" | "SAFETY_STOP",
    evidence?: PhaseEvidence,
    publicationState?:
      "PENDING" | "BRANCH_PUSHED" | "CI_PASSED" | "PR_CREATED" | "BLOCKED",
    publicationEvidence?: PublicationEvidence,
  ): Promise<CanonicalEvent> {
    const events = await this.store.load();
    const last = events.at(-1);
    const current = last
      ? {
          state: last.to,
          phaseId: last.phaseId,
          retryCount: last.retryCount,
          publicationState: last.publicationState ?? "NOT_STARTED",
        }
      : initialSnapshot;
    const next = resolveCanonicalTransition(current, action, phaseId, outcome);
    return this.store.append({
      schemaVersion: 2,
      runId: this.runId,
      planHash: this.options.planHash,
      from: last?.to ?? null,
      to: next.state,
      phaseId: next.phaseId,
      retryCount: next.retryCount,
      action,
      evidence,
      publicationState,
      publicationEvidence,
    });
  }

  prepare(): Promise<CanonicalEvent> {
    return this.transition("prepare");
  }

  approve(): Promise<CanonicalEvent> {
    return this.transition("approve");
  }

  ready(): Promise<CanonicalEvent> {
    return this.transition("prepare_workspace");
  }

  async startPhase(phaseId: string): Promise<CanonicalEvent> {
    const current = await this.snapshot();
    const events = await this.store.load();
    if (
      current.state === "RUNNING" &&
      current.phaseId === phaseId &&
      events.at(-1)
    ) {
      return events.at(-1)!;
    }
    const expected = this.options.phases[0]?.id;
    if (phaseId !== expected || current.phaseId !== null) {
      throw new Error("計画順序と異なるPhaseです");
    }
    return this.transition("begin_phase", phaseId);
  }

  async beginVerify(): Promise<CanonicalEvent> {
    return this.transition("begin_verify", (await this.snapshot()).phaseId);
  }

  async verificationPassed(evidence: PhaseEvidence): Promise<CanonicalEvent> {
    if (
      !evidence ||
      !/^[a-f0-9]{64}$/.test(evidence.evidenceHash) ||
      !/^[a-f0-9]{40}$/.test(evidence.verifiedSha) ||
      evidence.gatesPassed !== true
    )
      throw new Error("Phaseの品質証跡が不正です");
    const current = await this.snapshot();
    const index = this.options.phases.findIndex(
      (phase) => phase.id === current.phaseId,
    );
    if (
      current.state !== "VERIFYING" ||
      index < 0 ||
      evidence.phaseId !== current.phaseId
    ) {
      throw new Error("検証中のPhaseがありません");
    }
    const nextPhase = this.options.phases[index + 1]?.id ?? current.phaseId;
    const nextState =
      index === this.options.phases.length - 1 ? "COMPLETED" : "RUNNING";
    return this.transition(
      "verify_pass",
      nextPhase,
      undefined,
      evidence,
      nextState === "COMPLETED" ? "PENDING" : undefined,
    );
  }

  async updatePublicationState(
    to: "PENDING" | "BRANCH_PUSHED" | "CI_PASSED" | "PR_CREATED" | "BLOCKED",
    publicationEvidence?: PublicationEvidence,
  ): Promise<CanonicalEvent> {
    const current = await this.snapshot();
    const allowed = {
      NOT_STARTED: "PENDING",
      PENDING: "BRANCH_PUSHED",
      BRANCH_PUSHED: "CI_PASSED",
      CI_PASSED: "PR_CREATED",
      BLOCKED: "BLOCKED",
      PR_CREATED: "PR_CREATED",
    } as const;
    if (to !== "BLOCKED" && allowed[current.publicationState] !== to)
      throw new Error("公開状態を飛ばせません");
    if (to === "PENDING" && current.state !== "COMPLETED")
      throw new Error("実装完了前に公開待ちへ遷移できません");
    return this.transition(
      "publication_status",
      current.phaseId,
      undefined,
      undefined,
      to,
      publicationEvidence,
    );
  }

  async verificationFailed(input: FailureInput): Promise<CanonicalEvent> {
    const failure = classifyFailure(input);
    return this.transition(
      "verify_fail",
      (await this.snapshot()).phaseId,
      toCanonicalFailureOutcome(failure),
    );
  }

  replan(): Promise<CanonicalEvent> {
    return this.transition("replan");
  }

  fail(): Promise<CanonicalEvent> {
    return this.transition("fail");
  }

  safetyStop(): Promise<CanonicalEvent> {
    return this.transition("safety_stop");
  }

  async publish(
    targetSha: string,
    contextVerifier: () => Promise<{
      canonicalContextVerified: true;
      planHashValid: true;
      approvalHashValid: true;
      startHashValid: true;
    }>,
    boundaryVerifier: () => Promise<{ publicationBoundaryRevalidated: true }>,
    publisher: () => Promise<void>,
  ): Promise<void> {
    const state = await this.snapshot();
    const stored = await this.store.snapshot();
    const evidence = Object.values(stored.evidenceByPhase);
    const context = await contextVerifier();
    const boundary = await boundaryVerifier();
    const verifiedSha = evidence[0]?.verifiedSha;
    const eligible = isPublicationEligible({
      state: state.state,
      ...context,
      allPhasesPassed:
        state.state === "COMPLETED" &&
        stored.passedPhaseIds.length === this.options.phases.length &&
        this.options.phases.every((phase) =>
          stored.passedPhaseIds.includes(phase.id),
        ),
      targetSha,
      verifiedSha,
      ...boundary,
      legacyProjection: false,
    });
    if (!eligible || evidence.some((item) => item.verifiedSha !== targetSha)) {
      throw new Error("公開条件を満たしていません");
    }
    await publisher();
  }
}
