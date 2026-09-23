#!/usr/bin/env bash
# PreToolUse hook: blocks `git commit` Bash calls until:
#  1. the pre-commit skill's marker file exists (model ran the checklist)
#  2. the staged diff has no obvious debug leftovers
#  3. the commit message matches Conventional Commits (git-standards RULE G-06/G-07/G-08)
# The model writes the marker itself, as the last step of actually running
# the pre-commit checklist — this script only checks for it, never writes it.
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

if ! printf '%s' "$cmd" | grep -q "git commit"; then
  exit 0
fi

if [ ! -f .claude/.pre-commit-declared ]; then
  echo "pre-commit checklist not run yet — invoke the pre-commit skill (staged-diff review, stray files, message format), then create .claude/.pre-commit-declared, before committing." >&2
  exit 2
fi

# --- debug leftovers in staged diff ---
staged_added=$(git diff --cached -U0 -- . ':(exclude).claude/**' 2>/dev/null | grep -E '^\+' | grep -vE '^\+\+\+')
leftovers=$(printf '%s\n' "$staged_added" | grep -nE '^\+.*(console\.(log|debug)\(|debugger;|\bFIXME\b)' || true)
if [ -n "$leftovers" ]; then
  echo "debug leftovers found in staged diff (console.log/debugger/FIXME). Remove or justify before committing:" >&2
  printf '%s\n' "$leftovers" >&2
  exit 2
fi

# --- commit message format (Conventional Commits, git-standards RULE G-06/G-07/G-08) ---
# Only enforced if the project's git-standards.md still defines this exact rule set —
# projects that override git-standards.md with a different message format won't match
# this check anyway since it's pattern-based, not a read of the doc.
msg=$(printf '%s' "$cmd" | node -e "
let d='';
process.stdin.on('data', c => d += c);
process.stdin.on('end', () => {
  const s = d;
  const matches = [...s.matchAll(/-m\s+(\"([^\"]*)\"|'([^']*)')/g)];
  if (matches.length) process.stdout.write(matches[0][2] !== undefined ? matches[0][2] : matches[0][3]);
});
")

if [ -n "$msg" ]; then
  header=$(printf '%s' "$msg" | head -n1)
  if ! printf '%s' "$header" | grep -qE '^(feat|fix|patch|style|refactor|chore|docs|test|remove)(\([a-z0-9_-]+\))?: .+'; then
    echo "commit message header doesn't match Conventional Commits (git-standards RULE G-06/G-07): '$header'. Expected 'type: summary' with type in feat|fix|patch|style|refactor|chore|docs|test|remove." >&2
    exit 2
  fi
  header_len=${#header}
  if [ "$header_len" -gt 50 ]; then
    echo "commit message header exceeds 50 chars (git-standards RULE G-08): $header_len chars — '$header'" >&2
    exit 2
  fi
fi

exit 0
