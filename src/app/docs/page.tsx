import type { Metadata } from "next";
import KitMap from "./_map/kit-map";
import ModuleCarousel from "./_map/module-carousel";
import { MODULES_INTRO } from "@/content/modules";
import { SITE_NAME } from "@/content/site-meta";

export const metadata: Metadata = {
  title: "Docs — AI Dev Kit modules",
  description: "Documentation for each part of the AI Dev Kit: skills, commands, mods, coding standards, MCP servers, add-ons and libraries.",
  alternates: { canonical: "/docs" },
  openGraph: {
    title: "Docs — AI Dev Kit modules",
    description: "Documentation for each part of the AI Dev Kit: skills, commands, mods, coding standards, MCP servers, add-ons and libraries.",
    type: "website",
    siteName: SITE_NAME,
  },
};

export default function DocsIndex() {
  return (
    <article className="max-w-[var(--size-container)] ms-auto me-auto p-[0_var(--size-gutter)]">
      <h1 className="fs-[var(--font-size-xxl)] fw-[var(--font-weight-black)] max-w-[20ch]">AI Dev Kit docs</h1>
      <p className="max-w-[var(--measure-text)] mt-[var(--space-sm)] text-[var(--color-text-muted)]">{MODULES_INTRO.text}</p>
      <div className="mt-[var(--space-lg)]">
        <KitMap />
      </div>
      <ModuleCarousel />
    </article>
  );
}
