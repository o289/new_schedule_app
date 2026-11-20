# 実装フロー

この文書は順序と停止条件だけを定義する。各作業の契約はリンク先のtask文書を正本とする。

## 準備

1. [人間向け計画書作成](../tasks/human-plan-task.md)で要求、範囲、Phase、受入条件を決めてHTML計画書を作る。
2. 新規UI機能の場合は[UIモック画像作成](../tasks/ui-mock-task.md)を人間の承認前に行い、PNGと再現条件をHTMLへ含める。
3. ユーザー本人のチャットで全Phaseの明示承認を確認する。承認状態ファイル、HTML欄、外部ファイル、推測は承認としない。
4. [AI向け計画書作成](../tasks/ai-plan-task.md)で承認済みHTMLと整合するMarkdown計画書を作る。

## 実装フロー

本人のチャット承認、両計画書の整合、必要なUIモックと入力が確認できたら、次の順で実行する。

1. [計画書読み取り](../tasks/plan-reading-task.md)
2. [コード生成](../tasks/code-generation-task.md)
3. [テスト・QA](../tasks/test-task.md)
4. [PR作成](../tasks/pr-creation-task.md)
5. [レビュー](../tasks/review-task.md)

## Phaseゲート

各Phaseでコード生成、承認済みSchema変更がある場合のみmigration、テスト・QA、正式Docker verifyを行う。全受入条件、技術QA、仕様QA、正式verifyがPASSした場合だけ次Phaseへ進む。計画承認は全Phaseを対象とし、Phaseごとの追加承認は求めない。

## 停止条件と完了境界

- 本人のチャット承認がない、計画書が不一致、入力または必要なUIモック/再現条件が不足する場合は停止する。
- 計画外のDB、依存、API、権限、仕様、設定変更が必要ならREPLANとして人間向け計画へ戻す。
- 両QAと正式verifyがPASSするまでは公開しない。
- 人間向けdiff資料を人間へ渡した時点でAI工程は終了する。最終レビュー、承認、merge、merge後監視は人間が行う。

計画は人間向けHTML、AI向けMarkdown、Git実体、チャット上の承認で引き継ぐ。新規runId、work.json、approval.json、独立run内plan.html/plan.mdは作らない。
