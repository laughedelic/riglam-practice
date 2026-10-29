import { atom, read, update } from 'claude-code'
import type { EngineInterface, HttpResponse, Register } from 'claude-code'

import type { PrNode, PrVerdict, PrView } from '../types'
import { loadSnapshot, newCache, parseCurl, type Fetch } from './github'
import { buildView, changes, ciText, mergeText, reportText, statusLine } from './model'
import { parseOwners, type Owners } from './owners'

const PANE = 'pr-stacks'
const DEFAULT_REPO = 'laughedelic/riglam-practice'
const DEFAULT_OWNERS_FILE = '/mnt/project-files/tools/pr-stacks/owners.json'

type Config = { repo: string; ownersFile: string }

// What the pane draws from. Change a tag when its value's fields change: it
// declines what an earlier version stored, which outlives a reload.
const VIEW_SHAPE = 'view-1'
const view = atom({ plugin: 'pr-stacks', key: 'view' } as const, null as PrView | null, {
  shape: VIEW_SHAPE,
})
const load = atom({ plugin: 'pr-stacks', key: 'load' } as const, {
  isLoading: false,
  error: null as string | null,
})
const folded = atom({ plugin: 'pr-stacks', key: 'folded' } as const, [] as string[], {
  shape: 'folded-1',
})

// Answers that never change for a commit, kept for this load of the module.
const cache = newCache()
// How GitHub is reached on this host, settled on first use: `gh` when it is
// signed in, else curl, else `$.http.fetch`.
const transport: { hasGh: boolean | undefined; hasCurl: boolean } = {
  hasGh: undefined,
  hasCurl: true,
}
// The load in flight, so a second ask waits for it instead of starting another.
const running: { load: Promise<PrView | null> | null } = { load: null }

const COLOR: Record<PrVerdict, string> = {
  ready: 'success',
  review: 'suggestion',
  waiting: 'warning',
  broken: 'error',
  draft: 'subtle',
}
const GLYPH: Record<PrVerdict, string> = {
  ready: '✓',
  review: '◔',
  waiting: '◐',
  broken: '✗',
  draft: '◌',
}
const LABEL: Record<PrVerdict, string> = {
  ready: 'ready',
  review: 'review',
  waiting: 'waiting',
  broken: 'broken',
  draft: 'draft',
}

/** The owners file, then the names given with `/pr-stacks owner`, which win. */
async function ownersNow($: EngineInterface, file: string): Promise<Owners> {
  let fromFile: Owners = {}
  try {
    if (file && (await $.fs.exists(file))) fromFile = parseOwners(String(await $.fs.read(file)))
  } catch {
    // An unreadable file names nobody.
  }
  const stored = await $.store.get('owners')
  const extra =
    stored && typeof stored === 'object' ? (stored as Record<string, string>) : {}
  return { ...fromFile, ...extra }
}

function ago(now: number, iso: string): string {
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60000))
  if (minutes < 60) return `${minutes}m ago`
  if (minutes < 48 * 60) return `${Math.round(minutes / 60)}h ago`
  return `${Math.round(minutes / 1440)}d ago`
}

function clock(ms: number): string {
  return new Date(ms).toISOString().slice(11, 16) + 'Z'
}

/** The view the last load kept, read outside a drawing. */
async function lastView($: EngineInterface): Promise<PrView | null> {
  const { value } = await $.state.get({ plugin: 'pr-stacks', key: 'view' })
  return value?.shape === VIEW_SHAPE ? value.value : null
}

/**
 * `gh` first: it signs the calls with the person's login. Then curl: in a cloud
 * container it goes through the agent proxy, which signs GitHub calls, where
 * the host's own fetch is anonymous and soon rate limited.
 */
function fetcher($: EngineInterface): Fetch {
  return async (url, init): Promise<HttpResponse> => {
    if (transport.hasGh === undefined) {
      try {
        transport.hasGh = (await $.process.run(['gh', 'auth', 'status'])).exitCode === 0
      } catch {
        transport.hasGh = false
      }
    }
    if (transport.hasGh) {
      const argv = ['gh', 'api', '-i']
      for (const [name, value] of Object.entries(init.headers)) argv.push('-H', `${name}: ${value}`)
      argv.push(url.replace(/^https:\/\/api\.github\.com\//, ''))
      const ran = await $.process.run(argv, { timeoutMs: 40_000 })
      // gh exits 1 on an HTTP error but still prints the response.
      if (ran.stdout.startsWith('HTTP/')) return parseCurl(ran.stdout)
      throw new Error(`gh: ${ran.stderr.trim().slice(0, 160)}`)
    }
    if (transport.hasCurl) {
      const argv = ['curl', '-sS', '-i', '--max-time', '30']
      for (const [name, value] of Object.entries(init.headers)) argv.push('-H', `${name}: ${value}`)
      argv.push(url)
      let ran: { exitCode: number; stdout: string; stderr: string } | undefined
      try {
        ran = await $.process.run(argv, { timeoutMs: 40_000 })
      } catch {
        transport.hasCurl = false
      }
      if (ran) {
        if (ran.exitCode !== 0) throw new Error(`curl: ${ran.stderr.trim().slice(0, 160)}`)
        return parseCurl(ran.stdout)
      }
    }
    return $.http.fetch(url, init)
  }
}

/** Loads GitHub and replaces the view; a failure keeps the old view. */
function refresh($: EngineInterface, config: Config): Promise<PrView | null> {
  running.load ??= reload($, config).finally(() => {
    running.load = null
  })
  return running.load
}

async function reload($: EngineInterface, { repo, ownersFile }: Config): Promise<PrView | null> {
  await update($, load, () => ({ isLoading: true, error: null }))
  try {
    const owners = await ownersNow($, ownersFile)
    const now = await $.clock.now()
    const { snapshot, warnings } = await loadSnapshot(
      fetcher($),
      ms => $.clock.sleep(ms),
      repo,
      owners,
      cache,
      now,
    )
    const next = buildView(snapshot, owners)
    const prev = await lastView($)
    await update($, view, () => next)
    await update($, load, () => ({
      isLoading: false,
      error: warnings.length > 0 ? `${warnings.length} calls failed: ${warnings[0]}` : null,
    }))
    $.ui.status(statusLine(next))
    const moved = changes(prev, next)
    if (moved.length > 0) $.ui.toast(`PR stacks: ${moved.join('; ')}`, { timeoutMs: 8000 })
    return next
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await update($, load, () => ({ isLoading: false, error: message }))
    return null
  }
}

export const register: Register = (on, options) => {
  const repo = typeof options.repo === 'string' && options.repo ? options.repo : DEFAULT_REPO
  const minutes = typeof options.refreshMinutes === 'number' ? options.refreshMinutes : 10
  const ownersFile =
    typeof options.ownersFile === 'string' ? options.ownersFile : DEFAULT_OWNERS_FILE
  const config: Config = { repo, ownersFile }

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'pr-stacks',
      description: 'Open PR stacks: CI, conflicts, owners, what is ready to merge',
      argumentHint: '[refresh | text | owner <key> <name>]',
    })
    await $.tool.register({
      name: 'report',
      description: `The open pull requests of ${repo} as stacks, freshly loaded: what is ready to merge, what waits on CI, what its owning thread must fix, what needs coordination between threads, and each stack's PRs with CI and merge state. Plain text.`,
      inputSchema: { type: 'object', properties: {} },
    })
    void $.ui.open({ id: PANE, title: 'PR stacks' })
    void refresh($, config)
    if (minutes > 0) $.clock.every(minutes * 60_000, () => void refresh($, config))
    return next(e)
  })

  // The tool's name is only typed once the engine has listed it, hence the RegExp.
  on('tool.call', { tool: /^mcp__pr-stacks__report$/ }, async $ => {
    const shown = (await refresh($, config)) ?? (await lastView($))
    if (!shown) {
      const { value } = await $.state.get({ plugin: 'pr-stacks', key: 'load' })
      return { result: `No data yet${value?.error ? `: ${value.error}` : ''}.` }
    }
    const panes = await $.ui.panes()
    const pane = panes.find(p => p.id === PANE)
    const surfaces = (await $.session.surfaces()).join(', ') || 'none'
    const where = pane?.isPlaced ? 'shown' : 'open, not placed by any surface'
    return { result: `${reportText(shown)}\n\n(pane: ${pane ? where : 'closed'}; surfaces: ${surfaces})` }
  }).catch(() => ({ result: 'pr-stacks could not build the report.' }))

  on('command.run', { command: 'pr-stacks' }, async ($, e) => {
    const [word = '', ...rest] = e.args.trim().split(/\s+/)
    if (word === 'owner') {
      const [key, ...name] = rest
      if (!key || name.length === 0) {
        return { text: 'Usage: /pr-stacks owner <thread id or branch token> <thread name>' }
      }
      const stored = (await $.store.get('owners')) as Record<string, string> | undefined
      await $.store.set('owners', { ...stored, [key]: name.join(' ') })
      await refresh($, config)
      return { text: `${key} is now ${name.join(' ')}.` }
    }
    await $.ui.open({ id: PANE, title: 'PR stacks' })
    const fresh = await refresh($, config)
    const shown = fresh ?? (await lastView($))
    if (!shown) {
      const { value } = await $.state.get({ plugin: 'pr-stacks', key: 'load' })
      return { text: `No data yet${value?.error ? `: ${value.error}` : ''}.` }
    }
    return { text: reportText(shown) }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Link } = $.ui.resolve(e)
    const data = await read($, view)
    const state = await read($, load)
    const fold = await read($, folded)

    const byNumber = new Map((data?.nodes ?? []).map(n => [n.number, n]))
    const count = (v: PrVerdict) => (data?.nodes ?? []).filter(n => n.verdict === v).length
    const stackCount = (data?.stacks ?? []).filter(s => s.prs.length > 1).length

    const Row = (n: PrNode, rail: string, now: number) => (
      <Box key={`pr-${n.number}`} flexDirection="row" gap={1}>
        <Text dimColor>{rail}</Text>
        <Box flexDirection="column" flexShrink={1}>
          <Box flexDirection="row" gap={1}>
            <Link href={n.url} label={`#${n.number}`} />
            <Text color={COLOR[n.verdict]} bold>
              {GLYPH[n.verdict]} {LABEL[n.verdict]}
            </Text>
            <Text wrap="truncate-end">{n.title.replace(/^[a-z]+(\([^)]*\))?!?: /, '')}</Text>
          </Box>
          <Text dimColor wrap="truncate-end">
            {[
              ciText(n.ci),
              n.merge === 'blocked' && n.ci.state === 'running' ? '' : mergeText(n.merge),
              n.staging === 'conflict' ? 'left out of staging' : '',
              n.owner,
              n.review === 'approved' ? 'approved' : n.review === 'changes' ? 'changes requested' : '',
              n.labels.includes('staging') ? 'staging' : '',
              ago(now, n.updatedAt),
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          {n.reasons.length > 0 && n.verdict !== 'draft' && (
            <Text color={COLOR[n.verdict]} wrap="truncate-end">
              {n.reasons.join('; ')}
            </Text>
          )}
        </Box>
      </Box>
    )

    const board = (
      title: string,
      kind: 'ready' | 'wait' | 'thread' | 'coordinate' | 'tidy',
      color: string,
    ) => {
      const items = (data?.notices ?? []).filter(n => n.kind === kind)
      if (items.length === 0) return null
      return (
        <Box key={kind} flexDirection="column">
          <Text color={color} bold>
            {title}
          </Text>
          {items.map((item, i) => (
            <Box key={`${kind}-${i}`}>
              <Text wrap="wrap">
                {'• '}
                {item.owner ? <Text dimColor>{`[${item.owner}] `}</Text> : null}
                {item.text}
              </Text>
            </Box>
          ))}
        </Box>
      )
    }

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="row" justifyContent="space-between">
          <Text bold>{data?.repo ?? 'PR stacks'}</Text>
          <Button
            key="refresh"
            label={state.isLoading ? 'Loading…' : 'Refresh'}
            hotkey="r"
            onPress={() => {
              void refresh($, config)
            }}
          />
        </Box>

        {data ? (
          <Box flexDirection="column">
            <Text>
              {data.nodes.length} open · {stackCount} stack{stackCount === 1 ? '' : 's'}
              {' · '}
              <Text color="success">✓ {count('ready')} ready</Text>
              {' · '}
              <Text color="suggestion">◔ {count('review')} review</Text>
              {' · '}
              <Text color="warning">◐ {count('waiting')} waiting</Text>
              {' · '}
              <Text color="error">✗ {count('broken')} broken</Text>
              {count('draft') > 0 ? ` · ${count('draft')} draft` : ''}
            </Text>
            <Text dimColor>
              updated {clock(data.fetchedAt)}
              {data.rate ? ` · GitHub API ${data.rate.remaining}/${data.rate.limit} left` : ''}
            </Text>
          </Box>
        ) : (
          <Text dimColor>{state.isLoading ? 'Loading the open PRs…' : 'No data yet.'}</Text>
        )}
        {state.error && (
          <Text color="error" wrap="wrap">
            {state.error}
          </Text>
        )}

        {data && (
          <Box flexDirection="column" gap={1}>
            {board('Ready for you', 'ready', 'success')}
            {board('Waiting on CI', 'wait', 'warning')}
            {board('Needs its thread', 'thread', 'error')}
            {board('Needs coordination between threads', 'coordinate', 'merged')}
            {board('Tidy', 'tidy', 'subtle')}
          </Box>
        )}

        {data?.stacks.map(stack => {
          const isFolded = fold.includes(stack.id)
          const nodes = [...stack.prs]
            .reverse()
            .map(n => byNumber.get(n))
            .filter((n): n is PrNode => !!n)
          const title =
            stack.prs.length > 1
              ? `Stack${stack.number ? ` ${stack.number}` : ''} · ${stack.prs.length} PRs`
              : 'Single PR'
          return (
            <Box key={stack.id} flexDirection="column">
              <Box flexDirection="row" gap={1}>
                <Button
                  key={`fold-${stack.id}`}
                  plain
                  label={`${isFolded ? '▸' : '▾'} ${title}`}
                  onPress={() => {
                    void update($, folded, list =>
                      list.includes(stack.id)
                        ? list.filter(id => id !== stack.id)
                        : [...list, stack.id],
                    )
                  }}
                />
                <Text color={COLOR[stack.verdict]} bold>
                  {GLYPH[stack.verdict]} {LABEL[stack.verdict]}
                </Text>
                <Text dimColor wrap="truncate-end">
                  {stack.owners.join(' + ')}
                </Text>
              </Box>
              <Text dimColor wrap="wrap">
                {stack.note}
              </Text>
              {!isFolded &&
                nodes.map((n, i) =>
                  Row(n, i === nodes.length - 1 ? '└' : '│', data.fetchedAt),
                )}
              {!isFolded && (
                <Text dimColor>
                  {'  '}
                  {stack.base}
                </Text>
              )}
            </Box>
          )
        })}

        <Text dimColor wrap="wrap">
          Merging a stack from its top PR squashes every PR below it. Name a thread with
          /pr-stacks owner {'<branch token> <name>'}.
        </Text>
      </Box>
    )
  })
}
