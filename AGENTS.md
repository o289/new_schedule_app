# エージェント開発フロー

## 実行環境

- 通常の実装確認、typecheck、unit testは`compose.dev.yml`を使用する。
- DB統合テストは`compose.test.yml`を使用する。
- Node.js、pnpm、TypeScript、import境界の機械判定は`pnpm typecheck`に含まれるプロジェクトルール検査に従う。

品質ゲート、DB変更時の手順、E2Eテストの実行環境は[`品質管理.md`](品質管理.md)に従う。

## 実装計画

- 実装に着手する前に、[`IMPLEMENTATION_DECISION_FLOW.md`](IMPLEMENTATION_DECISION_FLOW.md)の判断フローに従う。
- 実装計画は[`IMPLEMENTATION_PLAN_TEMPLATE.md`](IMPLEMENTATION_PLAN_TEMPLATE.md)の形式で作成する。
- ユーザーによる実装計画の承認は、その`*_実装計画.md`に記載された全フェーズへの実装承認として扱う。各フェーズ完了時に追加承認を求めず、品質ゲートPASS後は次のフェーズへ進む。
- 実装を複数の独立タスクへ分割する場合は、分割したタスクごとに`*_実装計画.md`を作成する。1つの計画書内のフェーズを独立タスクとして扱わない。
- 複数フェーズの計画では、各フェーズに変更対象、実装内容、完了条件、品質ゲートを記載する。
- 現在のフェーズの品質ゲートがすべてPASSになるまで、次のフェーズを開始しない。

## コーディング上の判断

- コメントは必要最小限にする。
- 実装計画の範囲外に変更が必要になった場合は、理由を報告してから進める。
