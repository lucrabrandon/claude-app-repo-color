# repo-color

Give each repo a color in Claude Code. Your messages are drawn as a bubble bordered in that color, so you can tell sessions apart at a glance. Every worktree of a repo shares its color.

## Install

```bash
claude plugin marketplace add lucrabrandon/claude-app-repo-color
claude plugin install repo-color@repo-color
```

Start a new session after installing.

## Use

| Command | What it does |
| --- | --- |
| `/repo-color` | Opens the color picker |
| `/repo-color <color>` | Sets this repo's color: a preset or a hex like `#ff8800` |
| `/repo-color off` | Goes back to the default color |
| `/repo-color opacity <0-100>` | Fades the border; applies to every repo |

Presets: `red`, `orange`, `yellow`, `green`, `teal`, `blue`, `indigo`, `purple`, `pink`, `gray`.

A repo with no color set gets a stable default picked from its name.

## Requirements

This is a mod. It uses the Claude Code mod runtime to redraw your messages and open the picker pane. Clients without that runtime ignore it.

## Develop

```bash
claude plugin test .
claude plugin validate .
```

## License

MIT
