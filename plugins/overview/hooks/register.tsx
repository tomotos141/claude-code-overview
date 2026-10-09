import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderChildren } from 'claude-code'

import type { Board, Criterion, Issue, Offshoot } from '../types'

const PANE = 'overview'

const board = atom({ plugin: 'overview', key: 'board' } as const, null)

export type Lang = 'en' | 'ja'

// The pane's own words; the contents are Claude's, in whatever language the person uses.
export const LABELS = {
  en: {
    title: 'Current task',
    problem: 'Problem',
    issue: 'Issue',
    goal: 'Goal',
    criteria: 'Done when',
    offshoots: 'Offshoots',
    next: 'Next step',
    none: 'None yet',
    unset: '(not set)',
    empty: 'Claude fills this in once a task is agreed.',
    updated: 'Updated',
    opened: 'Opened the current task pane.',
  },
  ja: {
    title: 'いまの作業',
    problem: '課題',
    issue: 'issue',
    goal: '目的',
    criteria: '完了条件',
    offshoots: '派生',
    next: '次の一手',
    none: 'まだありません',
    unset: '（未記入）',
    empty: '作業が決まると、ここに Claude が書き込みます。',
    updated: '更新',
    opened: 'いまの作業のペインを開きました。',
  },
} as const

export const langOf = (options: unknown): Lang =>
  (options as { language?: unknown } | undefined)?.language === 'ja' ? 'ja' : 'en'

// What the model reads about the tool: when to call it, since nothing else reminds it.
const GUIDE = [
  'Update the "current task" pane the person watches to see the whole picture of their task.',
  'Call it when a task is agreed (the problem it solves, goal, completion criteria, next step, and the issue tracking it if there is one),',
  'when a criterion is met,',
  'when work branches off into a follow-up (offshoot), when the next step changes, and with clear when the task ends.',
  'Write every field in the language the person is using, short and concrete. Pass only the fields that changed;',
  'criteria and offshoots replace the whole list when given. The answer shows the pane as it now stands.',
].join(' ')

const INPUT_SCHEMA = {
  type: 'object',
  properties: {
    problem: { type: 'string', description: 'The problem this task solves: what is wrong or missing now, in one or two sentences' },
    issue: {
      type: 'object',
      description: 'The ticket tracking this task (a Linear or GitHub issue, say); an empty id removes it',
      properties: {
        id: { type: 'string', description: 'Its identifier, such as ABC-123 or #42' },
        url: { type: 'string', description: 'Its link (optional)' },
      },
      required: ['id'],
    },
    goal: { type: 'string', description: 'What the task is for, in one sentence' },
    criteria: {
      type: 'array',
      description: 'Completion criteria; replaces the whole list when given',
      items: {
        type: 'object',
        properties: { text: { type: 'string' }, done: { type: 'boolean' } },
        required: ['text', 'done'],
      },
    },
    offshoots: {
      type: 'array',
      description: 'Follow-ups that branched off this task; replaces the whole list when given',
      items: {
        type: 'object',
        properties: { text: { type: 'string' }, note: { type: 'string', description: 'Status or where it lives (optional)' } },
        required: ['text'],
      },
    },
    next: { type: 'string', description: 'The next step, in one sentence' },
    clear: { type: 'boolean', description: 'true empties the pane (when the task is over)' },
  },
}

type UpdateInput = {
  problem?: unknown
  issue?: unknown
  goal?: unknown
  criteria?: unknown
  offshoots?: unknown
  next?: unknown
  clear?: unknown
}

const EMPTY: Board = { problem: '', issue: null, goal: '', criteria: [], offshoots: [], next: '', at: 0 }
// The pane is a glance, not a log: long lists and long lines are cut.
const MAX_ITEMS = 12
const MAX_CHARS = 160

const clip = (s: string): string => {
  // By code point, so an emoji is never cut in half.
  const chars = Array.from(s.trim())
  return chars.length > MAX_CHARS ? `${chars.slice(0, MAX_CHARS - 1).join('')}…` : chars.join('')
}
const hasText = (x: unknown): x is { text: string } =>
  typeof (x as { text?: unknown } | null)?.text === 'string' && (x as { text: string }).text.trim() !== ''

// An issue as given: an object with an id sets it, an empty id removes it, anything else leaves it.
const issueOf = (x: unknown): Issue | null | undefined => {
  const id = (x as { id?: unknown } | null)?.id
  if (typeof id !== 'string') return undefined
  if (id.trim() === '') return null
  const url = (x as { url?: unknown }).url
  return { id: clip(id), url: typeof url === 'string' ? clip(url) : '' }
}

// The board after an update: given fields replace, missing ones stay.
export const applyUpdate = (current: Board | null, input: UpdateInput, at: number): Board | null => {
  if (input.clear === true) return null
  // A board kept from an earlier version lacks the newer fields.
  const base: Board = { ...EMPTY, ...current }
  const issue = issueOf(input.issue)
  const criteria: Criterion[] | undefined = Array.isArray(input.criteria)
    ? input.criteria
        .filter(hasText)
        .slice(0, MAX_ITEMS)
        .map(c => ({ text: clip(c.text), isDone: (c as { done?: unknown }).done === true }))
    : undefined
  const offshoots: Offshoot[] | undefined = Array.isArray(input.offshoots)
    ? input.offshoots
        .filter(hasText)
        .slice(0, MAX_ITEMS)
        .map(o => {
          const note = (o as { note?: unknown }).note
          return { text: clip(o.text), note: typeof note === 'string' ? clip(note) : '' }
        })
    : undefined
  return {
    problem: typeof input.problem === 'string' ? clip(input.problem) : base.problem,
    issue: issue === undefined ? base.issue : issue,
    goal: typeof input.goal === 'string' ? clip(input.goal) : base.goal,
    criteria: criteria ?? base.criteria,
    offshoots: offshoots ?? base.offshoots,
    next: typeof input.next === 'string' ? clip(input.next) : base.next,
    at,
  }
}

// The board as the model reads it back in the tool's answer.
export const summary = (b: Board | null): string => {
  if (b === null) return 'The pane is empty.'
  const lines: string[] = []
  if (b.problem) lines.push(`problem: ${b.problem}`)
  if (b.issue) lines.push(`issue: ${b.issue.id}${b.issue.url === '' ? '' : ` (${b.issue.url})`}`)
  if (b.goal !== '') lines.push(`goal: ${b.goal}`)
  for (const c of b.criteria) lines.push(`criterion [${c.isDone ? 'x' : ' '}] ${c.text}`)
  for (const o of b.offshoots) lines.push(`offshoot: ${o.text}${o.note === '' ? '' : ` (${o.note})`}`)
  if (b.next !== '') lines.push(`next: ${b.next}`)
  return lines.length === 0 ? 'The pane is empty.' : lines.join('\n')
}

const clock = (ms: number): string => {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

async function openPane($: EngineInterface, title: string) {
  await $.ui.open({ id: PANE, title })
}

export const register: Register = (on, options) => {
  const t = LABELS[langOf(options)]
  // The engine names the tool after the plugin as installed; keep the name it hands back.
  let toolName = 'mcp__overview__update'

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'overview', description: 'Open the pane with the whole picture of the current task' })
    toolName = (await $.tool.register({ name: 'update', description: GUIDE, inputSchema: INPUT_SCHEMA })).tool
    // Opened where someone watches; a headless run has nobody to show it to.
    if (e.isInteractive) void openPane($, t.title).catch(() => undefined)
    return next(e)
  })

  on('command.run', { command: 'overview' }, async $ => {
    await openPane($, t.title)
    return { text: t.opened }
  })

  on('tool.call', async ($, e, next) => {
    if (e.tool !== toolName) return next(e)
    const at = await $.clock.now()
    let written: Board | null = null
    await update($, board, current => (written = applyUpdate(current, e as UpdateInput, at)))
    return { result: `Updated the pane. It now shows:\n${summary(written)}` }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const b = await read($, board)
    const width = e.props.bodyColumns ?? 40
    // Headings in the theme's accent; what is finished recedes, what is left and the next step stand out.
    const heading = (text: string, count?: string) => (
      <Text bold color="claude">
        {text}
        {count !== undefined && <Text dimColor>{`  ${count}`}</Text>}
      </Text>
    )
    const quiet = (text: string) => <Text dimColor>{`  ${text}`}</Text>
    const section = (children: RenderChildren) => (
      <Box flexDirection="column" marginBottom={1}>
        {children}
      </Box>
    )

    if (b === null)
      return (
        <Box flexDirection="column" width={width}>
          {section([heading(t.goal), quiet(t.empty)])}
        </Box>
      )

    const doneCount = b.criteria.filter(c => c.isDone).length
    const left = b.criteria.filter(c => !c.isDone)
    const done = b.criteria.filter(c => c.isDone)
    return (
      <Box flexDirection="column" width={width}>
        {section([heading(t.problem), <Text>{`  ${b.problem ? b.problem : t.unset}`}</Text>])}
        {b.issue
          ? section([
              heading(t.issue),
              <Text>
                {`  ${b.issue.id}`}
                {b.issue.url !== '' && <Text dimColor>{`  ${b.issue.url}`}</Text>}
              </Text>,
            ])
          : null}
        {section([heading(t.goal), <Text>{`  ${b.goal === '' ? t.unset : b.goal}`}</Text>])}
        {section([
          heading(t.criteria, `${doneCount}/${b.criteria.length}`),
          b.criteria.length === 0 ? quiet(t.none) : null,
          ...left.map(c => <Text>{`  ○ ${c.text}`}</Text>),
          ...done.map(c => (
            <Text dimColor>
              {'  '}
              <Text color="success">✓</Text>
              {` ${c.text}`}
            </Text>
          )),
        ])}
        {section([
          heading(t.offshoots),
          b.offshoots.length === 0 ? quiet(t.none) : null,
          ...b.offshoots.map(o => (
            <Text>
              {`  • ${o.text}`}
              {o.note !== '' && <Text dimColor>{` (${o.note})`}</Text>}
            </Text>
          )),
        ])}
        {section([
          heading(t.next),
          b.next === '' ? quiet(t.none) : <Text bold color="suggestion">{`  → ${b.next}`}</Text>,
        ])}
        <Text dimColor>{`  ${t.updated} ${clock(b.at)}`}</Text>
      </Box>
    )
  })
}
