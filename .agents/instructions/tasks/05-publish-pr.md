# 05 PUSH・PR作成タスク

共通契約は[AGENTS-DETAILS.md](../AGENTS-DETAILS.md)、特に[Branch、公開、禁止事項](../AGENTS-DETAILS.md#branch公開禁止事項)を参照する。

## 目的

両QA PASS済みの差分を許可されたbranchへ通常公開する。

## 担当・権限

担当はメインまたは公開担当。共通契約の開始条件とbranch別完了境界をメインが確認してから公開正本を使う。merge・レビュー承認・branch削除は行わない。

## 開始条件／入力

技術QA・仕様QAの両PASS、最新Docker正式verify PASS、計画外変更なしを確認し、work.json→plan.md→Git実体の順でbranch・HEAD・差分を読む。

## 手順

1. Git実体を再確認する。
2. 開始条件を再確認し、共通契約の[Branch、公開、禁止事項](../AGENTS-DETAILS.md#branch公開禁止事項)に定義された公開正本を使う。
3. 同契約のbranch種別ごとの順序で公開・確認する。
   大規模作業の`feature/<slug>-vX.Y.Z`は、対応する`feature/vX.Y.Z`をbaseとして通常PRを作成する。具体的な公開条件は共通契約に従う。
4. branch、SHA、CI結果、URL等の実行結果を記録し、引き継ぐ。

## 禁止事項

禁止事項は共通契約の[Branch、公開、禁止事項](../AGENTS-DETAILS.md#branch公開禁止事項)に従う。

## 成果物／完了条件

共通契約に定義されたbranch種別ごとのpush、CI、PR、head/base/SHA確認までを記録する。AIの完了境界も同じ条件とする。

## 失敗時／差戻し

権限不足や不整合は公開を止め、メインへ返す。CI失敗は同一SHAを確認して原因を記録し、必要ならQAまたは実装へ戻す。

## 次タスクへの引き継ぎ

レビュー、承認、merge、merge後監視を人間へ渡す。
