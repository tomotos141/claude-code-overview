import type { CommandRunInput } from 'claude-code'
import { expect, test } from 'claude-code/testing'

import { LABELS, applyUpdate, langOf, summary } from './register'

test('an update replaces what it names and keeps the rest', () => {
  const first = applyUpdate(null, { goal: 'mod を作る', criteria: [{ text: 'テストが通る', done: false }], next: '書く' }, 1)
  expect(first).toEqual({ goal: 'mod を作る', criteria: [{ text: 'テストが通る', isDone: false }], offshoots: [], next: '書く', at: 1 })

  const second = applyUpdate(first, { criteria: [{ text: 'テストが通る', done: true }], offshoots: [{ text: 'kanban 強化', note: 'PR #93' }] }, 2)
  expect(second?.goal).toBe('mod を作る')
  expect(second?.criteria).toEqual([{ text: 'テストが通る', isDone: true }])
  expect(second?.offshoots).toEqual([{ text: 'kanban 強化', note: 'PR #93' }])
  expect(second?.next).toBe('書く')

  expect(applyUpdate(second, { clear: true }, 3)).toBe(null)
  expect(applyUpdate(null, { criteria: [{ nope: 1 }, { text: 'ok' }] }, 4)?.criteria).toEqual([{ text: 'ok', isDone: false }])
})

test('blank items are dropped and long ones are cut', () => {
  const b = applyUpdate(null, { criteria: [{ text: '  ', done: false }, { text: 'a'.repeat(300), done: false }] }, 0)
  expect(b?.criteria).toHaveLength(1)
  expect(b?.criteria[0]?.text.length).toBe(160)
  expect(applyUpdate(null, { offshoots: Array.from({ length: 20 }, (_, i) => ({ text: `o${i}` })) }, 0)?.offshoots).toHaveLength(12)
})

test('the model reads the board back', () => {
  expect(summary(null)).toBe('The pane is empty.')
  const b = applyUpdate(null, { goal: 'g', criteria: [{ text: 'c', done: true }], offshoots: [{ text: 'o' }], next: 'n' }, 0)
  expect(summary(b)).toBe('goal: g\ncriterion [x] c\noffshoot: o\nnext: n')
})

test('the model updates the pane through its tool', async ($, on) => {
  on('clock.now', async () => ({ value: 0 }) as never)
  const ran = await $.tool.call({ tool: 'mcp__overview__update', goal: '全貌を見せる', next: '見た目を確かめる' } as never)
  expect(ran.deny).toBe(undefined)
  expect(String(ran.text ?? ran.result)).toContain('goal: 全貌を見せる')
  expect(String(ran.text ?? ran.result)).toContain('next: 見た目を確かめる')
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
