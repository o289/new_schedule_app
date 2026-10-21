# Schedule重複上書き設定

## 概要と範囲

- 目的：既存予定Aの `allowOverwrite` がtrueなら、後発予定Bの追加時にA側の重複日程だけを除き、Bを登録する。
- 課題：現在は時間区間が重なると `SCHEDULE_TIME_OVERLAP` の409を返す。
- DB Schema/migration：`schedules.allow_overwrite boolean NOT NULL DEFAULT false` を追加する。Drizzle migrationを生成しSQLを確認してローカルDBへ適用する。既存予定はfalseのまま従来動作を維持する。
- 依存：変更しない。
- API：createはfalseをdefault、updateはoptional、responseはrequired boolean。作成responseの形は変えず、新規作成時だけ上書き処理を行う。
- 権限：変更しない。同一userの予定だけを重複対象とする。
- 仕様：重複date row全体をAから削除し、非重複rowは維持。Aのdatesが0件ならA本体も削除し、既存FK cascadeでtodosも削除する。user/categoryは削除しない。B自身のflagはBが将来上書きされる許可。false設定との衝突が一件でもあれば全体をConflictでrollback。B内重複と既存予定の編集時の重複は従来どおり拒否。端点接触は非重複。
- 設定：`allowOverwrite` default false。
- UIモック：該当なし。既存ScheduleAsideFormに設定checkboxを追加する。
- 対象：Schedule model/schema/repository/router、schedule作成・編集UIと型、重複処理、schedule/group-calendar cache、Drizzle migration、関連テスト。
- 対象外：schedule全体の一般的な重複許可、重複時間の切詰め・row分割、更新APIでの自動上書き、依存更新、staging/prod操作。
- 人間向け計画書：[予定重複上書き設定](../../docs/html/予定重複上書き設定_実装計画.html)（docsは既存ignore規則でGit管理対象外）。
- QA/E2E：技術QAと仕様QAを独立に実施。新しいフォーム操作と作成結果を仕様QAがE2E確認する。
- 承認：ユーザー本人が2026-10-21に上記HTML全内容を明示承認。
- 固定実装フロー：計画書読み取り → コード生成 → テスト → PR作成 → レビュー。

## Phase 1：Model/API

### 変更対象・実装内容

- 対象：`apps/backend/features/schedule/model.ts`、`packages/schemas/schedule.ts`、`apps/backend/features/schedule/repository.ts`、`apps/backend/features/schedule/router.ts`、`apps/frontend/components/schedules/useScheduleForm.ts`（初期false）、`scheduleFormAdapter.ts`、ScheduleResponse fixtures、関連schema/router/API integration tests、Drizzle生成migration/meta。
- 対象外：重複解決、ロック変更、フォームUI/cache、group calendar、E2E。これらは後続Phase。
- 変更理由：永続化されたbooleanをSchedule API契約に追加し、false既定を保証する。
- 実装：Drizzle modelにboolean NOT NULL DEFAULT falseを追加。Zod createはdefault false、updateはoptional、responseは必須にする。Repository create/updateとrouter response projectionでfieldを通す。frontendフォームの型初期値とresponse adapterもfalse/response値を保持するが、checkbox UIはまだ追加しない。request/responseの全利用箇所とfixturesを確認し、false default・true/false更新・response必須をテストする。GroupCalendar DTOはScheduleResponseと別型でschedule model flagを含まないため変更しない。

### 受入条件

- [x] migration SQLは既存データをfalseで保ち、DB上でNOT NULL DEFAULT false。
- [x] Createで未指定ならfalse、true/falseを受理。Updateでは省略とtrue/falseを区別。Responseではfield必須。
- [x] Schedule作成・取得・更新のDB/API経路で値を保持する。
- [x] Phase 1で重複動作は変わらない。
- [x] 計画外のresponse shape/API/DB変更がない。
- [x] E2E：不要。Phase 1はformや重複動作を変更せず、unit/API/integration testsと正式verifyで確認した。

### 品質ゲートと引継ぎ

- [x] `pnpm db:generate`、生成SQLとsnapshot/journal確認、ローカルDBへ`pnpm db:migrate`。
- [x] schedule schema/router/repository tests、DB integration testを実行。
- [x] Node.js 22.23.1を明示した状態でDocker正式verifyを実行：`docker compose -f compose.dev.yml run --rm application sh -c 'pnpm install --frozen-lockfile && pnpm verify:phase'`。
- [ ] 技術QAと仕様QAが独立してPASSし、メインが最終判定する。
- [ ] FAIL時はPhase 1内で修正し、該当テストと正式verifyを再実行。
- [x] Phase 1のPASS結果とdiffを親へ返し、親の次Phase指示までPhase 2を開始しない。
- [x] 未実行検証、未解決事項、計画外変更の有無を記録する。
- [x] DB/migration/API/schema以外の変更が必要ならREPLANして停止する。

## Phase 2：Atomic create

- 状態：実装・専用DB integration・Node 22 typecheck・正式Docker verify 完了。migration triggerは変更していない。
- 受入結果：createはtrue既存予定だけを許可し、false衝突混在時は全状態を保ったConflict。部分日程row、A空時の親/Todo cascade、外部キー失敗時rollback、同時create/create・create/update・create/deleteをcompose.test app_test DBで確認（11/11 integration PASS）。正式Docker verifyはexit 0、201 unit tests PASS。

- 同一user advisory lockを最初に取り、最新のA/flag/date rowsを読み、false衝突を先に判定する。falseが一件でもあれば変更せずConflict。
- 全衝突Aが許可済みの場合のみ、重なるdate rowを丸ごと削除し、datesが0件のA本体を削除し、最後にBをinsertする。同一transactionで失敗時は全てrollback。
- B内date重複は引き続きConflict。既存triggerのuser単位lockと重複チェックを維持する。trigger変更は実装・SQL確認で必要と判定された場合だけ。
- Schedule datesのupdate/deleteとflag-only updateも同じuser lockで直列化し、create判定との競合を防ぐ。既存予定編集時の重複はConflictのまま。
- QA：複数A、同一user/別user、false混在、部分重複row、日跨ぎ、B内重複、全row削除とtodo cascade、同時create/update/delete、DB error rollback。

## Phase 3：Frontend

- `ScheduleAsideForm`のcreate/editにcheckboxを追加。create default false、editは保存値を表示する。
- API response形式は維持し、作成後にschedule listおよびgroup calendarなど影響するcacheを無効化する。
- 技術/仕様QAとE2EでA/Bの一覧・詳細・checkbox操作、成功/Conflict表示を確認する。
- 状態：既存フォーム内のswitchと説明文を実装、初期OFFと編集時の値保持をE2Eで確認。作成/更新/削除成功後に個人schedule listとgroup calendar cacheをinvalidate。frontendにTodo query/cacheは存在せず追加無効化対象なし。
- E2E：schedule/mobile対象をNode.js 22で実行し5/5 PASS（setup込み）。既存のdesktop 1440×900 / mobile 390×844表示確認と、Phase 4追加の実backend A/B上書きcaseを実施。後者はAをAPIで2日程作成し、UIからBを作成、reloadなしのcalendar反映、Aの残存日程とBのAPI状態を確認する。月末にAの非重複日を同月前日へ調整する。スクリーンショット用コードはテストから除去し、画像はignored artifacts。

## Phase 4：QA

- 状態：親の最終品質判定はPASS。独立技術・仕様QA、実差分、追加E2E、最終品質ゲートを確認済み。計画外差分なし。

- 受入条件：false混在時はA/Bすべて不変、許可Aの重複rowだけ削除、非重複row保持、dates 0のAは関連todoを含めてcascade削除、transaction failure時はDB state完全復元。
- [x] 技術QA：同一user advisory lockが既存triggerと一致し、create/update/delete/flag-onlyを直列化する。transaction内で最新衝突を判定し、false混在時rollback、true行の削除、dates 0の親削除と既存todo cascade、B insert失敗時の全状態復元を確認。
- [x] 仕様QA：同一userだけの衝突、false defaultとtrue許可、重複date row全体削除、非重複日維持、親0件時のtodo cascade、編集時Conflict、画面文言/初期OFF/編集値/cache invalidationが承認仕様と一致。
- [x] DB integration：専用app_test DB 11/11 PASS（rollback、false混在、cascade、同時create/create/update/deleteを含む）。
- [x] 仕様E2E：追加A/Bケースはsetup込み2/2 PASS、`--retries=0`。schedule/mobile全体は5/5 PASS（setup込み）。追加fixtureの日付を月内にする修正後も追加caseを2/2再実行。
- [x] 最終正式Docker verify：`docker compose -f compose.dev.yml run --rm application sh -c 'pnpm install --frozen-lockfile && pnpm verify:phase'` exit 0。Node 22.23.1、typecheck PASS、201 tests PASS。統合11件はこのcompose runではDB未指定でskipだが、専用DB runは上記11/11 PASS。
- [x] 最終 `format:check` と `git diff --check` PASS。
- [x] 親の最終品質判定：技術QA・仕様QA・正式verify・追加E2E・UI目視を含めPASS。
- transaction失敗のrollbackは変更前stateを復元するが、導入後に成功して削除した過去日程はコードrollbackでは戻らない。必要時は事前backupからの復元を運用判断する。

## 全Phase完了条件

- [x] 各Phaseの受入条件を満たしている。
- [x] Docker正式verifyがPASSしている。実行後の変更はE2E fixtureの日付を月末前後で安定させる小変更とPrettier整形のみで、fixtureの意味を再実行で確認済み。
- [x] 計画外の差分がない。
- [ ] feature/v3.2.3の公開は、正式verify PASS後に人間の指示を受け、公開正本契約に従う。
