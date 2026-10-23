import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Repo } from '../types'

const repo = atom({ plugin: 'repo-color', key: 'repo' } as const, null)
const color = atom({ plugin: 'repo-color', key: 'color' } as const, null)

const PRESETS: Record<string, string> = {
  red: '#e5484d',
  orange: '#f76b15',
  yellow: '#ffc53d',
  green: '#30a46c',
  teal: '#12a594',
  blue: '#0090ff',
  indigo: '#3e63dd',
  purple: '#8e4ec6',
  pink: '#d6409f',
  gray: '#8b8d98',
}

// A faint fill for the picker's preview, a step above the desktop's dark
// background. No theme key names it.
const BUBBLE = '#1e1e1e'

const PICKER = 'repo-color-picker'

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

const USAGE = `Usage: /repo-color opens the picker, or /repo-color <color> | off\nPresets: ${Object.keys(PRESETS).join(', ')}, or a hex like #ff8800.`

export function parseColor(input: string): string | null {
  const value = input.trim().toLowerCase()
  if (PRESETS[value]) {
    return PRESETS[value]
  }

  return HEX.test(value) ? value : null
}

// A stable preset per repo name, used until /repo-color sets one.
export function defaultColorFor(name: string): string {
  const presets = Object.values(PRESETS)
  let hash = 0
  for (const char of name) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  }

  return presets[hash % presets.length]!
}

// The status line is plain text, so the color shows as the nearest colored
// circle emoji.
export function emojiFor(hex: string): string {
  const digits = hex.slice(1)
  const full = digits.length === 3 ? [...digits].map(d => d + d).join('') : digits
  const [r, g, b] = [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16) / 255) as [
    number,
    number,
    number,
  ]
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const lightness = (max + min) / 2
  const delta = max - min
  if (delta < 0.12) {
    return lightness > 0.5 ? '⚪' : '⚫'
  }

  const sector =
    max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4
  const hue = (sector * 60 + 360) % 360
  if (hue >= 15 && hue < 38 && lightness < 0.35) {
    return '🟤'
  }
  if (hue < 15 || hue >= 340) {
    return '🔴'
  }
  if (hue < 38) {
    return '🟠'
  }
  if (hue < 70) {
    return '🟡'
  }
  if (hue < 165) {
    return '🟢'
  }
  if (hue < 255) {
    return '🔵'
  }

  return '🟣'
}

export function statusText(current: Repo, hex: string | null): string {
  return `${emojiFor(hex ?? defaultColorFor(current.name))} ${current.name}`
}

// The picker offers exactly the circles the status line can show, each saved as
// a color that maps back to it.
export const CIRCLES: [emoji: string, hex: string][] = [
  ['🔴', '#e5484d'],
  ['🟠', '#f76b15'],
  ['🟡', '#ffc53d'],
  ['🟢', '#30a46c'],
  ['🔵', '#0090ff'],
  ['🟣', '#8e4ec6'],
  ['🟤', '#6b4423'],
  ['⚫', '#2b2b2b'],
  ['⚪', '#e8e8e8'],
]

function storeKey(key: string): string {
  return `color:${key}`
}

// Keyed by the git common dir so every worktree of a repo shares one color.
async function findRepo($: EngineInterface): Promise<Repo> {
  const root = await $.session.root()
  try {
    const { exitCode, stdout } = await $.process.run(
      ['git', 'rev-parse', '--path-format=absolute', '--git-common-dir'],
      { cwd: root, timeoutMs: 5000 },
    )
    if (exitCode === 0 && stdout.trim()) {
      const key = stdout.trim().replace(/\/\.git\/?$/, '')

      return { key, name: key.split('/').pop() || key }
    }
  } catch {
    // Not a git checkout, or git is missing. Fall back to the session root.
  }

  return { key: root, name: root.split('/').pop() || root }
}

async function applyColor($: EngineInterface, hex: string | null) {
  const current = (await read($, repo)) ?? (await findRepo($))
  if (hex) {
    await $.store.set(storeKey(current.key), hex)
  } else {
    await $.store.delete(storeKey(current.key))
  }
  await update($, repo, () => current)
  await update($, color, () => hex)
  $.ui.status(statusText(current, hex))

  return current
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'repo-color',
      description: 'Set a color for this repo, shown in the status line',
    })
    const found = await findRepo($)
    const saved = await $.store.get(storeKey(found.key))
    const hex = typeof saved === 'string' ? saved : null
    await update($, repo, () => found)
    await update($, color, () => hex)
    $.ui.status(statusText(found, hex))

    return next(e)
  })

  on('command.run', { command: 'repo-color' }, async ($, e) => {
    const arg = e.args.trim()

    if (!arg) {
      await $.ui.open({ id: PICKER, title: 'Repo color' })

      return { text: 'Opened the repo color picker.' }
    }

    if (arg === 'off' || arg === 'clear') {
      const current = await applyColor($, null)

      return { text: `${current.name} is back to its default color.` }
    }

    const parsed = parseColor(arg)
    if (!parsed) {
      return { text: `Unknown color "${arg}".\n${USAGE}` }
    }

    const current = await applyColor($, parsed)

    return { text: `${current.name} is now ${parsed}.` }
  })

  on('ui.render', { component: 'Pane', requestId: PICKER }, async ($, e) => {
    const current = await read($, repo)
    const set = await read($, color)
    const fill = set ?? defaultColorFor(current?.name ?? '')
    const { Box, Button, Text } = $.ui.resolve(e)
    const shown = emojiFor(fill)

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="row" gap={1}>
          <Box
            key="preview"
            borderStyle="round"
            borderColor={fill}
            backgroundColor={BUBBLE}
            paddingX={1}
          >
            <Text>{`${shown} ${current?.name ?? 'this repo'}`}</Text>
          </Box>
          {!set && <Text dimColor>(default)</Text>}
        </Box>
        <Box flexDirection="row" gap={1}>
          {CIRCLES.map(([emoji, hex]) => (
            <Button key={emoji} plain onPress={() => applyColor($, hex)}>
              <Text>{emoji}</Text>
            </Button>
          ))}
        </Box>
        <Box flexDirection="row" gap={1}>
          <Button key="reset" label="Use default" onPress={() => applyColor($, null)} />
          <Button
            key="done"
            label="Done"
            variant="primary"
            onPress={() => $.ui.close({ id: PICKER })}
          />
        </Box>
      </Box>
    )
  })

}
