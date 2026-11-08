import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { KIT_MODULES, findModule } from "@/content/modules";
import { MODULE_STORIES } from "@/content/module-stories";
import { SITE_NAME } from "@/content/site-meta";
import ModuleStory from "../_story/module-story";

export function generateStaticParams(): { module: string }[] {
  return KIT_MODULES.map((kitModule) => ({ module: kitModule.slug }));
}

export async function generateMetadata({ params }: PageProps<"/docs/[module]">): Promise<Metadata> {
  const { module: slug } = await params;
  const kitModule = findModule(slug);
  if (!kitModule) return {};
  return {
    title: `${kitModule.name} — AI Dev Kit docs`,
    description: kitModule.metaDescription,
    alternates: { canonical: `/docs/${kitModule.slug}` },
    openGraph: {
      title: `${kitModule.name} — AI Dev Kit docs`,
      description: kitModule.metaDescription,
      type: "website",
      siteName: SITE_NAME,
    },
  };
}

export default function ModulePage({ params }: PageProps<"/docs/[module]">) {
  return (
    <Suspense fallback={null}>
      <ModuleBody params={params} />
    </Suspense>
  );
}

async function ModuleBody({ params }: Pick<PageProps<"/docs/[module]">, "params">) {
  const { module: slug } = await params;
  const kitModule = findModule(slug);
  if (!kitModule) notFound();
  const story = MODULE_STORIES[kitModule.slug];
  if (story) return <ModuleStory guide={story.guide} scene={story.scene} motion={story.motion} />;

  return (
    <article className="max-w-[var(--size-container)] ms-auto me-auto p-[0_var(--size-gutter)]">
      <nav aria-label="Breadcrumb" className="fs-[var(--font-size-sm)] mb-[var(--space-sm)] text-[var(--color-text-muted)]">
        <Link href="/docs" className="rk-link">
          Docs
        </Link>
      </nav>
      <h1 className="fs-[var(--font-size-xxl)] fw-[var(--font-weight-black)] max-w-[20ch]">{kitModule.name}</h1>
      <p className="max-w-[var(--measure-text)] mt-[var(--space-sm)] text-[var(--color-text-muted)]">{kitModule.summary}</p>
      <h2 className="fs-[var(--font-size-lg)] fw-[var(--font-weight-bold)] mt-[var(--space-lg)]">In this module</h2>
      <ul className="d-flex flex-wrap col-gap-[var(--space-sm)] list-unstyled mt-[var(--space-sm)] row-gap-[var(--space-xs)]">
        {kitModule.parts.map((part) => (
          <li key={part} className="rk-chip fs-[var(--font-size-sm)]">
            {part}
          </li>
        ))}
      </ul>
      <h2 className="fs-[var(--font-size-lg)] fw-[var(--font-weight-bold)] mt-[var(--space-lg)]">Details</h2>
      <p className="max-w-[var(--measure-text)] mt-[var(--space-sm)] text-[var(--color-text-muted)]">
        In-depth documentation for this module is not written yet.
      </p>
    </article>
  );
}
