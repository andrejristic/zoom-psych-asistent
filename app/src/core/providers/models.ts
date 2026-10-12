// Claude models the app offers. Kept apart from claude.ts so the window can
// list them without bundling the SDK.

export const CLAUDE_MODELS = ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5'] as const
export type ClaudeModel = (typeof CLAUDE_MODELS)[number]
