import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, PromptComposeInput, PromptComposeSection, Register, RenderChildren, SessionStartInput } from 'claude-code'

import type { Board, Close, Criterion, Issue, Offshoot } from '../types'

const PANE = 'overview'

const board = atom({ plugin: 'overview', key: 'board' } as const, null)

export type Lang = 'en' | 'ja'

// The pane's own words; the contents are Claude's, in whatever language the person uses.
export const LABELS = {
  en: {
    pane: 'Session overview',
    title: 'Title',
    problem: 'Problem',
    issue: 'Linear issue',
    goal: 'Goal',
    criteria: 'Done when',
    offshoots: 'Side tasks',
    next: 'Next step',
    close: 'Session',
    closeOk: 'Safe to close',
    closeNo: 'Keep it open',
    archiveOk: 'Safe to archive',
    archiveNo: 'Do not archive yet',
    spinOff: '↗',
    spinOffPrompt: (text: string) => `Spin off the side task "${text}" as a task chip (spawn_task), so it can start in a new session.`,
    refresh: '↻',
    refreshPrompt: 'Bring the Session overview pane up to date with where the work stands now.',
    none: 'None yet',
    unset: '(not set)',
    missing: 'Still missing',
    empty: 'Claude fills this in once a task is agreed.',
    updated: 'Updated',
    opened: 'Opened the Session overview pane.',
    progress: (done: number, total: number) => `${done} of ${total} done`,
  },
  ja: {
    pane: 'Session overview',
    title: '題名',
    problem: '課題',
    issue: 'Linear issue',
    goal: '目的',
    criteria: '完了条件',
    offshoots: '別件',
    next: '次にやること',
    close: 'セッション',
    closeOk: '閉じてよい',
    closeNo: 'まだ閉じない',
    archiveOk: 'アーカイブしてよい',
    archiveNo: 'まだアーカイブしない',
    spinOff: '↗',
    spinOffPrompt: (text: string) => `別件「${text}」を、新しいセッションで始められるタスクチップ（spawn_task）として切り出してください。`,
    refresh: '↻',
    refreshPrompt: 'Session overview のペインを、いまの作業の状況に合わせて更新してください。',
    none: 'まだありません',
    unset: '（未記入）',
    missing: 'まだ足りない',
    empty: '作業が決まると、ここに Claude が書き込みます。',
    updated: '更新',
    opened: 'Session overview のペインを開きました。',
    progress: (done: number, total: number) => `${total}件中${done}件完了`,
  },
} as const

export const langOf = (options: unknown): Lang =>
  (options as { language?: unknown } | undefined)?.language === 'ja' ? 'ja' : 'en'

// What the model reads about the tool: when to call it, since nothing else reminds it.
const GUIDE = [
  'Update the Session overview pane the person watches to see the whole picture of their task.',
  'Call it when a task is agreed (a short title naming it, the Linear issue tracking it if there is one, the problem it solves, goal, completion criteria, next step),',
  'when a criterion is met,',
  'when work branches off into a follow-up (offshoot), when the next step changes, and with clear when the task ends.',
  'The problem is what is wrong or missing now. The goal is why the work is done: what solving the problem achieves for someone,',
  'not a restatement of the problem, and not the deliverable (that belongs in criteria) or the steps (the next one goes in next).',
  'close says whether the person can close this session now without losing anything, and why.',
  'Set it to not ok when you start changing files or anything else, start something that keeps running,',
  'or begin waiting for a reply or approval; set it to ok once nothing would be lost (changes committed and pushed',
  'where they belong, or there were none), nothing is running and nothing is awaited.',
  'When the task ends, send clear together with close, so the pane keeps telling whether the session can be closed.',
  'A later update that sends any other field drops an ok close, since the work has moved on: send close again with it.',
  'Write every field in the language the person is using, short and concrete. Pass only the fields that changed;',
  'criteria and offshoots replace the whole list when given. The answer shows the pane as it now stands.',
].join(' ')

// What the model reads in the system prompt, so the first request fills the pane without anyone asking.
export const kickoff = (tool: string): PromptComposeSection => ({
  id: 'overview:kickoff',
  scope: 'session',
  text: [
    `The person keeps a Session overview pane of their current task in view, written through the ${tool} tool.`,
    'When they bring a task to work on (not a quick question), the first request of the session included, call it before you start the work, without being asked:',
    'a short title, the problem, goal, completion criteria and next step as far as the request tells them. Leave out what you cannot tell rather than guess;',
    'the pane marks what is still missing, and you fill it in once you learn it. Then keep it current as the tool describes.',
  ].join(' '),
})

// The system prompt with the kickoff added last, only for the main conversation of a session someone watches
// with the tool offered: not a -p run or the SDK drawing nowhere, not a teammate (it would overwrite the
// person's task with its own), not --bare. Left alone otherwise.
export const withKickoff = (
  sections: readonly PromptComposeSection[],
  e: Pick<PromptComposeInput, 'tools' | 'surfaces' | 'traits'>,
  tool: string,
): readonly PromptComposeSection[] =>
  e.tools.includes(tool) && e.surfaces.length > 0 && !e.traits.includes('teammate') && !e.traits.includes('bare')
    ? [...sections.filter(s => s.id !== 'overview:kickoff'), kickoff(tool)]
    : sections

// Whether someone watches at start: a person at the REPL, or a surface that draws (the desktop app runs
// the session as an SDK, so isInteractive is false there while the surface is not).
export const isWatched = (e: Pick<SessionStartInput, 'isInteractive' | 'surface'>): boolean => e.isInteractive || e.surface !== null

// The fields a task needs that the board still lacks, in the order the tool asks for them.
export const missingOf = (b: Board): readonly ('title' | 'problem' | 'goal' | 'criteria' | 'next')[] => [
  ...(b.title === '' ? (['title'] as const) : []),
  ...(b.problem === '' ? (['problem'] as const) : []),
  ...(b.goal === '' ? (['goal'] as const) : []),
  ...(b.criteria.length === 0 ? (['criteria'] as const) : []),
  ...(b.next === '' ? (['next'] as const) : []),
]

// How far the criteria are done, as a bar of cells: full ones done, light ones left. Never empty for a
// criterion done nor full for one left, so a bar is not read as finished when it is not.
export const barCells = (done: number, total: number, cells: number): string => {
  if (total === 0 || cells <= 0) return ''
  const raw = Math.round((done / total) * cells)
  const full = done === total ? cells : Math.min(cells - 1, Math.max(done > 0 ? 1 : 0, raw))
  return `${'█'.repeat(full)}${'░'.repeat(cells - full)}`
}

// The same bar drawn where a surface draws SVG: a track and the part done, in fixed colors that read on light and dark.
export const barSvg = (done: number, total: number): string => {
  const ratio = total === 0 ? 0 : done / total
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="6" viewBox="0 0 240 6">',
    '<rect width="240" height="6" rx="3" fill="#8a8a8a" fill-opacity="0.3"/>',
    ratio === 0 ? '' : `<rect width="${Math.round(240 * ratio)}" height="6" rx="3" fill="#4caf50"/>`,
    '</svg>',
  ].join('')
}

// A link is never cut, but one this long is not a link.
const MAX_URL_CHARS = 2048

const INPUT_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'A short title naming the task, a few words, like a ticket title' },
    problem: { type: 'string', description: 'The problem this task solves: what is wrong or missing now, in a sentence' },
    issue: {
      type: 'object',
      description: 'The Linear issue tracking this task; an empty id removes it',
      properties: {
        id: { type: 'string', description: 'Its identifier, such as ABC-123' },
        url: { type: 'string', description: `Its link (optional, up to ${MAX_URL_CHARS} characters; a longer one makes the whole issue ignored). Omitted: kept if the id is unchanged, otherwise none. Empty: removed.` },
      },
      required: ['id'],
    },
    close: {
      type: 'object',
      description: 'Whether the session can be closed now without losing anything',
      properties: {
        ok: { type: 'boolean', description: 'true when nothing would be lost by closing' },
        reason: { type: 'string', description: 'Why, in a few words' },
      },
      required: ['ok'],
    },
    goal: { type: 'string', description: 'Why the work is done: what solving the problem achieves, in one sentence (not the problem restated, not the deliverable)' },
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
    clear: { type: 'boolean', description: 'true empties the pane (when the task is over); a close sent with it replaces the one shown, and without one a not-ok close already shown stays' },
  },
}

type UpdateInput = {
  title?: unknown
  problem?: unknown
  issue?: unknown
  goal?: unknown
  criteria?: unknown
  offshoots?: unknown
  next?: unknown
  close?: unknown
  clear?: unknown
}

const EMPTY: Board = { title: '', problem: '', issue: null, goal: '', criteria: [], offshoots: [], next: '', close: null, at: 0 }
// The pane is a glance, not a log: long lists and long lines are cut.
const MAX_ITEMS = 12
const MAX_CHARS = 160

// Spaces and line breaks, with NEL and the information separators that \s leaves out but some readers break lines on.
const SEPARATORS = /[\s\u0085\u001c-\u001f]+/g

const clip = (s: string): string => {
  // One line each, so a line break cannot pass for another field when the board is read back.
  // By code point, so an emoji is never cut in half.
  const chars = Array.from(s.replace(SEPARATORS, ' ').trim())
  return chars.length > MAX_CHARS ? `${chars.slice(0, MAX_CHARS - 1).join('')}…` : chars.join('')
}
const hasText = (x: unknown): x is { text: string } =>
  typeof (x as { text?: unknown } | null)?.text === 'string' && clip((x as { text: string }).text) !== ''

// An issue as given: an object with an id sets it, an empty id removes it, anything else leaves it.
// Its link left out, the current one stays when the id is the same.
const issueOf = (x: unknown, current: Issue | null): Issue | null | undefined => {
  const id = (x as { id?: unknown } | null)?.id
  if (typeof id !== 'string') return undefined
  if (clip(id) === '') return null
  const url = (x as { url?: unknown }).url
  const sameId = current !== null && current.id === clip(id)
  // A link is kept whole, without spaces or line breaks: cut, it would no longer open.
  const link = typeof url === 'string' ? url.replace(SEPARATORS, '') : undefined
  if (link !== undefined && link.length > MAX_URL_CHARS) return undefined
  return { id: clip(id), url: link ?? (sameId ? current.url : '') }
}

// Whether the session can be closed, as given: an object with a boolean ok sets it, anything else leaves it.
const closeOf = (x: unknown): Close | undefined => {
  const ok = (x as { ok?: unknown } | null)?.ok
  if (typeof ok !== 'boolean') return undefined
  const reason = (x as { reason?: unknown }).reason
  return { isOk: ok, reason: typeof reason === 'string' ? clip(reason) : '' }
}

// A board kept from an earlier version, across a reload, lacks the newer fields.
export const normalize = (b: Board | null): Board | null => (b === null ? null : { ...EMPTY, ...b })

// Whether a board holds no task, only (at most) whether the session can be closed.
export const isBlank = (b: Board): boolean =>
  b.title === '' && b.problem === '' && b.issue === null && b.goal === '' && b.criteria.length === 0 && b.offshoots.length === 0 && b.next === ''

// The board after an update: given fields replace, missing ones stay.
export const applyUpdate = (current: Board | null, input: UpdateInput, at: number): Board | null => {
  const base = normalize(current) ?? EMPTY
  const close = closeOf(input.close)
  // A finished task leaves the pane empty but for whether the session can be closed: the close sent with it,
  // or else a "keep it open" already shown, which must not vanish unanswered.
  if (input.clear === true) {
    const left = close ?? (base.close?.isOk === false ? base.close : null)
    return left === null ? null : { ...EMPTY, close: left, at }
  }
  const issue = issueOf(input.issue, base.issue)
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
  const isWorkSent =
    issue !== undefined || criteria !== undefined || offshoots !== undefined ||
    (['title', 'problem', 'goal', 'next'] as const).some(k => typeof input[k] === 'string')
  // An ok close is only as good as the moment it was judged: once the work moves on it no longer holds.
  const keptClose = isWorkSent && base.close?.isOk === true ? null : base.close
  return {
    title: typeof input.title === 'string' ? clip(input.title) : base.title,
    problem: typeof input.problem === 'string' ? clip(input.problem) : base.problem,
    issue: issue === undefined ? base.issue : issue,
    goal: typeof input.goal === 'string' ? clip(input.goal) : base.goal,
    criteria: criteria ?? base.criteria,
    offshoots: offshoots ?? base.offshoots,
    next: typeof input.next === 'string' ? clip(input.next) : base.next,
    close: close ?? keptClose,
    at,
  }
}

// The board as the model reads it back in the tool's answer.
export const summary = (kept: Board | null): string => {
  const b = normalize(kept)
  if (b === null) return 'The pane is empty.'
  const lines: string[] = []
  if (b.title !== '') lines.push(`title: ${b.title}`)
  if (b.issue !== null) lines.push(`issue: ${b.issue.id}${b.issue.url === '' ? '' : ` (${b.issue.url})`}`)
  if (b.problem !== '') lines.push(`problem: ${b.problem}`)
  if (b.goal !== '') lines.push(`goal: ${b.goal}`)
  for (const c of b.criteria) lines.push(`criterion [${c.isDone ? 'x' : ' '}] ${c.text}`)
  for (const o of b.offshoots) lines.push(`offshoot: ${o.text}${o.note === '' ? '' : ` (${o.note})`}`)
  if (b.next !== '') lines.push(`next: ${b.next}`)
  if (b.close !== null) lines.push(`close: ${b.close.isOk ? 'ok' : 'not yet'}${b.close.reason === '' ? '' : ` (${b.close.reason})`}`)
  if (isBlank(b)) lines.unshift('The pane is empty.')
  else if (missingOf(b).length > 0) lines.push(`still missing: ${missingOf(b).join(', ')}`)
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
  // Opened once unasked per load of this module; after that only the person opens it, so a pane they closed
  // stays closed (a reload, such as a language change in the config menu, may open it once more).
  let isOpenedUnasked = false
  // What a button asked Claude for and Claude has not yet answered: pressed again meanwhile, it asks nothing more.
  // A turn's end clears them, so a button asks again even when Claude found nothing to change on the pane.
  const asked = new Set<string>()

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'overview', description: 'Open the pane with the whole picture of the current task' })
    toolName = (await $.tool.register({ name: 'update', description: GUIDE, inputSchema: INPUT_SCHEMA })).tool
    // Opened where someone watches; a headless run has nobody to show it to.
    if (isWatched(e) && !isOpenedUnasked) {
      isOpenedUnasked = true
      void openPane($, t.pane).catch(() => undefined)
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    asked.clear()
    return next(e)
  })

  // A surface that joins after the start (the desktop app, a phone) is someone watching too.
  on('session.attach', async ($, e, next) => {
    if (!isOpenedUnasked) {
      isOpenedUnasked = true
      void openPane($, t.pane).catch(() => undefined)
    }
    return next(e)
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    return { sections: withKickoff(composed.sections, e, toolName) }
  })

  // Listed in front rather than behind ToolSearch, so the kickoff's first call needs no lookup.
  on('tool.describe', async ($, e, next) => {
    const described = await next(e)
    return e.tool === toolName ? { ...described, isDeferred: false } : described
  })

  on('command.run', { command: 'overview' }, async $ => {
    await openPane($, t.pane)
    return { text: t.opened }
  })

  on('tool.call', async ($, e, next) => {
    if (e.tool !== toolName) return next(e)
    // The pane is the person's task: a subagent or teammate writing its own would overwrite it.
    if (e.agentId !== undefined) return { result: 'Only the main conversation writes the pane; it was left as it is.' }
    const at = await $.clock.now()
    let written: Board | null = null
    await update($, board, current => (written = applyUpdate(current, e as UpdateInput, at)))
    return { result: `Updated the pane. It now shows:\n${summary(written)}` }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const elements = $.ui.resolve(e)
    const { Box, Text, Button, Link } = elements
    // The terminal draws no SVG; the bar is drawn in cells there.
    const Svg = e.surface === 'terminal' ? undefined : (elements as Elements['desktop']).Svg
    const b = normalize(await read($, board))
    const width = e.props.bodyColumns ?? 40
    // Headings in the theme's accent; what is finished recedes, what is left and the next step stand out.
    const heading = (text: string, count?: string) => (
      <Text bold color="claude">
        {text}
        {count !== undefined && <Text dimColor>{`  ${count}`}</Text>}
      </Text>
    )
    const quiet = (text: string) => <Text dimColor>{`  ${text}`}</Text>
    // What a task still lacks stands out, so a gap is seen at a glance rather than read past.
    const lacking = (text: string) => <Text color="warning">{`  ! ${text}`}</Text>
    const section = (children: RenderChildren) => (
      <Box flexDirection="column" marginBottom={1}>
        {children}
      </Box>
    )

    const isDesktop = e.surface === 'desktop'
    // Asks Claude in the person's stead, as a turn of its own once the session is idle.
    const ask = (text: string) => {
      if (asked.has(text)) return
      asked.add(text)
      void $.prompt.submit({ text })
    }
    const refresh = (
      <Button
        key="refresh"
        label={t.refresh}
        variant="primary"
        onPress={() => ask(t.refreshPrompt)}
      />
    )
    // Named after the step the person takes: the desktop app archives a session, the terminal closes it.
    const closeWords = (isOk: boolean) => (isOk ? `✓ ${isDesktop ? t.archiveOk : t.closeOk}` : `✗ ${isDesktop ? t.archiveNo : t.closeNo}`)

    // An empty pane: the line that says Claude fills it in, and whether the session can be closed.
    if (b === null || isBlank(b))
      return (
        <Box flexDirection="column" width={width}>
          {section([heading(t.goal), quiet(t.empty)])}
          {b?.close
            ? section([
                heading(t.close),
                <Text color={b.close.isOk ? 'success' : 'warning'}>{`  ${closeWords(b.close.isOk)}`}</Text>,
                b.close.reason === '' ? null : quiet(b.close.reason),
              ])
            : null}
          <Box marginTop={1}>{refresh}</Box>
        </Box>
      )

    const missing = missingOf(b)
    const doneCount = b.criteria.filter(c => c.isDone).length
    const left = b.criteria.filter(c => !c.isDone)
    const done = b.criteria.filter(c => c.isDone)
    // What the cover leaves unset stands out without a heading of its own.
    const unsetCover = (label: string) => <Text color="warning">{`! ${label} ${t.unset}`}</Text>
    return (
      <Box flexDirection="column" width={width}>
        {missing.length === 0
          ? null
          : section([<Text bold color="warning">{`! ${t.missing}: ${missing.map(k => t[k]).join(' / ')}`}</Text>])}
        {/* The cover, read on coming back to the session: what the task is, what comes next, how far it is,
            and whether the session can be put away. */}
        {section([
          b.title === '' ? unsetCover(t.title) : <Text bold>{b.title}</Text>,
          b.next === '' ? unsetCover(t.next) : <Text bold color="suggestion">{`→ ${b.next}`}</Text>,
          b.criteria.length === 0 ? null : (
            <Box flexDirection="row">
              {Svg !== undefined
                ? <Svg source={barSvg(doneCount, b.criteria.length)} alt={t.progress(doneCount, b.criteria.length)} />
                : <Text color="success">{barCells(doneCount, b.criteria.length, Math.min(20, width - 8))}</Text>}
              <Text dimColor>{`  ${doneCount}/${b.criteria.length}`}</Text>
            </Box>
          ),
          b.close === null ? null : (
            <Text color={b.close.isOk ? 'success' : 'warning'}>
              {/* A speech bubble: the line is about this session (this conversation), not the task. */}
              {`💬 ${closeWords(b.close.isOk)}`}
              {b.close.reason !== '' && <Text dimColor>{` — ${b.close.reason}`}</Text>}
            </Text>
          ),
        ])}
        {section([<Text dimColor>{'─'.repeat(Math.max(1, Math.min(width - 2, 40)))}</Text>])}
        {b.issue
          ? section([
              heading(t.issue),
              // The id opens the issue where there is a link; without one it is only named.
              b.issue.url === '' ? (
                <Text>{`  ${b.issue.id}`}</Text>
              ) : (
                <Box flexDirection="row">
                  <Text>{'  '}</Text>
                  <Link href={b.issue.url} label={b.issue.id} />
                </Box>
              ),
            ])
          : null}
        {section([heading(t.problem), b.problem === '' ? lacking(t.unset) : <Text>{`  ${b.problem}`}</Text>])}
        {section([heading(t.goal), b.goal === '' ? lacking(t.unset) : <Text>{`  ${b.goal}`}</Text>])}
        {section([
          heading(t.criteria, `${doneCount}/${b.criteria.length}`),
          b.criteria.length === 0 ? lacking(t.none) : null,
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
          ...b.offshoots.map((o, i) => (
            <Box flexDirection="row">
              <Text>{isDesktop ? '  ' : '  • '}</Text>
              {/* Task chips are the desktop app's: there a side task can start a session of its own. */}
              {isDesktop && <Button key={`spinoff:${i}`} label={t.spinOff} onPress={() => ask(t.spinOffPrompt(o.text))} />}
              <Text>
                {isDesktop ? ` ${o.text}` : o.text}
                {o.note !== '' && <Text dimColor>{` (${o.note})`}</Text>}
              </Text>
            </Box>
          )),
        ])}
        {/* Buttons sit on the left, set in as the side tasks' ↗ are (spaces, not a margin: on the desktop the two
            differ in width); the time follows the one that refreshes it. */}
        <Box flexDirection="row">
          <Text>{'  '}</Text>
          {refresh}
          <Text dimColor>{` ${t.updated} ${clock(b.at)}`}</Text>
        </Box>
      </Box>
    )
  })
}
