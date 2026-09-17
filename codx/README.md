# AI開発フローの使い方

この個人開発では、引き継ぎ時に次の順で確認する。

1. `ai/runs/<runId>/work.json`
2. `ai/runs/<runId>/plan.md`
3. Gitの現在branch、HEAD、差分

計画済みのPhaseは、品質確認に合格したら追加承認なしで次へ進む。計画外の変更だけ停止して、計画を直す。

## 実装と確認

Phaseごとに実装し、必要なDB変更がある場合だけmigrationを実行する。その後、プロジェクトのDocker環境で次を実行する。

```sh
docker compose -f compose.dev.yml run --rm application sh -c 'pnpm install --frozen-lockfile && pnpm verify:phase'
```

`verify:phase`はtypecheckとtestを順に実行する。失敗したら原因を直し、同じ確認をやり直す。

## 公開

品質確認がすべてPASSした後、次だけを実行する。

```sh
pnpm agent:publish
```

この入口はhostのNode.js 20環境から起動できるよう、リポジトリ内の固定された`node_modules/.bin/tsx`を使う。品質確認そのものはhostで行わず、publish内部のDocker Compose環境で実行する。

- `feature/vX.Y.Z`：同名originへ通常pushし、同じSHAのCI成功を確認する。
- `feature/<slug>-vX.Y.Z`：同名originへpushし、対応する`feature/vX.Y.Z`をbaseに通常PRを作成する。

publishはDockerの正式確認がPASSするまでpushしない。mainへのpush、force push、branch削除、DB削除、本番DB操作、任意remote・refspec・shellは行わない。

## 失敗したとき

作業ツリー、現在branch、HEADを確認する。Docker確認が失敗したら原因を直して再確認する。認証、origin、branch、CI、PRのhead/base/SHAが不一致なら停止して人間へ報告する。push済みの変更を自動削除・強制上書きしない。

レビュー、承認、mergeは人間が行う。AIの完了条件は、版branchではpushとCI成功、機能branchでは通常PR作成までとする。
