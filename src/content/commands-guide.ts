import type { ModuleGuide } from "@/types/module-guide";

export const COMMANDS_GUIDE: ModuleGuide = {
  slug: "commands",
  title: "Commands",
  line: "Slash commands you type to run a kit action.",
  intro: [
    {
      id: "script-first",
      kicker: "Chapter 1",
      title: "A script does the work, the model reads the result",
      line: "Most commands run a small script first, so the model summarizes a report instead of reading every file.",
      moreLabel: "How a command behaves",
      more: [
        "Every command file is marked so that only you can start it. The model never runs one on its own.",
        "Most commands need the skill that owns their script. A command whose skill is not installed has nothing to run.",
        "Two commands run no script at all: /kit prints a cheat sheet and /eta restates the current time estimate.",
      ],
    },
  ],
  itemsKicker: "Shelf",
  items: [
    {
      id: "check",
      name: "Check your work",
      hl: "group:skills-commands",
      line: "Audits, commit checks and viewport checks before you hand work over.",
      rows: [
        { label: "/audit", hl: "name:audit", act: "does", text: "Runs the code-audit script over the whole project and summarizes the worst rules, the worst files and the one fix with the biggest effect. Needs code-audit." },
        { label: "/commit-check", hl: "name:commit-check", act: "does", text: "Mechanical check of the staged change before a commit. A BLOCK finding stops the summary there. Needs pre-commit." },
        { label: "/githooks", hl: "name:githooks", act: "does", text: "Shows whether the kit's git hooks for secrets, files and commit messages are installed. Installs only after an explicit yes. Needs pre-commit." },
        { label: "/responsive-check", hl: "name:responsive-check", act: "does", text: "A viewport plan or breakpoint report on the RULE 17 zones, with custom ranges, widths and --detect. Needs responsive-check." },
      ],
    },
    {
      id: "session",
      name: "Session and handover",
      hl: "group:skills-commands",
      line: "Stop a session cleanly and start the next one cold.",
      rows: [
        { label: "/pickup", hl: "name:pickup", act: "does", text: "Loads handover.md as the project state and only reads. Needs handover." },
        { label: "/wrap-up", hl: "name:wrap-up", act: "does", text: "Rewrites handover.md in place so the next session resumes cold. Needs handover." },
        { label: "/next", hl: "name:next", act: "does", text: "Queues the next task with tsk-note or starts it with tsk-start, archives the skills it does not need and records the moves in handover.md. With no mode word and task it moves nothing. Needs skill-scope." },
        { label: "/archive", act: "does", text: "Archives skills you do not need this session. With no names it archives every archivable skill; a pinned skill stays. Needs skill-scope." },
        { label: "/unarchive", act: "does", text: "Brings archived skills back and names the ones now active. With no names it restores every archived skill. Needs skill-scope." },
        { label: "/eta", hl: "name:eta", act: "does", text: "Restates the active task's time estimate and its next checkpoint. No script. Needs plan-first." },
      ],
    },
    {
      id: "files",
      name: "Files and versions",
      hl: "group:skills-commands",
      line: "Bump a version, shrink assets, settle a merge, hide a file.",
      rows: [
        { label: "/version-bump", hl: "name:version-bump", act: "does", text: "Bumps a package.json version (major, feature, patch, alpha, beta, rc or release) and inserts the matching CHANGELOG.md entry. Needs version-bump." },
        { label: "/optimize-assets", hl: "name:optimize-assets", act: "does", text: "Scans for heavy assets, then converts, compresses or pre-compresses them. Originals are never touched. Needs optimize-assets." },
        { label: "/resolve-conflicts", hl: "name:resolve-conflicts", act: "does", text: "Lists the conflict set and role scope, then guides resolution by mode, pace and role. Needs resolve-conflicts." },
        { label: "/untrack", act: "does", text: "Hides files from the Changes tree locally, shows them again, or lists what is hidden. Nothing is committed. Needs untrack." },
      ],
    },
    {
      id: "docs",
      name: "Memory and project docs",
      hl: "group:skills-commands",
      line: "Keep notes and project documents tidy.",
      rows: [
        { label: "/stale", hl: "name:stale", act: "does", text: "Lists memory bullets that name files which no longer exist. Edits nothing unless asked. Needs memory-gardener." },
        { label: "/ctx", hl: "name:ctx", act: "does", text: "Sets up, analyzes and checks the private project-context folder. Needs project-context." },
        { label: "/figma", hl: "name:figma", act: "does", text: "Turns exported Figma PNG and SVG files into project-context/design/figma.md, with no Figma connector. Needs project-context." },
      ],
    },
    {
      id: "output",
      name: "Output and add-on controls",
      hl: "group:skills-commands",
      line: "Shape what comes back, and steer the opt-in add-ons.",
      rows: [
        { label: "/quiet", hl: "name:quiet", act: "does", text: "Runs a noisy command with shortened output and keeps the failure lines. Needs session-budget." },
        { label: "/format", hl: "name:format", act: "does", text: "Sets the response shape for the session: table, bullets, oneline, bool or reset. No script." },
        { label: "/kit", hl: "name:kit", act: "does", text: "A cheat sheet that names the command that fits your situation. No script." },
        { label: "/persona", hl: "name:persona", act: "does", text: "Chooses how replies are phrased: set female or male at novice, mid or pro, off, status, list. Needs personality." },
        { label: "/narration", hl: "name:narration", act: "does", text: "Controls reply narration: play, pause, resume, mode, mute, voice, volume, speed, pitch, alerts and status. Needs narrate." },
        { label: "/diagram", act: "does", text: "Detects, checks or builds a stack or structure diagram from a spec. Logos are downloaded only after you agree. Needs diagram." },
        { label: "/teardown", act: "does", text: "Detects, scaffolds, checks, builds or photographs a 3D machine simulator, and probes the live page. Needs teardown." },
        { label: "/teardown-film", act: "does", text: "Checks or records a simulator's tour as an MP4. Needs teardown-film and ffmpeg." },
        { label: "/teardown-sound", act: "does", text: "Writes or measures a simulator's score as a WAV file. Needs teardown-sound." },
      ],
    },
  ],
  finder: [
    { situation: "You want a health check of the whole project", item: "/audit", hl: "name:audit" },
    { situation: "You are about to commit", item: "/commit-check", hl: "name:commit-check" },
    { situation: "You want files out of the Changes tree", item: "/untrack hide <paths>", hl: "group:skills-commands" },
    { situation: "You are resuming work from last time", item: "/pickup", hl: "name:pickup" },
    { situation: "You are ending a session", item: "/wrap-up", hl: "name:wrap-up" },
  ],
};
