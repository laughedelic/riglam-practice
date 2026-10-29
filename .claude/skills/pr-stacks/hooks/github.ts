// The loader: GitHub's REST API into a Snapshot. The caller hands it a fetch:
// curl on the host first (it goes through the machine's proxy and whatever
// GitHub credentials that adds), else `$.http.fetch`. A public repository needs
// no token; the rate limit GitHub reports is shown in the pane.
import type { HttpResponse } from 'claude-code'

import {
  comparePairs,
  type GhCheckRun,
  type GhCompare,
  type GhDetail,
  type GhPull,
  type GhReview,
  type GhStack,
  type Snapshot,
} from './model'
import type { Owners } from './owners'

export type Fetch = (url: string, init: { headers: Record<string, string> }) => Promise<HttpResponse>

/** Reads `curl -i` output: the last header block (after any proxy CONNECT) and the body. */
export function parseCurl(raw: string): HttpResponse {
  let rest = raw
  for (;;) {
    const end = rest.search(/\r?\n\r?\n/)
    if (end < 0) return { status: 0, ok: false, headers: {}, text: rest }
    const head = rest.slice(0, end)
    const body = rest.slice(end).replace(/^\r?\n\r?\n/, '')
    const [statusLine = '', ...lines] = head.split(/\r?\n/)
    const status = Number(statusLine.split(' ')[1] ?? 0)
    const isInterim =
      status === 100 || (status === 200 && /connection established/i.test(statusLine))
    if (isInterim && /^HTTP\//.test(body)) {
      rest = body
      continue
    }
    const headers: Record<string, string> = {}
    for (const line of lines) {
      const colon = line.indexOf(':')
      if (colon > 0) headers[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim()
    }
    return { status, ok: status >= 200 && status < 300, headers, text: body }
  }
}

/** Answers that never change for a given commit: kept across refreshes. */
export type Cache = {
  files: Record<string, string[]>
  compares: Record<string, GhCompare>
}

export const newCache = (): Cache => ({ files: {}, compares: {} })

const WIDTH = 4
const MAX_COMPARES = 12
const LOW_RATE = 30

async function pool<T>(items: readonly T[], width: number, work: (item: T) => Promise<void>) {
  const queue = [...items]
  const lanes = Array.from({ length: Math.min(width, queue.length) }, async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) {
      await work(item)
    }
  })
  await Promise.all(lanes)
}

export async function loadSnapshot(
  fetch: Fetch,
  sleep: (ms: number) => Promise<unknown>,
  repo: string,
  owners: Owners,
  cache: Cache,
  now: number,
): Promise<{ snapshot: Snapshot; warnings: string[] }> {
  const seen: { rate: Snapshot['rate'] } = { rate: null }
  const warnings: string[] = []

  async function get<T>(path: string, version?: string): Promise<T> {
    const url = `https://api.github.com${path}`
    const res = await fetch(url, {
      headers: {
        accept: 'application/vnd.github+json',
        'user-agent': 'pr-stacks-mod',
        ...(version ? { 'x-github-api-version': version } : {}),
      },
    })
    const left = res.headers['x-ratelimit-remaining']
    const limit = res.headers['x-ratelimit-limit']
    if (left !== undefined && limit !== undefined) {
      seen.rate = { remaining: Number(left), limit: Number(limit) }
    }
    if (!res.ok) {
      const limited = left === '0' ? ` (rate limit ${limit} spent)` : ''
      const said = res.text.replace(/\s+/g, ' ').slice(0, 160)
      throw new Error(`${res.status} on ${path}${limited}: ${said}`)
    }
    return JSON.parse(res.text) as T
  }

  /** One of many calls: a failure is a warning, not the end of the refresh. */
  async function soft<T>(path: string, version?: string): Promise<T | undefined> {
    try {
      return await get<T>(path, version)
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : String(error))
      return undefined
    }
  }

  const pulls = await get<GhPull[]>(`/repos/${repo}/pulls?state=open&per_page=100`)
  if (seen.rate && seen.rate.remaining < LOW_RATE) {
    throw new Error(`GitHub rate limit nearly spent (${seen.rate.remaining} calls left)`)
  }

  const stackList =
    (await soft<(GhStack & { open?: boolean })[]>(`/repos/${repo}/stacks`, '2026-03-10')) ?? []
  const stacks = stackList.filter(s => s.open !== false)

  const details: Snapshot['details'] = {}
  const checks: Snapshot['checks'] = {}
  const reviews: Snapshot['reviews'] = {}
  const files: Snapshot['files'] = {}

  await pool(pulls, WIDTH, async pull => {
    const n = pull.number
    const [detail, runs, revs] = await Promise.all([
      soft<GhDetail>(`/repos/${repo}/pulls/${n}`),
      soft<{ check_runs: GhCheckRun[] }>(
        `/repos/${repo}/commits/${pull.head.sha}/check-runs?per_page=100`,
      ),
      soft<GhReview[]>(`/repos/${repo}/pulls/${n}/reviews?per_page=100`),
    ])
    details[n] = detail
    checks[n] = runs?.check_runs
    reviews[n] = revs
    const known = cache.files[pull.head.sha]
    if (known) {
      files[n] = known
    } else {
      const names: string[] = []
      for (let page = 1; page <= 3; page++) {
        const part = await soft<{ filename: string }[]>(
          `/repos/${repo}/pulls/${n}/files?per_page=100&page=${page}`,
        )
        if (!part) break
        names.push(...part.map(f => f.filename))
        if (part.length < 100) {
          cache.files[pull.head.sha] = names
          files[n] = names
          break
        }
      }
      files[n] ??= names
    }
  })

  // GitHub computes mergeability lazily: ask once more for the ones it has not.
  const pending = pulls.filter(p => details[p.number]?.mergeable === null)
  if (pending.length > 0) {
    await sleep(2500)
    await pool(pending, WIDTH, async pull => {
      const again = await soft<GhDetail>(`/repos/${repo}/pulls/${pull.number}`)
      if (again) details[pull.number] = again
    })
  }

  const snapshot: Snapshot = {
    repo,
    now,
    pulls,
    details,
    checks,
    reviews,
    files,
    stacks,
    compares: { ...cache.compares },
    rate: seen.rate,
  }

  const wanted = comparePairs(snapshot, owners)
    .filter(p => !cache.compares[p.key])
    .slice(0, MAX_COMPARES)
  await pool(wanted, WIDTH, async pair => {
    const result = await soft<GhCompare>(
      `/repos/${repo}/compare/${pair.base}...${pair.head}?per_page=1`,
    )
    if (result) {
      cache.compares[pair.key] = {
        status: result.status,
        ahead_by: result.ahead_by,
        behind_by: result.behind_by,
      }
      snapshot.compares[pair.key] = cache.compares[pair.key]
    }
  })

  snapshot.rate = seen.rate
  return { snapshot, warnings }
}
