import Link from "next/link";
import type { ReactNode } from "react";

interface SectionProps {
  id: string;
  title: string;
  docsHref?: string;
  children: ReactNode;
}

export default function Section({ id, title, docsHref, children }: SectionProps) {
  const titleId = `${id}-title`;

  return (
    <section
      id={id}
      aria-labelledby={titleId}
      className="rk-section d-flex flex-column justify-content-center max-w-[var(--size-container)] min-h-[calc(100dvh_-_var(--size-chrome))] ms-auto me-auto p-[min(var(--space-md),1.5dvh)_var(--size-gutter)]"
    >
      <h2
        id={titleId}
        className="fs-[min(var(--font-size-xxl),7dvh,9vw)] fw-[var(--font-weight-black)] max-w-[20ch] mb-[min(var(--space-md),2dvh)]"
      >
        {title}
      </h2>
      {docsHref ? (
        <Link
          href={docsHref}
          className="rk-docs-link rk-link fs-[max(var(--font-size-xs),min(var(--font-size-sm),2.6dvh))] fw-[var(--font-weight-bold)] text-nowrap"
        >
          Read the docs
        </Link>
      ) : null}
      {children}
    </section>
  );
}
