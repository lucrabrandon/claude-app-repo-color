export type Repo = { key: string; name: string }

declare module 'claude-code' {
  interface PluginState {
    'repo-color': { repo: Repo | null; color: string | null; opacity: number }
  }
}
