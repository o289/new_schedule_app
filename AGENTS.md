# エージェント実行環境

このプロジェクトでNode.js／pnpmコマンドを実行する前に、必ず **Node.js v22.23.1** を使用してください。

`package.json` が許容するNode.jsの範囲は `>=22.13 <23` です。Node.js 20系および23系以降は使用しません。

## 実行手順

NVMが利用できる環境では、各作業の開始時に以下を実行します。

```bash
nvm use 22.23.1
node --version
```

出力が `v22.23.1` であることを確認してから、依存関係のインストール、型チェック、テスト、ビルドを実行してください。

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
```

## 注意事項

- `node --version` がv22.23.1以外なら、作業を続けずNode.jsのバージョンを切り替える。
- Codexや自動実行環境では、対話ターミナルと異なるNode.jsが選ばれることがある。コマンド実行前に毎回確認する。
- TypeScript 7はネイティブ実行ファイルを使うため、非対応Node.js環境では `Unknown system error -8` が発生する場合がある。
