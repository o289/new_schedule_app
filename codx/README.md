# PR作成エージェントの運用

## 配置とRules

ユーザー指定により正本はリポジトリルートの`codx/rules/pr-agent.rules`。ホーム配下は変更しない。

[OpenAI公式Rules仕様](https://learn.chatgpt.com/docs/agent-configuration/rules?translationFallback=ja-JP)では、起動時に有効な設定層の`rules/`を読み込み、プロジェクトの`.codex/rules/`は信頼された設定層であることが必要になる。**`codx/`は自動読込先ではない**。この実装はRulesの保存と明示的な判定検証までを提供する。有効化には別途、有効な設定層への配置と再起動が必要であり、本タスクではその設定変更を行わない。

```sh
codex execpolicy check --pretty --rules codx/rules/pr-agent.rules -- git status
codex execpolicy check --pretty --rules codx/rules/pr-agent.rules -- ./tools/pr-agent-publish
codex execpolicy check --pretty --rules codx/rules/pr-agent.rules -- git push origin main
codex execpolicy check --pretty --rules codx/rules/pr-agent.rules -- gh pr create
```

順にallow、allow、forbidden、forbiddenを期待する。Codex更新時にも再検証する。`execpolicy check`は対象コマンドを実行せず、Rulesを現在のセッションへ読み込む操作でもない。

prefixの規則はコマンド形に依存し、別順序のオプション・別API・改変した専用処理まで封じる隔離機構ではない。専用入口は追加引数を拒否する。専用処理自体を信頼する前提であり、その変更も高リスクとしてレビューする。

## 開始前の準備

[PR作成エージェント.md](../PR作成エージェント.md)が役割規則の正本。公開用入力は`docs/pr-agent-handoff.json`に置く。`docs/`配下はGit管理しない。品質管理が同じcommit SHAの最終PASSを記録した後、PR役割が分類・HTML・本文を完成させる。

- 実装側で承認範囲だけをコミットし、作業ツリーをcleanにする。未追跡ファイルも公開処理の停止対象。
- 使用するNode.jsは`.nvmrc`、pnpmは`package.json`の指定に合わせる。
- 承認済み計画へ単独行`PR base: feature/vX.Y.Z`等で実際のbaseを明示する。版branchのbaseを推測しない。
- originのURLは`https://github.com/o289/new_schedule_app.git`または`git@github.com:o289/new_schedule_app.git`の単一設定。追跡先は未設定、originの同名head、またはoriginのbaseだけ。
- baseのremote SHAとローカル`refs/remotes/origin/<base>`が一致していること。古い場合は公開前に実装側で取得し、差分を再照合する。
- `gh`がgithub.comへ認証済みで、対象repositoryへpush・PR作成が可能であること。

## 入力形式

実際のSchemaは[tools/pr-agent-publish.ts](../tools/pr-agent-publish.ts)の`handoffSchema`を正本とする。次は形式例であり、サンプルhashやSHAのまま実行できない。すべてのartifactは`{"path":"docs/...","sha256":"64桁のSHA-256"}`で指定し、非空のUTF-8ファイルを参照する。シンボリックリンクによるdocs外参照は拒否する。

```json
{
  "schemaVersion": 1,
  "head": "feature/pr-agent-v3.2.2",
  "headSha": "対象コミットの40桁SHA",
  "base": "feature/v3.2.2",
  "baseSha": "baseの40桁SHA",
  "mergeBaseSha": "merge-baseの40桁SHA",
  "plan": { "path": "docs/実装計画/対象_実装計画.md", "sha256": "64桁hash" },
  "implementation": {
    "path": "docs/pr-agent-implementation.md",
    "sha256": "64桁hash"
  },
  "allPhasesComplete": true,
  "quality": {
    "final": "PASS",
    "verifyPhase": {
      "status": "PASS",
      "evidence": { "path": "docs/pr-agent-quality.md", "sha256": "64桁hash" }
    },
    "integration": { "status": "NOT_REQUIRED", "reason": "DB変更なし" },
    "e2e": {
      "status": "NOT_REQUIRED",
      "reason": "アプリユーザーフロー変更なし"
    }
  },
  "changes": {
    "db": false,
    "dependencies": false,
    "configuration": true,
    "generated": true
  },
  "review": {
    "diffSha256": "全diff原本の64桁hash",
    "classification": {
      "path": "docs/pr-agent-classification.md",
      "sha256": "64桁hash"
    },
    "allDiffClassified": true,
    "unclassified": 0,
    "safetyReview": { "path": "docs/pr-agent-safety.md", "sha256": "64桁hash" },
    "noSecretsOrDebug": true,
    "noUnapprovedChanges": true,
    "destructiveMigrationApproved": true,
    "html": { "path": "docs/html/対象-pr-review.html", "sha256": "64桁hash" }
  },
  "title": "課題と変更後の動作を示すタイトル",
  "body": { "path": "docs/pr-agent-body.md", "sha256": "64桁hash" }
}
```

品質PASSの証跡と実装引き継ぎには対象head SHAを記載する。品質証跡にはコマンド、環境、結果、件数、未実行理由を残す。Integration/E2Eを実行した場合は`verifyPhase`と同形式のPASS + evidenceとする。破壊的migrationがない場合も安全確認文書に「該当なし」と記録して`destructiveMigrationApproved: true`とする。

hashはファイルの内容から`shasum -a 256 <file>`で取得できる。全diffの原本は次の形式で取得し、末尾改行も保持してhashを計算する。

```sh
git diff --no-ext-diff --no-textconv --binary --full-index '<baseSha>...<headSha>' -- > docs/pr-agent-full.diff
shasum -a 256 docs/pr-agent-full.diff
```

hashは改変・取り違えを検出するためのもの。品質結果の真正性やhunk分類の意味的な正しさを保証する署名ではない。初版ではエージェントが分類表と全diffを照合する。本文の見出しとartifactの存在は機械検証するが、説明の品質、秘密情報検出、分類の完全性は役割手順で確認する。

## 公開

```sh
./tools/pr-agent-publish
```

引数を受け付けず、リポジトリルートから実行する。GitとGitHub CLIを外部境界に使う。許可headは`feature/v<major>.<minor>.<patch>`と`feature/<機能名>-v<major>.<minor>.<patch>`（機能名は英数字・ハイフン・アンダースコア）。機能branchのbaseは同版の版branchへ固定する。

検証後に対象SHAの単一refだけをoriginへpushする。force、tagsの追随push、mirrorは使用しない。push後は`ci.yml`のpushイベント、head branch、SHA、workflow名CIが一致する最新runと「型・テスト・書式の確認」jobの成功を確認する。10秒間隔で最大60回待ち、未検出・待機中はSTOPする。外部コマンドには個別のtimeoutもあるため総所要時間は10分を超える場合がある。main限定E2Eのskipは許容するが必須jobのskipは許容しない。

公開直前にもSHA、base、diff、artifact、CI、既存PRを再確認する。CI証跡を追加した本文を一時ファイルから渡して通常PRを作成する。既存の同一base/headの通常PRは同じSHAを確認してURLを返す。Draft・閉じたPR・異なるbase・重複はSTOPし、自動変更しない。既存PRの本文は自動更新しないため、別の変更を同じbranchへ追加する運用は対象外とし、再実行は同じ公開内容の復旧に用いる。

同時起動は`docs/pr-agent-publish.lock`で拒否する。異常終了でlockが残った場合は、実行中processがないことを確認してからそのlockだけを除く。push完了後のCI・PR作成失敗はbranchを残して停止する。接続断などでPR作成結果が不明なら、再実行で既存PRを確認し重複を防ぐ。

STOP時は不足や失敗を直した担当へ戻し、必要な品質ゲートから再実行する。公開処理は品質結果をPASSへ変更しない。Mergeと公開済みbranchの削除は人間の判断とする。
