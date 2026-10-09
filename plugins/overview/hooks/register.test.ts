import type { CommandRunInput } from 'claude-code'
import { expect, test } from 'claude-code/testing'

import { LABELS, applyUpdate, langOf, summary } from './register'

test('an update replaces what it names and keeps the rest', () => {
  const first = applyUpdate(null, { goal: 'Ship the checklist', criteria: [{ text: 'Tests pass', done: false }], next: 'Write it' }, 1)
  expect(first).toEqual({ problem: '', issue: null, goal: 'Ship the checklist', criteria: [{ text: 'Tests pass', isDone: false }], offshoots: [], next: 'Write it', at: 1 })

  const second = applyUpdate(first, { criteria: [{ text: 'Tests pass', done: true }], offshoots: [{ text: 'Fix the date picker', note: 'separate PR' }] }, 2)
  expect(second?.goal).toBe('Ship the checklist')
  expect(second?.criteria).toEqual([{ text: 'Tests pass', isDone: true }])
  expect(second?.offshoots).toEqual([{ text: 'Fix the date picker', note: 'separate PR' }])
  expect(second?.next).toBe('Write it')

  expect(applyUpdate(second, { clear: true }, 3)).toBe(null)
  expect(applyUpdate(null, { criteria: [{ nope: 1 }, { text: 'ok' }] }, 4)?.criteria).toEqual([{ text: 'ok', isDone: false }])
})

test('the problem and the issue are kept until replaced or removed', () => {
  const first = applyUpdate(null, { problem: 'New staff cannot find the checklist', issue: { id: 'ABC-12', url: 'https://example.com/ABC-12' } }, 1)
  expect(first?.problem).toBe('New staff cannot find the checklist')
  expect(first?.issue).toEqual({ id: 'ABC-12', url: 'https://example.com/ABC-12' })

  const second = applyUpdate(first, { next: 'Write it' }, 2)
  expect(second?.problem).toBe('New staff cannot find the checklist')
  expect(second?.issue).toEqual({ id: 'ABC-12', url: 'https://example.com/ABC-12' })

  expect(applyUpdate(second, { issue: { id: '#42' } }, 3)?.issue).toEqual({ id: '#42', url: '' })
  expect(applyUpdate(second, { issue: { id: '' } }, 3)?.issue).toBe(null)
  expect(applyUpdate(second, { issue: 'ABC-13' }, 3)?.issue).toEqual({ id: 'ABC-12', url: 'https://example.com/ABC-12' })
})

test('a board from before the problem and issue fields still updates', () => {
  const old = { goal: 'g', criteria: [], offshoots: [], next: '', at: 0 } as never
  expect(applyUpdate(old, { next: 'n' }, 1)).toEqual({ problem: '', issue: null, goal: 'g', criteria: [], offshoots: [], next: 'n', at: 1 })
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
  const b = applyUpdate(null, { problem: 'p', issue: { id: 'ABC-1', url: 'u' }, goal: 'g', criteria: [{ text: 'c', done: true }], offshoots: [{ text: 'o' }], next: 'n' }, 0)
  expect(summary(b)).toBe('problem: p\nissue: ABC-1 (u)\ngoal: g\ncriterion [x] c\noffshoot: o\nnext: n')
})

test('the model updates the pane through its tool', async ($, on) => {
  on('clock.now', async () => ({ value: 0 }) as never)
  const ran = await $.tool.call({ tool: 'mcp__overview__update', goal: 'Keep the task in view', next: 'Check the pane' } as never)
  expect(ran.deny).toBe(undefined)
  expect(String(ran.text ?? ran.result)).toContain('goal: Keep the task in view')
  expect(String(ran.text ?? ran.result)).toContain('next: Check the pane')
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
