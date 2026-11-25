---
description: Bump a package.json version (major/feature/patch/alpha/beta/rc/release) and insert the matching CHANGELOG.md entry
disable-model-invocation: true
allowed-tools: Bash(node:*)
---
Version bump:

!`A={{skill-root}}/skill-scope/auto.js ; if [ -f "$A" ]; then node "$A" run version-bump bump.js $ARGUMENTS; else node {{skill-root}}/version-bump/bump.js $ARGUMENTS; fi`

With no arguments it reads the commits since the last version change (or tag) and prints a suggested bump and changelog line, so it works in a fresh session with a clean tree; `--auto` applies that suggestion as-is. Usage: `/version-bump <major|feature|patch|alpha|beta|rc|release> [scope] [--added/--changed/--fixed/--removed "text"] [--for major|feature|patch] [--force] [--dry-run]`. With no scope it bumps every `package.json` under the current directory; a folder scopes to a group; a direct `package.json` path scopes to one package. A changelog bullet is required unless `--no-changelog` is passed. Use the `version-bump` skill if it is installed. Run with `--dry-run` first when more than one package will be touched. Show the result as reported; never run `git tag` or `git push` unless asked.
Report the result in at most 6 lines.
