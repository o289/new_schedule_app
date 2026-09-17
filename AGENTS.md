# AIエージェント開発フロー

詳細なAI開発規則は[`.agents/instructions/AGENTS-DETAILS.md`](.agents/instructions/AGENTS-DETAILS.md)を参照してください。
詳細規則は単一の`.agents/instructions/AGENTS-DETAILS.md`に集約しています。AIの公開正本は`./.agents/tools/pr-agent-publish`です。`pnpm agent:publish`はNode.js 22が有効な人間terminalで使うaliasとし、許可されたfeature branch・origin・通常push・同一SHAのCI確認を守ってください。
