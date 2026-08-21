# エージェント開発フロー

## 実行環境

- 通常の実装確認、typecheck、unit testは`compose.dev.yml`を使用する。
- DB統合テストは`compose.test.yml`を使用する。
- E2Eテスト用DBは`compose.e2e.yml`を使用する。
- Node.js、pnpm、TypeScript、import境界の機械判定は`pnpm typecheck`に含まれるプロジェクトルール検査に従う。

## 実装計画

- 実装に着手する前に、[`IMPLEMENTATION_DECISION_FLOW.md`](IMPLEMENTATION_DECISION_FLOW.md)の判断フローに従う。
- 実装計画は[`IMPLEMENTATION_PLAN_TEMPLATE.md`](IMPLEMENTATION_PLAN_TEMPLATE.md)の形式で作成する。
- ユーザーによる実装計画の承認は、その`*_実装計画.md`に記載された全フェーズへの実装承認として扱う。各フェーズ完了時に追加承認を求めず、品質ゲートPASS後は次のフェーズへ進む。
- 実装を複数の独立タスクへ分割する場合は、分割したタスクごとに`*_実装計画.md`を作成する。1つの計画書内のフェーズを独立タスクとして扱わない。
- 複数フェーズの計画では、各フェーズに変更対象、実装内容、完了条件、品質ゲートを記載する。
- 現在のフェーズの品質ゲートがすべてPASSになるまで、次のフェーズを開始しない。

## フェーズ品質ゲート

各フェーズは次の順序で進める。

1. 現在のフェーズだけを実装する。
2. `pnpm format`を実行する。
3. `pnpm verify:phase`を実行する。
4. typecheckが失敗した場合は原因を分析して修正し、`pnpm verify:phase`を再実行する。
5. testが失敗した場合は原因を分析して修正し、testだけでなく`pnpm verify:phase`を再実行する。
6. typecheckとtestの両方が成功した場合のみ、そのフェーズを完了にする。
7. 次のフェーズへ進む。

すべてのフェーズ完了後にも`pnpm verify:phase`を実行し、全体の回帰がないことを確認する。

検証を実行できない場合はフェーズを完了扱いにせず、実行できない理由と必要な対応を報告する。

## DB変更を含むフェーズ

DBモデルを変更した場合は、品質ゲートの前に以下を行う。

1. `pnpm db:generate`でmigrationを生成する。
2. 生成されたSQLを確認する。
3. 接続先がローカル開発DBであることを確認する。
4. `pnpm db:migrate`を実行する。
5. 通常の品質ゲートに加えて、`compose.test.yml`でDB統合テストを実行する。

DBモデルの変更がない場合はmigrationを実行しない。

## コーディング上の判断

- コメントは必要最小限にする。
- 実装計画の範囲外に変更が必要になった場合は、理由を報告してから進める。
