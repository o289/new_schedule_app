# テスト・QAタスク

共通契約は[AGENTS-DETAILS.md](../AGENTS-DETAILS.md)、特に実装と品質ループを参照する。

## 目的

承認済みPhaseの実装を技術面・仕様面から独立検証し、正式verifyと根拠あるQA結果を出す。

## 担当・権限

技術QAと仕様QAは独立・並行に判定する。テストで担保できる項目は実装者と別のread-only担当、困難な項目はメインが担当する。read-only担当は修正しない。最終PASSはメインが判定する。

## 開始条件／入力

人間向け・AI向け計画書、現在Phaseの完了条件、確定したGit差分、実装引継ぎ、必要なmigration結果、QA担当区分と理由。

## 手順

1. 計画対象・対象外、変更ファイル、生成物、未承認差分を照合する。
2. 計画にmigrationがある場合だけ、生成SQL、適用結果、必要なintegration testを確認する。
3. 技術QAと仕様QAを独立に実行する。
   - 技術QA: architecture/import境界、入力検証、security/secrets、日時、Promise、依存、migration、再現性を確認する。
   - 仕様QA: 要件対応表を作り、受入条件、UX、文言、error、API/time contract、計画範囲を確認する。
4. 共通契約の正式Docker verifyを実行する。verify:phaseはtypecheck→testの順であり、typecheck失敗時はtestへ進まない。失敗は原因修正後に同じverifyをやり直す。
5. E2Eは仕様QAが計画どおり実施する。不要の場合は具体的理由を記録する。技術QAはE2Eを代行しない。
6. 技術・仕様それぞれに根拠付きPASS/FAILを記録し、最終判定をメインへ返す。

正式verifyは次のコマンドを使う。

    docker compose -f compose.dev.yml run --rm application sh -c 'pnpm install --frozen-lockfile && pnpm verify:phase'

## 禁止事項

- 受入条件を緩和する、仕様を独断で変更する、実装を兼任する
- 二つのQAを一つの判定にまとめる、技術QAでE2Eを代行する
- 根拠なくPASSと判定する、公開を行う

## 成果物／完了条件

技術QA・仕様QAそれぞれの検査内容、根拠、正式verifyのコマンドと結果、E2E結果または不要理由、計画外差分の確認、PASS/FAIL。両QAと正式verifyのPASSをメインが確認する。

## 失敗時／差戻し

FAILは再現条件、対象、根拠とともに[コード生成タスク](code-generation-task.md)へ戻す。仕様・範囲・未承認設定の変更が必要ならREPLANとして計画書作成へ戻す。

## 次タスクへの引き継ぎ

QA記録とメインの最終判定を[PR作成タスク](pr-creation-task.md)へ渡す。両QAと最新正式verifyがPASSするまでは公開しない。
