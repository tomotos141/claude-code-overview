import type { EngineInterface, PromptComposeInput, PromptComposeSection, Register } from 'claude-code'

// A session's name is set when it starts and does not follow the work, and the model forgets to rename it
// at the moment the state changes: the rename tool waits behind ToolSearch and nothing points at it then.
// This plugin keeps the tool in front, puts the rule in the system prompt, and rides on overview's update
// result, which the model calls at each state change anyway.
export const TITLE_TOOL = 'mcp__ccd_session_mgmt__set_session_title'

// overview's tool is mcp__overview__update; the longer spelling is accepted in case a build namespaces plugin tools.
export const isOverviewUpdate = (tool: string): boolean => /^mcp__(?:plugin_)?overview(?:_overview)?__update$/.test(tool)

const FORM = '`<issue or task> <subject> <state>`'

export const rule = (): PromptComposeSection => ({
  id: 'session-title:rule',
  scope: 'session',
  text: [
    `Keep this session's name, shown in the sidebar, current: whenever the task's state changes, rename the session with ${TITLE_TOOL} (session_id "self") to the short form ${FORM}, without being asked.`,
    'The state changes when work starts, when the session starts waiting (for a reply, a confirmation, a sign-in, a review, an approval), and when the work is done, handed over or put on hold. Do not rename every turn.',
    'Use the issue key if there is one, else a plain name, and write the name in the language the person is using. Never put personal data, secrets or internal URLs in it.',
    'Examples: `ABC-123 onboarding checklist in progress`, `ABC-123 onboarding checklist waiting for review`.',
  ].join(' '),
})

export const nudge = (): string =>
  `From the session-title plugin: the overview was updated. If the task's state changed (started, waiting, done, handed over, on hold), rename the session to match, as ${FORM}, with ${TITLE_TOOL} (session_id "self"). If it did not change, do nothing.`

// Only the main conversation of a session someone watches: not a -p run drawing nowhere, not a teammate, not --bare.
export const isWatchedMain = (e: Pick<PromptComposeInput, 'tools' | 'surfaces' | 'traits'>): boolean =>
  e.tools.includes(TITLE_TOOL) && e.surfaces.length > 0 && !e.traits.includes('teammate') && !e.traits.includes('bare')

// Set once the engine has described the rename tool to this plugin: the session has it.
let sawTitleTool = false

// Whether there is a rename tool to point at. Where there is none (the terminal, a -p run), a reminder
// would name a tool the model cannot call. Either sign is enough, so a reload that clears the flag
// does not silence the reminder.
const hasTitleTool = async ($: EngineInterface): Promise<boolean> =>
  sawTitleTool || (await $.tool.list().catch(() => [])).some(t => t.name === TITLE_TOOL)

export const register: Register = on => {
  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    if (!isWatchedMain(e)) return composed
    return { sections: [...composed.sections.filter(s => s.id !== 'session-title:rule'), rule()] }
  })

  // Listed in front so renaming needs no ToolSearch first; its own description says "when clearly stale",
  // which reads against the rule, so the rule is added to it.
  on('tool.describe', async ($, e, next) => {
    const described = await next(e)
    if (e.tool !== TITLE_TOOL) return described
    sawTitleTool = true
    return {
      ...described,
      description: `${described.description}\n\nThe session-title plugin's rule: also rename this session (session_id "self") whenever the task's state changes, as ${FORM}.`,
      isDeferred: false,
    }
  })

  // Added where overview's result is stored rather than in tool.call: overview answers that call itself,
  // so a tool.call hook nested inside it would never see the call, and the nesting within a tier is not set.
  // A PostToolUse command hook does not see it either, for the same reason.
  on('session.append', { door: 'tool-result' }, async ($, e, next) => {
    const o = e.origin as { kind?: string; tool?: string }
    const failed = e.message.content.some(b => b.type === 'tool_result' && b.is_error === true)
    if (e.agentId !== undefined || o.kind !== 'tool' || !isOverviewUpdate(o.tool ?? '') || failed) return next(e)
    if (!(await hasTitleTool($))) return next(e)
    return next({ ...e, message: { ...e.message, content: [...e.message.content, { type: 'text', text: nudge() }] } })
  })
}
