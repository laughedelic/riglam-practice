// The values the pr-stacks pane keeps in `$.state`, and the shapes of the view
// the model builds from GitHub's answers. Everything here is plain JSON.

/** How a PR's checks stand. Checks of the `staging` workflow are not counted. */
export type PrCi = {
  state: 'passed' | 'failed' | 'running' | 'none'
  passed: number
  failed: number
  running: number
  total: number
  failedNames: string[]
}

/** GitHub's mergeable state, folded to what a person acts on. */
export type PrMerge =
  | 'clean'
  | 'conflict'
  | 'behind'
  | 'blocked'
  | 'unstable'
  | 'draft'
  | 'unknown'

/**
 * ready: green and mergeable. review: green, but GitHub still blocks it
 * (usually an approval). waiting: CI is running or the state is still being
 * computed. broken: failed CI, conflicts, behind its base, changes requested.
 */
export type PrVerdict = 'ready' | 'review' | 'waiting' | 'broken' | 'draft'

export type PrReview = 'approved' | 'changes' | 'commented' | 'none'

export type PrNode = {
  number: number
  title: string
  url: string
  head: string
  base: string
  sha: string
  labels: string[]
  isDraft: boolean
  ci: PrCi
  merge: PrMerge
  review: PrReview
  /** The project thread that owns the PR, or `unassigned`. */
  owner: string
  /** What the owner was read from: a thread id, a branch token, or ''. */
  ownerKey: string
  verdict: PrVerdict
  /** Why it is not ready, one short phrase each. */
  reasons: string[]
  /** Set when the `staging` check run failed: the PR is left out of staging. */
  staging: 'in' | 'out' | 'conflict' | 'none'
  commits: number
  changed: number
  updatedAt: string
  /** The GitHub stack it belongs to. */
  stack: number | null
  /** The open PR it is based on, if any. */
  parent: number | null
}

export type PrStack = {
  id: string
  /** The GitHub stack number, when every PR of the group shares one. */
  number: number | null
  /** The branch the bottom PR targets. */
  base: string
  /** Bottom to top. */
  prs: number[]
  owners: string[]
  verdict: PrVerdict
  /** The highest PR that can be merged now: every PR up to it is ready. */
  readyUpTo: number | null
  note: string
}

export type PrNotice = {
  kind: 'ready' | 'wait' | 'thread' | 'coordinate' | 'tidy'
  text: string
  prs: number[]
  /** The thread that has to act, when there is one. */
  owner?: string
}

export type PrView = {
  repo: string
  fetchedAt: number
  nodes: PrNode[]
  stacks: PrStack[]
  notices: PrNotice[]
  rate: { remaining: number; limit: number } | null
}

export type PrLoad = { isLoading: boolean; error: string | null }

declare module 'claude-code' {
  interface PluginState {
    'pr-stacks': {
      // Change the tag when PrView changes: it declines what an earlier
      // version stored, which outlives a reload.
      view: Shaped<PrView | null>
      load: PrLoad
      folded: Shaped<string[]>
    }
  }
}
