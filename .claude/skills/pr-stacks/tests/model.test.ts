import { expect, test } from 'claude-code/testing'

import {
  buildView,
  changes,
  comparePairs,
  summarizeCi,
  type GhCheckRun,
  type GhDetail,
  type GhPull,
  type Snapshot,
} from '../hooks/model'
import { parseCurl } from '../hooks/github'
import { ownerOf, parseOwners } from '../hooks/owners'

const pull = (number: number, head: string, base: string, extra: Partial<GhPull> = {}): GhPull => ({
  number,
  title: `feat: pr ${number}`,
  html_url: `https://github.com/o/r/pull/${number}`,
  body: null,
  labels: [],
  head: { ref: head, sha: `sha${number}` },
  base: { ref: base },
  updated_at: '2026-10-29T04:00:00Z',
  ...extra,
})
const run = (name: string, status: string, conclusion: string | null): GhCheckRun => ({
  name,
  status,
  conclusion,
})
const green = [run('Lint', 'completed', 'success'), run('Unit', 'completed', 'success')]
const clean: GhDetail = { mergeable: true, mergeable_state: 'clean', commits: 2, changed_files: 3 }
const snap = (over: Partial<Snapshot>): Snapshot => ({
  repo: 'o/r',
  now: Date.parse('2026-10-29T05:00:00Z'),
  pulls: [],
  details: {},
  checks: {},
  reviews: {},
  files: {},
  stacks: [],
  compares: {},
  rate: null,
  ...over,
})
const owners = {
  '2hlkty': 'Ladder thread',
  '76esap': 'Path thread',
  cmsg_01PathThread: 'Path thread',
}

test('a stack follows the base branches and is ready up to the first PR that is not', () => {
  const view = buildView(
    snap({
      pulls: [pull(1, 'a', 'main'), pull(2, 'b', 'a'), pull(3, 'c', 'b')],
      details: { 1: clean, 2: clean, 3: { ...clean, mergeable_state: 'blocked' } },
      checks: { 1: green, 2: green, 3: [run('Lint', 'in_progress', null)] },
      stacks: [{ number: 9, pull_requests: [{ number: 1 }, { number: 2 }, { number: 3 }] }],
    }),
    owners,
  )
  expect(view.stacks.length).toBe(1)
  expect(view.stacks[0]?.prs).toEqual([1, 2, 3])
  expect(view.stacks[0]?.number).toBe(9)
  expect(view.stacks[0]?.readyUpTo).toBe(2)
  expect(view.stacks[0]?.verdict).toBe('waiting')
  expect(view.notices.some(n => n.kind === 'ready' && n.text.includes('#1–#2 can merge now'))).toBe(true)
  expect(view.notices.some(n => n.kind === 'wait')).toBe(true)
})

test('a whole green stack says to merge from the top', () => {
  const view = buildView(
    snap({
      pulls: [pull(1, 'a', 'main'), pull(2, 'b', 'a')],
      details: { 1: clean, 2: clean },
      checks: { 1: green, 2: green },
      stacks: [{ number: 9, pull_requests: [{ number: 1 }, { number: 2 }] }],
    }),
    owners,
  )
  expect(view.stacks[0]?.verdict).toBe('ready')
  expect(view.notices.find(n => n.kind === 'ready')?.text).toContain('merge from the top, #2')
})

test('a conflict goes to the thread that owns the branch', () => {
  const view = buildView(
    snap({
      pulls: [pull(5, 'claude/project-thread-2hlkty-x', 'main')],
      details: { 5: { ...clean, mergeable: false, mergeable_state: 'dirty' } },
      checks: { 5: green },
    }),
    owners,
  )
  expect(view.nodes[0]?.verdict).toBe('broken')
  const notice = view.notices.find(n => n.kind === 'thread')
  expect(notice?.owner).toBe('Ladder thread')
  expect(notice?.text).toContain('merge conflicts')
})

test('a failed check is named, and the staging checks are not CI', () => {
  const { ci, staging } = summarizeCi([
    run('Lint', 'completed', 'success'),
    run('Browser tests (layout)', 'completed', 'failure'),
    run('staging', 'completed', 'failure'),
    run('Rebuild staging', 'completed', 'cancelled'),
  ])
  expect(ci.state).toBe('failed')
  expect(ci.failedNames).toEqual(['Browser tests (layout)'])
  expect(ci.total).toBe(2)
  expect(staging).toBe('conflict')
})

test('the attribution link beats the branch token, and the release PR is nobody\'s thread', () => {
  const body = '_Requested by **A** · [project thread](https://claude.ai/code/project/chan_1?thread=cmsg_01PathThread)_'
  expect(ownerOf(body, 'claude/project-thread-2hlkty', owners).owner).toBe('Path thread')
  expect(ownerOf(null, 'claude/project-thread-zzzzzz-1', owners).owner).toBe('thread zzzzzz')
  expect(ownerOf(null, 'release-please--branches--main', owners).owner).toBe('release-please')
  expect(ownerOf(null, 'feature/x', owners).owner).toBe('unassigned')
})

test('two stacks that change the same files need coordination; release files do not count', () => {
  const base = {
    pulls: [
      pull(10, 'claude/project-thread-2hlkty-a', 'main'),
      pull(20, 'claude/project-thread-76esap-5', 'main'),
    ],
    details: { 10: clean, 20: clean },
    checks: { 10: green, 20: green },
  }
  const only = (shared: string[]) =>
    snap({ ...base, files: { 10: ['x.ts', ...shared], 20: ['y.ts', ...shared] } })

  const noise = buildView(only(['CHANGELOG.md', 'package.json']), owners)
  expect(noise.notices.some(n => n.kind === 'coordinate')).toBe(false)

  const real = buildView(only(['src/app/path/a.ts']), owners)
  const text = real.notices.find(n => n.kind === 'coordinate')?.text ?? ''
  expect(text).toContain('Ladder thread')
  expect(text).toContain('Path thread')
  expect(text).toContain('both change 1 file')

  // The compare of the tops asks the loader for exactly this pair.
  expect(comparePairs(only(['src/app/path/a.ts']), owners).map(p => p.key)).toEqual(['sha10...sha20'])
  expect(comparePairs(only([]), owners)).toEqual([])
})

test('a stack that already holds another PR\'s head says which to merge first', () => {
  const view = buildView(
    snap({
      pulls: [pull(10, 'claude/project-thread-2hlkty-a', 'main'), pull(20, 'claude/project-thread-76esap-5', 'main')],
      details: { 10: clean, 20: clean },
      checks: { 10: green, 20: green },
      files: { 10: ['s.ts'], 20: ['s.ts'] },
      // compare 10...20: the head of 20 is behind 10, so #10 holds #20.
      compares: { 'sha10...sha20': { status: 'behind', ahead_by: 0, behind_by: 3 } },
    }),
    owners,
  )
  const text = view.notices.find(n => n.kind === 'coordinate')?.text ?? ''
  expect(text).toContain('#10 (Ladder thread) already contains the head of #20')
  expect(text).toContain('merge #20 first')
})

test('PRs chained by branches but outside a GitHub stack are flagged', () => {
  const view = buildView(
    snap({
      pulls: [pull(1, 'a', 'main'), pull(2, 'b', 'a')],
      details: { 1: clean, 2: clean },
      checks: { 1: green, 2: green },
    }),
    owners,
  )
  expect(view.notices.some(n => n.kind === 'tidy' && n.text.includes('not all in one GitHub stack'))).toBe(true)
})

test('a toast names what became ready or broken, and what left', () => {
  const ready = snap({
    pulls: [pull(1, 'a', 'main'), pull(2, 'b', 'main')],
    details: { 1: clean, 2: clean },
    checks: { 1: [run('Lint', 'in_progress', null)], 2: green },
  })
  const before = buildView(ready, owners)
  const after = buildView(
    snap({ ...ready, pulls: [pull(1, 'a', 'main')], checks: { 1: green } }),
    owners,
  )
  expect(changes(null, after)).toEqual([])
  expect(changes(before, after)).toEqual(['#1 is ready', '#2 is closed or merged'])
})

test('curl output through a proxy reads as the last response', () => {
  const raw =
    'HTTP/1.1 200 Connection Established\r\n\r\n' +
    'HTTP/1.1 200 OK\r\nX-RateLimit-Remaining: 14876\r\nX-RateLimit-Limit: 15000\r\n\r\n[{"number":1}]'
  const res = parseCurl(raw)
  expect(res.status).toBe(200)
  expect(res.ok).toBe(true)
  expect(res.headers['x-ratelimit-remaining']).toBe('14876')
  expect(JSON.parse(res.text)).toEqual([{ number: 1 }])
  expect(parseCurl('HTTP/2 404\r\n\r\n{}').ok).toBe(false)
})

test('an owners file is a JSON object of names; anything else names nobody', () => {
  expect(parseOwners('{"2hlkty": "Ladder thread", "n": 3}')).toEqual({ '2hlkty': 'Ladder thread' })
  expect(parseOwners('[1, 2]')).toEqual({})
  expect(parseOwners('not json')).toEqual({})
})
