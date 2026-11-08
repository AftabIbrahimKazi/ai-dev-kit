"use client";

import { ArrowUpRight, ChevronRight, ChevronUp } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import FooterMascot from "./footer-mascot";
import GithubIcon from "./github-icon";
import NavLink from "./nav-link";
import ScrollTop from "./scroll-top";
import { FOOTER_BLURB, FOOTER_COLUMNS, FOOTER_LINKS, FOOTER_SUPPORT, REPO_URL } from "./site-nav";

const ESCAPE_KEY = "Escape" as const;

export default function SiteFooter() {
  const [isOpen, setIsOpen] = useState(false);
  const panelId = useId();
  const hookRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === ESCAPE_KEY) setIsOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen]);

  return (
    <footer className="rk-footer-bar">
      <div className="rk-glass rk-footer-shell" data-open={isOpen}>
        <ScrollTop />
        <FooterMascot isActive={!isOpen} hookRef={hookRef} />
        <button
          ref={hookRef}
          type="button"
          className="rk-footer-hook rk-glass"
          aria-label={isOpen ? "Collapse footer" : "Expand footer"}
          aria-expanded={isOpen}
          aria-controls={panelId}
          onClick={() => setIsOpen((open) => !open)}
        >
          <ChevronUp className="rk-footer-chevron" size={16} strokeWidth={2.5} aria-hidden="true" />
        </button>
        <div id={panelId} className="rk-footer-drawer" inert={!isOpen} onClick={(event) => event.target instanceof Element && event.target.closest("a") && setIsOpen(false)}>
          <div className="min-h-[0] overflow-hidden">
            <div className="rk-footer-grid p-[var(--space-md)_var(--space-md)_var(--space-sm)]">
              <div className="d-flex flex-column row-gap-[var(--space-sm)] align-items-start">
                <p className="rk-accent rk-footer-brand fs-[var(--font-size-xl)] fw-[var(--font-weight-black)]">AI Dev Kit</p>
                <p className="fs-[var(--font-size-sm)] max-w-[var(--measure-text)] text-[var(--color-text-muted)]">{FOOTER_BLURB}</p>
                <p className="fs-[var(--font-size-xs)] text-[var(--color-text-muted)]">{FOOTER_SUPPORT}</p>
              </div>
              {FOOTER_COLUMNS.map((column) => (
                <nav key={column.title} aria-label={column.title} className="d-flex flex-column row-gap-[var(--space-xxs)]">
                  <p className="rk-footer-title fs-[var(--font-size-xs)] fw-[var(--font-weight-bold)]">{column.title}</p>
                  {column.links.map((link) => (
                    <NavLink key={link.label} href={link.href} className="rk-footer-link fs-[var(--font-size-sm)]">
                      <ChevronRight className="rk-footer-icon" size={14} strokeWidth={2.5} aria-hidden="true" />
                      {link.label}
                    </NavLink>
                  ))}
                </nav>
              ))}
            </div>
          </div>
        </div>
        <div className="rk-footer-strip">
          <p className="rk-accent rk-footer-brand fs-[var(--font-size-md)] fw-[var(--font-weight-black)]">AI Dev Kit</p>
          <nav aria-label="Project" className="rk-footer-links">
            {FOOTER_LINKS.map((link) => (
              <a key={link.label} href={link.href} className="rk-footer-link fs-[var(--font-size-sm)]">
                <ArrowUpRight className="rk-footer-icon" size={14} strokeWidth={2.5} aria-hidden="true" />
                {link.label}
              </a>
            ))}
          </nav>
          <a href={REPO_URL} className="btn btn-primary rk-lamp rk-footer-github fs-[var(--font-size-sm)] rounded-[var(--radius-pill)]">
            <GithubIcon />
            GitHub
          </a>
        </div>
      </div>
    </footer>
  );
}
