# Install kit extras

Read only when migrating renamed skills, adding a signature or company standards, archiving, uninstalling or updating an install.

## Step 3b — Migrate renamed skills (every re-install; mechanical with an approval gate)
The library keeps a rename ledger at `migrations/RENAMES.md` (repo root). On every `update` run, the script compares the target's `.ai-dev-kit.json` manifest against the ledger's **Old name** column itself and reports any match as a *pending* migration — it never renames anything without approval:
```
node <library>/skills/meta/install-kit.cli.js update --library <library> --root <target>
```
If the output lists a pending migration, show the old → new name to the user and ask. On approval, re-run with `--apply-migrations old-name1,old-name2` (or `--apply-migrations all` once the user has approved everything shown). That one flag copies the new-name skill in with its companions, carries `learnings.md` forward from the old folder (the one exception to "never copy learnings" — it's a move within the same project), and deletes the old folder only after the new one lands. Still grep the routed session-protocol file (and any multi-tool pointer file), plus the other skills' text, for the old name and update references by hand — the script only touches skill folders. Report each migration in the Step 4 summary (`old-name → new-name, learnings carried, N references updated`).
When maintaining the library itself: any skill rename/merge MUST add a ledger row in the same change — a rename without a ledger row strands every existing install.

## Step 3b2 — Project signature (optional watermark; the user decides)

Ask once after the standards question, via `AskUserQuestion` (single-select, header "Signature"): **No signature** (default), **Use a short alias** (the built-in "Other" box takes 2 to 6 letters). Say in one sentence what it does: it watermarks the code written to the standards with that alias, `abc-` classes and ids, `data-abc-` data attributes, `Abc` components, for the project's own code only, never packages or libraries. Never suggest or choose an alias yourself. Pass the answer as `--signature <alias>` or `--signature none`. It fills the project table's "Selector signature" row; `signature set|remove|show --root <target>` changes it later. `code-audit` rule `css-11` checks it against custom code only.

## Step 3c — Company standards (opt-in; mechanical)

Ask once, after the standards question, via `AskUserQuestion` (yes/no, header "Company standards"): "Does this project follow your own company's standards (a design system, style guide, standards docs)?" On no, skip this step. On yes, the kit keeps them in a separate `coding-standards/company/` folder and never edits the files in it.

1. Ask where the docs are (free text via "Other"; blank means the user will drop files in later).
2. Ask what happens to the kit's default standards (`AskUserQuestion`, single-select, header "Defaults"): **Install the default standards too** (`keep`, the safe default: company rules win on conflict), **Don't install the default standards** (`drop`: company only, so skip the Step 3 questions and do not pass `--standards`), **Auto-detect** (`auto`). Before showing auto-detect, say in one sentence that it guesses from file names, titles and headings, never removes the accessibility, QA, git or versioning defaults, and is reversible.
3. Run: `node <library>/skills/meta/install-kit.cli.js company sync --library <library> --root <target> --company-from <folder> --company-defaults keep|drop|auto` (or add the same three flags to `install`). With auto, show the user the returned `findings` table and the `disclaimer`, and offer `--company-defaults keep` if they disagree.
4. It writes `coding-standards/company/INDEX.md` (routing table; imports the company's own "build X, read Y" table when it has one), a `company-standards` skill, a marked block in the session-protocol file, and a manifest record. Report `files`, `routes`, `dropped`.

Later: `company sync` after the folder changes, `company status`, `company remove` (restores removed defaults, keeps the user's docs; `--purge` deletes them). The `standards-chain` mod requires `INDEX.md` to be read before code or UI edits, and does not demand a default file the company replaced.

## Step 5 — Archive / unarchive (mount / unmount) a skill
Archiving is automatic: the `skill-scope` session-start hook archives the per-session-archivable set, the prompt hook restores a skill when the message names its trigger, and `/next <task>` does both on demand (all through `skill-scope/auto.js`, which calls the commands below). Never hand-move those folders. To move one named skill yourself, run:
```
node <library>/skills/meta/install-kit.cli.js archive   --root <target> --skills name1,name2   # or --all
node <library>/skills/meta/install-kit.cli.js unarchive --root <target> --skills name1,name2   # or --all
```
`archive` moves exactly the named skills (only ones the manifest tracks as currently installed — same protection as `uninstall`) from `<skill-root>/<name>/` to `<tool-dir>/skills-archive/<name>/` (`.claude/skills-archive/` or `.opencode/skills-archive/`, sibling of the skill root, matching `skill-scope`'s existing convention), drops the CommonJS shield once nothing archived still needs it, and records the move in the manifest. `unarchive` reverses it by name (or `--all` to restore everything currently archived), re-adding the shield if a restored skill needs it. A skill the manifest doesn't recognize as installed, or doesn't recognize as archived, is reported back and left untouched rather than guessed at. `handover` records the archived list + paths in `handover.md` as it always did; the script just makes the move itself atomic and reversible instead of a narrated multi-file move.

## Step 6 — Uninstall
```
node <library>/skills/meta/install-kit.cli.js uninstall --root <target> --skills name1,name2   # or --all   [--remove-hooks] [--remove-standards]
```
Kit hooks in `.claude/settings.json` stay unless `--remove-hooks` is passed, which removes only entries identical to the kit's own and keeps every other hook and setting. Removes exactly the skill folders the manifest (`.ai-dev-kit.json`) recorded this kit as having installed, active or archived (an archived skill is removed from `skills-archive/`, and an empty `skills-archive/` goes with it) — never a folder the manifest doesn't know about, even if `--all` is passed, so a hand-authored or third-party skill living in the same skill root is always left alone. Drops the `package.json` CommonJS shield once no remaining companion needs it. **Never removes `coding-standards/` or the session-protocol file by default** — pass `--remove-standards` to also remove `coding-standards/`; the session-protocol file is never deleted by the script under any flag, since it may carry project-specific edits beyond what the kit wrote. If the user wants it gone too, remove it yourself after confirming with them, not automatically. Report what was removed and what was deliberately left, straight from the script's `removed`/`kept` output.

## Keeping installs current
This copies a snapshot, tracked by the manifest. `update --all` also refreshes archived skills in place and leaves them archived, and adds any hook block a newer kit ships to `.claude/settings.json` when the project already holds a kit hook (a project that never opted in is left alone); `install` of an archived skill makes it active again. When the library improves, or the user wants more skills, commands, addons or mods later, run `update` (add `--skills` for specific ones, or `--all` to resync everything the manifest already tracks) — the manifest ensures only kit-managed files move. Never edit an installed copy directly for library-wide improvements; edit the library and re-install/update.

**What's new.** `update` returns a `whatsNew` block: the `CHANGELOG.md` entries newer than the date this project last saw (`lastSeen` in the manifest, set by `install` and advanced by every `update`). Show it as a footnote after the update summary: one line per entry (`entries`, each `date kind: headline`), then "and N more" from `more`. It is information only: ask nothing and install nothing because of it. When `baseline` is true the project had no recorded date, so the entries are just the two newest sections; say tracking starts now. If `whatsNew` is absent or `entries` is empty, print nothing.

