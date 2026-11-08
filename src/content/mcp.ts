export interface McpPort {
  id: string;
  name: string;
  does: string;
  cost: string;
  source: string;
}

export const MCP_INTRO = {
  text: 'Optional servers, never in a default install. After installing, say "set up MCP servers" and the manager asks what you want.',
  source: "README, mcp section",
} as const;

export const MCP_PORTS: readonly McpPort[] = [
  {
    id: "stitch",
    name: "stitch",
    does: "UI prototyping with Google Stitch.",
    cost: "Free for now.",
    source: "README, mcp table, stitch row",
  },
  {
    id: "local-vision",
    name: "local-vision",
    does: "Reads images offline for models that cannot see them.",
    cost: "Runs locally.",
    source: "README, mcp table, local-vision row",
  },
  {
    id: "image-gen",
    name: "image-gen",
    does: "Generates images for sites and apps.",
    cost: "Gemini needs billing. The Cloudflare fallback has a free allowance of about 173 images a day.",
    source: "README, mcp table, image-gen row",
  },
  {
    id: "prefilter",
    name: "prefilter",
    does: "Ranks candidate files before the agent reads them in full.",
    cost: "Local and free, using the Laya model.",
    source: "README, optional tools table, prefilter row",
  },
];

export const MCP_CAVEAT = {
  text: "Free here means a local model or a free tier. Hosted services have limits or need billing.",
  source: "README FAQ, is it free",
} as const;
