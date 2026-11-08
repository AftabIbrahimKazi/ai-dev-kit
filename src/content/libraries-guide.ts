import type { ModuleGuide } from "@/types/module-guide";

export const LIBRARIES_GUIDE: ModuleGuide = {
  slug: "libraries",
  title: "Libraries and stack",
  line: "Guides for the author's own libraries and for stack-specific work.",
  intro: [
    {
      id: "two-kinds",
      kicker: "Chapter 1",
      title: "Two kinds of guide",
      line: "Library guides for repos the author owns. Stack guides for technologies in general.",
      moreLabel: "Why the repo wins",
      more: [
        "The library guides cover the author's own Strata CSS and Triforge. Because the author owns them, a bug found while using one can be fixed at its source, and the repo always wins over what the guide says.",
        "Stack guides cover Astro, Shopify and Three.js. Their facts drift between releases, so each one tells the agent to trust the installed version over the guide when they disagree.",
      ],
    },
  ],
  itemsKicker: "Group",
  items: [
    {
      id: "libraries",
      name: "The author's libraries",
      hl: "group:skills-libraries",
      line: "Use them, debug them, fix them at source.",
      rows: [
        { label: "strata-css", hl: "name:strata-css", act: "does", text: "The Strata CSS framework: use its utilities, convert plain CSS to utilities safely, and debug. The npm package is strata-css, not strata. A coverage script answers whether a utility exists for a property, so nobody reads the registry by hand." },
        { label: "triforge", hl: "name:triforge", act: "does", text: "The @triforge Three.js node suite: package choice, APIs, debugging and fixes at source. Before relying on a node name or parameter, compare the installed version with the repo's." },
      ],
    },
    {
      id: "stack",
      name: "Stack guides",
      hl: "group:skills-stack",
      line: "Technology-specific discipline, loaded before the work.",
      rows: [
        { label: "astro-page", hl: "name:astro-page", act: "does", text: "Convention-driven Astro scaffolding for a page, component, overlay or entry script: discover the conventions, mirror sibling files, verify. New surface should look like existing surface." },
        { label: "shopify-toolkit-install", hl: "name:shopify-toolkit-install", act: "does", text: "Live-pulls Shopify's own AI toolkit skills into a project from github.com/Shopify/Shopify-AI-Toolkit. The kit never stores a copy, so the content stays Shopify's." },
        { label: "threejs-scene", hl: "name:threejs-scene", act: "does", text: "Three.js discipline: shaders, disposal, scroll-bound cameras and render hygiene. If a rule contradicts the installed three version, trust that version's notes and log the correction." },
      ],
    },
  ],
  finder: [
    { situation: "You are using or debugging Strata classes", item: "strata-css", hl: "name:strata-css" },
    { situation: "You are working on an @triforge package", item: "triforge", hl: "name:triforge" },
    { situation: "You are adding an Astro page or component", item: "astro-page", hl: "name:astro-page" },
    { situation: "You want Shopify's own skills in a project", item: "shopify-toolkit-install", hl: "name:shopify-toolkit-install" },
    { situation: "A Three.js scene shows a visual glitch", item: "threejs-scene", hl: "name:threejs-scene" },
  ],
};
