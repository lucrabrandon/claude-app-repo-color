import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { CIRCLES, defaultColorFor, emojiFor, parseColor } from '../hooks/register'

function run($: Engine, args: string) {
  return $.command.run({
    command: 'repo-color',
    args,
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 80 },
  })
}

function fakeRepo(on: On) {
  mock.store(on)
  on('session.root', async () => ({ value: '/Users/me/web/app/.claude/worktrees/feature' }))
  on('process.run', async () => ({
    value: {
      exitCode: 0,
      stdout: '/Users/me/web/app/.git\n',
      stderr: '',
      isStdoutTruncated: false,
      isStderrTruncated: false,
    },
  }))
}

test('a repo with no color set gets a stable default', async () => {
  expect(defaultColorFor('app')).toBe(defaultColorFor('app'))
  expect(parseColor(defaultColorFor('my-other-repo'))).not.toBe(null)
})

test('the picker sets one of the status line circles', async ($, on) => {
  fakeRepo(on)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'repo-color',
      surface,
      component: 'Pane',
      requestId: 'repo-color-picker',
      props: { title: 'Repo color', bodyColumns: 60 } as never,
    })
    await ui.press({ key: '🟤' })
    expect(await ui.find({ type: 'Text', text: '🟤 app' })).toBeDefined()
    await ui.press({ key: '⚪' })
    expect(await ui.find({ type: 'Text', text: '⚪ app' })).toBeDefined()
    await ui.unmount()
  }
})

test('every circle in the picker shows as itself', async () => {
  for (const [emoji, hex] of CIRCLES) {
    expect(emojiFor(hex)).toBe(emoji)
  }
})

describe('parseColor', () => {
  test('takes presets and hex, refuses the rest', async () => {
    expect(parseColor('Blue')).toBe('#0090ff')
    expect(parseColor('#abc')).toBe('#abc')
    expect(parseColor('#A1B2C3')).toBe('#a1b2c3')
    expect(parseColor('chartreuse')).toBe(null)
  })
})

test('the color set for a repo shows in the status line', async ($, on) => {
  fakeRepo(on)

  const set = await run($, 'purple')
  expect(set.text).toContain('app is now #8e4ec6')

  const cleared = await run($, 'off')
  expect(cleared.text).toContain('back to its default color')
})

test('emojiFor picks the nearest circle', async () => {
  expect(emojiFor('#e5484d')).toBe('🔴')
  expect(emojiFor('#f76b15')).toBe('🟠')
  expect(emojiFor('#ffc53d')).toBe('🟡')
  expect(emojiFor('#30a46c')).toBe('🟢')
  expect(emojiFor('#0090ff')).toBe('🔵')
  expect(emojiFor('#8e4ec6')).toBe('🟣')
  expect(emojiFor('#8b8d98')).toBe('⚪')
  expect(emojiFor('#222')).toBe('⚫')
})

test('an unknown color is refused with usage', async ($, on) => {
  fakeRepo(on)
  const result = await run($, 'chartreuse')
  expect(result.text).toContain('Unknown color')
})
