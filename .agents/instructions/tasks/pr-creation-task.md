# PR作成タスク

共通契約は[AGENTS-DETAILS.md](../AGENTS-DETAILS.md)、特にBranch、公開、禁止事項を参照する。

## 目的

QAと正式verifyがPASSした差分を許可されたbranchへ公開し、CIまたはPRの完了境界を確認する。

## 担当・権限

担当はメインまたは指定された公開担当。公開正本は./.agents/tools/pr-agent-publishだけ。レビュー承認、merge、branch削除は行わない。

## 開始条件／入力

技術QA・仕様QAの両PASS、最新Docker正式verify PASS、計画外変更なし、Git実体（branch、HEAD、差分）、必要な人間向けdiff資料。

## 手順

1. 公開前に対象差分、branch、HEAD、origin、QA記録とverify結果を確認する。
2. 共通契約のbranch別条件に従い、公開正本を使う。
   - feature/vX.Y.Z: 同名originへ通常pushし、そのHEAD SHAと一致するCI成功を確認する。PRは作らない。
   - `feature/<slug>-vX.Y.Z`: 同名originへpushし、対応するfeature/vX.Y.Zをbaseとする通常PRを作成し、head/base/SHAを確認する。
3. branch、SHA、CI結果、PR URLとhead/base/SHA（該当時）を記録する。
4. 公開結果をレビュータスクへ渡す。

## 禁止事項

- 両QAまたは正式verifyのPASS前の公開
- mainへのpush、force push、任意remote/refspec、merge、branch削除
- 公開正本以外を使ったpush/PR操作
- レビュー、承認、merge、merge後監視をAIの完了条件にすること

## 成果物／完了条件

version branchは同一SHAのCI成功まで。機能branchはpushと通常PRに加え、PRのhead/base/SHA一致確認まで。結果を記録する。

## 失敗時／差戻し

権限・remote・branch不一致、CI失敗、PRのhead/base/SHA不一致があれば公開を止めてメインへ返す。CI失敗は同一SHAを確認し、必要ならtestまたはcode generationへ戻す。

## 次タスクへの引き継ぎ

公開結果、差分、両QA記録、正式verify結果を[レビュータスク](review-task.md)へ渡す。最終レビュー、承認、merge、merge後監視は人間へ渡す。
