import { expect, mock, test } from 'claude-code/testing'

import { isOverviewUpdate, TITLE_TOOL } from './register'

const OVERVIEW = 'mcp__overview__update'

test('both spellings of overview update are recognised', () => {
  expect(isOverviewUpdate('mcp__overview__update')).toBe(true)
  expect(isOverviewUpdate('mcp__plugin_overview_overview__update')).toBe(true)
  expect(isOverviewUpdate('mcp__linear__update')).toBe(false)
  expect(isOverviewUpdate('mcp__overview__updater')).toBe(false)
})

test('the rule joins the system prompt only for a watched main conversation with the tool', async ($, on) => {
  on('prompt.compose', async () => ({ sections: [{ id: 'intro', text: 'i', scope: 'shared' }] }) as never)
  const compose = (surfaces: readonly 'desktop'[], tools: readonly string[], traits: readonly never[] = []) =>
    $.prompt.compose({ model: 'm', promptModel: 'm', outputStyle: null, surfaces, tools, traits })
  const watched = await compose(['desktop'], [TITLE_TOOL])
  expect(watched.sections.map(s => s.id)).toEqual(['intro', 'session-title:rule'])
  expect(watched.sections[1]?.text).toContain('<issue or task> <subject> <state>')
  expect((await compose([], [TITLE_TOOL])).sections.map(s => s.id)).toEqual(['intro'])
  expect((await compose(['desktop'], ['Bash'])).sections.map(s => s.id)).toEqual(['intro'])
  expect((await compose(['desktop'], [TITLE_TOOL], ['teammate' as never])).sections.map(s => s.id)).toEqual(['intro'])
  expect((await compose(['desktop'], [TITLE_TOOL], ['bare' as never])).sections.map(s => s.id)).toEqual(['intro'])
})

test('a rule section already there is replaced, not doubled', async ($, on) => {
  on('prompt.compose', async () => ({ sections: [{ id: 'intro', text: 'i', scope: 'shared' }, { id: 'session-title:rule', text: 'old', scope: 'session' }] }) as never)
  const composed = await $.prompt.compose({ model: 'm', promptModel: 'm', outputStyle: null, surfaces: ['desktop'], tools: [TITLE_TOOL], traits: [] })
  expect(composed.sections.map(s => s.id)).toEqual(['intro', 'session-title:rule'])
  expect(composed.sections[1]?.text).not.toBe('old')
})

// A stored tool result as the engine writes it: a successful one carries no is_error key at all.
const row = (tool: string, isError?: boolean, agentId?: string, uuid = 'u1') =>
  ({
    door: 'tool-result',
    origin: { kind: 'tool', tool },
    uuid,
    ...(agentId === undefined ? {} : { agentId }),
    message: {
      type: 'user',
      role: 'user',
      isMeta: false,
      content: [{ type: 'tool_result', tool_use_id: uuid, content: 'Updated the pane.', ...(isError === undefined ? {} : { is_error: isError }) }],
    },
  }) as never

type Block = { type: string; text?: string; tool_use_id?: string }

// The content blocks of the row as stored by this append; fails when the append stored nothing.
const stored = async ($: { session: { append: (r: never) => Promise<unknown> } }, session: ReturnType<typeof mock.session>, r: never): Promise<readonly Block[]> => {
  const before = session.appended().length
  await $.session.append(r)
  expect(session.appended().length).toBe(before + 1)
  return (session.appended().at(-1) as { message: { content: readonly Block[] } }).message.content
}

const texts = (blocks: readonly Block[]) => blocks.filter(b => b.type === 'text').map(b => b.text ?? '')

test('where the session has no rename tool, an overview update result is stored as it came', async ($, on) => {
  on('tool.list', async () => ({ value: [{ name: 'Bash', description: 'b', mcp: false }] }) as never)
  const session = mock.session(on)
  const blocks = await stored($, session, row(OVERVIEW, undefined, undefined, 'u0'))
  expect(blocks.length).toBe(1)
  expect(blocks[0]?.tool_use_id).toBe('u0')
})

test('a rename tool in the tool list is enough for the reminder, after the result', async ($, on) => {
  on('tool.list', async () => ({ value: [{ name: TITLE_TOOL, description: 'r', mcp: true }] }) as never)
  const session = mock.session(on)
  const blocks = await stored($, session, row(OVERVIEW))
  expect(blocks.length).toBe(2)
  expect(blocks[0]?.tool_use_id).toBe('u1')
  expect(texts(blocks).join(' ')).toContain(TITLE_TOOL)
})

test('the rename tool is kept in front and its description keeps its own words and carries the rule', async ($, on) => {
  on('tool.describe', async () => ({ description: 'Rename a CCD session', isDeferred: true }) as never)
  const title = await $.tool.describe({ tool: TITLE_TOOL, description: 'd' } as never)
  expect(title.isDeferred).toBe(false)
  expect(title.description.startsWith('Rename a CCD session')).toBe(true)
  expect(title.description).toContain('whenever the task')
  const other = await $.tool.describe({ tool: 'mcp__other__x', description: 'd' } as never)
  expect(other.isDeferred).toBe(true)
  expect(other.description).toBe('Rename a CCD session')
})

const describeTitleTool = async ($: { tool: { describe: (i: never) => Promise<unknown> } }, on: Parameters<Parameters<typeof test>[1]>[1]) => {
  on('tool.describe', async () => ({ description: 'Rename a CCD session', isDeferred: true }) as never)
  await $.tool.describe({ tool: TITLE_TOOL, description: 'd' } as never)
}

test('once the rename tool was described, an overview update result carries the reminder', async ($, on) => {
  on('tool.list', async () => ({ value: [] }) as never)
  const session = mock.session(on)
  await describeTitleTool($ as never, on)
  const blocks = await stored($, session, row(OVERVIEW))
  expect(blocks.length).toBe(2)
  expect(blocks[0]?.tool_use_id).toBe('u1')
  expect(texts(blocks).length).toBe(1)
  expect(texts(await stored($, session, row(OVERVIEW, false, undefined, 'u2'))).length).toBe(1)
  expect(texts(await stored($, session, row('mcp__plugin_overview_overview__update', undefined, undefined, 'u3'))).length).toBe(1)
})

test('other results, failed updates and subagent updates are stored as they came', async ($, on) => {
  const session = mock.session(on)
  await describeTitleTool($ as never, on)
  for (const [r, id] of [
    [row('Bash', undefined, undefined, 'u4'), 'u4'],
    [row(OVERVIEW, true, undefined, 'u5'), 'u5'],
    [row(OVERVIEW, undefined, 'a1', 'u6'), 'u6'],
  ] as const) {
    const blocks = await stored($, session, r)
    expect(blocks.length).toBe(1)
    expect(blocks[0]?.tool_use_id).toBe(id)
  }
})
