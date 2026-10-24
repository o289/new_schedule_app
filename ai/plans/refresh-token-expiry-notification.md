# リフレッシュトークン期限切れ時のログアウト通知

## 概要と範囲

- 現在の進行：Phase 1/2実装とPhase 3の期限切れ通知E2E・unit/integration QAが完了。最終sourceのDocker正式verifyもPASS。独立技術/仕様QAと最終判定はメイン担当。

- 目的：opaque refresh tokenの期限切れを次回refresh時に正確に判定し、その場合にだけ既存Snackbarで利用者へログアウトと再ログインを案内する。
- 課題：現在のrefresh処理は存在しない・失効済み・期限切れ・rotation競合を`INVALID_REFRESH_TOKEN`へまとめるため、期限切れを区別できない。
- DB Schema/migration：変更なし。既存session digest、expiresAt、revokedAtを使う。
- 依存：変更なし。
- API：401 `REFRESH_TOKEN_EXPIRED`を追加。レスポンスへtoken、expiry、session情報を含めない。
- 権限：変更なし。
- 仕様：digest一致rowを期限条件なしで取得し、rowなし/revoked/rotation競合は従来の`INVALID_REFRESH_TOKEN`。未失効rowで`expiresAt <= now`の場合だけ`REFRESH_TOKEN_EXPIRED`。opaque tokenのため期限到達時刻を監視せず次回refresh時に判定する。
- 設定：変更なし。
- UIモック：不要。既存AlertProvider/Snackbarを使う。
- 対象：Backend refresh判定/API error contractとtests、Frontend refresh失敗理由の一元化・単一通知・session cleanupとtests。
- 対象外：token寿命、rotation意味、DB/migration、権限、network/5xx時の現行logout挙動、timer/TTL公開/polling、console/server log、全タブ同期。
- 人間向け計画書：[リフレッシュトークン期限切れ通知_実装計画.html](../../docs/html/リフレッシュトークン期限切れ通知_実装計画.html)
- QA/E2E：各PhaseでDocker正式verify。Backend API error contractをunit/integrationで確認。Frontend refresh/session/Alert behaviorをunitで確認し、必要な画面遷移をE2Eで確認する。
- 固定実装フロー：計画書読み取り → コード生成 → テスト → PR作成 → レビュー

## Phase 1：期限切れ専用API error code

### 変更対象・実装内容

- 対象：`apps/backend/features/auth-session/repository.ts`、`apps/backend/features/auth/service.ts`、`packages/contracts/api-error.ts`、Backend auth/router tests。
- 対象外：Frontend通知、DB schema/migration、token寿命、rotation条件。
- 変更理由：期限切れsession rowを特定し、他のinvalid理由と区別する。
- 実装：digest一致rowを期限条件なしで取得するmethodを追加。refreshではrowなし・revoked優先でgeneric invalidとし、未失効rowの`expiresAt <= now`だけ期限切れcodeを返す。rotation updateの失敗は引き続きgeneric invalidとする。既存active lookup/logoutとrotation predicateは維持する。

### 受入条件

- [x] 未失効・期限切れrowだけ`REFRESH_TOKEN_EXPIRED`を返す。
- [x] digest不一致/rowなし、revoked、rotation競合は`INVALID_REFRESH_TOKEN`を返す。
- [x] 期限内rowは既存rotation挙動を維持する。
- [x] responseにtoken、expiry timestamp、session情報が含まれない。
- [x] DB/migration、依存、token寿命、rotation条件に変更がない。

### 品質ゲートと引継ぎ

- [ ] 必要時のみmigrationを生成、SQL確認、適用する（本Phaseでは不要）。
- [x] Backend service/routerおよび専用DB integration testsを実施する。`pnpm test:integration`: 12/12 PASS。Auth service/router対象を含む通常unit suite: 203 passed、12 skipped。
- [x] Docker正式verify `docker compose -f compose.dev.yml run --rm application sh -c 'pnpm install --frozen-lockfile && pnpm verify:phase'` がPASS。typecheck全対象とtest 39 files/203 tests passed、integration 12 testsは環境未設定でskip（専用compose testで別途12/12 PASS）。
- [ ] 技術QAと仕様QAが独立してPASSし、メインが最終判定する。
- [ ] Phase 1の結果をメインへ報告し、メインの指示後Phase 2へ進む。
- [ ] FAIL時は原因修正後に再verify。計画外変更が必要ならREPLAN。

## Phase 2：Frontendの単一通知とsession cleanup

### 変更対象・実装内容

- 対象：`apps/frontend/lib/apiClient.ts`、`apps/frontend/lib/sessionManager.ts`、Alert context/provider、alert message mappingと関連tests。
- 対象外：Backend期限判定の変更、network/5xx時logout挙動の変更、全タブ同期。
- 変更理由：期限切れcodeの通知を一度だけ表示し、session/query cache cleanupとlogin遷移の競合を防ぐ。
- 実装：refresh試行ID/session世代に結び付けてinvalidate理由を一箇所で確定し、後続のgeneric clearで上書きしない。常時mounted AlertProviderの既存Snackbarで一度だけ通知し、同じsessionQuery alertとの重複を抑止する。manual logout/relogin後の古い失敗結果は現在sessionをclearせず通知もしない。初回未ログイン、refresh tokenなし、generic invalid、network/5xxでは期限切れ文言を出さない。既存refresh single-flight、token rotation、request retryを維持する。

### 受入条件

- [x] 次回refreshで`REFRESH_TOKEN_EXPIRED`を確認した場合だけ「ログインの有効期限が切れたため、ログアウトします。再度ログインしてください。」を一度表示し、session/query cacheをclearしてloginへ移る（期限切れ応答をinterceptする実ブラウザE2Eでlogin URL、token clear、通知1件を確認）。
- [x] access tokenの401後refresh成功では通知もlogoutもしない（Frontend unit testsで確認）。
- [ ] 複数refresh/sessionQuery errorでも通知は重複しない。
- [x] manual logout/relogin後に届く旧refresh failureは新sessionへ影響しない。
- [x] 未ログイン、tokenなし、generic invalid、network/5xxで期限切れ通知を出さない。その他のrefresh failureに対するlogout挙動は維持する。
- [x] token/cookie/Authorization/PIIを通知やlogに含めない。

### 品質ゲートと引継ぎ

- [x] Frontend/backend unit testsで期限切れ、generic invalid、成功refresh、同時refresh、logout/relogin race、通知重複抑止を確認する（最終修正後209 passed、12 integration testsはPhase 1の専用DB suiteでPASS）。
- [x] 画面遷移E2E：`pnpm test:e2e e2e/network-state.spec.ts --grep 'refresh token期限切れ' --retries=0`、setup+chromium 2/2 PASS。login遷移、token clear、通知1件を確認。
- [x] 最終sourceでDocker正式verify `docker compose -f compose.dev.yml run --rm application sh -c 'pnpm install --frozen-lockfile && pnpm verify:phase'` がPASS。Node 22.23.1/pnpm 11.20.0、typecheck全対象、39 files/209 passed、integration 12 testsはverify内skip。追加の`pnpm format:check`と`git diff --check`もPASS。
- [ ] 技術QAと仕様QAが独立してPASSし、メインが最終判定する。
- [x] 初回verifyはAlertProvider effect cleanupがbooleanを返す型不一致で停止。cleanup callbackをvoid returnに修正し、再verify PASS。計画外変更なし。

## Phase 3：統合検証と最終引継ぎ

### 変更対象・実装内容

- 対象：既存テストと関連資料の結果記録。
- 対象外：追加仕様、DB/migration、依存、設定。
- 変更理由：API code、session cleanup、通知、login遷移を一連の利用者動作として確認する。
- 実装：API code契約とFrontend通知/session clear/route transition/manual logout raceをunit/integration/E2Eで確認。E2Eが不要な項目は根拠を記録する。

### 受入条件

- [x] 期限切れ、非期限切れ、競合、再ログイン後の受入条件をunit/integration/E2Eで確認した。技術/仕様QAの最終判定はメイン担当。
- [ ] 技術QAと仕様QAが独立してPASSする。
- [x] 最終sourceに対するDocker正式verifyがPASSする。最初の再実行では未使用importを検出したため除去し、再verifyでPASS。
- [ ] 計画外差分、DB/migration、依存変更がないことを確認する。

### 品質ゲートと引継ぎ

- [x] 実装結果、テスト結果、未解決事項をメインへ引き継ぐ。
- [ ] 公開はメインの最終品質判定後にのみ行う。

## 最終独立QAと判定

- 独立技術QA：PASS。refresh lookup/expiry/revocation/rotation条件、session generation guard、single-flight/finally identity guard、logout token capture、通知経路をread-onlyで確認。実装bugなし。
- 独立仕様QA：PASS。承認済み人間向けHTMLと本計画の整合、専用期限切れ通知条件、対象外、logout/relogin競合、AlertProvider表示を確認。仕様逸脱なし。
- メイン最終判定：PASS。正式Docker verify、専用DB integration、対象E2E、formatとdiff checkの結果を確認。ソース・DB migration・依存・設定の計画外変更なし。
- QAではテストを再実行していない。実行結果は上記Phase記録のとおり。
