import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Repo } from '../types'

const repo = atom({ plugin: 'repo-color', key: 'repo' } as const, null)
const color = atom({ plugin: 'repo-color', key: 'color' } as const, null)
const opacity = atom({ plugin: 'repo-color', key: 'opacity' } as const, 100)

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

// Origins of a prompt the person sent: the terminal, the desktop app (SDK)
// and Remote Control.
const PERSON = new Set(['composer', 'sdk', 'bridge'])

// A faint fill for the bubble, a step above the desktop's dark background.
// No theme key names it.
const BUBBLE = '#1e1e1e'

const PICKER = 'repo-color-picker'

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

const OPACITY_KEY = 'opacity'

const OPACITY_STEPS = [100, 75, 50, 25]

const USAGE = `Usage: /repo-color opens the picker, or /repo-color <color> | off | opacity <0-100>\nPresets: ${Object.keys(PRESETS).join(', ')}, or a hex like #ff8800.`

export function parseColor(input: string): string | null {
  const value = input.trim().toLowerCase()
  if (PRESETS[value]) {
    return PRESETS[value]
  }

  return HEX.test(value) ? value : null
}

export function parseOpacity(input: string): number | null {
  const value = input.trim().replace(/%$/, '')
  if (!/^\d{1,3}$/.test(value)) {
    return null
  }
  const percent = Number(value)

  return percent <= 100 ? percent : null
}

// Mixes the color into the bubble fill. Surfaces take no alpha in a color, so
// opacity is drawn as a blend toward the background instead.
export function withOpacity(hex: string, percent: number, background = BUBBLE): string {
  const channels = (value: string) => {
    const digits = value.slice(1)
    const full = digits.length === 3 ? [...digits].map(d => d + d).join('') : digits

    return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16))
  }
  const top = channels(hex)
  const bottom = channels(background)
  const alpha = percent / 100

  return `#${top
    .map((value, i) => Math.round(value * alpha + bottom[i]! * (1 - alpha)))
    .map(value => value.toString(16).padStart(2, '0'))
    .join('')}`
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

export function hslToHex(hue: number, saturation: number, lightness: number): string {
  const s = saturation / 100
  const l = lightness / 100
  const a = s * Math.min(l, 1 - l)
  const channel = (n: number) => {
    const k = (n + hue / 30) % 12
    const value = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))

    return Math.round(value * 255)
      .toString(16)
      .padStart(2, '0')
  }

  return `#${channel(0)}${channel(8)}${channel(4)}`
}

// The picker's grid: twelve hues around the wheel, light to dark, then grays.
const SWATCHES: string[][] = [
  ...[72, 58, 44].map(lightness =>
    Array.from({ length: 12 }, (_, i) => hslToHex(i * 30, 80, lightness)),
  ),
  [92, 80, 68, 56, 44, 32].map(lightness => hslToHex(0, 0, lightness)),
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

  return current
}

// One opacity for every repo.
async function applyOpacity($: EngineInterface, percent: number) {
  await $.store.set(OPACITY_KEY, percent)
  await update($, opacity, () => percent)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'repo-color',
      description: 'Set a color for this repo, shown beside your messages',
    })
    const found = await findRepo($)
    const saved = await $.store.get(storeKey(found.key))
    await update($, repo, () => found)
    await update($, color, () => (typeof saved === 'string' ? saved : null))
    const savedOpacity = await $.store.get(OPACITY_KEY)
    await update($, opacity, () => (typeof savedOpacity === 'number' ? savedOpacity : 100))

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

    const opacityArg = arg.match(/^opacity\s+(.+)$/i)
    if (opacityArg) {
      const percent = parseOpacity(opacityArg[1]!)
      if (percent === null) {
        return { text: `Opacity is a number from 0 to 100, not "${opacityArg[1]}".` }
      }
      await applyOpacity($, percent)

      return { text: `Repo color opacity is now ${percent}%.` }
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
    const percent = await read($, opacity)
    const elements = $.ui.resolve(e)
    const { Box, Button, Text } = elements
    // The mobile app draws no field, so no hex input there.
    const Input = 'Input' in elements ? elements.Input : null
    // Surfaces without Client (mobile, VS Code) fall back to dot buttons.
    const Client = 'Client' in elements ? elements.Client : null

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="row" gap={1}>
          <Box
            key="preview"
            borderStyle="round"
            borderColor={withOpacity(fill, percent)}
            backgroundColor={BUBBLE}
            paddingX={1}
          >
            <Text>{current?.name ?? 'this repo'}</Text>
          </Box>
          <Text dimColor>{`${set ?? `${fill} (default)`} at ${percent}%`}</Text>
        </Box>
        {Client ? (
          <Client
            key="swatches"
            module="./swatches.tsx"
            props={{ rows: SWATCHES, selected: set }}
          />
        ) : (
          <Box flexDirection="column">
            {SWATCHES.map((row, i) => (
              <Box key={`row-${i}`} flexDirection="row">
                {row.map(hex => (
                  <Button key={hex} plain onPress={() => applyColor($, hex)}>
                    <Text color={hex}>{hex === set ? '◉' : '●'}</Text>
                  </Button>
                ))}
              </Box>
            ))}
          </Box>
        )}
        {Input && (
          <Input
            key="hex"
            label="Hex"
            placeholder="#ff8800"
            submitLabel="Set"
            onSubmit={async (value: string) => {
              const parsed = parseColor(value)
              if (parsed) {
                await applyColor($, parsed)
              } else {
                $.ui.toast(`Not a color: ${value}`)
              }
            }}
          />
        )}
        <Box flexDirection="row" gap={1}>
          <Text>Opacity</Text>
          {OPACITY_STEPS.map(step => (
            <Button
              key={`opacity-${step}`}
              label={`${step}%`}
              variant={step === percent ? 'primary' : 'secondary'}
              onPress={() => applyOpacity($, step)}
            />
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

  on('ui.message', async ($, e, next) => {
    if (e.requestId !== PICKER || e.element !== 'swatches') {
      return next(e)
    }
    const data = e.data as { pick?: unknown }
    const parsed = typeof data?.pick === 'string' ? parseColor(data.pick) : null
    if (parsed) {
      await applyColor($, parsed)
    }

    return {}
  })

  // Draws each prompt you send as a right-aligned rounded bubble, bordered in
  // the repo color. Wrapping the engine's own drawing outlines its whole
  // reserved area, not the bubble, so the bubble is ours.
  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    const current = await read($, repo)
    if (!current || !PERSON.has(e.props.origin.kind)) {
      return next(e)
    }

    const fill = withOpacity(
      (await read($, color)) ?? defaultColorFor(current.name),
      await read($, opacity),
    )
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="row" justifyContent="flex-end">
        <Box
          key="bubble"
          borderStyle="round"
          borderColor={fill}
          backgroundColor={BUBBLE}
          paddingX={1}
        >
          <Text>{e.props.text}</Text>
        </Box>
      </Box>
    )
  })
}
