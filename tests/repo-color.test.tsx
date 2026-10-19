import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { defaultColorFor, hslToHex, parseColor, parseOpacity, withOpacity } from '../hooks/register'

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

test('hslToHex lands on known colors', async () => {
  expect(hslToHex(0, 100, 50)).toBe('#ff0000')
  expect(hslToHex(120, 100, 50)).toBe('#00ff00')
  expect(hslToHex(0, 0, 50)).toBe('#808080')
})

test('the picker sets a color from a swatch and from hex', async ($, on) => {
  fakeRepo(on)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'repo-color',
      surface,
      component: 'Pane',
      requestId: 'repo-color-picker',
      props: { title: 'Repo color', bodyColumns: 60 } as never,
    })
    // Second swatch of the second row: x 3 is its first cell, y 1 its row.
    const orange = hslToHex(30, 80, 58)
    await ui.pointer({ type: 'down', x: 3, y: 1, button: 'left' })
    expect(await ui.find({ type: 'Text', text: orange })).toBeDefined()

    // A click on the gap between swatches picks nothing.
    await ui.pointer({ type: 'down', x: 2, y: 0, button: 'left' })
    expect(await ui.find({ type: 'Text', text: orange })).toBeDefined()

    await ui.input({ key: 'hex', text: '#123456' })
    expect(await ui.find({ type: 'Text', text: '#123456' })).toBeDefined()
    await ui.unmount()
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

test('the color set for a repo marks your messages on every surface', async ($, on) => {
  fakeRepo(on)

  const set = await run($, 'purple')
  expect(set.text).toContain('app is now #8e4ec6')

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'repo-color',
      surface,
      component: 'UserMessage',
      props: { text: 'hello', origin: { kind: 'composer' }, isExpanded: true },
    })
    expect((await ui.find({ key: 'bubble' }))?.props.borderColor).toBe('#8e4ec6')
    expect(await ui.find({ type: 'Text', text: 'hello' })).toBeDefined()
    await ui.unmount()
  }

  const cleared = await run($, 'off')
  expect(cleared.text).toContain('back to its default color')
})

test('an unknown color is refused with usage', async ($, on) => {
  fakeRepo(on)
  const result = await run($, 'chartreuse')
  expect(result.text).toContain('Unknown color')
})

describe('opacity', () => {
  test('parses percents and blends toward the bubble', async () => {
    expect(parseOpacity('50')).toBe(50)
    expect(parseOpacity('75%')).toBe(75)
    expect(parseOpacity('101')).toBe(null)
    expect(parseOpacity('half')).toBe(null)
    expect(withOpacity('#ffffff', 100)).toBe('#ffffff')
    expect(withOpacity('#ffffff', 0)).toBe('#1e1e1e')
    expect(withOpacity('#fff', 50, '#000000')).toBe('#808080')
  })

  test('the set opacity fades the bubble border on every surface', async ($, on) => {
    fakeRepo(on)
    await run($, 'purple')
    const set = await run($, 'opacity 50')
    expect(set.text).toContain('50%')
    expect((await run($, 'opacity 150')).text).toContain('0 to 100')

    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({
        plugin: 'repo-color',
        surface,
        component: 'UserMessage',
        props: { text: 'hello', origin: { kind: 'composer' }, isExpanded: true },
      })
      expect((await ui.find({ key: 'bubble' }))?.props.borderColor).toBe(
        withOpacity('#8e4ec6', 50),
      )
      await ui.unmount()
    }
  })
})

test('a prompt sent with an image keeps the engine drawing for it and the bubble for its text', async ($, on) => {
  fakeRepo(on)
  on('prompt.submit', async (_, e) => ({ text: e.text }))
  // Stands in for the engine's own drawing, which shows the image.
  on('ui.render', { component: 'UserMessage' }, async ($e, e) => {
    const { Text } = $e.ui.resolve(e)

    return <Text>{`engine: ${e.props.text}`}</Text>
  })
  await run($, 'purple')
  await $.prompt.submit({
    text: 'see this',
    attachments: [{ type: 'image', mediaType: 'image/png' }],
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    const withImage = await $.ui.mount({
      plugin: 'repo-color',
      surface,
      component: 'UserMessage',
      props: { text: 'see this', origin: { kind: 'composer' }, isExpanded: true },
    })
    expect((await withImage.find({ key: 'bubble' }))?.props.borderColor).toBe('#8e4ec6')
    expect(await withImage.find({ type: 'Text', text: 'see this' })).toBeDefined()
    // The engine draws the image with the text taken out, so it shows once.
    expect(await withImage.find({ type: 'Text', text: 'engine: ' })).toBeDefined()
    expect(await withImage.find({ type: 'Text', text: 'engine: see this' })).toBeUndefined()
    await withImage.unmount()

    const plain = await $.ui.mount({
      plugin: 'repo-color',
      surface,
      component: 'UserMessage',
      props: { text: 'hello', origin: { kind: 'composer' }, isExpanded: true },
    })
    expect(await plain.find({ key: 'bubble' })).toBeDefined()
    await plain.unmount()
  }
})

test('a row drawn before its image prompt is recorded redraws with the image', async ($, on) => {
  fakeRepo(on)
  on('prompt.submit', async (_, e) => ({ text: e.text }))
  on('ui.render', { component: 'UserMessage' }, async ($e, e) => {
    const { Text } = $e.ui.resolve(e)

    return <Text>{`engine: ${e.props.text}`}</Text>
  })
  await run($, 'purple')

  const ui = await $.ui.mount({
    plugin: 'repo-color',
    surface: 'desktop',
    component: 'UserMessage',
    props: { text: 'late', origin: { kind: 'sdk' }, isExpanded: true },
  })
  expect(await ui.find({ type: 'Text', text: 'engine: ' })).toBeUndefined()

  await $.prompt.submit({ text: 'late', attachments: [{ type: 'image', mediaType: 'image/png' }] })
  expect(await ui.find({ type: 'Text', text: 'engine: ' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'late' })).toBeDefined()
  await ui.unmount()
})
