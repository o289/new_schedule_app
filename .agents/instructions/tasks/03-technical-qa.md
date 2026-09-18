# 03 技術品質管理タスク

共通契約は[AGENTS-DETAILS.md](../AGENTS-DETAILS.md)、特に[実装と品質ループ](../AGENTS-DETAILS.md#実装と品質ループ)を参照する。

## 目的

差分の技術的安全性、設計整合性、再現可能性を独立判定する。

## 担当・権限

QA担当区分と最終PASSの共通契約を確認し、実装者と独立して検査する。read-only担当は修正せず、最終PASSはメインが判定する。

## 開始条件／入力

work.json→plan.md→Git実体の順に確認し、実装引継ぎ、受入条件、Git差分、テスト結果、QA担当区分と理由を入力にする。実装者と独立して判定する。

## 手順

1. plan.mdの対象・非対象と完了チェックを確認し、対象外、生成物、計画外変更を差分確認する。
2. architecture、import境界、input validation、security/secrets、time、Promise、dependency、migrationを検査する。
3. メインが共通契約に定義された正式Docker verifyを実行し、typecheck失敗時はtestへ進まないことを確認する。
4. E2E境界は共通契約に従い、技術判定の根拠付きPASS/FAILを記録する。

## 禁止事項

仕様を技術都合で緩和すること、実装を兼任すること、公開操作、E2Eの代行。

## 成果物／完了条件

検査対象、根拠、コマンド結果、懸念、PASS/FAIL記録。最終的に技術QA PASSをメインが保持する。

## 失敗時／差戻し

FAILは再現条件、対象箇所、根拠を添えて実装へ戻し、修正後に同じ検査を再判定する。計画変更が必要ならREPLANへ戻す。

## 次タスクへの引き継ぎ

技術QA記録をメインへ返す。仕様QAとは独立に判定し、両PASS後に公開タスクへ進む。
