---
name: personality
description: Opt-in add-on. Use when the user asks to set up, pick, change or remove a reply persona, personality or tone for their skill level (novice, mid, pro).
---

# Personality — Replies Phrased to Fit the Reader

**Opt-in only.** The scripts live in `<skill-root>/personality/` once installed (in the kit repo they are `skills/addons/personality.<name>`). Six original personas change how Claude words its replies: two voices (female, male) times three skill levels. They change wording only. Facts, code, commands, paths, numbers, error text and how carefully work is verified never change.

| Level | For | Language |
|---|---|---|
| `novice` | newcomer, junior developer | plain words, terms explained once, reason before step, numbered steps |
| `mid` | working developer | everyday dev terms unexplained, advanced ideas in one clause, reason and fix together |
| `pro` | professional developer | full jargon, result first, exact names, no preamble or recap |

| | novice | mid | pro |
|---|---|---|---|
| female | Maya | Nora | Vera |
| male | Leo | Jonas | Victor |

## How it works
`inject.js` runs as a SessionStart hook and adds the chosen persona (about 150 to 190 tokens) to the session. A hook is used because a skill may not be matched, and a tone must hold in every session. Nothing is added until a persona is chosen. The text is written to read well aloud, so it pairs with the `narrate` add-on: pick the same gender for the voice.

## Install: one persona only
The kit holds all six, but an install copies **one**, because a session needs one. Ask the user to pick from eight options:

| # | Choice | Installs |
|---|---|---|
| 1-6 | `female-novice`, `female-mid`, `female-pro`, `male-novice`, `male-mid`, `male-pro` | that persona file only |
| 7 | `none` | nothing; no personality is applied |
| 8 | `custom` | a persona of the user's own: their file, or a starter to edit |

Run `node setup.js --install <choice> [--to <skill-root>/personality] [--file my-persona.md]`. It copies the injector, this doc and the chosen persona (never the other five), and saves the choice. Then add the hook to `~/.claude/settings.json` (skip for `none`):
```json
{ "hooks": { "SessionStart": [{ "hooks": [{ "type": "command", "command": "node \"<skill-root>/personality/inject.js\"" }] }] } }
```
A persona that is not installed can be added later by running setup again from the kit repo; switching with `--set` to one that is not installed is refused with that hint. `--status`, `--list`, `--show` (prints the exact text injected) and `--off` work too, as `/persona <setting>` once the command is installed. A project can override the choice with `<project>/.claude/personality.json`, for example `{"gender":"male","level":"pro"}` or `{"custom":true}`.

## Change or replace a persona
Choose `custom` at install, or edit `~/.claude/personas/custom.md` later (it lives in your folder, so kit updates never touch it). You can also override a built-in by putting your own `<gender>-<level>.md` (for example `female-pro.md`) in `~/.claude/personas/`; it wins over the kit's. Keep each under about 100 words: the text is added to every session, so each word costs tokens. The persona rules (wording only, short, no emoji) are added automatically after your text.

## Writing a persona
- Describe voice and level rules as short bullets, then one example of the same message in that voice.
- Characters must be original. Do not imitate a real person or a copyrighted character.
- A persona may not tell Claude to skip verification, hide errors or invent facts.
