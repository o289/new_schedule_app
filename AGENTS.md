# AIエージェント開発フロー

共通契約とtask索引は[AGENTS-DETAILS.md](.agents/instructions/AGENTS-DETAILS.md)、固定実装順は[implementation-flow.md](.agents/instructions/flows/implementation-flow.md)、タスク固有の正本は[.agents/instructions/tasks/](.agents/instructions/tasks/)を参照してください。

中規模以上の変更は人間向けHTML計画書を作成し、ユーザー本人のチャット承認後にAI向けMarkdown計画書を作ります。公開正本は./.agents/tools/pr-agent-publishです。pnpm agent:publishはNode.js 22が有効な人間terminalで使うaliasとし、許可されたfeature branch・origin・通常push・同一SHAのCI確認を守ってください。
