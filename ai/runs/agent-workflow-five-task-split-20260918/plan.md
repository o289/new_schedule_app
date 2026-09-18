# 実装計画

承認済みHTML計画（`plan.html`）の3 Phaseを実装する。計画外のDB、依存、API、権限、仕様、設定変更が必要になった場合はREPLANで停止する。

## 概要

- 目的：圧縮された開発フローを共通契約と5タスク文書へ分割する。
- 成果物：`.agents/instructions/AGENTS-DETAILS.md`、同じディレクトリの5タスク文書、状態管理ファイル。
- DB Schema変更：なし。migration作成・適用なし。
- 依存追加：なし。
- API・権限・設定変更：なし。
- E2E：不要。今回は文書再編で画面・APIの挙動を変更しないため。仕様QAでは不要理由を記録する。

## Phase 1：共通契約と5タスク骨格

Phase 1記録：初回は削除済み`codx/README.md`の無条件読込みでFAILしたため、承認済みPhase 3の必要範囲として検査を前倒し修正。その後、Node 22.23.1、rules/typecheck PASS、32 test files/172 tests PASS、6 skippedの正式Docker verify PASS、独立技術QA PASS、メイン仕様QA PASSを確認し、Phase 1を完了した。

### 変更対象

- `.agents/instructions/AGENTS-DETAILS.md`
- `.agents/instructions/tasks/01-planning.md` 〜 `05-publish-pr.md`
- `ai/runs/agent-workflow-five-task-split-20260918/plan.md`
- `ai/runs/agent-workflow-five-task-split-20260918/work.json`

### 実装内容・チェックリスト

- [x] AGENTS-DETAILS.mdを共通契約・5タスク索引へ再編する。
- [x] 5タスクを同じディレクトリの個別Markdownへ分割し、各タスクの骨格と最低限のルールを記載する。
- [x] 6項目だけのwork.jsonを作成する。
- [x] 現行のPhase、REPLAN、品質ループ、コード、branch、公開、引継ぎ規則を保持する。

### 品質ゲート

- [x] メインがDocker正式環境で`pnpm verify:phase`（`pnpm typecheck && pnpm test`）を実行しPASSする。
- [x] メインが実際の差分を確認し、技術QA・仕様QAの最終PASSを判定する。

## Phase 2：タスク固有ルールの詳細化

Phase 2 QA指摘4点（恒久文書からrun固有E2E記述を分離、共通契約との正式verify／QA／公開条件の重複削減、小規模計画スキップ条件の明確化、plan.html・計画記録の矛盾整理）を修正した。Phase 2品質ゲートは再QA完了まで未チェックとする。

Phase 2再QA残存P2：05の公開正本・branch別手順の逐語重複を削除し、共通契約のアンカー参照と開始条件・Git再確認・結果記録の固有手順へ整理した。Phase 2品質ゲートは再QAと正式verify完了まで未チェックとする。

### 実装チェックリスト

- [x] 各タスクの入出力、担当区分、判定境界、差戻し、引継ぎを詳細化する。
- [x] 各Phaseのテスト担保可否、読み取り専用サブエージェント／メインの担当を明記する。
- [x] 仕様QAのE2E責務と、不要時の理由記録を明記する。

### 品質ゲート

- [x] メインのDocker正式verify PASS。
- [x] 技術QA・仕様QAが独立・並行にPASSし、メインが最終PASSを判定する。

## Phase 3：必要範囲の関連文書同期

Phase 3は、入口（AGENTS.md）、計画テンプレート、ルール検査の参照関係を必要範囲で同期する。既存run履歴と`docs/**`は変更しない。

Phase 3初回QA FAIL：テンプレートのbranch完了条件が総称的で、検査unit testの一時fixtureが未清掃、instructions必須の直接テストが不足していたため修正した。テンプレートをbranch別条件へ更新し、fixtureをafterEachでrecursive/force cleanupし、AGENTS存在・instructions不存在を個別検証するテストを追加した。品質ゲートは再QA・再verifyまで未チェックとする。

Phase 3再技術QA残存P2：全Phase完了条件の公開記述を、version branchはpush後の同一SHA CI成功、機能branchはpush後の通常PR作成とhead/base/SHA確認というbranch別条件へ統一した。最終結果は正式Docker verify PASS、独立技術QA PASS（P1/P2なし）、メイン仕様QA PASS、E2E不要（文書・ルール検査のみ）、計画外変更なし。

初回公開CIは`format:check`でFAILし、対象7ファイルをPrettier整形のため実装へ差し戻した。plan.mdとwork.jsonはformat対象外の書式を維持し、整形後の再QA・正式verify待ちとする。

再検証結果：Dockerで`pnpm format:check` PASS、Node 22.23.1／pnpm 11.20.0、Project rules OK、全typecheck PASS、33 test files PASS + 1 skipped、174 tests PASS + 6 skipped。独立技術QA PASS（機械整形のみ、P1/P2なし）、メイン仕様QA PASS、E2E不要、計画外変更なし。再公開待ちとする。

### 実装チェックリスト

- [x] `AGENTS.md`、テンプレート、参照文書、ルール検査テストを、入口・契約・参照・検査対象としてつながりが必要な範囲だけ同期する。
- [x] 無関係な記述、既存run履歴、`docs/**`を変更しない。
- [x] 参照切れ、重複、矛盾を確認する。

### 品質ゲート

- [x] メインのDocker正式verify PASS（Node 22.23.1、pnpm 11.20.0、Project rules OK、frontend/backend/tools typecheck PASS、33 test files PASS + 1 skipped、174 tests PASS + 6 skipped）。
- [x] 技術QA・仕様QAの独立PASSとメインの最終PASS。

## 全Phase完了条件

- [x] 全Phaseの実装チェックリストを満たす。
- [x] Docker正式環境で`pnpm verify:phase`がPASSする。
- [x] 計画外の不要な差分がない。
- [x] 両QA PASS後、version branchはpush後の同一SHA CI成功、機能branchはpush後の通常PR作成とhead/base/SHA確認まで完了する。公開正本のpush_onlyと同一SHA CI成功を確認し、version branchのためPRは不要。

## 今回のPhase 1の制約

DB／migration／依存／API／権限／設定変更はなく、E2Eは不要。Docker正式verifyと最終品質ゲートはメインが実行・判定するため、本タスクでは実行しない。AGENTS.md、テンプレート、run履歴、`docs/**`はPhase 1の対象外である。check-project-rules.tsは、削除済み候補を無条件に読まないことと、5タスク文書を検査対象へ含めるための最小同期のみPhase 1へ前倒しした。Phase 3には残りの関連文書・テンプレート同期と、検査テストの必要性判断を残す。
