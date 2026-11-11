import type { ModuleGuide } from "@/types/module-guide";

export const ADDONS_GUIDE: ModuleGuide = {
  slug: "add-ons",
  title: "Add-ons",
  line: "Opt-in extras. Nothing here is installed until you ask.",
  intro: [
    {
      id: "optional",
      kicker: "Chapter 1",
      title: "Off until you switch it on",
      line: "Each add-on is installed on request, never as part of the default kit.",
      moreLabel: "Why they are opt-in",
      more: [
        "Every add-on below is marked opt-in only in its own file. Some add a hook that runs in every session, some download a model, one needs an API key or a local server. None of that should happen unasked.",
        "Once you turn one on, it behaves like any installed skill and stays until you remove it.",
      ],
    },
  ],
  itemsKicker: "Add-on",
  items: [
    {
      id: "personality",
      name: "Personality",
      hl: "name:personality",
      line: "Replies phrased to fit the reader.",
      rows: [
        { label: "Does", text: "Six original personas change how Claude words its replies: two voices (female, male) times three skill levels (novice, mid, pro). Wording only: facts, code, commands, paths, numbers, error text and how carefully work is verified never change." },
        { label: "You", text: "Pick one of six personas, none, or a custom one at install. Run node setup.js --install <choice> --hook." },
        { label: "AI", text: "A SessionStart hook adds the chosen persona, about 150 to 190 tokens, to every session. Nothing is added until a persona is chosen." },
      ],
      moreLabel: "Levels and custom personas",
      more: [
        "novice: plain words, terms explained once, reason before step. mid: everyday dev terms unexplained, reason and fix together. pro: full jargon, result first, exact names, no preamble or recap.",
        "An install copies one persona, because a session needs one. Edit ~/.claude/personas/custom.md for your own, or put a file named like female-pro.md in ~/.claude/personas/ to override a built-in. Keep each under about 100 words, since the text is added to every session.",
        "The text is written to read well aloud, so it pairs with narrate: pick the same gender for the voice.",
      ],
    },
    {
      id: "narrate",
      name: "Narrate",
      hl: "name:narrate",
      line: "Replies read aloud.",
      rows: [
        { label: "Does", text: "A Stop hook reads the final reply aloud. Code, tables and links are dropped and announced as on screen. It runs locally, never talks to Claude, and costs no tokens." },
        { label: "You", text: "Run node setup.js --voices (about 125 MB of free, offline Piper voices), then node setup.js --hook. Control it with /narration: mute, voice, volume, speed, pitch, play, pause, resume, mode and alerts." },
        { label: "AI", text: "Nothing. The default mode is manual: the hook only keeps the reply until you play it. Mode auto speaks every reply as it arrives." },
      ],
      moreLabel: "Platforms and your own voice",
      more: [
        "Playback follows the system default output on Windows, macOS, Linux and Android (Termux). Only Windows has been run on a real machine; the other rows are covered by tests of the player choice, not by listening.",
        "You can add another Piper voice, or a cloned voice through a command engine that reads text on stdin and writes a wav. Licences are yours to check; never commit a custom voice or its reference audio to a shared repo.",
        "pause holds the speech and resume continues from the same spot; stop still cuts it and clears the queue.",
        "Spoken alerts are off by default. When a reply ends on a question, a short line in a second voice says so, only after the keyboard has been idle (default 30 seconds, Windows). An optional alertCommand sends alerts, and only alerts, to your own engine; every rendered piece is cached under ~/.claude/narrate-cache.",
        "For on-screen buttons in VS Code, install extensions/narrate-buttons.",
      ],
    },
    {
      id: "project-context",
      name: "Project context",
      hl: "name:project-context",
      line: "Private project docs, indexed for few tokens.",
      rows: [
        { label: "Does", text: "Keeps requirements, brand notes, assets and Figma exports in one gitignored project-context/ folder. Each sub-folder gets an INDEX.md, so the agent finds a fact without reading the raw files." },
        { label: "You", text: "Ask for the feature, choose auto-detect, recommended or your own folders, drop docs in, then run /ctx analyze." },
        { label: "AI", text: "Reads project-context/INDEX.md at session start, answers from each folder's Key facts, and edits INDEX.md files only, never your docs." },
      ],
      moreLabel: "The tool and the privacy rules",
      more: [
        "scan.js does the mechanical work: detect, init, status, changed, stamp, root and add. The agent reads only files that are new or modified since the last analysis.",
        "The folder is gitignored and pre-commit blocks any staged file under it. Its content never goes into a commit, PR, published page or subagent prompt unless you say so. If a file holds credentials, the agent says so without printing them.",
        "Where two docs disagree, both are listed under conflicts and the agent does not pick one.",
      ],
    },
    {
      id: "system1-prefilter",
      name: "System-1 prefilter",
      hl: "name:system1-prefilter",
      line: "Rank candidates with a typed-decision model.",
      rows: [
        { label: "Does", text: "Takes a state and typed questions and returns a chosen option with a probability per option, never generated text. It cuts file reads before they cost tokens." },
        { label: "You", text: "Choose a hosted endpoint with an API key, or local Laya: free, offline, no key, about 1 GB of weights on CPU." },
        { label: "AI", text: "If unconfigured, it skips prefiltering and does the task the normal way. A deterministic ladder decides when to read the runner-up." },
      ],
      moreLabel: "What it is not for",
      more: [
        "Proven uses: narrowing files after a search, code-review triage, test selection, skill-applicability decisions, and binary or multiple-choice questions already asked in that shape.",
        "Never for security or safety pass-fail checks: a real miss was found there, a plaintext secret scored a wrong pass. It is also not for choosing between solution approaches.",
        "It must never be pointed at a general chat model, because those do not return calibrated probabilities.",
      ],
    },
    {
      id: "diagram",
      name: "Diagram",
      hl: "group:skills-addons",
      line: "Stack and structure diagrams drawn by a script.",
      rows: [
        { label: "Does", text: "diagram.cli.js detects a project's stack or folder structure into a spec, lays it out, checks it for overlaps, arrows through text and a missing accessible title and description, and renders light and dark SVG plus a self-contained HTML page and a README snippet." },
        { label: "You", text: "Type /diagram detect, confirm the guessed links, then /diagram build <spec>. Logos are fetched only if you agree to /diagram icons." },
        { label: "AI", text: "Supplies roles, wording and confirmation of guessed edges, and looks at the result before calling it done. It never hand-writes SVG." },
      ],
      moreLabel: "Why a script draws it",
      more: [
        "Hand-drawn diagrams put arrows through text, drift from the code and cost tokens on every redraw. A script lays out and checks the same spec every time.",
        "Builds make no network calls. Brand logos are cached once with the icons word.",
      ],
    },
    {
      id: "figma-code",
      name: "Figma Code",
      hl: "group:skills-addons",
      line: "An exported Figma SVG turned into pixel-matched HTML and CSS by a script.",
      rows: [
        { label: "Does", text: "figma-code.cli.js reads the SVG, writes index.html and styles.css, renders both in headless Chrome or Edge and diffs them pixel for pixel. PASS means the page matches." },
        { label: "You", text: "Export the frame as SVG with Outline text unchecked, then type /figma-code build <path.svg>, adding --download-fonts to fetch Google Fonts. Give the path, never an attachment." },
        { label: "AI", text: "Runs the script and reports what the diff says. It does not draw or tune layout." },
      ],
      moreLabel: "Fonts and project-context",
      more: [
        "An SVG holds font names, not files. A missing font looks like a layout bug in the diff, so the script lists missing fonts and fetches them only with --download-fonts.",
        "With project-context, the SVG lives in project-context/design/ and each build records one row per frame in figma-code.md.",
      ],
    },
    {
      id: "teardown",
      name: "Teardown",
      hl: "group:skills-addons",
      line: "Interactive 3D simulators of any machine or model, built on Triforge.",
      rows: [
        { label: "Does", text: "teardown.cli.js detects the project, scaffolds one machine-agnostic page where any set of named parts gets isolate, a cutaway, a camera framed from the real bounds and a tour stop, then checks, builds an offline page, and renders review sheets in headless Chrome." },
        { label: "You", text: "Describe the machine, or give a .glb or .gltf model. Run /teardown detect, init, check, build, sheet and probe. Starters: gears, crank or custom." },
        { label: "AI", text: "Supplies the real dimensions, the reference and the machine's geometry, and reads the sheet before calling it done. Any probe FAIL is a bug in the page." },
      ],
      moreLabel: "Film and sound",
      more: [
        "teardown-film records the tour to an H.264 MP4 by stepping the page's pure render(t) in headless Chrome and encoding with ffmpeg.",
        "teardown-sound writes a reproducible score WAV from the tour's timeline, mastered to -14 LUFS with the peak at or below -2 dBFS. Neither is part of a default install, and both need teardown.",
      ],
    },
  ],
  finder: [
    { situation: "You want replies worded for your skill level", item: "personality", hl: "name:personality" },
    { situation: "You want replies read aloud", item: "narrate", hl: "name:narrate" },
    { situation: "The project comes with requirements, brand and Figma notes", item: "project-context", hl: "name:project-context" },
    { situation: "You want fewer file reads before work starts", item: "system1-prefilter", hl: "name:system1-prefilter" },
    { situation: "You want an architecture or structure diagram for a README", item: "diagram", hl: "group:skills-addons" },
    { situation: "You want an interactive 3D cutaway of a machine or model", item: "teardown", hl: "group:skills-addons" },
  ],
};
