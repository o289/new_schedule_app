# AIエージェント開発規則

この文書だけをAI作業手順の正本とする。引き継ぎ時は`ai/runs/<runId>/work.json`、同じrunの`plan.md`、Gitの実体（現在branch、HEAD、差分）の順で読む。

`work.json`はgoal、currentPhase、nextAction、lastVerification、blocker、updatedAtだけを持つ共有メモとする。branch、SHA、hash、期限、event log、state machine、evidence pathは保存せず、branchとSHAはGitから取得する。run履歴とlegacyの`docs/**`は変更・削除しない。計画MDの完了項目は`[ ]`から`[x]`へ更新する。

## 計画とPhase

- 小規模変更は計画書を作らず、実装・品質確認へ進む。
- 中規模以上は、実装前に人間向けHTMLとAI向け`plan.md`を作り、ユーザーの承認を得る。
- 計画承認は、その計画に書かれた全Phaseへの承認である。Phase完了ごとの追加承認は求めない。
- 計画にないDB、依存、API、権限、仕様、設定の変更が必要になった場合だけREPLANで停止し、計画を直して再承認を得る。

## 実装と品質ループ

- 書き込みを行うサブエージェントは同時に1つだけ。高モデル時は小規模をLuna、中・大規模をTerraへ委譲し、メインが計画と品質判定を保持する。
- 各Phaseは、実装 → 必要なDB migration → Docker正式環境で`pnpm verify:phase` → PASSなら次Phase、FAILなら原因修正後にverify再実行、の順で進める。
- 正式verifyは`docker compose -f compose.dev.yml run --rm application sh -c 'pnpm install --frozen-lockfile && pnpm verify:phase'`で実行する。
- `verify:phase`は`pnpm typecheck && pnpm test`である。typecheck失敗中にtestへ進まない。
- DB Schema変更が承認済み計画にある場合だけ`pnpm db:generate`、SQL確認、ローカルDBへの`pnpm db:migrate`、必要なintegration testを行う。Schema変更がなければmigrationを作らない。
- E2Eが必要な変更だけ既存のE2E手順を使い、不要なら理由を報告する。

## 主要なコード規則

- Frontend、Backend、packagesのimport境界を守る。`packages`から`apps`をimportしない。
- BackendはRouter（HTTP入出力）→ Service（認可・業務ルール）→ Repository（DB操作）→ Model / databaseの責務分離を守る。
- HTTP入力、環境変数、外部レスポンスを信用せず、既存のZod Schemaと共通API契約を使う。
- `any`、`@ts-ignore`、検査回避の二重cast、未処理Promise、デバッグログを追加しない。
- 日時は既存の日本時間wall-clock契約を守り、意図しないUTC変換や末尾`Z`を追加しない。
- Token、credential、秘密鍵、Join Code、個人情報をログやGitへ出さない。秘密情報は実行時の環境から読み、ファイルへ保存しない。

## Branchと公開

- 通常作業は`feature/vX.Y.Z`。大規模だけ承認後にそこから`feature/<slug>-vX.Y.Z`を作る。
- `feature/vX.Y.Z`は同名originへ通常pushし、同一SHAのCI成功でAI作業を完了する。
- `feature/<slug>-vX.Y.Z`は同名originへpushし、対応する`feature/vX.Y.Z`をbaseに通常PRを作成する。
- AIは公開正本の`./.agents/tools/pr-agent-publish`だけを使う。host Node.js 20ではpnpm自体を起動しない。`pnpm agent:publish`はNode.js 22が有効な人間terminalで使うaliasである。publishはDocker正式verifyがPASSした後だけpushし、機能branchでは通常PRのhead/base/SHAを確認する。
- `main`へのpush、force push、branch削除、任意remote/refspec、DB削除、本番DB操作、`docker compose down -v`、任意shell実行を行わない。
- AIの完了は必要なpushまたは通常PR作成まで。レビュー、承認、merge、merge後監視は人間の業務である。

## 引き継ぎ

実装完了時は、変更ファイル、実装内容、テスト、DB・migration・依存・設定・生成物の有無、実行コマンドと結果、未実行検証、未解決事項、計画外変更の有無をメインへ返す。品質PASSはメインが実際の差分とDocker正式verifyを確認して判定する。
