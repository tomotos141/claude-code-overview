import type { CommandRunInput, On } from 'claude-code'
import { expect, test } from 'claude-code/testing'

import { LABELS, barCells, barSvg, isWatched, kickoff, missingOf, withKickoff, applyUpdate, langOf, normalize, summary } from './register'

// What the engine answers beneath the plugin when a session starts.
// The tool is named after the plugin as installed, which need not be the name the module starts with.
const INSTALLED = 'mcp__plugin_overview_overview__update'
const engine = (on: On) => {
  const registered: string[] = []
  on('session.start', async (_$, e) => ({ cwd: e.cwd }) as never)
  on('session.attach', async (_$, e) => ({ clientId: e.clientId, handle: 'h' }) as never)
  on('command.register', async (_$, e) => {
    registered.push(`command:${e.name}`)
    return { value: { command: e.name } } as never
  })
  on('tool.register', async (_$, e) => {
    registered.push(`tool:${e.name}`)
    return { value: { tool: INSTALLED } } as never
  })
  on('prompt.compose', async () => ({ sections: [] }) as never)
  return registered
}

const SURFACES = ['terminal', 'desktop'] as const
// The desktop app archives a session where the terminal closes it; the pane names the step the person takes.
const SAFE = { terminal: LABELS.en.closeOk, desktop: LABELS.en.archiveOk } as const
const KEEP = { terminal: LABELS.en.closeNo, desktop: LABELS.en.archiveNo } as const
const PANE = { component: 'Pane', requestId: 'overview', props: { title: 'Overview', isFocused: false, bodyColumns: 60, placement: 'dock' } } as never

test('an update replaces what it names and keeps the rest', () => {
  const first = applyUpdate(null, { goal: 'Ship the checklist', criteria: [{ text: 'Tests pass', done: false }], next: 'Write it' }, 1)
  expect(first).toEqual({ title: '', problem: '', issue: null, goal: 'Ship the checklist', criteria: [{ text: 'Tests pass', isDone: false }], offshoots: [], next: 'Write it', close: null, at: 1 })

  const second = applyUpdate(first, { criteria: [{ text: 'Tests pass', done: true }], offshoots: [{ text: 'Fix the date picker', note: 'separate PR' }] }, 2)
  expect(second?.goal).toBe('Ship the checklist')
  expect(second?.criteria).toEqual([{ text: 'Tests pass', isDone: true }])
  expect(second?.offshoots).toEqual([{ text: 'Fix the date picker', note: 'separate PR' }])
  expect(second?.next).toBe('Write it')

  expect(applyUpdate(second, { clear: true }, 3)).toBe(null)
  expect(applyUpdate(null, { criteria: [{ nope: 1 }, { text: 'ok' }] }, 4)?.criteria).toEqual([{ text: 'ok', isDone: false }])
})

test('the problem and the Linear issue are kept until replaced or removed', () => {
  const url = `https://linear.app/acme/issue/ABC-12/${'a'.repeat(200)}`
  const first = applyUpdate(null, { problem: 'New staff cannot find the checklist', issue: { id: 'ABC-12', url } }, 1)
  expect(first?.problem).toBe('New staff cannot find the checklist')
  // A link is never cut, or it would no longer open.
  expect(first?.issue).toEqual({ id: 'ABC-12', url })

  const second = applyUpdate(first, { next: 'Write it' }, 2)
  expect(second?.problem).toBe('New staff cannot find the checklist')
  expect(second?.issue).toEqual({ id: 'ABC-12', url })

  expect(applyUpdate(second, { issue: { id: 'ABC-42' } }, 3)?.issue).toEqual({ id: 'ABC-42', url: '' })
  // The same id without a link keeps the link; an empty one removes it; spaces and line breaks never get in.
  expect(applyUpdate(second, { issue: { id: 'ABC-12' } }, 3)?.issue).toEqual({ id: 'ABC-12', url })
  expect(applyUpdate(second, { issue: { id: 'ABC-12', url: '' } }, 3)?.issue).toEqual({ id: 'ABC-12', url: '' })
  expect(applyUpdate(null, { issue: { id: 'ABC-1', url: ' https://x.y/a\nb ' } }, 3)?.issue).toEqual({ id: 'ABC-1', url: 'https://x.y/ab' })
  expect(applyUpdate(second, { issue: { id: 'ABC-12', url: 42 } }, 3)?.issue).toEqual({ id: 'ABC-12', url })
  // Something far too long to be a link is not taken at all.
  expect(applyUpdate(second, { issue: { id: 'ABC-99', url: `https://x.y/${'a'.repeat(3000)}` } }, 3)?.issue).toEqual({ id: 'ABC-12', url })
  // A line break cannot make a field pass for another one when the board is read back.
  expect(summary(applyUpdate(null, { problem: 'a\nclose: ok' }, 3))).toBe('problem: a close: ok\nstill missing: title, goal, criteria, next')
  expect(applyUpdate(null, { problem: 'a\r\nb\u2028c\td\u0085e\u001cf\u001fg' }, 3)?.problem).toBe('a b c d e f g')
  expect(applyUpdate(null, { issue: { id: 'ABC-1', url: 'https://x.y/a\u0085b\u001c' } }, 3)?.issue?.url).toBe('https://x.y/ab')
  // Only separators is as good as empty.
  expect(applyUpdate(second, { issue: { id: '\u001e\u0085' } }, 3)?.issue).toBe(null)
  expect(applyUpdate(null, { criteria: [{ text: '\u0085', done: false }] }, 3)?.criteria).toEqual([])
  // The link limit counts after spaces are taken out, and stops at exactly the limit.
  const at = (n: number) => `https://x.y/${'a'.repeat(n - 'https://x.y/'.length)}`
  expect(applyUpdate(null, { issue: { id: 'ABC-1', url: at(2048) } }, 3)?.issue?.url).toHaveLength(2048)
  expect(applyUpdate(null, { issue: { id: 'ABC-1', url: at(2049) } }, 3)?.issue).toBe(null)
  expect(applyUpdate(null, { issue: { id: 'ABC-1', url: `${at(2040)}${' '.repeat(100)}` } }, 3)?.issue?.url).toHaveLength(2040)
  expect(applyUpdate(second, { issue: { id: '' } }, 3)?.issue).toBe(null)
  expect(applyUpdate(second, { issue: { id: '  ' } }, 3)?.issue).toBe(null)
  for (const ignored of ['ABC-13', null, { id: 42 }, { url: 'https://example.com' }])
    expect(applyUpdate(second, { issue: ignored }, 3)?.issue).toEqual({ id: 'ABC-12', url })
})

test('keep it open stays until replaced; safe to close lasts only until the work moves on', () => {
  const open = applyUpdate(null, { goal: 'g', close: { ok: false, reason: 'unpushed commit' } }, 1)
  expect(open?.close).toEqual({ isOk: false, reason: 'unpushed commit' })
  expect(applyUpdate(open, { next: 'Push it' }, 2)?.close).toEqual({ isOk: false, reason: 'unpushed commit' })
  for (const ignored of [true, null, { ok: 'yes' }, { reason: 'done' }])
    expect(applyUpdate(open, { close: ignored }, 3)?.close).toEqual({ isOk: false, reason: 'unpushed commit' })

  const safe = applyUpdate(open, { close: { ok: true } }, 3)
  expect(safe?.close).toEqual({ isOk: true, reason: '' })
  expect(applyUpdate(safe, { close: { ok: true, reason: 'pushed' } }, 4)?.close).toEqual({ isOk: true, reason: 'pushed' })
  // Further work makes a stale "safe to close" disappear rather than linger, whichever field carries it.
  const work = [
    { problem: 'p2' }, { issue: { id: 'ABC-9' } }, { goal: 'g2' },
    { criteria: [{ text: 'c', done: false }] }, { offshoots: [{ text: 'o' }] }, { next: 'One more fix' },
  ]
  for (const sent of work) expect(applyUpdate(safe, sent, 4)?.close).toBe(null)
  // Values that are ignored change nothing, so they leave it.
  for (const ignored of [{ issue: 'ABC-13' }, { issue: null }, { issue: { id: 42 } }, { criteria: 'x' }, { offshoots: 'x' }, { problem: null }, {}])
    expect(applyUpdate(safe, ignored, 4)?.close).toEqual({ isOk: true, reason: '' })
  expect(applyUpdate(safe, { next: 'One more fix', close: { ok: false, reason: 'editing' } }, 4)?.close).toEqual({ isOk: false, reason: 'editing' })
})

test('clearing a finished task keeps the close sent with it, or a keep it open already shown', () => {
  const b = applyUpdate(null, { goal: 'g', next: 'n' }, 1)
  expect(applyUpdate(b, { clear: true }, 2)).toBe(null)
  const open = applyUpdate(b, { close: { ok: false, reason: 'deploy running' } }, 2)
  for (const sent of [{ clear: true }, { clear: true, close: { ok: 'yes' } }])
    expect(applyUpdate(open, sent, 3)?.close).toEqual({ isOk: false, reason: 'deploy running' })
  expect(applyUpdate(applyUpdate(b, { close: { ok: true } }, 2), { clear: true }, 3)).toBe(null)
  // The close sent with clear wins over the "keep it open" it answers.
  expect(applyUpdate(open, { clear: true, close: { ok: true, reason: 'pushed' } }, 3)?.close).toEqual({ isOk: true, reason: 'pushed' })
  // A "keep it open" carried through clear still stands when the next task starts.
  expect(applyUpdate(applyUpdate(open, { clear: true }, 3), { goal: 'next task' }, 4)?.close).toEqual({ isOk: false, reason: 'deploy running' })
  const cleared = applyUpdate(b, { clear: true, close: { ok: true, reason: 'pushed and merged' } }, 2)
  expect(cleared).toEqual({ title: '', problem: '', issue: null, goal: '', criteria: [], offshoots: [], next: '', close: { isOk: true, reason: 'pushed and merged' }, at: 2 })
  expect(summary(cleared)).toBe('The pane is empty.\nclose: ok (pushed and merged)')
})

test('a board from before the newer fields still updates', () => {
  const old = { goal: 'g', criteria: [], offshoots: [], next: '', at: 0 } as never
  expect(applyUpdate(old, { next: 'n' }, 1)).toEqual({ title: '', problem: '', issue: null, goal: 'g', criteria: [], offshoots: [], next: 'n', close: null, at: 1 })
  expect(summary(old)).toBe('goal: g\nstill missing: title, problem, criteria, next')
})

test('blank items are dropped and long ones are cut', () => {
  const b = applyUpdate(null, { criteria: [{ text: '  ', done: false }, { text: 'a'.repeat(300), done: false }] }, 0)
  expect(b?.criteria).toHaveLength(1)
  expect(b?.criteria[0]?.text.length).toBe(160)
  expect(applyUpdate(null, { offshoots: Array.from({ length: 20 }, (_, i) => ({ text: `o${i}` })) }, 0)?.offshoots).toHaveLength(12)
})

test('the model reads the board back', () => {
  expect(summary(null)).toBe('The pane is empty.')
  const b = applyUpdate(null, { title: 't', problem: 'p', issue: { id: 'ABC-1', url: 'u' }, goal: 'g', criteria: [{ text: 'c', done: true }], offshoots: [{ text: 'o' }], next: 'n', close: { ok: false, reason: 'r' } }, 0)
  expect(summary(b)).toBe('title: t\nissue: ABC-1 (u)\nproblem: p\ngoal: g\ncriterion [x] c\noffshoot: o\nnext: n\nclose: not yet (r)')
})

test('the model updates the pane through its tool', async ($, on) => {
  on('clock.now', async () => ({ value: 0 }) as never)
  const ran = await $.tool.call({ tool: 'mcp__overview__update', goal: 'Keep the task in view', issue: { id: 'ABC-7' }, close: { ok: true }, next: 'Check the pane' } as never)
  expect(ran.deny).toBe(undefined)
  const text = String(ran.text ?? ran.result)
  expect(text).toContain('goal: Keep the task in view')
  expect(text.split('\n')).toContain('issue: ABC-7')
  expect(text).toContain('next: Check the pane')
  expect(text).toContain('close: ok')
})

test('the cover comes first: the title, the next step, how far it is and whether to close; the details follow a rule', async ($, on) => {
  on('clock.now', async () => ({ value: 0 }) as never)
  await $.tool.call({ tool: 'mcp__overview__update', goal: 'g' } as never)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: 'overview', surface, ...PANE })
    const texts = (await ui.findAll({ type: 'Text' })).map(el => el.text)
    // What is missing is named first; the cover marks its own gaps, with no bar and no close until they are set.
    expect(texts.slice(0, 3)).toEqual([
      `! ${LABELS.en.missing}: ${LABELS.en.title} / ${LABELS.en.problem} / ${LABELS.en.criteria} / ${LABELS.en.next}`,
      `! ${LABELS.en.title} ${LABELS.en.unset}`,
      `! ${LABELS.en.next} ${LABELS.en.unset}`,
    ])
    expect((await ui.find({ type: 'Text', text: `! ${LABELS.en.title} ${LABELS.en.unset}` }))?.props.color).toBe('warning')
    expect(texts).not.toContain(LABELS.en.issue)
    await ui.unmount()
  }

  await $.tool.call({
    tool: 'mcp__overview__update',
    title: 'Fix the date picker',
    problem: 'p',
    issue: { id: 'ABC-7', url: 'https://linear.app/acme/issue/ABC-7' },
    criteria: [{ text: 'c1', done: true }, { text: 'c2', done: false }],
    offshoots: [{ text: 'o' }],
    next: 'Write the test',
    close: { ok: false, reason: 'unpushed' },
  } as never)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: 'overview', surface, ...PANE })
    const texts = (await ui.findAll({ type: 'Text' })).map(el => el.text)
    expect(texts.slice(0, 2)).toEqual(['Fix the date picker', '→ Write the test'])
    expect((await ui.find({ type: 'Text', text: 'Fix the date picker' }))?.props.bold).toBe(true)
    // How far it is, then whether the session can be put away, named after the step the surface takes.
    const count = texts.indexOf('  1/2')
    const close = texts.findIndex(x => x.startsWith(`✗ ${KEEP[surface]}`))
    const rule = texts.findIndex(x => x.startsWith('─'))
    expect(count).toBeGreaterThan(1)
    expect(close).toBeGreaterThan(count)
    expect(texts[close]).toContain('unpushed')
    expect(rule).toBeGreaterThan(close)
    // The details below the rule, in the order they are read: issue, problem, goal, criteria, side tasks.
    const order = [LABELS.en.issue, LABELS.en.problem, LABELS.en.goal, LABELS.en.offshoots].map(h => texts.indexOf(h))
    expect(order[0]).toBeGreaterThan(rule)
    expect([...order].sort((a, z) => a - z)).toEqual(order)
    // The ↻ button comes first on the last line, set in by the same two spaces as the ↗ ones, then the time.
    expect(texts.at(-1)?.startsWith(` ${LABELS.en.updated} `)).toBe(true)
    expect(texts.at(-2)).toBe('  ')
    await ui.unmount()
  }

  await $.tool.call({ tool: 'mcp__overview__update', close: { ok: true } } as never)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: 'overview', surface, ...PANE })
    const safe = await ui.find({ type: 'Text', text: SAFE[surface] })
    expect(safe?.text).toBe(`✓ ${SAFE[surface]}`)
    expect(safe?.props.color).toBe('success')
    await ui.unmount()
  }
})

test('a cleared pane still says whether the session can be closed', async ($, on) => {
  on('clock.now', async () => ({ value: 0 }) as never)
  await $.tool.call({ tool: 'mcp__overview__update', goal: 'g' } as never)
  await $.tool.call({ tool: 'mcp__overview__update', clear: true, close: { ok: true, reason: 'merged' } } as never)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: 'overview', surface, ...PANE })
    const texts = (await ui.findAll({ type: 'Text' })).map(el => el.text)
    expect(texts).toEqual([LABELS.en.goal, `  ${LABELS.en.empty}`, LABELS.en.close, `  ✓ ${SAFE[surface]}`, '  merged'])
    await ui.unmount()
  }
})

test('normalize fills in the fields a board kept from before them lacks', () => {
  const old = { goal: 'g', criteria: [], offshoots: [], next: '', at: 0 } as never
  expect(normalize(old)).toEqual({ title: '', problem: '', issue: null, goal: 'g', criteria: [], offshoots: [], next: '', close: null, at: 0 })
  expect(normalize(null)).toBe(null)
})

test('headings come in English unless Japanese is chosen', () => {
  expect(langOf(undefined)).toBe('en')
  expect(langOf({ language: 'ja' })).toBe('ja')
  expect(langOf({ language: 'fr' })).toBe('en')
  expect(Object.keys(LABELS.ja).sort()).toEqual(Object.keys(LABELS.en).sort())
})

// Passing userConfig values into a test needs a newer test kit than some installs have, so the
// language switch is covered by langOf above and the command by its default.
test('/overview opens the pane, titled in English by default', async ($, on) => {
  const opened: string[] = []
  on('ui.open', async (_$, e) => {
    opened.push(e.title ?? '')
    return { value: true } as never
  })
  const ran = await $.command.run({ command: 'overview', args: '' } as CommandRunInput)
  expect(ran.text).toBe(LABELS.en.opened)
  expect(opened).toEqual(['Session overview'])
})

test('the pane opens unasked where someone watches: the REPL, or a surface such as the desktop app', () => {
  expect(isWatched({ isInteractive: true, surface: 'terminal' })).toBe(true)
  // The desktop app runs the session as an SDK: not interactive, but it draws.
  expect(isWatched({ isInteractive: false, surface: 'desktop' })).toBe(true)
  expect(isWatched({ isInteractive: false, surface: null })).toBe(false)
})

test('the system prompt asks for the pane on the first request, only in a watched main conversation', () => {
  const base = [{ id: 'intro', text: 'i', scope: 'shared' }] as const
  const tool = 'mcp__overview__update'
  const watched = { tools: [tool], surfaces: ['desktop'], traits: [] } as const
  const added = withKickoff(base, watched, tool)
  expect(added.map(s => s.id)).toEqual(['intro', 'overview:kickoff'])
  expect(added.at(-1)?.scope).toBe('session')
  expect(added.at(-1)?.text).toContain(tool)
  expect(added.at(-1)?.text).toContain('first request')
  expect(withKickoff(added, watched, tool)).toHaveLength(2)
  // The desktop app composes with the print trait (seen in a real session: lean|print|skills, surface desktop),
  // so print alone must not drop the kickoff; whether anything draws decides.
  expect(withKickoff(base, { ...watched, traits: ['lean', 'print', 'skills'] }, tool)).toHaveLength(2)
  // Not where the tool is missing, nobody watches (-p, a bare SDK run), a teammate works, or --bare.
  expect(withKickoff(base, { ...watched, tools: ['Bash'] }, tool)).toBe(base)
  expect(withKickoff(base, { ...watched, surfaces: [] }, tool)).toBe(base)
  expect(withKickoff(base, { ...watched, traits: ['teammate'] }, tool)).toBe(base)
  expect(withKickoff(base, { ...watched, traits: ['bare'] }, tool)).toBe(base)
  expect(kickoff('x').id).toBe('overview:kickoff')
})

test('a subagent or teammate cannot overwrite the pane', async ($, on) => {
  on('clock.now', async () => ({ value: 0 }) as never)
  await $.tool.call({ tool: 'mcp__overview__update', goal: 'the main goal' } as never)
  const ran = await $.tool.call({ tool: 'mcp__overview__update', goal: 'a subagent goal', agentId: 'a1' } as never)
  expect(String(ran.text ?? ran.result)).toContain('Only the main conversation')
  const back = await $.tool.call({ tool: 'mcp__overview__update', next: 'n' } as never)
  expect(String(back.text ?? back.result)).toContain('goal: the main goal')
})

test('what a task still lacks is named, the title first', () => {
  const b = applyUpdate(null, { goal: 'g' }, 0)
  expect(b === null ? [] : missingOf(b)).toEqual(['title', 'problem', 'criteria', 'next'])
  const full = applyUpdate(null, { title: 't', problem: 'p', goal: 'g', criteria: [{ text: 'c', done: false }], next: 'n' }, 0)
  expect(full === null ? ['x'] : missingOf(full)).toEqual([])
  expect(summary(full)).not.toContain('still missing')
})

test('the missing fields show in Japanese too', () => {
  expect(LABELS.ja.missing).toBe('まだ足りない')
  expect(Object.keys(LABELS.ja).sort()).toEqual(Object.keys(LABELS.en).sort())
})

test('the issue opens from its id where it has a link, and is only named where it has none', async ($, on) => {
  on('clock.now', async () => ({ value: 0 }) as never)
  const url = 'https://linear.app/acme/issue/ABC-7'
  await $.tool.call({ tool: 'mcp__overview__update', issue: { id: 'ABC-7', url } } as never)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: 'overview', surface, ...PANE })
    const link = await ui.find({ type: 'Link' })
    expect(link?.props).toEqual(expect.objectContaining({ href: url, label: 'ABC-7' }))
    await ui.unmount()
  }
  await $.tool.call({ tool: 'mcp__overview__update', issue: { id: 'ABC-8' } } as never)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: 'overview', surface, ...PANE })
    expect(await ui.find({ type: 'Link' })).toBe(undefined)
    expect((await ui.findAll({ type: 'Text' })).map(el => el.text)).toContain('  ABC-8')
    await ui.unmount()
  }
})

test('the missing line stands alone: the pane offers no button to fill it', async ($, on) => {
  on('clock.now', async () => ({ value: 0 }) as never)
  await $.tool.call({ tool: 'mcp__overview__update', goal: 'g' } as never)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: 'overview', surface, ...PANE })
    expect(await ui.find({ type: 'Text', text: new RegExp(LABELS.en.missing) })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'fill' })).toBe(undefined)
    await ui.unmount()
  }
})

test('the refresh button asks Claude to bring the pane up to date, once until Claude has answered', async ($, on) => {
  on('clock.now', async () => ({ value: 0 }) as never)
  const sent: string[] = []
  on('prompt.submit', async (_$, e) => {
    sent.push(e.text)
    return { drop: 'test' } as never
  })
  on('turn.complete', async () => ({ text: '' }) as never)
  // Offered on an empty pane too: there it asks Claude to write the task down.
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: 'overview', surface, ...PANE })
    // A reload mark beside the time it was last updated.
    const button = await ui.find({ type: 'Button', key: 'refresh' })
    expect(button?.props.label).toBe('↻')
    // The pane's one colored button: the side tasks' ↗ stay plain, so it stands out without competing with them.
    expect(button?.props.variant).toBe('primary')
    await ui.unmount()
  }
  await $.tool.call({ tool: 'mcp__overview__update', goal: 'g' } as never)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: 'overview', surface, ...PANE })
    await ui.press({ key: 'refresh' })
    await ui.press({ key: 'refresh' })
    await ui.unmount()
  }
  // Pressed again before Claude has answered, it asks nothing more, whichever surface the press came from.
  expect(sent).toEqual([LABELS.en.refreshPrompt])
  // Once the turn ends it asks again, even when Claude found nothing to change on the pane.
  await $.turn.complete({ reason: 'answer' } as never)
  const again = await $.ui.mount({ plugin: 'overview', surface: 'terminal', ...PANE })
  await again.press({ key: 'refresh' })
  await again.unmount()
  expect(sent).toEqual([LABELS.en.refreshPrompt, LABELS.en.refreshPrompt])
})

test('each side task has a button on the desktop that asks Claude to spin it off as a task chip', async ($, on) => {
  on('clock.now', async () => ({ value: 0 }) as never)
  const sent: string[] = []
  on('prompt.submit', async (_$, e) => {
    sent.push(e.text)
    return { drop: 'test' } as never
  })
  on('turn.complete', async () => ({ text: '' }) as never)
  await $.tool.call({ tool: 'mcp__overview__update', offshoots: [{ text: 'Fix the date picker' }, { text: 'Rename the tab', note: 'later' }] } as never)
  // Task chips are the desktop app's; the terminal has nowhere to start one from.
  const terminal = await $.ui.mount({ plugin: 'overview', surface: 'terminal', ...PANE })
  expect(await terminal.find({ type: 'Button', key: 'spinoff:0' })).toBe(undefined)
  await terminal.unmount()
  const desktop = await $.ui.mount({ plugin: 'overview', surface: 'desktop', ...PANE })
  expect((await desktop.find({ type: 'Button', key: 'spinoff:1' }))?.props.label).toBe(LABELS.en.spinOff)
  await desktop.press({ key: 'spinoff:1' })
  await desktop.press({ key: 'spinoff:1' })
  await desktop.press({ key: 'spinoff:0' })
  expect(sent).toEqual([LABELS.en.spinOffPrompt('Rename the tab'), LABELS.en.spinOffPrompt('Fix the date picker')])
  // Once Claude has answered, a press asks again.
  await $.turn.complete({ reason: 'answer' } as never)
  await desktop.press({ key: 'spinoff:1' })
  await desktop.unmount()
  expect(sent.at(-1)).toBe(LABELS.en.spinOffPrompt('Rename the tab'))
})

test('the plain words: side tasks, the next thing to do, and archive on the desktop', () => {
  expect(LABELS.ja.offshoots).toBe('別件')
  expect(LABELS.ja.next).toBe('次にやること')
  expect(LABELS.ja.archiveOk).toBe('アーカイブしてよい')
  expect(LABELS.ja.archiveNo).toBe('まだアーカイブしない')
  expect(LABELS.en.pane).toBe('Session overview')
  expect(LABELS.ja.pane).toBe('Session overview')
  expect(LABELS.ja.title).toBe('題名')
  expect(LABELS.en.spinOff).toBe('↗')
})

test('the criteria show a bar: SVG where the surface draws it, cells on the terminal', async ($, on) => {
  on('clock.now', async () => ({ value: 0 }) as never)
  await $.tool.call({ tool: 'mcp__overview__update', criteria: [{ text: 'a', done: true }, { text: 'b', done: false }, { text: 'c', done: false }] } as never)
  const desktop = await $.ui.mount({ plugin: 'overview', surface: 'desktop', ...PANE })
  const svg = await desktop.find({ type: 'Svg' })
  expect(svg?.props.alt).toBe(LABELS.en.progress(1, 3))
  expect(String(svg?.props.source)).toContain('width="80"')
  await desktop.unmount()
  const terminal = await $.ui.mount({ plugin: 'overview', surface: 'terminal', ...PANE })
  expect((await terminal.findAll({ type: 'Text' })).map(el => el.text)).toContain(barCells(1, 3, 20))
  await terminal.unmount()
})

test('a bar is full only when every criterion is done, and empty only when none is', () => {
  expect(barCells(0, 3, 10)).toBe('░'.repeat(10))
  expect(barCells(3, 3, 10)).toBe('█'.repeat(10))
  expect(barCells(1, 100, 10)).toBe(`█${'░'.repeat(9)}`)
  expect(barCells(99, 100, 10)).toBe(`${'█'.repeat(9)}░`)
  expect(barCells(1, 2, 10)).toBe(`${'█'.repeat(5)}${'░'.repeat(5)}`)
  expect(barCells(0, 0, 10)).toBe('')
  expect(barSvg(0, 2)).not.toContain('#4caf50')
  expect(barSvg(2, 2)).toContain('width="240" height="6" rx="3" fill="#4caf50"')
})

test('the session start offers the tool and the command and opens the pane once where someone watches', async ($, on) => {
  const registered = engine(on)
  const opened: string[] = []
  on('ui.open', async (_$, e) => {
    opened.push(e.id)
    return { value: true } as never
  })
  on('clock.now', async () => ({ value: 0 }) as never)
  // Nobody watches a headless run: nothing opens, but the tool is still there.
  await $.session.start({ cwd: '.', surface: null, isInteractive: false })
  expect(opened).toEqual([])
  // The desktop app starts as an SDK that draws; a later start or a surface joining does not open it again.
  await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: false })
  await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: false })
  await $.session.attach({ surface: 'mobile', clientId: 'phone' })
  expect(opened).toEqual(['overview'])
  expect(registered.slice(0, 2)).toEqual(['command:overview', 'tool:update'])
  // The tool answers under the name the engine handed back, and the old default name no longer reaches it.
  const ran = await $.tool.call({ tool: INSTALLED, goal: 'g' } as never)
  expect(String(ran.text ?? ran.result)).toContain('goal: g')
  const command = await $.command.run({ command: 'overview', args: '' } as CommandRunInput)
  expect(command.text).toBe(LABELS.en.opened)
  // The person opening it by hand always opens it.
  expect(opened).toEqual(['overview', 'overview'])
})

test('a surface joining after a headless start opens the pane once', async ($, on) => {
  engine(on)
  const opened: string[] = []
  on('ui.open', async (_$, e) => {
    opened.push(e.id)
    return { value: true } as never
  })
  await $.session.start({ cwd: '.', surface: null, isInteractive: false })
  await $.session.attach({ surface: 'desktop', clientId: 'app' })
  await $.session.attach({ surface: 'mobile', clientId: 'phone' })
  expect(opened).toEqual(['overview'])
})

test('the composed system prompt carries the kickoff, and the tool is listed in front', async ($, on) => {
  engine(on)
  on('tool.describe', async () => ({ description: 'd', isDeferred: true }) as never)
  await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: false })
  const compose = (surfaces: readonly ('desktop')[], tools: readonly string[]) =>
    $.prompt.compose({ model: 'm', promptModel: 'm', outputStyle: null, surfaces, tools, traits: [] })
  const composed = await compose(['desktop'], [INSTALLED])
  const kick = composed.sections.find(s => s.id === 'overview:kickoff')
  expect(kick?.text).toContain(INSTALLED)
  // Only the installed name counts: offered under the default name alone, the tool is not the plugin's.
  expect((await compose(['desktop'], ['mcp__overview__update'])).sections.map(s => s.id)).not.toContain('overview:kickoff')
  expect((await compose([], [INSTALLED])).sections.map(s => s.id)).not.toContain('overview:kickoff')
  expect((await $.tool.describe({ tool: INSTALLED, description: 'd' } as never)).isDeferred).toBe(false)
  expect((await $.tool.describe({ tool: 'mcp__other__update', description: 'd' } as never)).isDeferred).toBe(true)
})
