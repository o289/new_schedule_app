# 今日の予定メール機能 AI向け実装計画

## 概要と範囲

- 目的：利用者本人のJST当日予定を、設定した曜日・時刻にメールで通知する。
- 課題：通知設定、送信履歴、worker、メールテンプレート、Providerが未実装である。
- DB Schema/migration：`email_notification_preferences`、`email_notification_weekday_rules`、`email_delivery_logs`を追加し、Phase 1でmigrationを生成・確認・適用する。
- 依存：Phase 2でBrevo公式Node.js SDK `@getbrevo/brevo`をexact指定で追加する。Fake Providerは外部Brevoへ接続せずAPI key不要とする。
- API：本人の通知設定を7曜日分まとめて取得・更新する認証APIを追加する。
- 権限：本人の設定と本人所有予定だけを扱う。有効セッションが0件のユーザーはworkerが送信対象から除外する。
- 仕様：全体ON/OFF、ISO曜日1〜7のON/OFF、00:00〜23:30の30分刻み、JST固定、予定0件抑止、同一ユーザー・同一日の重複抑止、限定retry、delivery logを実装する。
- 設定：Provider選択名と環境変数名は候補として実装時に確定する。devはFake固定でsecret不要、staging/prodはBrevoを環境ごとの実行時secretで使う。stagingで受信・表示を確認し、prodは通常配信経路を扱う。
- UIモック：Phase 4の実装前確認用に、既存プロフィール画面のコンポーネントと共通CSSを使ったdesktop/mobile画像を用意する。再現条件と参照先は人間向け計画書に記載する。
- 対象：`packages/schemas`、`apps/backend/features/email-notification`、`apps/backend/workers`、`apps/backend/database`、Compose/Dockerfile、環境別env、プロフィールUI、E2E候補、Brevo adapter。
- 対象外：Mailpit等の新依存、開発環境からのBrevo実メール送信、本番での実操作、既存EventCardのメール転用、外部job/APIからの定期実行、認証方式変更。
- 人間向け計画書：`docs/html/今日の予定メール機能_実装計画.html`
- QA/E2E：技術QAと仕様QAを独立実施する。開発E2EはFake Providerで外部送信なし。実メールの受信・表示はstagingで確認する。コード/UI動作変更後はPhase 4でE2Eを実施する。
- 固定実装フロー：計画書読み取り → コード生成 → テスト → PR作成 → レビュー。書き込み担当はLuna、最終品質判定はメインが保持する。

## Phase 1：契約・DB・migration・曜日別設定API

### 変更対象・実装内容

- 対象：`packages/schemas/email-notification.ts`（候補）、`apps/backend/features/email-notification/{model,repository,service,router}.ts`（候補）、`apps/backend/database/schema.ts`、`apps/backend/app.ts`、Drizzle migration。
- 対象外：メールProvider、worker、Brevo SDK、プロフィールUI。
- 変更理由：通知設定と送信履歴を永続化し、本人が7曜日の設定を一括管理できる契約を先に確定する。
- 実装：3テーブル、index、`unique(userId, dayOfWeek)`、`unique(userId, localDate)`、7曜日一括取得・一括更新API、認証・所有者境界、globalEnabled・曜日enabled・HH:mmの30分境界をZod/Serviceで検証する。曜日欠落のpartial更新は許可しない。

### 受入条件

- [x] migration reviewとローカル開発DBへの適用が完了する（`drizzle/0009_sleepy_captain_britain.sql`）。
- [x] 設定APIの認証、入力、所有者境界、7曜日一括更新テストがPASSする。
- [x] Node.js 22.23.1、typecheck、test、integration testがPASSする。
- [ ] E2Eは不要。APIとDB契約のPhaseであり、UIはPhase 4で確認する理由を記録する。

### 品質ゲートと引継ぎ

- [x] 必要なmigrationだけを生成し、SQL確認・適用する。
- [x] Docker正式verifyがPASSする（Node.js 22.23.1、typecheck、35 files / 179 tests）。
- [ ] 技術QAと仕様QAが独立してPASSし、メインが最終判定する。
- [x] 未実行検証、未解決事項、計画外変更の有無を記録する。
- [ ] 計画外のDB/API/依存/権限/仕様/設定変更が必要ならREPLANとして停止する。

## Phase 2：メールテンプレート・Provider adapter

### 変更対象・実装内容

- 対象：`apps/backend/features/email-notification/template.ts`、`provider.ts`（候補）、Backend package、lockfile、環境別Provider選択（候補名）。
- 対象外：workerのpoll/claim、プロフィールUI、devからの実メール。
- 変更理由：業務ロジックから外部SDKを分離し、通常QAをFake Providerで安全に行う。
- 実装：Provider interface、Fake Provider、Brevo公式SDK adapter、イベントカードのHTML/plain-text、入力escape、Brevoエラー分類を追加する。Fake Providerは外部Brevoへ接続せずAPI keyを要求しない。staging/prodだけ環境ごとの実行時secretを使う。SDK retryとworker retryは二重化しない。

### 受入条件

- [ ] 開発のFake Providerで宛先、件名、本文、API payloadを検証できる。
- [ ] staging/prodの選択設定でBrevoへ切り替えられる。
- [ ] API key欠落・不正、429、quota超過、一時障害、恒久障害の分類とretry方針を検証できる。
- [ ] HTML主要クライアントで崩れにくいinline CSSを確認する。
- [ ] Node.js 22.23.1、typecheck、testがPASSする。
- [ ] E2Eは不要。Fake Providerのunit/integrationで外部送信なしに担保する理由を記録する。

### 品質ゲートと引継ぎ

- [ ] `@getbrevo/brevo`をexact指定し、lockfileを確認する。
- [x] Docker正式verifyがPASSする（Node.js 22.23.1、38 files / 183 tests）。
- [ ] 技術QAと仕様QAが独立してPASSし、メインが最終判定する。
- [x] API key、本文、個人情報をログへ出さないことを確認する。
- [ ] 計画外の依存/API/設定変更が必要ならREPLANとして停止する。

### Phase 1/2 QA引継ぎ

- 技術QA：Node.js 22.23.1、typecheck、migration、unit/integration、Fake Provider、Brevo payload分類を確認済み。正式Docker verifyはPASS。
- 仕様QA：本人境界、7曜日一括設定、Fake外部接続なし、HTML escape、plain-text、secret/個人情報非ログをテスト根拠で確認済み。最終判定はメインが行う。

## Phase 3：worker・Compose・デプロイ

### 変更対象・実装内容

- 対象：`apps/backend/workers/daily-email.ts`（候補）、`compose.dev.yml`、`compose.stg.yml`、`compose.prod.yml`、Dockerfile、`package.json` scripts、環境別secret/healthcheck、Brevo運用手順。
- 対象外：本番DB操作、開発環境からのBrevo実メール送信、任意shell実行。
- 変更理由：JSTのdue ruleをworkerで処理し、claim・送信・履歴を安全に運用する。
- 実装：JSTの曜日・時刻と30分の許容窓、未送信当日対象claim、本人所有予定取得、送信直前の設定・有効session再確認、0件時Provider抑止、成功/失敗/retry/providerMessageId記録、複数worker・再起動耐性を実装する。retryはtemporary/rate_limitedだけを対象にし、quota/permanent/unknownはfailedで停止する。pendingは送信後クラッシュ時の不明結果を安易に再送せず保留する。Brevoの送信には同一user/dateのUUID idempotency keyを付けるが、timeoutの受付結果を確実に判定できる公式保証が確認できるまでtimeoutはunknownとして自動再送しない。dev ComposeはFake Provider固定で外部Brevoへ接続しない。staging/prodは環境ごとの実行時secretでBrevoへ切り替える。設定名は候補として実装時に確定し、欠落設定は既存入力検証に従い起動失敗とする。

### 受入条件

- [ ] 開発ComposeでFake workerとPostgreSQLの接続を確認する。
- [ ] due判定、poll取り逃し、再起動、同日設定変更、重複worker、retry、API障害/quota超過、0件抑止のintegration testがPASSする。
- [ ] 送信直前の全体ON/OFF、曜日ON/OFF、時刻変更、session失効を再評価し、他人予定を除外する。
- [ ] 開発Fake経路で外部Brevoへ接続しないことを確認する。
- [ ] stagingのBrevo経路で受信とメール表示を確認し、prodは通常配信経路を確認する。
- [ ] Node.js 22.23.1、typecheck、testがPASSする。
- [ ] E2EはUI未実装のため不要。worker/integrationで担保する理由を記録する。

### 品質ゲートと引継ぎ

- [ ] Docker正式verifyがPASSする。
- [ ] 技術QAと仕様QAが独立してPASSし、メインが最終判定する。
- [ ] dev Fake経路、staging受信、prod通常配信、secret非出力を確認する。
- [ ] staging/prod secretやCompose設定を計画外に広げない。
- [ ] 仕様・設定・権限・依存の追加判断が必要ならREPLANとして停止する。

## Phase 4：プロフィール通知UI・E2E

### 変更対象・実装内容

- 対象：既存Dashboardの`CalendarContext`/`CalendarAside`/`ScheduleCalendarPage`、notification settings component、`apps/frontend/lib/api.ts`、`queryOptions.ts`、`queryKeys.ts`、`e2e/email-notification.spec.ts`。既存`/setting`のプロフィール編集は維持し、通知UIはDashboardのaside modeへ統合する。
- 対象外：開発からの実メール送信、staging/prodの本番運用操作、認証方式変更。今回のPhase 4 QAではstaging実環境を扱わない。
- 変更理由：利用者が全体ON/OFFと7曜日の送信条件をプロフィールから安全に設定できるようにする。
- 実装済み：Dashboardの既存aside modeに通知設定を追加し、URLを`/dashboard`のまま初期OFF、7曜日のON/OFF、30分刻みselect、一括保存・再読込、保存成功/失敗/読み込み中/未設定表示、全曜日OFF時の説明を提供する。開発E2EはFake Providerで外部Brevoへ接続せず、staging実環境の受信確認は今回の対象外とする。

### 受入条件

- [x] 7曜日設定、全体ON/OFF、30分選択肢、全曜日OFF、APIエラーのE2EがPASSする。
- [x] 開発Fake経路で宛先・件名・本文・送信条件・重複防止・delivery logを確認する。
- [x] staging Brevo経路での実操作は今回の対象外として明記する。
- [x] Node.js 22.23.1、typecheck、testがPASSする。
- [x] responsive/accessibilityを確認する。

### 品質ゲートと引継ぎ

- [x] E2Eは開発Fake、実メールなしでPASSする。
- [x] staging実環境を操作せず、dev Fakeとローカル構成検証に限定する。
- [x] Docker正式verifyがPASSする。
- [x] 技術QAと仕様QAがPASSし、メインが最終判定する。
- [ ] 計画外のUI/API/設定変更が必要ならREPLANとして停止する。

### UIモック（Phase 4開始前の確認入力）

- desktop：`human/images/mock-today-email-desktop-enabled.png`（1440×900）。
- mobile：`human/images/mock-today-email-mobile-enabled.png`（390×844）。
- 状態：全体ON、月・火・木ON、その他OFF、OFF曜日の時刻select無効。既存プロフィール画面のカード幅・余白と共通CSSを使い、mobileでは曜日行を縦積みにする。
- 実装前に人間が表示と再現条件を確認済み。画像自体はプロダクトコード・新規依存ではない。

## Phase 3ローカル運用手順

- devは`EMAIL_PROVIDER=fake`固定で`docker compose -f compose.dev.yml up --build`を使う。Fakeは外部Brevoへ接続せず、API key不要。
- staging/prodはそれぞれのenv fileへBrevo選択、検証済みsender、対応する実行時secretを注入してworker serviceを起動する。secretをGit、DB、本文、通常ログへ保存しない。
- workerはmigration適用後に起動し、healthcheckのheartbeat停止をworker停止・DB/Provider障害の兆候として扱う。
- delivery logの`temporary`/`rate_limited`だけを最大3回retryする。`quota`、`permanent`、`unknown`は再送せず、特にBrevo timeoutは受付結果不明のため`unknown`としてpending/failedの状態を人間が確認する。
- stale `pending`は送信済みの可能性があるため自動再送しない。同日再送が必要な場合は運用判断とし、履歴削除で回避しない。
- Phase 3のローカル技術QAはPASS。staging受信・表示とprod通常配信は今回の対象外とする。Phase 4のUI mockは承認済み。

## 全Phase完了条件

- [ ] 各Phaseの受入条件を満たしている。
- [ ] Docker正式verifyがPASSしている。
- [ ] devはFakeのみでBrevo API key不要、staging/prodは環境ごとのsecretでBrevoを使う。
- [ ] stagingの実メール受信・表示確認とprod通常配信の確認が完了している。
- [ ] 計画外の差分がない。
- [ ] 公開、push、PR、merge、branch削除はメイン/人間の担当範囲であり、Lunaは実施しない。

## 最終QA・親レビュー記録（2026-10-04）

- Docker正式verify PASS: `docker compose -f compose.dev.yml run --rm application sh -c 'pnpm install --frozen-lockfile && pnpm verify:phase'`。Node.js 22.23.1、typecheck PASS、unit 39 files / 201 tests PASS、1 integration file / 9 testsは通常verifyではskip。
- DB integration PASS: `docker compose -f compose.test.yml run --rm integration-test`、1 file / 9 tests PASS。恒久失敗後も`attemptCount=1`を保持する確認を含む。
- Browser E2E PASS: `e2e/email-notification.spec.ts`と既存`e2e/authenticated.spec.ts`、計9 tests PASS。dev Fakeのみで実メール・staging操作なし。
- 実ブラウザ画面: desktop 1440×900とmobile 390×844で通知設定を確認。mobileは7曜日、全曜日OFF時の送信停止文言、保存ボタンまでスクロールして確認。画像は`test-results/email-notification-desktop.png`、`test-results/email-notification-mobile.png`、`test-results/email-notification-mobile-bottom.png`。
- Node 22 host typecheck、unit test 201、frontend build、対象ファイルformat checkもPASS。compose.dev/e2e/test構文確認PASS。stg/prod Composeは実環境変数`MIGRATION_IMAGE`未注入のためconfig確認対象外。
- 独立技術QAの指摘2点（恒久失敗時attemptCount改変、Provider前DB例外によるpending放置）を修正し、回帰テストで確認。独立QA agentの再開はagent thread limitで拒否されたため、親が最終ソース/UIのread-only確認を行い、仕様QA・品質判定をPASSとした。
- staging実メール受信とprod通常配信はユーザーが今回明示した対象外。外部環境操作をしていないため、全Phase完了条件の該当2項目は未完了のままとする。
- 初回push後の同一SHA CIはPrettier確認だけが失敗し、対象は`drizzle/meta/_journal.json`、`drizzle/meta/0009_snapshot.json`、`pnpm-lock.yaml`。3ファイルだけを整形し、JSON/YAMLのparse結果が整形前と同一で依存version・schema値に変更がないことを確認。Node.js 22で全体`pnpm format:check`と`pnpm rules:check`がPASSした。修正commitと正本publisher再実行後、同一SHA CIの成功を確認する。
