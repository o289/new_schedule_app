# AI runフローを簡素化・run単位化し、隔離実装から品質確認、feature branchのpush、同一SHA CI PASS、通常PR作成までをAIのPhase 5責務として機械的に完了できるようにする。レビューとmergeは人間専用とする。

- planId: agent-workflow-slim-v323-20260916-r3
- runId: agent-workflow-slim-v323-20260916-r3
- schemaVersion: 2
- planHash: dfd6970e1d7aaa3e6fd371152a67f105ae790db0ddc552963f59b047f428c1c0

## 目的・前提
AI runフローを簡素化・run単位化し、隔離実装から品質確認、feature branchのpush、同一SHA CI PASS、通常PR作成までをAIのPhase 5責務として機械的に完了できるようにする。レビューとmergeは人間専用とする。

## Open decisions

## Phases
### phase-1: run単位path整理

runごとの箱に分ける

Allowed paths:
- .agents/**

Quality gates:
- typecheck
- test

Acceptance criteria:
- run単位になる

Stop conditions:
- 不一致

### phase-2: canonical整備

正本を一つにする

Allowed paths:
- .agents/**
- ai/**

Quality gates:
- typecheck
- test

Acceptance criteria:
- canonicalを使う

Stop conditions:
- 不一致

### phase-3: 公開条件

公開条件を確認する

Allowed paths:
- .agents/**

Quality gates:
- typecheck
- test

Acceptance criteria:
- 証跡を残す

Stop conditions:
- 失敗

### phase-4: 移行経路

古いrunを安全に扱う

Allowed paths:
- .agents/**
- ai/**

Quality gates:
- typecheck
- test

Acceptance criteria:
- 旧記録を壊さない

Stop conditions:
- 上書き

### phase-5: 公開

pushとPRを検証する

Allowed paths:
- .agents/**

Quality gates:
- typecheck
- test

Acceptance criteria:
- PRを作成する

Stop conditions:
- 不一致

## Allowed paths
- .agents/**
- ai/**
- human/**
- codx/**
- .dockerignore
- AGENTS.md
- package.json
- tools/**
- tsconfig.tools.json
- vitest.config.ts

## Forbidden paths
- .git/**
- .env*
- main
- docs/agent-runs/**

## API changes
- status: NOT_APPLICABLE
- description: NOT_APPLICABLE: 変更なし

## DB changes
- status: NOT_APPLICABLE
- description: NOT_APPLICABLE: 変更なし

## Dependency changes
- status: NOT_APPLICABLE
- description: NOT_APPLICABLE: 変更なし

## Permission changes
- status: NOT_APPLICABLE
- description: NOT_APPLICABLE: 変更なし

## Secret changes
- status: NOT_APPLICABLE
- description: NOT_APPLICABLE: 変更なし

## External side effects
- status: NOT_APPLICABLE
- description: NOT_APPLICABLE: 変更なし

## Quality gates
- Node22 typecheck/test
- Project Rules PASS

## Failure policy
stop

## Limits
- maxRetries: 3
- maxDurationMinutes: 120
- maxCostYen: 0

## Branch / worktree
- source: feature/v3.2.3
- worktree: run
- mode: pull_request

## Acceptance criteria
- Phase 5まで公開状態を検証する
