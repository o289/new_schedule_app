# AIエージェント開発規則（共通契約・索引）

この文書、リンク先の8 task文書、実装フローをAI作業手順の正本とする。task固有の手順は各文書に置き、共通ルールを重複記載しない。

## Task索引

準備：

- [01 人間向け計画書作成](tasks/human-plan-task.md)
- [02 AI向け計画書作成](tasks/ai-plan-task.md)
- [04 UIモック画像作成（新規UI機能のみ）](tasks/ui-mock-task.md)

実装フロー [implementation-flow.md](flows/implementation-flow.md)：

1. [03 計画書読み取り](tasks/plan-reading-task.md)
2. [05 コード生成](tasks/code-generation-task.md)
3. [06 テスト・QA](tasks/test-task.md)
4. [07 PR作成](tasks/pr-creation-task.md)
5. [08 レビュー](tasks/review-task.md)

## 計画と引き継ぎ

引き継ぎは承認済み人間向けHTML計画書、内容を忠実に写したAI向けMarkdown計画書、ユーザー本人のチャット承認、Git実体（branch、HEAD、差分）の順で確認する。承認は本人の明示的なチャットメッセージだけを受け取り、approval.json、work.json、HTML欄、外部ファイル、推測を使わない。

中規模以上はAI向け計画書作成前に人間向けHTML計画書を作り、全Phaseの承認を求める。新規UI機能は必要なMock PNGと再現条件を承認前に計画へ含める。承認後にAI向けMarkdown計画書を作成し、両計画書の整合を確認してから実装フローを始める。独立したrun内plan.html/plan.md、runId、work.json、approval.jsonを新規作業で作成しない。既存run履歴とlegacy docs/**は変更・削除しない。

- 小規模変更は計画書を省略できる。対象/対象外、QA担当、E2E要否、REPLAN条件を確認する。
- 計画承認は全Phaseを対象とする。Phaseごとの追加承認は求めない。
- 各Phaseは実装 → 必要なDB migration → Docker正式verify → PASSなら次Phase。FAILなら原因修正後に再verifyする。
- 計画にないDB、依存、API、権限、仕様、設定変更が必要な場合だけREPLANで停止し、計画を直して再承認を得る。

## 実装と品質ループ

書き込み担当は同時に1人だけとする。実装規模に応じ担当を指定し、メインが計画と品質最終判定を保持する。正式verifyは次のコマンドとし、verify:phaseはpnpm typecheck && pnpm test。typecheck失敗中はtestへ進まない。

    docker compose -f compose.dev.yml run --rm application sh -c 'pnpm install --frozen-lockfile && pnpm verify:phase'

Schema変更が承認済み計画にある場合だけpnpm db:generate、生成SQL確認、ローカルDBへのpnpm db:migrate、必要なintegration testを行う。変更がなければmigrationを作らない。

技術QAと仕様QAは独立・並行に判定する。各Phaseでテスト担保可能なら実装者と別のread-only担当、困難ならメインが担当する。最終PASSはメインが保持し、両QA PASS後だけ公開へ進む。仕様QAがE2E実行責務を持ち、技術QAは代行しない。E2E不要時は理由を記録する。

## 主要なコード規則

- Frontend、Backend、packagesのimport境界を守り、packagesからappsをimportしない。
- BackendはRouter（HTTP入出力）→ Service（認可・業務ルール）→ Repository（DB操作）→ Model/databaseの責務分離を守る。
- HTTP入力、環境変数、外部レスポンスを信用せず、既存のZod Schemaと共通API契約を使う。
- any、@ts-ignore、検査回避の二重cast、未処理Promise、debug logを追加しない。日時は既存の日本時間wall-clock契約を守り、意図しないUTC変換や末尾Zを追加しない。Token、credential、秘密鍵、Join Code、個人情報をログやGitへ出さない。秘密情報は実行時環境から読み、ファイルへ保存しない。

## Branch、公開、禁止事項

通常作業はfeature/vX.Y.Z、大規模だけ承認後に`feature/<slug>-vX.Y.Z`を作る。正式Docker verify PASS後に公開する。feature/vX.Y.Zは同名originへ通常pushし、同一SHAのCI成功を確認してAI作業を完了する。`feature/<slug>-vX.Y.Z`は同名originへpushし、対応するfeature/vX.Y.Zをbaseに通常PRを作成し、head/base/SHAを確認してAI作業を完了する。公開正本は./.agents/tools/pr-agent-publishだけとする。host Node.js 20ではpnpmを起動しない。pnpm agent:publishはNode.js 22が有効な人間terminalのaliasである。main push、force push、branch削除、任意remote/refspec、merge、DB削除、本番DB操作、docker compose down -v、正式Docker verify PASS前の公開、version branchで同一SHAのCI成功確認前の完了判定、任意shell実行を行わない。レビュー、承認、merge、merge後監視は人間の業務である。

## 完了時の引き継ぎ

変更ファイル、実装内容、テスト、DB/migration/依存/設定/生成物の有無、実行コマンドと結果、未実行検証、未解決事項、計画外変更の有無をメインへ返す。品質PASSはメインが実際の差分とDocker正式verifyを確認して判定する。
