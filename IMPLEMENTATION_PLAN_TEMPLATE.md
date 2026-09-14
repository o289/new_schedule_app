# 実装計画

> 新規計画では、この文書の項目をcanonical `plan.json`へ構造化し、`tools/agent-plan-generate`でHTML／Markdownを生成する。生成物の手編集は禁止する。承認可能条件は`openDecisions`が空で、各変更単位が`APPROVED`または`NOT_APPLICABLE`、planHash・approvedBy・approvedAt・expiresAtが一致し、有効期間が最大7日であること。新規開始はschemaVersion 2のみとし、completed v1 recordは履歴互換として保持する。

既存のMarkdown計画書は履歴・移行前資料として保持する。このテンプレートはcanonical JSON入力の項目設計用referenceであり、手作業で生成Markdownを作成しない。新規計画では`docs/agent-plan-input.json`を作成し、generator出力の`agent-plan.md`を承認snapshotとして扱う。

## 概要

- 解決する課題と実装の目的を記載する。
- DBモデル変更の有無を記載する。
- 新規機能の場合は、UIモック画像（PNG）の保存先と、確認する画面・操作を記載する。

## 規模・作業branch

[判断フロー](IMPLEMENTATION_DECISION_FLOW.md)で判定する。

- 規模: 中規模 / 大規模
- 実装担当: implementation_terra（メインがAstra / Solの場合）
- 実装フェーズ数:
- 変更予定ファイル一覧・重複なしの件数:
- 認証の動作変更: あり / なし（根拠）
- 変更DBモデル一覧:
- モデル間依存が必要: あり / なし（関係・処理順を記載）
- 開始元版branch:
- slug: 大規模のみ
- 作業head:
- 公開モード: push_only / pull_request
- reviewBaseSha: 実装開始前に記録
- PR base: pull_requestのみ、head末尾版から導出
- 承認時点の計画スナップショット・開始記録の保存先:

## フェーズ1：日付計算ロジック

### 変更対象

- ファイルA
- ファイルB

### 実装内容

- 処理A
- 処理B

### フェーズ完了条件

- 関数Aのテストが追加されている
- 既存の個別選択が維持されている

### 品質ゲート

- [ ] Node.js v22.23.1
- [ ] typecheck PASS
- [ ] test PASS

---

フェーズが複数ある場合は、フェーズ1の章を複製して連番にする。

現在のフェーズの品質ゲートがすべてPASSになるまで、次のフェーズを開始しない。

この計画書への実装承認は、記載された全フェーズへの承認として扱う。フェーズの品質ゲートがPASSしたら、追加承認を求めず次のフェーズへ進む。

独立タスクへ分割する場合は、このテンプレートを使ってタスクごとに別の`*_実装計画.md`を作成する。独立タスクを1つの計画書内のフェーズとして記載しない。

DB変更を含むフェーズでは、品質ゲートに以下を追加する。

- [ ] migration生成物レビュー PASS
- [ ] ローカル開発DB migration PASS
- [ ] integration test PASS

## 全フェーズ完了条件

- [ ] 各フェーズの完了条件を満たしている
- [ ] 最終の`pnpm verify:phase` PASS
- [ ] 実装計画の範囲外に不要な差分がない
