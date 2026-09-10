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

## 実装開始の記録

規模の正本は[判断フロー](../IMPLEMENTATION_DECISION_FLOW.md)。開始処理は`./tools/pr-agent-start`（引数なし）。入力は`docs/pr-agent-start-input.json`、出力は`docs/pr-agent-start-record.json`。開始時点の承認済み計画または小規模の要求文書を変更しないスナップショットとして保存し、そのpath/hashを入力にする。進捗更新用の計画書と分け、開始後にsnapshotを上書きしない。

```json
{
  "schemaVersion": 1,
  "approved": true,
  "assessment": {
    "phaseCount": 3,
    "plannedFiles": ["tools/example.ts", "tools/example.test.ts"],
    "authenticationChanged": false,
    "dbModels": [],
    "dependentDbModels": false,
    "directImplementation": false
  },
  "size": "medium",
  "mode": "push_only",
  "sourceBranch": "feature/v3.2.3",
  "head": "feature/v3.2.3",
  "reviewBaseSha": "実装開始前の40桁SHA",
  "plan": { "path": "docs/approved-plan.md", "sha256": "64桁hash" }
}
```

大規模ではsize=large、mode=pull_request、slugを追加し、headを`feature/<slug>-vX.Y.Z`とする。小規模はphaseCount=0、directImplementation=true。変更予定ファイルは重複なしの一覧とする。依存関係のある複数DBモデル変更はdbModelsに2つ以上、dependentDbModels=trueで記録する。単なる依存パッケージ追加をこのフラグへ代入しない。

開始処理はclean、版branch、開始SHA、固定origin、承認snapshotのhashを検証し、大規模のみ同名local/remote不存在を確認してローカルbranchを作る。結果は入力にcompleted=trueを加えた開始記録。同名記録は上書きしない。失敗時に空の記録が残ることがあるため、現在branchと入力SHAを確認して復旧し、タスク途中のHEADを新しい開始点にしない。記録保存前にbranch作成が成功していた場合も自動削除しない。

開始処理はRulesへ自動allowを追加しない。通常の実行権限に従う。公開時はこの開始記録のpath/hashをhandoffへ渡す。

## 公開入力（schemaVersion 2）

正本は[公開処理のhandoffSchema](../tools/pr-agent-publish.ts)。旧version 1は暗黙変換せずSTOPする。開始処理のversionは引き続き1であり、公開入力のversionとは別。

入力は`docs/pr-agent-handoff.json`。品質管理PASS後、実装引き継ぎ・品質証跡には同じhead SHAを記録する。開始記録のmode/head/reviewBaseSha/plan参照が公開入力と一致することを確認する。承認済み計画snapshotのhashを変えない。artifactは非空のUTF-8ファイルをdocs内へ置き、hashを`shasum -a 256 <file>`で取得する。docs外へのsymlinkは拒否する。これらのhashは改変検出であり、品質判定の真正性や分類の意味を保証する署名ではない。

### 版branchの入力例

push_onlyはPR base・baseSha・prReview・title・bodyを持たない。以下のSHA/hashは実測値へ置き換える。

```json
{
  "schemaVersion": 2,
  "mode": "push_only",
  "head": "feature/v3.2.3",
  "headSha": "品質確認した40桁SHA",
  "reviewBaseSha": "実装開始前の40桁SHA",
  "start": {
    "path": "docs/pr-agent-start-record.json",
    "sha256": "64桁のSHA-256"
  },
  "plan": {
    "path": "docs/approved-plan.md",
    "sha256": "64桁のSHA-256"
  },
  "implementation": {
    "path": "docs/implementation.md",
    "sha256": "64桁のSHA-256"
  },
  "allPhasesComplete": true,
  "quality": {
    "final": "PASS",
    "verifyPhase": {
      "status": "PASS",
      "evidence": {
        "path": "docs/quality.md",
        "sha256": "64桁のSHA-256"
      }
    },
    "integration": {
      "status": "NOT_REQUIRED",
      "reason": "DB変更なし"
    },
    "e2e": {
      "status": "NOT_REQUIRED",
      "reason": "アプリフロー変更なし"
    }
  },
  "changes": {
    "db": false,
    "dependencies": false,
    "configuration": true,
    "generated": false
  },
  "review": {
    "diffSha256": "タスク全diffのSHA-256",
    "classification": {
      "path": "docs/classification.md",
      "sha256": "64桁のSHA-256"
    },
    "allDiffClassified": true,
    "unclassified": 0,
    "safetyReview": {
      "path": "docs/safety.md",
      "sha256": "64桁のSHA-256"
    },
    "noSecretsOrDebug": true,
    "noUnapprovedChanges": true,
    "destructiveMigrationApproved": true,
    "html": {
      "path": "docs/html/review.html",
      "sha256": "64桁のSHA-256"
    }
  }
}
```

### 機能branchの入力例

pull_requestではbaseをheadの末尾から自動導出する。次のheadなら必ずfeature/v3.2.3。任意のbaseを質問しない。baseを入力にも書く場合は導出値と完全一致する必要がある。PR全diff用のprReviewと完成本文を追加する。開始記録は大規模の機能branch作成時のものを参照する。

```json
{
  "schemaVersion": 2,
  "mode": "pull_request",
  "head": "feature/task-v3.2.3",
  "headSha": "品質確認した40桁SHA",
  "reviewBaseSha": "実装開始前の40桁SHA",
  "start": {
    "path": "docs/pr-agent-start-record.json",
    "sha256": "64桁のSHA-256"
  },
  "plan": {
    "path": "docs/approved-plan.md",
    "sha256": "64桁のSHA-256"
  },
  "implementation": {
    "path": "docs/implementation.md",
    "sha256": "64桁のSHA-256"
  },
  "allPhasesComplete": true,
  "quality": {
    "final": "PASS",
    "verifyPhase": {
      "status": "PASS",
      "evidence": {
        "path": "docs/quality.md",
        "sha256": "64桁のSHA-256"
      }
    },
    "integration": {
      "status": "NOT_REQUIRED",
      "reason": "DB変更なし"
    },
    "e2e": {
      "status": "NOT_REQUIRED",
      "reason": "アプリフロー変更なし"
    }
  },
  "changes": {
    "db": false,
    "dependencies": false,
    "configuration": true,
    "generated": false
  },
  "review": {
    "diffSha256": "タスク全diffのSHA-256",
    "classification": {
      "path": "docs/classification.md",
      "sha256": "64桁のSHA-256"
    },
    "allDiffClassified": true,
    "unclassified": 0,
    "safetyReview": {
      "path": "docs/safety.md",
      "sha256": "64桁のSHA-256"
    },
    "noSecretsOrDebug": true,
    "noUnapprovedChanges": true,
    "destructiveMigrationApproved": true,
    "html": {
      "path": "docs/html/review.html",
      "sha256": "64桁のSHA-256"
    }
  },
  "baseSha": "対応する版branchの40桁SHA",
  "prReview": {
    "diffSha256": "PR全diffのSHA-256",
    "classification": {
      "path": "docs/pr-classification.md",
      "sha256": "64桁のSHA-256"
    },
    "allDiffClassified": true,
    "unclassified": 0
  },
  "title": "課題と変更後の動作を示すタイトル",
  "body": {
    "path": "docs/pr-body.md",
    "sha256": "64桁のSHA-256"
  }
}
```

## 差分と公開前の確認

- タスク差分は`reviewBaseSha...headSha`。reviewBaseShaがheadの祖先であり、開始記録と一致することを機械検証する。変更パスが開始時の予定にない場合は計画へ戻す。追加要件による規模の変化を公開直前に都合よく再判定しない。
- PR全diffは導出baseのbaseSha...headSha。タスク差分と異なることがあるため別のhashと分類証跡を用意し、双方とも全hunkを省略しない。PR baseのremote SHAと取得済みrefが違えば停止する。
- 機密・デバッグ・未分類・計画外変更の有無、破壊的migrationの承認・復旧は担当役割が照合して記録する。該当なしも安全確認文書へ記載する。未実行テストをPASSにしない。
- 固定origin、現在branchとhead SHA、clean（未追跡ファイルを含む）、artifactのhashを確認する。対象外branchやdetached HEADは停止する。
- originはhttps://github.com/o289/new_schedule_app.gitまたはgit@github.com:o289/new_schedule_app.gitの単一URL。取得先・push先とも検証する。追跡先は未設定または同名origin、PR時だけ対応版originも許容する。

```sh
git diff --no-ext-diff --no-textconv --binary --full-index '<reviewBaseSha>...<headSha>' -- > docs/task-full.diff
shasum -a 256 docs/task-full.diff
# pull_requestだけで追加するPR全diff
git diff --no-ext-diff --no-textconv --binary --full-index '<baseSha>...<headSha>' -- > docs/pr-full.diff
shasum -a 256 docs/pr-full.diff
```

## 公開と再実行

公開入口は`./tools/pr-agent-publish`（引数なし）。許可された同名originの単一refへ指定SHAだけを送る。remoteが先行・分岐していたらforceせずSTOP。remote commitがローカルに未取得で祖先性を確認できない場合もSTOPし、実装側で取得してから再検証する。branchが未作成なら新規push、同一SHAなら再pushを省略する。tag追随・mirror・削除は行わない。

- push_onlyはPR一覧取得もPR作成も呼ばない。remoteの同一SHAとCI成功で完了する。結果はmode/head/headSha/ciUrl。
- pull_requestはheadから導出した版branchへ通常PRを作る。結果は上記にbase/prUrlを追加。同一base/head/SHAの通常PRを再利用し、Draft・閉じたPR・異なるbase/head・重複はSTOPする。既存PRの本文・状態は変更しない。

CIはci.ymlのpushイベント、branch、head SHA、workflow名CI、必須job「型・テスト・書式の確認」の成功を照合する。10秒間隔で最大60回待つ。各外部コマンドにもtimeoutがあるため全体は10分を超える場合がある。main限定E2Eのskipは許容するが必須checkのskipは許容しない。必要なローカルE2Eをbranch CIの代わりに省略しない。

push後のCI失敗・待機・PR応答不明時はpush済み状態を残して停止する。同じ入力で再実行するとremote SHAとCIを再確認し、既存PRを再利用して重複を防ぐ。失敗の解消に実装修正が必要なら新しいhead SHAに対して品質検証とartifact生成をやり直す。異なるSHAの既存PRは自動更新しない。

公開直前に開始記録、品質証跡、差分、headとremote SHAを再確認する。CI成功を本文へ追加し一時ファイルから通常PRを作る。同時起動はdocs/pr-agent-publish.lockで拒否する。異常終了でlockが残った場合は実行中processがないことを確認してそのlockのみ取り除く。品質PASSへの書換え、履歴改変、Mergeは行わない。
