import { expect, test } from 'claude-code/testing'

import type { PrView } from '../types'

const VIEW: PrView = {
  repo: 'o/r',
  fetchedAt: Date.parse('2026-10-29T05:00:00Z'),
  rate: { remaining: 14000, limit: 15000 },
  nodes: [
    {
      number: 7,
      title: 'feat: a thing',
      url: 'https://github.com/o/r/pull/7',
      head: 'claude/project-thread-2hlkty-a',
      base: 'main',
      sha: 'abc',
      labels: ['staging'],
      isDraft: false,
      ci: { state: 'passed', passed: 4, failed: 0, running: 0, total: 4, failedNames: [] },
      merge: 'clean',
      review: 'none',
      owner: 'Ladder thread',
      ownerKey: '2hlkty',
      verdict: 'ready',
      reasons: [],
      staging: 'in',
      commits: 2,
      changed: 3,
      updatedAt: '2026-10-29T04:00:00Z',
      stack: null,
      parent: null,
    },
  ],
  stacks: [
    {
      id: 'pr-7',
      number: null,
      base: 'main',
      prs: [7],
      owners: ['Ladder thread'],
      verdict: 'ready',
      readyUpTo: 7,
      note: 'Ready to merge.',
    },
  ],
  notices: [{ kind: 'ready', prs: [7], owner: 'Ladder thread', text: '#7 is ready to merge.' }],
}

const PANE = {
  plugin: 'pr-stacks',
  component: 'Pane',
  requestId: 'pr-stacks',
  props: {
    title: 'PR stacks',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

test('the pane shows the ready PR and its owner on every surface', async ($, on) => {
  on('state.get', (_, e) => {
    if (e.key === 'view') return { value: { value: { shape: 'view-1', value: VIEW }, version: 1 } }
    if (e.key === 'folded') return { value: { value: { shape: 'folded-1', value: [] }, version: 1 } }
    return { value: { value: undefined, version: 0 } }
  })

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /#7 is ready to merge/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /1 open/ })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'refresh' })).toBeDefined()
    await ui.unmount()
  }
})

test('before the first load the pane says so', async ($, on) => {
  on('state.get', () => ({ value: { value: undefined, version: 0 } }))

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /No data yet/ })).toBeDefined()
  await ui.unmount()
})
