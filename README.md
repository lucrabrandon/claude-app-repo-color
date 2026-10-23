# repo-color

Give each repo a color in Claude Code. The color and the repo name show in the status line under the prompt, so you can tell sessions apart at a glance. Messages and their attachments are left as the app draws them. Every worktree of a repo shares its color.

## Install

```bash
claude plugin marketplace add lucrabrandon/claude-app-repo-color
claude plugin install repo-color@repo-color
```

Start a new session after installing.

## Use

| Command | What it does |
| --- | --- |
| `/repo-color` | Opens the picker: one of the nine circles the status line can show |
| `/repo-color <color>` | Sets this repo's color: a preset or a hex like `#ff8800` |
| `/repo-color off` | Goes back to the default color |

The status line is plain text, so a preset or hex shows as the nearest colored circle emoji.

Presets: `red`, `orange`, `yellow`, `green`, `teal`, `blue`, `indigo`, `purple`, `pink`, `gray`.

A repo with no color set gets a stable default picked from its name.

## Requirements

This is a mod. It uses the Claude Code mod runtime to set the status line and open the picker pane. Clients without that runtime ignore it.

## Develop

```bash
claude plugin test .
claude plugin validate .
```

## License

MIT
