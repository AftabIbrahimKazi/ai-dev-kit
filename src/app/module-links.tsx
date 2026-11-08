import Link from "next/link";
import type { KitModule } from "@/content/modules";
import { ICONS, MODULE_ICONS } from "@/stage/icon-registry";

interface ModuleLinksProps {
  modules: readonly KitModule[];
  intro: string;
}

export default function ModuleLinks({ modules, intro }: ModuleLinksProps) {
  return (
    <>
      <p className="rk-short-hide fs-[var(--font-size-sm)] max-w-[var(--measure-text)] mb-[min(var(--space-sm),1.5dvh)] text-[var(--color-text-muted)]">
        {intro}
      </p>
      <ul className="rk-module-grid d-grid list-unstyled mb-0">
        {modules.map((kitModule) => {
          const ModuleIcon = ICONS[MODULE_ICONS[kitModule.slug] ?? "sparkles"];
          return (
          <li key={kitModule.slug}>
            <Link
              id={`rk-module-${kitModule.slug}-ts`}
              href={`/docs/${kitModule.slug}`}
              className="rk-module-ts rk-glass rk-link align-items-center col-gap-[var(--space-md)_var(--space-md)] d-flex justify-content-between p-[min(var(--space-xs),1dvh)_var(--space-md)] rounded-[var(--radius-pill)]"
            >
              <span className="align-items-center col-gap-[var(--space-sm)] d-flex">
                <ModuleIcon className="text-[var(--color-accent)] flex-shrink-0" size={22} strokeWidth={2.25} />
                <span className="rk-snug fs-[max(var(--font-size-xs),min(var(--font-size-md),2.8dvh))] fw-[var(--font-weight-bold)]">{kitModule.name}</span>
              </span>
            </Link>
          </li>
          );
        })}
      </ul>
    </>
  );
}
