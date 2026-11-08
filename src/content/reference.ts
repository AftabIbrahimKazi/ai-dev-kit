import { CONTRIBUTE_URL, LICENSE_URL, REPO_URL } from "@/app/site-nav";

export interface ReferenceLink {
  id: string;
  label: string;
  note: string;
  href: string;
  source: string;
}

export const REFERENCE_LINKS: readonly ReferenceLink[] = [
  {
    id: "readme",
    label: "README",
    note: "The full guide to every skill, mod and command.",
    href: `${REPO_URL}#readme`,
    source: "repository root README.md",
  },
  {
    id: "license",
    label: "License",
    note: "MIT.",
    href: LICENSE_URL,
    source: "repository root LICENSE; README FAQ",
  },
  {
    id: "contributing",
    label: "Contributing",
    note: "How to send issues and pull requests.",
    href: `${REPO_URL}/blob/main/CONTRIBUTING.md`,
    source: "repository root CONTRIBUTING.md; README, contributing section",
  },
  {
    id: "changelog",
    label: "Changelog",
    note: "What changed in each version.",
    href: `${REPO_URL}/blob/main/CHANGELOG.md`,
    source: "repository root CHANGELOG.md",
  },
  {
    id: "issues",
    label: "Issues",
    note: "Report a problem or ask a question.",
    href: CONTRIBUTE_URL,
    source: "repository issues page; site-nav CONTRIBUTE_URL",
  },
];
