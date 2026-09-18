# AIエージェント開発規則（共通契約・索引）

この文書とリンク先の5タスク文書をAI作業手順の正本とする。タスク固有の手順は各文書に置き、共通ルールを重複記載しない。

## タスク索引

- [01 計画書作成](tasks/01-planning.md)
- [02 実装](tasks/02-implementation.md)
- [03 技術品質管理](tasks/03-technical-qa.md)
- [04 仕様品質管理](tasks/04-specification-qa.md)
- [05 PUSH・PR作成](tasks/05-publish-pr.md)

## 共通データと引き継ぎ順

引き継ぎ時は`ai/runs/<runId>/work.json`、同じrunの`plan.md`、Gitの実体（現在branch、HEAD、差分）の順で読む。`work.json`は`goal`、`currentPhase`、`nextAction`、`lastVerification`、`blocker`、`updatedAt`の6項目だけを持ち、branch、SHA、hash、期限、event log、state machine、evidence pathは保存しない。plan.mdの完了項目は`[ ]`から`[x]`へ更新する。既存run履歴とlegacyの`docs/**`は変更・削除しない。

## 計画、Phase、REPLAN

- 小規模変更は計画書を作らず実装・品質確認へ進む。中規模以上は実装前に人間向けHTMLとAI向けplan.mdを作り、ユーザーの承認を得る。
- 計画承認は全Phaseへの承認であり、Phaseごとの追加承認は求めない。
- 各Phaseは「実装 → 必要なDB migration → Docker正式verify → PASSなら次Phase」。FAILなら原因修正後に再verifyする。
- 計画にないDB、依存、API、権限、仕様、設定の変更が必要な場合だけREPLANで停止し、計画を直して再承認を得る。

## 実装と品質ループ

書き込みサブエージェントは同時に1つだけとする。高モデル時は小規模をLuna、中・大規模をTerraへ委譲し、メインが計画と品質判定を保持する。正式verifyは`docker compose -f compose.dev.yml run --rm application sh -c 'pnpm install --frozen-lockfile && pnpm verify:phase'`で実行し、`verify:phase`は`pnpm typecheck && pnpm test`とする。typecheck失敗中はtestへ進まない。DB Schema変更が承認済み計画にある場合だけ`pnpm db:generate`、生成SQL確認、ローカルDBへの`pnpm db:migrate`、必要なintegration testを行い、変更がなければmigrationを作らない。

技術QAと仕様QAは独立・並行に判定する。各Phaseでテスト担保可能かを決め、可能なら実装者と別の読み取り専用サブエージェント、それ以外はメインが担当する。最終PASSはメインが保持し、両QA PASS後だけ公開へ進む。仕様QAがE2E実行責務を持ち、技術QAは代行しない。E2E不要時は理由を記録する。

## 主要なコード規則

- Frontend、Backend、packagesのimport境界を守り、`packages`から`apps`をimportしない。
- BackendはRouter（HTTP入出力）→ Service（認可・業務ルール）→ Repository（DB操作）→ Model/databaseの責務分離を守る。
- HTTP入力、環境変数、外部レスポンスを信用せず、既存のZod Schemaと共通API契約を使う。
- `any`、`@ts-ignore`、検査回避の二重cast、未処理Promise、デバッグログを追加しない。日時は既存の日本時間wall-clock契約を守り、意図しないUTC変換や末尾`Z`を追加しない。Token、credential、秘密鍵、Join Code、個人情報をログやGitへ出さない。秘密情報は実行時の環境から読み、ファイルへ保存しない。

## Branch、公開、禁止事項

通常作業は`feature/vX.Y.Z`、大規模だけ承認後に`feature/<slug>-vX.Y.Z`を作る。正式Docker verify PASS後に公開する。`feature/vX.Y.Z`は同名originへ通常pushし、同一SHAのCI成功を確認してAI作業を完了する。`feature/<slug>-vX.Y.Z`は同名originへpushし、対応する`feature/vX.Y.Z`をbaseに通常PRを作成し、head/base/SHAを確認してAI作業を完了する。公開正本は`./.agents/tools/pr-agent-publish`だけとする。host Node.js 20ではpnpmを起動しない。`pnpm agent:publish`はNode.js 22が有効な人間terminalのaliasである。main push、force push、branch削除、任意remote/refspec、merge、DB削除、本番DB操作、`docker compose down -v`、正式Docker verify PASS前の公開、version branchで同一SHAのCI成功確認前の完了判定、任意shell実行を行わない。レビュー、承認、merge、merge後監視は人間の業務である。

## 完了時の引き継ぎ

変更ファイル、実装内容、テスト、DB・migration・依存・設定・生成物の有無、実行コマンドと結果、未実行検証、未解決事項、計画外変更の有無をメインへ返す。品質PASSはメインが実際の差分とDocker正式verifyを確認して判定する。
