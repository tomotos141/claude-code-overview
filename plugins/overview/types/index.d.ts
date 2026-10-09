export type Criterion = { text: string; isDone: boolean }
export type Offshoot = { text: string; note: string }
export type Issue = { id: string; url: string }
export type Board = {
  problem: string
  issue: Issue | null
  goal: string
  criteria: Criterion[]
  offshoots: Offshoot[]
  next: string
  at: number
}

declare module 'claude-code' {
  interface PluginState {
    overview: {
      board: Board | null
    }
  }
}
