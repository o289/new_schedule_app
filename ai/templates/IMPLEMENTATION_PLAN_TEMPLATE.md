# 実装計画

この計画に書いた全Phaseは、最初の承認で実装してよい。Phaseの品質確認に合格したら、追加承認なしで次へ進む。計画外の変更だけREPLANとして停止する。

## 概要

- 目的：
- 解決する課題：
- DB Schema変更：あり / なし
- 依存追加：あり / なし
- API・権限変更：あり / なし
- UIモック：必要 / 不要（必要なら保存先）

## Phase 1：名前

### 変更対象

- `path/to/file`

### 実装内容

- 実装する処理
- 維持する既存動作

### フェーズ完了条件

- [ ] 実装が完了している
- [ ] 必要なテストが追加・更新されている

### 品質ゲート

- [ ] Node.js 22.23.1のDocker環境
- [ ] `pnpm typecheck` PASS
- [ ] `pnpm test` PASS

---

複数Phaseの場合はこの章を複製し、Phaseごとに変更対象・完了条件・品質ゲートを具体的に書く。DB変更を含むPhaseには次も追加する。

- [ ] migration生成物のSQLを確認した
- [ ] ローカル開発DBへmigrationを適用した
- [ ] 必要なintegration testがPASSした

## 全Phase完了条件

- [ ] 各Phaseの完了条件を満たしている
- [ ] Docker環境で`pnpm verify:phase`がPASSしている
- [ ] 計画外の不要な差分がない
- [ ] 必要なbranchへpush、または通常PRを作成した
