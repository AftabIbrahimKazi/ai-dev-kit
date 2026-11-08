import type { ModuleGuide } from "@/types/module-guide";

export const CODING_STANDARDS_GUIDE: ModuleGuide = {
  slug: "coding-standards",
  title: "Coding standards",
  line: "Layered rules the agent reads before it edits a file.",
  intro: [
    {
      id: "layers",
      kicker: "Chapter 1",
      title: "Three layers, read top down",
      line: "Universal rules first, then the file's role, then the framework.",
      moreLabel: "What each layer holds",
      more: [
        "Layer 1 is the global law for a discipline and applies to every file of that type, for example RULE 14 in the CSS standard: no !important, anywhere. Fix the selector instead.",
        "Layer 2 is the file-type rules, one partial per role, for example RULE T-05 for token files: semantic colours reference the palette and are never hardcoded.",
        "Layer 3 is the framework layer. It extends a universal rule or overrides it with an explicit note, for example RULE SC-05 in the Strata CSS file: no !-prefixed variants.",
      ],
    },
    {
      id: "testable",
      kicker: "Chapter 2",
      title: "A rule you can check",
      line: "Rules are declarative and testable, with a wrong and a right example wherever one could be misread.",
      moreLabel: "Overrides and conflicts",
      more: [
        "A framework file that overrides a universal rule must say so: OVERRIDES [filename] RULE [number], then the reason. A rule that only adds detail needs no note.",
        "No rule may conflict with another at the same layer. Conflicts between layers use the override note.",
        "A project uses exactly one script standard: JavaScript only, TypeScript only, or both together. Each is standalone.",
      ],
    },
  ],
  itemsKicker: "Shelf",
  items: [
    {
      id: "files",
      name: "The files you write",
      hl: "group:standards",
      line: "CSS, HTML and scripts, each with partials per file role.",
      rows: [
        { label: "CSS · 23 rules", hl: "name:css-standards", act: "does", text: "Global CSS laws, with partials for token, layout, component, overlay and utility files." },
        { label: "HTML · 10 rules", hl: "name:html-standards", act: "does", text: "Global markup laws, with partials for layout templates, page files and component markup." },
        { label: "TypeScript · 16 rules", hl: "name:ts-standards", act: "does", text: "For projects that use TypeScript only. Partials cover entry scripts, classes, controllers, presets, utilities and type files." },
        { label: "JavaScript · 11 rules", hl: "name:js-standards", act: "does", text: "For projects that use JavaScript only. A third standard of 16 rules covers JS and TS used together." },
      ],
    },
    {
      id: "process",
      name: "How the work is tracked",
      hl: "group:standards",
      line: "Commits, branches and versions.",
      rows: [
        { label: "Git · 12 rules", hl: "name:git-standards", act: "does", text: "Commit, branch and pull request conventions." },
        { label: "Versioning · 9 rules", hl: "name:versioning-standards", act: "does", text: "Package and changelog versioning." },
      ],
    },
    {
      id: "reach",
      name: "Who can find and use it",
      hl: "group:standards",
      line: "Search, speed and access.",
      rows: [
        { label: "SEO · 12 rules", hl: "name:seo-standards", act: "does", text: "Titles, meta, structure and schema." },
        { label: "Performance · 15 rules", hl: "name:performance-standards", act: "does", text: "Assets, scripts, CSS and Core Web Vitals." },
        { label: "Accessibility · 24 rules", hl: "name:accessibility-standards", act: "does", text: "WCAG 2.2 AA, keyboard use, ARIA, contrast, focus not obscured, drag alternatives and 24 px targets." },
      ],
    },
    {
      id: "craft",
      name: "What to make and how to behave",
      hl: "group:standards",
      line: "Design taste and the AI's own conduct.",
      rows: [
        { label: "Design · 15 rules", hl: "name:design-standards", act: "does", text: "What to make: Floor, Reflex and Finish rules against generated-looking UI." },
        { label: "AI · 19 rules", hl: "name:ai-standards", act: "does", text: "AI behaviour: hallucination detection and token efficiency." },
      ],
    },
    {
      id: "qa",
      name: "Quality assurance",
      hl: "group:qa",
      line: "An umbrella of six concerns rather than one file.",
      rows: [
        { label: "Definition of done", act: "does", text: "What done means for any task, and the self-QA pass." },
        { label: "Branch gates", act: "does", text: "What must be true before work moves from dev to test to beta to main." },
        { label: "Logic and error checks", act: "does", text: "Code-path tracing, async errors, null checks and state coverage." },
        { label: "Security checks", act: "does", text: "XSS, secrets, eval, CSP, dependency risk and the rest of the OWASP-adjacent checks." },
        { label: "End-to-end testing", act: "does", text: "Playwright fixture and page-object discipline, when specs are written and how they stay current." },
        { label: "Bug reporting", act: "does", text: "The standard format and severity levels for anything the AI finds." },
      ],
    },
    {
      id: "frameworks",
      name: "Frameworks and tooling",
      hl: "group:frameworks",
      line: "Layer 3, plus the lint configs that enforce what can be checked.",
      rows: [
        { label: "Astro · 6 rules", hl: "name:astro", act: "does", text: "Astro-specific additions and overrides." },
        { label: "Bootstrap", hl: "name:bootstrap", act: "does", text: "Bootstrap conflicts, violations and workarounds." },
        { label: "Strata CSS · 11 rules", hl: "name:strata-css", act: "does", text: "Mandatory utility-first framework, with coverage discipline." },
        { label: "Tooling", act: "does", text: "Machine enforcement: lint configs for the rules that can be checked by a tool." },
      ],
    },
    {
      id: "ui-company",
      name: "UI elements and company rules",
      hl: "group:standards",
      line: "What the file-type rules do not cover, and rules a company brings itself.",
      rows: [
        { label: "UI standards", hl: "group:partials", act: "does", text: "A routing table plus 30 compact partials (button, fields, modal, table, header, sidebar, charts, theming, landing, mobile and more). They cover empty and error states, validation, pagination, upload and export security and sign-in. A UI edit reads at most two." },
        { label: "Company standards", act: "does", text: "A separate coding-standards/company/ folder for a company's own rules. install-kit.cli.js company sync scans it, writes a routing INDEX.md and a company-standards skill, and where a company rule and a kit default disagree, the company rule wins." },
        { label: "Project signature", act: "does", text: "One alias you choose at install, used in exactly three places: abc- classes and ids, data-abc- attributes and Abc shared components. Never applied to package or framework names." },
      ],
    },
  ],
  finder: [
    { situation: "You are writing or editing CSS", item: "css-standards", hl: "name:css-standards" },
    { situation: "You are about to write a commit message", item: "git-standards", hl: "name:git-standards" },
    { situation: "You are writing a page title and meta description", item: "seo-standards", hl: "name:seo-standards" },
    { situation: "You are checking keyboard use and contrast", item: "accessibility-standards", hl: "name:accessibility-standards" },
    { situation: "You are building a new UI from scratch", item: "design-standards", hl: "name:design-standards" },
  ],
};
