import type { ModuleGuide } from "@/types/module-guide";

export const MODS_GUIDE: ModuleGuide = {
  slug: "mods",
  title: "Mods",
  line: "Hook-based plugins that run in code and can block an action.",
  intro: [
    {
      id: "in-code",
      kicker: "Chapter 1",
      title: "Skills ask. Mods enforce.",
      line: "A mod runs in code, so unlike a skill it fires every time.",
      moreLabel: "What a mod is",
      more: [
        "A skill is judged by the model and may not load. A mod is a hook on a tool call or a session event, so it runs whether or not the model remembers the rule.",
        "Mods are optional and fail open: if one breaks, your work continues. No kit rule depends on one.",
        "Mods need Claude Code 2.1.287 or later. They are Claude Code only.",
      ],
    },
    {
      id: "install",
      kicker: "Chapter 2",
      title: "Review before you install",
      line: "A mod runs with your permissions and sees every prompt and tool call.",
      moreLabel: "How to install one",
      more: [
        "The mod-setup skill checks your Claude Code version, lets you pick mods, validates each one and shows what it can touch. You say yes per mod.",
        "Add the kit marketplace once with claude plugin marketplace add <path-to-ai-dev-kit>/mods, then install by name with claude plugin install <name>@ai-dev-kit-mods.",
        "Four mods run a script that ships with a skill. A mod whose skill is missing loads fine but does nothing, by design.",
        "For a new user the order is budget-ledger first, because it measures the rest. Turn one off in /plugin, or start with --safe-mode to turn them all off for a session.",
      ],
    },
  ],
  itemsKicker: "Group",
  items: [
    {
      id: "blockers",
      name: "Blockers",
      hl: "group:mods",
      line: "These deny an action before it happens.",
      rows: [
        { label: "precommit-gate", hl: "name:precommit-gate", act: "does", text: "Gates git commit and push, in Bash and PowerShell. Blocks leaked secrets, secret files, bad messages and --no-verify. Needs the pre-commit skill's check.js." },
        { label: "guard", hl: "name:guard", act: "does", text: "Denies edits to secret files, lockfiles and .git, and destructive commands: root-like recursive deletes, force push, reset --hard, clean -f, publish, download piped into a shell. Config in .claude/guard.json." },
        { label: "standards-chain", hl: "name:standards-chain", act: "does", text: "Denies the first Edit or Write of a file until its coding-standards chain has been read, and again after a compaction. Does nothing without a coding-standards folder." },
        { label: "aiignore-guard", hl: "name:aiignore-guard", act: "does", text: "Keeps the AI out of files it should not read: your .aiignore, paths that belong to another role, the current task's scope. Does nothing without these files." },
      ],
    },
    {
      id: "shapers",
      name: "Result shapers",
      hl: "group:mods",
      line: "These change what the model sees, not what it may do.",
      rows: [
        { label: "edit-check", hl: "name:edit-check", act: "does", text: "After each Edit or Write, runs the pre-merge-gate skill's edit-check.js and shows the model only the problems: syntax, ESLint, Stylelint and coding-standards rules." },
        { label: "output-compact", hl: "name:output-compact", act: "does", text: "Runs session-budget's compact.js on every Bash or PowerShell result before the model reads it. Drops noise, keeps every failure line." },
        { label: "prefilter-rank", hl: "name:prefilter-rank", act: "does", text: "Ranks Grep and Glob results of 5 to 40 files by relevance to the task, using the local Laya prefilter. Calls 127.0.0.1 only. Does nothing if Laya is not set up." },
      ],
    },
    {
      id: "reminders",
      name: "Reminders",
      hl: "group:mods",
      line: "One line, once, and never a block.",
      rows: [
        { label: "debug-nudge", hl: "name:debug-nudge", act: "does", text: "At the second failed fix of a test or build command, reminds the model to stop editing and apply the debug-protocol skill." },
        { label: "eta-nudge", hl: "name:eta-nudge", act: "does", text: "Nudges once when a command is backgrounded, then every 10 minutes after the first 5, to restate a time estimate. Never computes one." },
        { label: "design-audit-offer", hl: "name:design-audit-offer", act: "does", text: "After the second distinct UI file edit in a project with a design source, tells the model to offer a UI/UX audit once. Never audits or changes the design." },
        { label: "skill-hint", act: "does", text: "On a typed prompt, matches keywords in code with no model call and attaches one line naming skills that may apply, once per skill per session. An archived skill is named with the /unarchive command. It never loads, archives or restores anything." },
        { label: "marker-guard", hl: "name:marker-guard", act: "does", text: "When a reply does not start with the [CX] marker your protocol file defines, shows one warning line beneath it. After a compaction it shows one notice. Never blocks." },
      ],
    },
    {
      id: "context",
      name: "Context and measuring",
      hl: "group:mods",
      line: "Add context, or just watch.",
      rows: [
        { label: "budget-ledger", hl: "name:budget-ledger", act: "does", text: "Logs real token usage, cost, cache and tool-result sizes per turn, one file per session, and adds /budget. Observes only." },
        { label: "gap-log", act: "does", text: "Appends each STANDARDS GAP line an answer contains to .claude/standards-gaps.jsonl (time, session, gap), so the holes in the standards pile up for the maintainer. Adds no text to the answer or context, and stops at 1 MB." },
        { label: "learnings-inject", hl: "name:learnings-inject", act: "does", text: "Adds a skill's learnings.md to the Skill call result once per session, so the skill's start-of-skill read needs no tool call. Context only." },
      ],
    },
  ],
  finder: [
    { situation: "You want leaked secrets kept out of commits", item: "precommit-gate", hl: "name:precommit-gate" },
    { situation: "You want destructive commands stopped", item: "guard", hl: "name:guard" },
    { situation: "You want edits to wait until the standards were read", item: "standards-chain", hl: "name:standards-chain" },
    { situation: "You want to see what a session costs", item: "budget-ledger", hl: "name:budget-ledger" },
    { situation: "You want a warning when the [CX] marker is dropped", item: "marker-guard", hl: "name:marker-guard" },
  ],
};
