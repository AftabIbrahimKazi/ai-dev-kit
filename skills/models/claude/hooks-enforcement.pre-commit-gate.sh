#!/usr/bin/env bash
# PreToolUse hook: blocks `git commit` Bash calls until the pre-commit
# skill's marker file exists. The model writes the marker itself, as the
# last step of actually running the pre-commit checklist — this script
# only checks for it, never writes it.
input=$(cat)
cmd=$(printf '%s' "$input" | node -e "
let d='';
process.stdin.on('data', c => d += c);
process.stdin.on('end', () => {
  try {
    const j = JSON.parse(d);
    process.stdout.write((j.tool_input && j.tool_input.command) || '');
  } catch (e) {}
});
")

if printf '%s' "$cmd" | grep -q "git commit"; then
  if [ ! -f .claude/.pre-commit-declared ]; then
    echo "pre-commit checklist not run yet — invoke the pre-commit skill (staged-diff review, stray files, message format), then create .claude/.pre-commit-declared, before committing." >&2
    exit 2
  fi
fi
exit 0
