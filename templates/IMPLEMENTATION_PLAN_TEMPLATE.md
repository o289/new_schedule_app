# 実装計画

この計画に書いた全Phaseは、最初の承認で実装してよい。Phaseの品質確認に合格したら、追加承認なしで次へ進む。計画外の変更だけREPLANとして停止する。

## 概要

- 目的：
- 解決する課題：
- DB Schema変更：あり / なし（対象・理由：）
- 依存追加：あり / なし（対象・理由：）
- API変更：あり / なし（対象・理由：）
- 権限変更：あり / なし（対象・理由：）
- 仕様変更：あり / なし（対象・理由：）
- 設定変更：あり / なし（対象・理由：）
- UIモック：必要 / 不要（必要なら保存先）
- 変更対象：
- 変更対象外：
- フロー：実装 → 技術QA／仕様QA → 公開（両QA PASS後のみ公開）

## Phase 1：名前

### 変更対象

- `path/to/file`

### 実装内容

- 実装する処理
- 維持する既存動作

### フェーズ完了条件

- [ ] 実装が完了している
- [ ] 必要なテストが追加・更新されている
- [ ] 必要なmigrationとSQL確認が完了している（Schema変更時のみ）
- [ ] E2E：必要 / 不要（不要なら理由：）

### 品質ゲート

- [ ] Node.js 22.23.1のDocker環境
- [ ] `pnpm typecheck` PASS
- [ ] `pnpm test` PASS
- [ ] 技術QA：テスト担保可能なら実装者と別のread-only sub、困難ならmain（判定理由：）
- [ ] 仕様QA：テスト担保可能なら実装者と別のread-only sub、困難ならmain（判定理由：）
- [ ] 技術QAと仕様QAが独立してPASSし、mainが最終PASSを判定した
- [ ] 次タスクへの引継ぎ（変更、テスト、DB／依存／設定、未実行検証、未解決事項）：
- [ ] FAIL時の差戻し先とREPLAN条件を記録した

---

複数Phaseの場合はこの章を複製し、Phaseごとに変更対象・非対象・完了条件・品質ゲート・QA担当区分・E2E要否・引継ぎ・差戻しを具体的に書く。計画承認は全Phaseを対象とし、計画外のDB、依存、API、権限、仕様、設定はREPLANで停止する。共通のbranch／公開条件は[AGENTS-DETAILS.md](../.agents/instructions/AGENTS-DETAILS.md#branch公開禁止事項)を参照する。

- [ ] migration生成物のSQLを確認した
- [ ] ローカル開発DBへmigrationを適用した
- [ ] 必要なintegration testがPASSした

## 全Phase完了条件

- [ ] 各Phaseの完了条件を満たしている
- [ ] Docker環境で`pnpm verify:phase`がPASSしている
- [ ] 計画外の不要な差分がない
- [ ] 共通契約のbranch種別ごとの完了条件を満たした（version branch：push後の同一SHA CI成功、機能branch：push後の通常PR作成とhead/base/SHA確認）

各Phaseの品質確認は、技術QAと仕様QAの両方がPASSした後にだけ次タスクへ進む。work.json→plan.md→Git実体の順で引き継ぎ、plan.mdの完了項目を更新する。
