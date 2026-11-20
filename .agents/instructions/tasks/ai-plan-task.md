# AI向け計画書作成タスク

共通契約は[AGENTS-DETAILS.md](../AGENTS-DETAILS.md)、人間向け計画書作成は[human-plan-task.md](human-plan-task.md)を参照する。

## 目的

承認済み人間向けHTML計画書を、AIが実行・検証できるMarkdown計画書へ忠実に写す。

## 担当・権限

担当はメイン。記述は指定された書き込み担当へ委譲できる。承認内容を実行可能に整理し、独自の要件や仕様判断を追加しない。

## 開始条件／入力

- ユーザー本人の明示的なチャット承認を確認できる。
- 承認済み人間向けHTML計画書と、参照されるUIモックがある。
- 共通契約、AI向け計画テンプレート、Git実体が確認できる。

条件を満たさない場合は開始しない。既存計画の移行を明示された場合は、その計画要素だけを入力にする。歴史runを探索・変更しない。

## 手順

1. HTMLから要求、対象/対象外、Phase、受入条件、QA/E2E、migration、公開条件を抽出する。
2. [AI向け計画テンプレート](../../../templates/IMPLEMENTATION_PLAN_TEMPLATE.md)を使い、実行順、完了条件、検証、差戻し条件をMarkdownで記述する。
3. AI向け計画書を `ai/plans/<slug>.md` に保存する。run固有の独立 plan.md は作らない。
4. HTMLとMarkdownの要求、範囲、Phase、受入条件、QA、正式verify、REPLAN条件を照合する。不一致があれば停止してHTML計画書へ戻す。
5. 相対リンクと対象範囲を確認し、計画書読み取りタスクへ渡す。

## 禁止事項

- 人間向け計画書の承認前にAI向け計画書を作ること
- HTMLにない要求、対象ファイル、Phase、設計判断を追加すること
- 新規runId、work.json、approval.json、run内のplan.html/plan.mdを作ること
- JSON、外部ファイル、HTML欄、推測で承認を判定すること

## 成果物／完了条件

`ai/plans/<slug>.md` に保存したAI向け計画書。承認済みHTMLと一致し、対象、各Phaseの変更・受入条件、QA/E2E、正式verify、公開ゲート、失敗時の扱い、REPLAN条件が具体的である。

## 失敗時／差戻し

承認を確認できない、入力が不足、HTMLと不整合、または未承認の判断が必要な場合は停止し、人間向け計画書作成へ差し戻す。

## 次タスクへの引き継ぎ

承認済みHTMLと整合確認済みMarkdown、チャット承認、必要なUIモックを[計画書読み取りタスク](plan-reading-task.md)へ渡す。
