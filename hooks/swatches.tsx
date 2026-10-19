import type { ClientModule } from 'claude-code'

export type SwatchProps = { rows: string[][]; selected: string | null }

// Cells per swatch: two of color, one gap.
export const CELL = 3

// Draws the swatch grid as colored blocks and posts the one clicked. Colors
// inside a Button are dropped by the desktop, so the grid is drawn here and a
// click is mapped back to its swatch from the pointer's cell.
const Swatches: ClientModule<SwatchProps, { isListening: true }> = (props, surface) => {
  const { Box, Text } = surface.elements

  if (!surface.state) {
    surface.onPointer(event => {
      if (event.type !== 'down' || event.x % CELL === CELL - 1) {
        return
      }
      const hex = props.rows[event.y]?.[Math.floor(event.x / CELL)]
      if (hex) {
        surface.post({ pick: hex })
      }
    })
    surface.setState({ isListening: true })
  }

  return (
    <Box flexDirection="column">
      {props.rows.map(row => (
        <Text>
          {row.map(hex => (
            <Text color={hex}>{hex === props.selected ? '▓▓ ' : '██ '}</Text>
          ))}
        </Text>
      ))}
    </Box>
  )
}

export default Swatches
