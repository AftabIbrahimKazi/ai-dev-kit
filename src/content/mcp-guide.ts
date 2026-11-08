import type { ModuleGuide } from "@/types/module-guide";

export const MCP_GUIDE: ModuleGuide = {
  slug: "mcp",
  title: "MCP servers",
  line: "Optional tool servers, set up through one manager.",
  intro: [
    {
      id: "optional",
      kicker: "Chapter 1",
      title: "Never in a default install",
      line: "Say \"set up MCP servers\" after installing, and the manager asks what you want.",
      moreLabel: "Why they are opt-in",
      more: [
        "Every server adds an external dependency, often a key, and its tool schemas cost tokens.",
        "A missing or failing server falls back to the normal flow. It never blocks a task.",
        "Free here means a local model or a free tier. Hosted services have limits or need billing.",
      ],
    },
    {
      id: "manager",
      kicker: "Chapter 2",
      title: "One manager, one set of rules",
      line: "Each server is a data file. The shared rules live in the mcp-manager skill.",
      moreLabel: "The setup interview",
      more: [
        "The manager asks one question at a time and skips any you already answered: which servers, which AI tools, which scope, which keys, and how to route between a server and the normal flow.",
        "The routing rule is MCP first, then fallback. A server file lists what it replaces and when it is used first.",
      ],
    },
  ],
  itemsKicker: "Server",
  items: [
    {
      id: "image-gen",
      name: "image-gen",
      hl: "name:mcp-manager.image-gen",
      line: "Generates images for sites and apps.",
      rows: [
        { label: "Does", act: "does", text: "Image generation for websites and apps. It also has enhance_image, which grades, levels and sharpens an existing photo with ImageMagick and no AI, and ai_edit_image for small AI edits." },
        { label: "You", act: "you", text: "Set at least one set of keys: GEMINI_API_KEY (needs billing), or CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN, which have a free allowance of about 173 images a day." },
        { label: "AI", act: "ai", text: "Tries Gemini, then Cloudflare FLUX.1 schnell, then a labelled placeholder. It tells you about every switch and pause." },
      ],
    },
    {
      id: "local-vision",
      name: "local-vision",
      hl: "name:mcp-manager.local-vision",
      line: "Reads images offline for models that cannot see them.",
      rows: [
        { label: "Does", act: "does", text: "Free offline image reading with Qwen3-VL through llama.cpp, as a stdio tool. It gives models without vision a way to read screenshots, diagrams and photos." },
        { label: "You", act: "you", text: "Run node local-vision.js setup. It downloads about 1.6 GB for the 2B model, or about 3 GB for 4B on GPUs with 6 GB or more. A GPU is optional." },
        { label: "AI", act: "ai", text: "Used first when the model lacks vision, and only on request for Claude, which already reads images. Without it, the image is skipped or you are asked to describe it." },
      ],
    },
    {
      id: "stitch",
      name: "stitch",
      hl: "name:mcp-manager.stitch",
      line: "UI prototyping with Google Stitch.",
      rows: [
        { label: "Does", act: "does", text: "AI UI design generation, with screens, variants and design systems, for rapid prototyping before code." },
        { label: "You", act: "you", text: "A remote HTTP server. Put an API key from stitch.withgoogle.com/settings in STITCH_API_KEY. It is free for now with usage limits, and that may change." },
        { label: "AI", act: "ai", text: "Tried first for new mockups and layout exploration. The fallback is a Claude artifact or a plain HTML prototype." },
      ],
    },
    {
      id: "prefilter",
      name: "prefilter",
      hl: "name:system1-prefilter",
      line: "Ranks candidate files before the agent reads them.",
      rows: [
        { label: "Does", act: "does", text: "Exposes the System-1 prefilter add-on as a tool, so the agent can rank candidates before it opens them." },
        { label: "You", act: "you", text: "Local and free with the Laya model. It starts on first use and is set up through the add-on's own setup." },
        { label: "AI", act: "ai", text: "If it is not configured, the agent skips prefiltering and does the task the normal way." },
      ],
    },
  ],
  finder: [
    { situation: "You need images for a site or app", item: "image-gen", hl: "name:mcp-manager.image-gen" },
    { situation: "The model cannot see images", item: "local-vision", hl: "name:mcp-manager.local-vision" },
    { situation: "You want UI mockups before any code", item: "stitch", hl: "name:mcp-manager.stitch" },
    { situation: "You want fewer file reads before work starts", item: "prefilter", hl: "name:system1-prefilter" },
  ],
};
