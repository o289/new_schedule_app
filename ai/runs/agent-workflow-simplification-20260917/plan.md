# AI開発フロー簡素化 実装計画

この計画に書かれた全Phaseは、最初の承認で実装してよい。各Phaseの品質ゲートが終わったら、追加承認なしで次のPhaseへ進む。計画にない変更が必要なときだけREPLANして、この計画を直してから再開する。

## Phase 1：最小publishを先に開通する

### 変更対象

- `AGENTS.md`とPR作成手順
- 公開関連script（既存entrypointはPhase 3で整理）
- 公開判定

### 実装内容

- trusted runner未実装を理由に公開を止めない
- `agent:publish`自身が同一実行で`pnpm verify:phase`を行い、PASS時だけ公開する
- `feature/vX.Y.Z`は同名originへpushし、同一SHAのCI成功確認で完了する（PR不要）
- `feature/<slug>-vX.Y.Z`はpushして`feature/vX.Y.Z`向け通常PRを作成して完了する
- main、force push、branch削除、本番操作を禁止する

### フェーズ完了条件

- [x] 版branchのpushと同一SHA CI確認が動く
- [x] 機能branchのpushと通常PR作成が動く
- [x] 危険な操作が拒否される
- [x] PR #11のマージ済み状態と矛盾する説明がない

### 品質ゲート

- [x] Docker正式ゲート（Node.js v22.23.1）
- [x] `pnpm typecheck` PASS
- [x] `pnpm test`（761 tests）PASS
- [x] publish安全テスト PASS

## Phase 2：共有メモと計画チェックリストの導入

### 変更対象

- `ai/runs/<runId>/work.json`
- `ai/runs/<runId>/plan.md`
- `.agents/instructions/AGENTS-DETAILS.md`
- `.agents/instructions/実装エージェント.md`
- `.agents/instructions/MULTI_AGENT_WORKFLOW.md`
- `.agents/tools/agent-run/work-schema.ts`
- `.agents/tools/agent-run/work-schema.test.ts`

### 実装内容

- runごとの実データを`work.json`と`plan.md`の2ファイルへ集約する
- work.jsonはgoal、currentPhase、nextAction、lastVerification、blocker、updatedAtだけを持つ
- branch、SHA、hash、期限、event、state machine、evidence pathはwork.jsonへ保存しない
- AIの引き継ぎ順を`work.json → plan.md → Gitの実体`に統一する
- branchとSHAは引き継ぎメモではなくGitコマンドの結果から取得する

### フェーズ完了条件

- [x] work.jsonを作成した
- [x] plan.mdを作成した
- [x] 最小schemaと余計なmetadataを拒否するテストを追加した
- [x] Phase 2の実装について自己確認した

### 品質ゲート

- [x] Docker正式ゲート（Node.js v22.23.1）PASS
- [x] format PASS
- [x] typecheck PASS
- [x] test PASS（65 test files / 763 tests、25 skipped）

## Phase 3：旧entrypointと状態管理を削除し、2つへ集約する

### 変更対象

- `.agents/tools/agent-run/**`
- `.agents/tools/trusted-runner/**`
- 重複するAI開発フロー文書

### 実装内容

- Phase 1のverify内実行を正本にし、別PASS記録を要求しない
- 旧entrypoint、state、trusted runnerを`rg`で参照ゼロ確認後に削除する
- package scriptsを`verify`と`publish`中心へ集約する
- push後のSHAとPRのhead SHAを確認する

### フェーズ完了条件

- [x] 旧entrypoint/state/trusted runnerの参照ゼロを確認する
- [x] verify入口が1つになる
- [x] FAIL時はpublish不可になる
- [x] branch別の完了条件が動く

### 品質ゲート

- [x] Node.js v22.23.1
- [x] format PASS
- [x] typecheck PASS
- [x] test PASS（32 test files / 171 tests、6 skipped）

## Phase 4：古い仕組みを片付ける

### 変更対象

- 参照されなくなったtrusted runner、state machine、cleanup、重複証跡
- 古い説明とリンク

### 実装内容

- 参照元がないことを確認して削除する
- 未参照の`codx/trusted-runner`設定と重複Rulesを削除し、Rulesの正本を`.agents/rules/pr-agent.rules`へ統一する
- 旧run履歴を読み取るコードは必要な間残す
- README、rootのAI指示、AI向けtemplateを短い流れへ更新する

### フェーズ完了条件

- [x] 新方式が使うファイルを一覧化する
- [x] 未参照コードを削除する
- [x] 未参照の`codx/trusted-runner`設定を削除する
- [x] 重複Rulesを削除し、`.agents/rules/pr-agent.rules`へ統一する
- [x] AI指示、root説明、README、計画templateを現行フローへ更新する
- [x] 旧run履歴を読める
- [x] branch別publishロジックを12件のmock安全テストで確認する
- [x] 版branchを実際にpushし、同一SHAのCI成功を確認する（SHA `398f2cf3ef713698c540be122b2e42776f3134b3`、CI PASS）
- [x] 機能branchの通常PRロジックを12件のmock安全テストで確認する（実branchがないため実PRはNOT_APPLICABLE）

### 品質ゲート

- [x] Node.js v22.23.1（Docker）
- [x] typecheck PASS
- [x] test PASS（32 test files / 172 tests、6 skipped）

## 全体完了条件

- [x] 全Phaseの完了条件を満たしている
- [x] 最終`pnpm verify:phase`がPASSしている
- [x] 計画外の不要な差分がない
