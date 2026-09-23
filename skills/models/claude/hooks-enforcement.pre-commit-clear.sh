#!/usr/bin/env bash
# PostToolUse hook: after any `git commit` Bash call, clear the pre-commit
# marker so the next commit requires a fresh declaration rather than
# reusing a stale one.
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
  rm -f .claude/.pre-commit-declared
fi
exit 0
