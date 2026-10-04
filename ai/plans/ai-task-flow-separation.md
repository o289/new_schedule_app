# AIタスクとフローの分離：実行計画

この計画は承認済みの[人間向け計画書](../../human/html/ai-task-flow-separation-proposal.html)を実行可能な手順にしたものです。人間向け計画書にない要件を追加しません。Phase 1の承認は全Phaseを対象とし、各Phaseの品質確認がPASSしたら追加承認なしで次へ進みます。計画外のDB、依存、API、権限、仕様、設定変更が必要な場合はREPLANとして停止します。

## 目的と範囲

AI作業を再利用可能な8タスクと実装フローに整理します。人間向け計画書作成とAI向け計画書作成を準備タスクとして定義し、その後の固定フローを「計画書読み取り → コード生成 → テスト → PR作成 → レビュー」とします。

最終構成は次の8タスクとフローです。

1. `human-plan-task.md`：要求・規模・範囲・Phase・受入条件・QA/E2E判断を決め、人間向けHTML計画書を記述する。
2. `ai-plan-task.md`：チャット上の本人の明示承認後にAI向けMarkdown計画書を作成する。Phase 2の移行時に限り、当時の既存run `plan.md`の必要要素を取り込んだ。現在のフローはrun内`plan.md`への継続依存を持たない。
3. `plan-reading-task.md`：両計画書とGit実体を読み、実装コンテキストを作る。
4. `ui-mock-task.md`：新規UI機能の場合のみ、既存UIに沿ったPNGと再現条件を作る。
5. `code-generation-task.md`：承認範囲の差分を実装する。
6. `test-task.md`：typecheck、test、Docker正式verify、独立した技術QAと仕様QA、計画されたE2Eを扱う。
7. `pr-creation-task.md`：QAと正式verifyのPASS後、許可されたbranchへ公開し、CIまたはPR条件を確認する。
8. `review-task.md`：タスク別diff資料を作り、人間レビューへ引き継ぐ。

成果物は8タスク文書、`.agents/instructions/flows/implementation-flow.md`、入口・共通契約・必要な計画テンプレートの参照同期です。Phase 3では新構成の作成と参照移行を行い、廃止機能の残骸削除はPhase 4に分けます。

### 変更範囲

対象は8タスク文書、実装フロー、`AGENTS.md`、`.agents/instructions/AGENTS-DETAILS.md`、必要な場合の`templates/IMPLEMENTATION_PLAN_TEMPLATE.md`と`.html`、および新規run状態管理・legacy handoff参照の移行です。Phase 3は作成と参照更新に限り、候補機能を先行削除しません。Phase 4は参照・依存・実行経路を調べ、不要と確定した残骸だけを削除します。

追跡済みの歴史run履歴とlegacy `docs/**`、製品コード、DB/migration、依存、API、権限、公開正本の現役ガードは保全します。Phase 2.5で承認された開発用compose設定だけをローカル固定値へ変更し、production/stagingのSecretsやcomposeは変更しません。DB Schema、migration、依存、API、権限変更はありません。製品UI変更はなく、E2Eは不要です。仕様QAで不要理由を記録します。

### 進行と承認

準備では人間向け計画書を作り、新規UI機能の場合は計画承認前にUIモックPNGと再現条件を用意して参照します。次にユーザー本人のチャットメッセージで全Phaseの明示承認を受け、その後AI向け計画書を作成します。承認の根拠に`approval.json`、`work.json`、HTML欄、外部ファイル、推測を使いません。チャット履歴を確認できない場合は承認済みと推定しません。

AI向け計画書と人間向け計画書の内容が一致することを確認してから実装フローへ進みます。不一致、入力成果物の不足、または新規UIでPNG・再現条件がない場合は停止します。計画書作成が終わったら、固定フローは計画書読み取り → コード生成 → テスト → PR作成 → レビューです。追加のPhase承認は不要です。

### 品質・公開境界

各Phaseは実装、必要なDB migration（承認済みSchema変更がある場合だけ）、正式Docker verify、PASSなら次Phaseの順です。正式verifyは次で実行します。

```sh
docker compose -f compose.dev.yml run --rm application sh -c 'pnpm install --frozen-lockfile && pnpm verify:phase'
```

`verify:phase`は`pnpm typecheck && pnpm test`です。typecheck失敗時はtestへ進まず、修正後に正式verifyを再実行します。技術QAと仕様QAは独立・並行に判定し、各項目をテストで担保できる場合は実装者とは別のread-only担当、困難な場合はメインが担当します。最終PASSはメインが保持し、両QAと正式verifyがPASSしてから公開します。E2Eは不要とする理由を記録します。

公開は`./.agents/tools/pr-agent-publish`を正本にします。`feature/vX.Y.Z`では同名originへ通常pushし、同一SHAのCI成功を確認します。大規模作業の`feature/<slug>-vX.Y.Z`では同名originへpushし、対応する`feature/vX.Y.Z`をbaseに通常PRを作成してhead/base/SHAを確認します。レビュー・承認・merge・merge後監視は人間の業務です。host Node.js 20ではpnpmを起動せず、`pnpm agent:publish`はNode.js 22が有効な人間terminalのaliasです。

## Phase 1：人間向け計画書の作成と承認

承認済みHTML計画書は[`human/html/ai-task-flow-separation-proposal.html`](../../human/html/ai-task-flow-separation-proposal.html)です。これに8タスク、承認後のAI計画書作成、Phase 3/4の分離、現行契約との移行関係、品質・公開境界を含めます。計画承認は全Phaseを対象とします。新規UI機能がないためUIモックは不要です。

**完了条件:** 人間が対象、順序、受入条件、リスク、現行契約との関係を確認できる計画書があり、本人の明示的なチャット承認がある。

## Phase 2：AI向け計画書作成と現行契約上の引継ぎ準備

実施時に、承認済みHTMLと当時の引継ぎ用run `plan.md`の必要な実行要素を本書へ統合し、その未追跡runコピー（`plan.html`・`plan.md`・`work.json`）は統合後に削除しました。独立planファイルの廃止を含む新構成への移行は完了しています。追跡済みの歴史run記録は変更せず保持し、現在フローのために同期・更新しません。今後も歴史run記録の更新を要求しません。

**完了条件:** 8タスク、準備→チャット承認→AI計画作成→実装フロー、Phase 3/4、受入条件、正式verify、QA、branch/CI/PR境界が承認HTMLと一致し、リンクが有効である。計画資料のみが対象で、AI指示Markdown本体にはまだ手を入れない。

## Phase 2.5：`.env.dev`なしでのローカル開発・verify

### 変更対象

- `compose.dev.yml`のみ。

### 実装内容

- applicationとdatabaseの`env_file: .env.dev`を削除し、ユーザーが提供したローカル専用固定値を各serviceの`environment`へ直接設定する。
- applicationのDB接続先はCompose内の`database` serviceにし、WebAuthn RP ID/originはlocalhostにする。Frontend API URLもローカルapplication portを参照する。
- これはdevelopment compose内だけのfixture設定。production/stagingのSecretsとcompose、公開用設定は変更しない。
- `.env.dev`ファイルは作成しない。

### 受入条件と検証

- `docker compose -f compose.dev.yml config --quiet`が成功する。値を含む設定出力は行わない。
- `.env.dev`がない状態でComposeのdevelopment applicationとdatabaseを起動できる。
- 現行の正式verify `docker compose -f compose.dev.yml run --rm application sh -c 'pnpm install --frozen-lockfile && pnpm verify:phase'`がPASSする。`verify:phase`はtypecheck→testの順。
- production/stagingはGitHub Secretsを使って`.env.prod`/`.env.stg`を生成・注入する既存経路を維持し、実値をdevelopment composeへ持ち込まない。

**完了記録:** Compose設定確認と`.env.dev`なしでの正式Docker verifyはPASSしました。Phase 3の正式Docker verifyもPASSしました。結果は本計画とチャット上の実施報告に記録し、追跡済みの歴史run記録は書き換えず保持します。一時的な未追跡runの引継ぎコピーは移行完了後に削除しました。

## Phase 3：8タスク構成の作成と参照移行

Phase 2.5の変更と3項目の確認が完了してから開始する。

### 対象ファイル・領域

- `.agents/instructions/tasks/human-plan-task.md`
- `.agents/instructions/tasks/ai-plan-task.md`
- `.agents/instructions/tasks/plan-reading-task.md`
- `.agents/instructions/tasks/ui-mock-task.md`
- `.agents/instructions/tasks/code-generation-task.md`
- `.agents/instructions/tasks/test-task.md`
- `.agents/instructions/tasks/pr-creation-task.md`
- `.agents/instructions/tasks/review-task.md`
- `.agents/instructions/flows/implementation-flow.md`
- `AGENTS.md`、`.agents/instructions/AGENTS-DETAILS.md`、必要な計画テンプレート
- `work-schema.ts`、新規run状態管理を参照する関連テスト、`pr-agent-publish.ts`のlegacy handoff schema利用箇所（依存・参照を調査して移行）
- 既存6タスク文書（内容移行後の扱いはPhase 4で決定）

### 作業順

1. AI向け計画書と人間向け計画書の整合を再確認する。
2. 8つのtask文書を作り、各々に目的、担当・権限、開始条件/入力、手順、禁止事項、成果物/完了条件、失敗時、次タスクへの引継ぎを記載する。
3. 薄い`implementation-flow.md`を作り、計画作成を実装フロー前の準備として扱い、固定順と全taskへの相対リンクを示す。
4. 入口、共通契約、必要なテンプレートの参照を新構成へ同期する。旧taskの削除や廃止機能の残骸削除はしない。
5. 実際の利用者と実行経路を調べ、run/work参照やlegacy handoff利用を新しい計画書参照へ移す。公開ツールの安全ガードは維持する。

### 受入条件

- 8 task文書とフローからのリンクがあり、指定順、各タスクの入出力、責務、停止条件、人間レビュー境界が一致する。
- 計画書読み取りの入力は承認済み人間向け計画書と、それを忠実に写し整合確認したAI向け計画書。
- 新規作業でrunId、`work.json`、`approval.json`、独立planファイルを作らない最終構成へ移行する。
- 追跡済みの歴史run配下の`plan.html`・`plan.md`・`work.json`は保持し、現在フローの入力・状態管理にせず、同期・更新しない。legacy `docs/**`も変更しない。移行用の未追跡runコピーは、内容統合後に削除済みです。
- 公開ツールのbranch、clean tree、origin、HEAD SHA、Docker verify、同一SHA CI、PR head/base/SHA確認を維持する。
- DB/migration、依存、API、権限、仕様、設定に計画外変更がない。
- E2E不要。その理由を仕様QAで記録する。

## Phase 4：廃止機能の残骸削除と最終検証

### 作業順と範囲

1. Phase 3の参照移行後、削除候補の依存、残存参照、実行経路を調査する。
2. 不要と確定した廃止機能の残骸だけを削除する。候補は新規run/work/approval/独立plan作成機能、`work-schema.ts`と新規run状態管理だけに使われるテスト、旧run/plan参照、未使用のlegacy handoff schemaや雛形、旧task文書。
3. 実利用が残る候補は削除せず、参照を移行する。
4. HTML構造と相対リンク、Markdownリンク、二計画書の一致、共通契約との矛盾、対象外差分を最終確認し、未解決事項・未実行検証を記録する。

追跡済みの歴史run履歴、legacy `docs/**`、公開正本の現役ガード、必要なDocker/QA/branch/CIの仕組みは維持します。残骸参照・依存・実行経路が残っていないことを確認します。計画外変更が必要ならREPLANとして停止します。

## 完了時の引継ぎ

変更ファイルと内容、Phaseごとの検証コマンド・結果、DB/migration/依存/API/権限/設定/生成物の有無、未実行検証、未解決事項、計画外変更の有無をメインへ渡します。技術QAと仕様QAの両PASS、最新の正式verify PASSをメインが差分とともに確認するまで品質PASS・公開可とは判定しません。
