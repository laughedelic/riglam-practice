// Pure: GitHub's answers in, the view out. No network, no `$`.
import type {
  PrCi,
  PrMerge,
  PrNode,
  PrNotice,
  PrReview,
  PrStack,
  PrVerdict,
  PrView,
} from '../types'
import { ownerOf, type Owners } from './owners'

export type GhPull = {
  number: number
  title: string
  html_url: string
  draft?: boolean
  body: string | null
  labels: { name: string }[]
  head: { ref: string; sha: string }
  base: { ref: string }
  updated_at: string
}
export type GhDetail = {
  mergeable: boolean | null
  mergeable_state: string
  commits: number
  changed_files: number
}
export type GhCheckRun = {
  name: string
  status: string
  conclusion: string | null
}
export type GhReview = {
  user: { login: string } | null
  state: string
}
export type GhStack = { number: number; pull_requests: { number: number }[] }
export type GhCompare = { status: string; ahead_by: number; behind_by: number }

export type Snapshot = {
  repo: string
  now: number
  pulls: GhPull[]
  details: Record<number, GhDetail | undefined>
  checks: Record<number, GhCheckRun[] | undefined>
  reviews: Record<number, GhReview[] | undefined>
  files: Record<number, string[] | undefined>
  stacks: GhStack[]
  /** Keyed `<sha>...<sha>`, as `comparePairs` names them. */
  compares: Record<string, GhCompare | undefined>
  rate: { remaining: number; limit: number } | null
}

// Files every release touches: they would make every pair of PRs overlap.
const NOISE =
  /(^|\/)(CHANGELOG\.md|package\.json|package-lock\.json|\.release-please-manifest\.json)$/
const STALE_MS = 3 * 24 * 3600 * 1000
const STAGING_CHECKS = new Set(['staging', 'Rebuild staging', 'Checks on staging'])

const SEVERITY: Record<PrVerdict, number> = {
  ready: 0,
  review: 1,
  draft: 2,
  waiting: 3,
  broken: 4,
}

// ---------------------------------------------------------------- one PR

export function summarizeCi(runs: readonly GhCheckRun[] | undefined): {
  ci: PrCi
  staging: PrNode['staging']
} {
  const ci: PrCi = {
    state: 'none',
    passed: 0,
    failed: 0,
    running: 0,
    total: 0,
    failedNames: [],
  }
  let staging: PrNode['staging'] = 'none'
  for (const run of runs ?? []) {
    if (run.name === 'staging') {
      staging =
        run.status !== 'completed'
          ? 'none'
          : run.conclusion === 'failure'
            ? 'conflict'
            : run.conclusion === 'success'
              ? 'in'
              : 'out'
    }
    if (STAGING_CHECKS.has(run.name)) continue
    ci.total += 1
    if (run.status !== 'completed') {
      ci.running += 1
    } else if (
      run.conclusion === 'success' ||
      run.conclusion === 'neutral' ||
      run.conclusion === 'skipped'
    ) {
      ci.passed += 1
    } else {
      ci.failed += 1
      ci.failedNames.push(run.name)
    }
  }
  ci.state =
    ci.failed > 0
      ? 'failed'
      : ci.running > 0
        ? 'running'
        : ci.passed > 0
          ? 'passed'
          : 'none'
  return { ci, staging }
}

export function mergeOf(isDraft: boolean, detail: GhDetail | undefined): PrMerge {
  if (isDraft) return 'draft'
  if (!detail) return 'unknown'
  if (detail.mergeable === false || detail.mergeable_state === 'dirty') {
    return 'conflict'
  }
  switch (detail.mergeable_state) {
    case 'clean':
    case 'has_hooks':
      return 'clean'
    case 'behind':
      return 'behind'
    case 'blocked':
      return 'blocked'
    case 'unstable':
      return 'unstable'
    default:
      return 'unknown'
  }
}

export function reviewOf(reviews: readonly GhReview[] | undefined): PrReview {
  // The latest decisive review of each person counts.
  const last = new Map<string, string>()
  let hasComment = false
  for (const review of reviews ?? []) {
    const who = review.user?.login ?? '?'
    if (review.state === 'COMMENTED') hasComment = true
    else if (review.state === 'APPROVED' || review.state === 'CHANGES_REQUESTED') {
      last.set(who, review.state)
    } else if (review.state === 'DISMISSED') last.delete(who)
  }
  const states = [...last.values()]
  if (states.includes('CHANGES_REQUESTED')) return 'changes'
  if (states.includes('APPROVED')) return 'approved'
  return hasComment ? 'commented' : 'none'
}

function judge(
  isDraft: boolean,
  ci: PrCi,
  merge: PrMerge,
  review: PrReview,
): { verdict: PrVerdict; reasons: string[] } {
  if (isDraft) return { verdict: 'draft', reasons: ['draft'] }
  const broken: string[] = []
  if (ci.state === 'failed') {
    const names = ci.failedNames.slice(0, 2).join(', ')
    const more = ci.failedNames.length > 2 ? ` +${ci.failedNames.length - 2}` : ''
    broken.push(`CI failed: ${names}${more}`)
  }
  if (merge === 'conflict') broken.push('merge conflicts')
  if (merge === 'behind') broken.push('behind its base branch')
  if (review === 'changes') broken.push('changes requested')
  if (broken.length > 0) return { verdict: 'broken', reasons: broken }

  const waiting: string[] = []
  if (ci.state === 'running') {
    waiting.push(`CI running (${ci.total - ci.running}/${ci.total} done)`)
  }
  if (ci.state === 'none') waiting.push('no checks reported yet')
  if (merge === 'unknown') waiting.push('GitHub is still computing mergeability')
  if (waiting.length > 0) return { verdict: 'waiting', reasons: waiting }

  if (merge === 'blocked') {
    return {
      verdict: 'review',
      reasons: [
        review === 'approved'
          ? 'blocked by branch rules'
          : 'blocked until it is approved or a required check passes',
      ],
    }
  }
  return { verdict: 'ready', reasons: [] }
}

// ---------------------------------------------------------------- groups

type Group = { id: string; prs: number[]; isLinear: boolean }

/** Trees of PRs by base branch; each is listed bottom to top, depth first. */
function groupsOf(nodes: readonly PrNode[]): Group[] {
  const children = new Map<number, number[]>()
  for (const node of nodes) {
    if (node.parent !== null) {
      children.set(node.parent, [...(children.get(node.parent) ?? []), node.number])
    }
  }
  const groups: Group[] = []
  for (const root of nodes.filter(n => n.parent === null)) {
    const prs: number[] = []
    let isLinear = true
    const walk = (number: number) => {
      prs.push(number)
      const next = (children.get(number) ?? []).sort((a, b) => a - b)
      if (next.length > 1) isLinear = false
      next.forEach(walk)
    }
    walk(root.number)
    groups.push({ id: `pr-${root.number}`, prs, isLinear })
  }
  return groups.sort((a, b) => Math.min(...a.prs) - Math.min(...b.prs))
}

export function span(prs: readonly number[]): string {
  const sorted = [...prs].sort((a, b) => a - b)
  const [first, last] = [sorted[0], sorted[sorted.length - 1]]
  if (first === undefined || last === undefined) return ''
  if (sorted.length === 1) return `#${first}`
  const isRun = sorted.every((n, i) => i === 0 || n === (sorted[i - 1] ?? 0) + 1)
  if (isRun) return `#${first}–#${last}`
  if (sorted.length <= 4) return sorted.map(n => `#${n}`).join(', ')
  return `#${first} … #${last} (${sorted.length} PRs)`
}

function worst(verdicts: readonly PrVerdict[]): PrVerdict {
  return verdicts.reduce<PrVerdict>(
    (a, b) => (SEVERITY[b] > SEVERITY[a] ? b : a),
    'ready',
  )
}

function fileSet(group: Group, files: Snapshot['files']): Set<string> {
  const out = new Set<string>()
  for (const number of group.prs) {
    for (const file of files[number] ?? []) if (!NOISE.test(file)) out.add(file)
  }
  return out
}

/** The compare calls the loader should make: the tops of overlapping groups. */
export function comparePairs(
  snapshot: Snapshot,
  owners: Owners,
): { key: string; base: string; head: string }[] {
  const { nodes, groups } = build(snapshot, owners)
  const top = (g: Group) => nodes.get(g.prs[g.prs.length - 1] ?? 0)
  const pairs: { key: string; base: string; head: string }[] = []
  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      const [a, b] = [groups[i], groups[j]]
      if (!a || !b) continue
      const [ta, tb] = [top(a), top(b)]
      if (!ta || !tb) continue
      const shared = [...fileSet(a, snapshot.files)].some(f =>
        fileSet(b, snapshot.files).has(f),
      )
      if (shared) {
        pairs.push({ key: `${ta.sha}...${tb.sha}`, base: ta.sha, head: tb.sha })
      }
    }
  }
  return pairs
}

// ---------------------------------------------------------------- the view

function build(snapshot: Snapshot, owners: Owners) {
  const byHead = new Map(snapshot.pulls.map(p => [p.head.ref, p.number]))
  const stackOf = new Map<number, number>()
  for (const stack of snapshot.stacks) {
    for (const pr of stack.pull_requests) stackOf.set(pr.number, stack.number)
  }
  const nodes = new Map<number, PrNode>()
  for (const pull of snapshot.pulls) {
    const detail = snapshot.details[pull.number]
    const isDraft = pull.draft === true
    const { ci, staging } = summarizeCi(snapshot.checks[pull.number])
    const merge = mergeOf(isDraft, detail)
    const review = reviewOf(snapshot.reviews[pull.number])
    const { verdict, reasons } = judge(isDraft, ci, merge, review)
    const { owner, key } = ownerOf(pull.body, pull.head.ref, owners)
    const parent = byHead.get(pull.base.ref)
    nodes.set(pull.number, {
      number: pull.number,
      title: pull.title,
      url: pull.html_url,
      head: pull.head.ref,
      base: pull.base.ref,
      sha: pull.head.sha,
      labels: pull.labels.map(l => l.name),
      isDraft,
      ci,
      merge,
      review,
      owner,
      ownerKey: key,
      verdict,
      reasons,
      staging,
      commits: detail?.commits ?? 0,
      changed: detail?.changed_files ?? 0,
      updatedAt: pull.updated_at,
      stack: stackOf.get(pull.number) ?? null,
      parent: parent !== undefined && parent !== pull.number ? parent : null,
    })
  }
  const list = [...nodes.values()]
  return { nodes, list, groups: groupsOf(list) }
}

export function buildView(snapshot: Snapshot, owners: Owners): PrView {
  const { nodes, list, groups } = build(snapshot, owners)
  const node = (n: number) => nodes.get(n)
  const ownersOf = (prs: readonly number[]) => [
    ...new Set(prs.map(n => node(n)?.owner ?? 'unassigned')),
  ]
  const ownerLabel = (prs: readonly number[]) => ownersOf(prs).join(' + ')

  const stacks: PrStack[] = groups.map(group => {
    const members = group.prs.map(n => node(n)).filter((n): n is PrNode => !!n)
    const verdict = worst(members.map(n => n.verdict))
    let readyUpTo: number | null = null
    for (const m of members) {
      if (m.verdict !== 'ready') break
      readyUpTo = m.number
    }
    const next = members.find(m => m.verdict !== 'ready')
    const numbers = new Set(members.map(m => m.stack))
    const shared = numbers.size === 1 ? ([...numbers][0] ?? null) : null
    const bottom = members[0]
    let note: string
    if (!next) {
      note =
        members.length === 1
          ? 'Ready to merge.'
          : `All ${members.length} ready: merge from the top, #${group.prs[group.prs.length - 1]}.`
    } else if (readyUpTo !== null) {
      const done = group.prs.indexOf(readyUpTo) + 1
      note = `Ready up to #${readyUpTo} (${done} of ${members.length}). #${next.number}: ${next.reasons.join('; ')}.`
    } else if (members.length === 1) {
      note = `${next.reasons.join('; ')}.`
    } else {
      note = `Nothing to merge yet. First blocker #${next.number}: ${next.reasons.join('; ')}.`
    }
    return {
      id: group.id,
      number: shared,
      base: bottom?.base ?? 'main',
      prs: group.prs,
      owners: ownersOf(group.prs),
      verdict,
      readyUpTo,
      note,
    }
  })

  const notices: PrNotice[] = []

  // What can be merged, and what is only waiting.
  for (const stack of stacks) {
    const members = stack.prs.map(n => node(n)).filter((n): n is PrNode => !!n)
    if (stack.verdict === 'ready') {
      notices.push({
        kind: 'ready',
        prs: stack.prs,
        owner: ownerLabel(stack.prs),
        text:
          stack.prs.length === 1
            ? `#${stack.prs[0]} is ready to merge.`
            : `${span(stack.prs)} is ready: merge from the top, #${stack.prs[stack.prs.length - 1]}.`,
      })
    } else if (stack.readyUpTo !== null) {
      const done = stack.prs.slice(0, stack.prs.indexOf(stack.readyUpTo) + 1)
      notices.push({
        kind: 'ready',
        prs: done,
        owner: ownerLabel(done),
        text: `${span(done)} can merge now, from #${stack.readyUpTo}; the rest waits.`,
      })
    }
    const reviewing = members.filter(m => m.verdict === 'review')
    if (reviewing.length > 0 && stack.verdict !== 'broken' && stack.verdict !== 'waiting') {
      notices.push({
        kind: 'ready',
        prs: reviewing.map(m => m.number),
        text: `${span(reviewing.map(m => m.number))} green but still blocked by GitHub: ${reviewing[0]?.reasons[0] ?? 'a rule'}.`,
      })
    }
    const running = members.filter(m => m.ci.state === 'running')
    if (running.length > 0) {
      const pending = running.reduce((n, m) => n + m.ci.running, 0)
      const total = running.reduce((n, m) => n + m.ci.total, 0)
      notices.push({
        kind: 'wait',
        prs: running.map(m => m.number),
        owner: ownerLabel(running.map(m => m.number)),
        text: `CI running on ${span(running.map(m => m.number))}: ${pending} of ${total} checks still pending.`,
      })
    }
  }

  // What its own thread has to fix.
  for (const n of list) {
    if (n.verdict !== 'broken') continue
    notices.push({
      kind: 'thread',
      prs: [n.number],
      owner: n.owner,
      text: `#${n.number}: ${n.reasons.join('; ')}.`,
    })
  }
  for (const n of list) {
    if (n.staging === 'conflict' && n.verdict !== 'broken') {
      notices.push({
        kind: 'thread',
        prs: [n.number],
        owner: n.owner,
        text: `#${n.number} is left out of staging (its check conflicts).`,
      })
    }
    if (
      n.verdict !== 'ready' &&
      n.verdict !== 'draft' &&
      snapshot.now - Date.parse(n.updatedAt) > STALE_MS
    ) {
      notices.push({
        kind: 'tidy',
        prs: [n.number],
        owner: n.owner,
        text: `#${n.number} has not moved for ${Math.floor((snapshot.now - Date.parse(n.updatedAt)) / 86_400_000)} days.`,
      })
    }
  }

  // Where threads meet.
  for (const stack of stacks) {
    if (stack.owners.length > 1) {
      notices.push({
        kind: 'coordinate',
        prs: stack.prs,
        text: `${span(stack.prs)} is one stack with PRs of ${stack.owners.length} threads (${stack.owners.join(', ')}): agree who pushes to it.`,
      })
    }
  }
  const tops = (g: Group) => node(g.prs[g.prs.length - 1] ?? 0)
  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      const [a, b] = [groups[i], groups[j]]
      if (!a || !b) continue
      const [fa, fb] = [fileSet(a, snapshot.files), fileSet(b, snapshot.files)]
      const shared = [...fa].filter(f => fb.has(f))
      if (shared.length === 0) continue
      const [ta, tb] = [tops(a), tops(b)]
      if (!ta || !tb) continue
      const [oa, ob] = [ownerLabel(a.prs), ownerLabel(b.prs)]
      const both = [...a.prs, ...b.prs]
      const status = snapshot.compares[`${ta.sha}...${tb.sha}`]?.status
      // compare `a...b`: "ahead" means b holds a's head, "behind" means a holds b's.
      if (status === 'ahead' || status === 'behind') {
        const [inner, outer, oi, oo] =
          status === 'ahead' ? [a, b, oa, ob] : [b, a, ob, oa]
        notices.push({
          kind: 'coordinate',
          prs: both,
          text: `${span(outer.prs)} (${oo}) already contains the head of ${span(inner.prs)} (${oi}): merge ${span(inner.prs)} first, then ${span(outer.prs)} shows only its own changes.`,
        })
      } else if (oa !== ob) {
        const sample = shared.slice(0, 2).join(', ')
        notices.push({
          kind: 'coordinate',
          prs: both,
          text: `${span(a.prs)} (${oa}) and ${span(b.prs)} (${ob}) both change ${shared.length} file${shared.length === 1 ? '' : 's'} (${sample}${shared.length > 2 ? ', …' : ''}): the second to merge must merge main up first.`,
        })
      }
    }
  }

  // Stack hygiene: the project merges stacks from the top, so they must be
  // GitHub stacks, and a branch chain should be one.
  for (const group of groups) {
    if (group.prs.length > 1) {
      const numbers = new Set(group.prs.map(n => node(n)?.stack ?? null))
      if (numbers.size > 1 || numbers.has(null)) {
        notices.push({
          kind: 'tidy',
          prs: group.prs,
          text: `${span(group.prs)} are chained by base branches but not all in one GitHub stack.`,
        })
      }
    }
    if (!group.isLinear) {
      notices.push({
        kind: 'tidy',
        prs: group.prs,
        text: `${span(group.prs)} fork: two PRs share one base branch.`,
      })
    }
  }
  for (const stack of snapshot.stacks) {
    const where = new Set(
      stack.pull_requests.map(
        pr => groups.find(g => g.prs.includes(pr.number))?.id ?? '',
      ),
    )
    if (where.size > 1) {
      notices.push({
        kind: 'tidy',
        prs: stack.pull_requests.map(p => p.number),
        text: `GitHub stack ${stack.number} holds PRs whose base branches do not chain.`,
      })
    }
  }

  return {
    repo: snapshot.repo,
    fetchedAt: snapshot.now,
    nodes: list,
    stacks,
    notices,
    rate: snapshot.rate,
  }
}

// ---------------------------------------------------------------- text

const MARK: Record<PrVerdict, string> = {
  ready: '✓ READY',
  review: '◔ REVIEW',
  waiting: '◐ WAITING',
  broken: '✗ BROKEN',
  draft: '◌ DRAFT',
}

export function ciText(ci: PrCi): string {
  switch (ci.state) {
    case 'passed':
      return `CI ✓ ${ci.passed}/${ci.total}`
    case 'failed':
      return `CI ✗ ${ci.failed} failed`
    case 'running':
      return `CI ◐ ${ci.total - ci.running}/${ci.total}`
    default:
      return 'CI —'
  }
}

export function mergeText(merge: PrMerge): string {
  switch (merge) {
    case 'clean':
      return 'mergeable'
    case 'conflict':
      return 'conflicts'
    case 'behind':
      return 'behind base'
    case 'blocked':
      return 'blocked'
    case 'unstable':
      return 'optional check red'
    case 'draft':
      return 'draft'
    default:
      return 'checking'
  }
}

/** The whole view as plain text: for the command's output and for tests. */
export function reportText(view: PrView): string {
  const byNumber = new Map(view.nodes.map(n => [n.number, n]))
  const lines: string[] = []
  const stacks = view.stacks.filter(s => s.prs.length > 1).length
  lines.push(
    `${view.repo}: ${view.nodes.length} open PRs, ${stacks} stack${stacks === 1 ? '' : 's'}`,
  )
  const section = (title: string, kind: PrNotice['kind']) => {
    const items = view.notices.filter(n => n.kind === kind)
    if (items.length === 0) return
    lines.push('', title)
    for (const item of items) {
      lines.push(`  ${item.owner ? `[${item.owner}] ` : ''}${item.text}`)
    }
  }
  section('Ready for you', 'ready')
  section('Waiting on CI', 'wait')
  section('Needs its thread', 'thread')
  section('Needs coordination between threads', 'coordinate')
  section('Tidy', 'tidy')
  for (const stack of view.stacks) {
    lines.push(
      '',
      `${stack.prs.length > 1 ? `Stack${stack.number ? ` ${stack.number}` : ''}` : 'Single PR'} on ${stack.base} · ${stack.owners.join(' + ')} · ${MARK[stack.verdict]}`,
      `  ${stack.note}`,
    )
    for (const number of [...stack.prs].reverse()) {
      const n = byNumber.get(number)
      if (!n) continue
      lines.push(
        `  #${n.number} ${MARK[n.verdict]} · ${ciText(n.ci)} · ${mergeText(n.merge)} · ${n.title}`,
      )
    }
    lines.push(`  └ ${stack.base}`)
  }
  return lines.join('\n')
}

// ---------------------------------------------------------------- change

/** What moved between two loads, worth a toast: ready, broken, gone. */
export function changes(prev: PrView | null, next: PrView): string[] {
  if (!prev) return []
  const before = new Map(prev.nodes.map(n => [n.number, n.verdict]))
  const out: string[] = []
  for (const n of next.nodes) {
    const was = before.get(n.number)
    if (was === undefined || was === n.verdict) continue
    if (n.verdict === 'ready') out.push(`#${n.number} is ready`)
    if (n.verdict === 'broken') out.push(`#${n.number} needs ${n.owner}: ${n.reasons[0] ?? 'a fix'}`)
  }
  const now = new Set(next.nodes.map(n => n.number))
  for (const n of prev.nodes) if (!now.has(n.number)) out.push(`#${n.number} is closed or merged`)
  return out
}

/** One line for the status bar. */
export function statusLine(view: PrView): string {
  const count = (v: PrVerdict) => view.nodes.filter(n => n.verdict === v).length
  const parts = [
    `${view.nodes.length} PRs`,
    `✓${count('ready')}`,
    `◐${count('waiting')}`,
    `✗${count('broken')}`,
  ]
  const review = count('review')
  if (review > 0) parts.push(`◔${review}`)
  return parts.join(' ')
}
