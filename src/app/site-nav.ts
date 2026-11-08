import { KIT_MODULES } from "@/content/modules";

export interface SiteLink {
  label: string;
  href: string;
}

export interface FooterColumn {
  title: string;
  links: readonly SiteLink[];
}

export const REPO_URL = "https://github.com/AftabIbrahimKazi/ai-dev-kit" as const;
export const LICENSE_URL = `${REPO_URL}/blob/main/LICENSE` as const;
export const CONTRIBUTE_URL = `${REPO_URL}/issues` as const;
export const README_URL = `${REPO_URL}#readme` as const;
export const DOCS_HREF = "/docs" as const;
export const NAV_DRAWER_ID = "rk-nav-drawer-js" as const;

const HEADER_MODULE_COUNT = 5 as const;
const FOOTER_SPLIT = 3 as const;

const DOCS_LINK: SiteLink = { label: "Docs", href: DOCS_HREF };
const MODULE_LINKS: readonly SiteLink[] = KIT_MODULES.map((kitModule) => ({
  label: kitModule.navLabel ?? kitModule.name,
  href: `${DOCS_HREF}/${kitModule.slug}`,
}));

export const SITE_NAV_LINKS: readonly SiteLink[] = [DOCS_LINK, ...MODULE_LINKS];
export const HEADER_NAV_LINKS: readonly SiteLink[] = [DOCS_LINK, ...MODULE_LINKS.slice(0, HEADER_MODULE_COUNT)];

export const FOOTER_COLUMNS: readonly FooterColumn[] = [
  { title: "Explore", links: [DOCS_LINK, ...MODULE_LINKS.slice(0, FOOTER_SPLIT)] },
  { title: "The kit", links: MODULE_LINKS.slice(FOOTER_SPLIT) },
];

export const FOOTER_BLURB = "A free, MIT-licensed toolkit of layered coding standards and on-demand skills for AI coding agents." as const;

export const FOOTER_LINKS: readonly SiteLink[] = [
  { label: "Readme", href: README_URL },
  { label: "License", href: LICENSE_URL },
  { label: "Contribute", href: CONTRIBUTE_URL },
  { label: "Repository", href: REPO_URL },
];

export const FOOTER_SUPPORT = "Built for Claude Code, OpenCode, Codex and any agent that reads markdown." as const;
