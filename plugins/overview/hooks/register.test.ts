import type { CommandRunInput } from 'claude-code'
import { expect, test } from 'claude-code/testing'

import { LABELS, applyUpdate, langOf, normalize, summary } from './register'

const SURFACES = ['terminal', 'desktop'] as const
const PANE = { component: 'Pane', requestId: 'overview', props: { title: 'Current task', isFocused: false, bodyColumns: 60, placement: 'dock' } } as never

test('an update replaces what it names and keeps the rest', () => {
  const first = applyUpdate(null, { goal: 'Ship the checklist', criteria: [{ text: 'Tests pass', done: false }], next: 'Write it' }, 1)
  expect(first).toEqual({ problem: '', issue: null, goal: 'Ship the checklist', criteria: [{ text: 'Tests pass', isDone: false }], offshoots: [], next: 'Write it', close: null, at: 1 })

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
  // Further work makes a stale "safe to close" disappear rather than linger.
  expect(applyUpdate(safe, { next: 'One more fix' }, 4)?.close).toBe(null)
  expect(applyUpdate(safe, { next: 'One more fix', close: { ok: false, reason: 'editing' } }, 4)?.close).toEqual({ isOk: false, reason: 'editing' })
})

test('clearing a finished task keeps the close sent with it', () => {
  const b = applyUpdate(null, { goal: 'g', next: 'n' }, 1)
  expect(applyUpdate(b, { clear: true }, 2)).toBe(null)
  const cleared = applyUpdate(b, { clear: true, close: { ok: true, reason: 'pushed and merged' } }, 2)
  expect(cleared).toEqual({ problem: '', issue: null, goal: '', criteria: [], offshoots: [], next: '', close: { isOk: true, reason: 'pushed and merged' }, at: 2 })
  expect(summary(cleared)).toBe('The pane is empty.\nclose: ok (pushed and merged)')
})

test('a board from before the newer fields still updates', () => {
  const old = { goal: 'g', criteria: [], offshoots: [], next: '', at: 0 } as never
  expect(applyUpdate(old, { next: 'n' }, 1)).toEqual({ problem: '', issue: null, goal: 'g', criteria: [], offshoots: [], next: 'n', close: null, at: 1 })
  expect(summary(old)).toBe('goal: g')
})

test('blank items are dropped and long ones are cut', () => {
  const b = applyUpdate(null, { criteria: [{ text: '  ', done: false }, { text: 'a'.repeat(300), done: false }] }, 0)
  expect(b?.criteria).toHaveLength(1)
  expect(b?.criteria[0]?.text.length).toBe(160)
  expect(applyUpdate(null, { offshoots: Array.from({ length: 20 }, (_, i) => ({ text: `o${i}` })) }, 0)?.offshoots).toHaveLength(12)
})

test('the model reads the board back', () => {
  expect(summary(null)).toBe('The pane is empty.')
  const b = applyUpdate(null, { problem: 'p', issue: { id: 'ABC-1', url: 'u' }, goal: 'g', criteria: [{ text: 'c', done: true }], offshoots: [{ text: 'o' }], next: 'n', close: { ok: false, reason: 'r' } }, 0)
  expect(summary(b)).toBe('problem: p\nissue: ABC-1 (u)\ngoal: g\ncriterion [x] c\noffshoot: o\nnext: n\nclose: not yet (r)')
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

test('the pane shows the problem, and the issue and close only once set', async ($, on) => {
  on('clock.now', async () => ({ value: 0 }) as never)
  await $.tool.call({ tool: 'mcp__overview__update', goal: 'g' } as never)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: 'overview', surface, ...PANE })
    const texts = (await ui.findAll({ type: 'Text' })).map(el => el.text)
    // Problem comes first and says it is not set; the goal follows.
    expect(texts.slice(0, 4)).toEqual([LABELS.en.problem, `  ${LABELS.en.unset}`, LABELS.en.goal, '  g'])
    expect(texts).not.toContain(LABELS.en.issue)
    expect(texts).not.toContain(LABELS.en.close)
    await ui.unmount()
  }

  await $.tool.call({ tool: 'mcp__overview__update', problem: 'p', issue: { id: 'ABC-7', url: 'https://linear.app/acme/issue/ABC-7' }, close: { ok: false, reason: 'unpushed' } } as never)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: 'overview', surface, ...PANE })
    const texts = (await ui.findAll({ type: 'Text' })).map(el => el.text)
    expect(texts.slice(0, 7)).toEqual([LABELS.en.problem, '  p', LABELS.en.issue, '  ABC-7', '  https://linear.app/acme/issue/ABC-7', LABELS.en.goal, '  g'])
    expect(texts.slice(-4)).toEqual([LABELS.en.close, `  ✗ ${LABELS.en.closeNo}`, '  unpushed', '  Updated 09:00'])
    await ui.unmount()
  }

  await $.tool.call({ tool: 'mcp__overview__update', close: { ok: true } } as never)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: 'overview', surface, ...PANE })
    const safe = await ui.find({ type: 'Text', text: LABELS.en.closeOk })
    expect(safe?.text).toBe(`  ✓ ${LABELS.en.closeOk}`)
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
    expect(texts).toEqual([LABELS.en.goal, `  ${LABELS.en.empty}`, LABELS.en.close, `  ✓ ${LABELS.en.closeOk}`, '  merged'])
    await ui.unmount()
  }
})

test('normalize fills in the fields a board kept from before them lacks', () => {
  const old = { goal: 'g', criteria: [], offshoots: [], next: '', at: 0 } as never
  expect(normalize(old)).toEqual({ problem: '', issue: null, goal: 'g', criteria: [], offshoots: [], next: '', close: null, at: 0 })
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
  expect(opened).toEqual(['Current task'])
})
