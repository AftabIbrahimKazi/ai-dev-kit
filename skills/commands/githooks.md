---
description: Show whether the kit's git hooks (secrets, files, commit message) are installed
allowed-tools: Bash(node:*)
---
Git hook status:

!`node {{skill-root}}/pre-commit/install-hook.js status`

Report the status in two lines. If a hook is not installed, say that `node {{skill-root}}/pre-commit/install-hook.js` installs it and `... uninstall` removes only hooks it wrote, then ask whether to install. If a different hook is present, say it is left alone unless `--force` is used. Install or uninstall nothing without an explicit yes.
