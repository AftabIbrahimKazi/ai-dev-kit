import { Menu } from "lucide-react";
import Link from "next/link";
import GithubIcon from "./github-icon";
import HeaderAutoHide from "./header-auto-hide";
import SoundToggle from "./sound-toggle";
import ThemeToggle from "./theme-toggle";
import NavLink from "./nav-link";
import { HEADER_NAV_LINKS, NAV_DRAWER_ID, REPO_URL, SITE_NAV_LINKS } from "./site-nav";

export default function SiteHeader() {
  return (
    <>
      <HeaderAutoHide />
      <header data-visibility="shown" className="rk-header w-100 max-w-[var(--size-container)] ms-auto me-auto p-[var(--space-xs)_var(--size-gutter)_0] sticky-top">
        <nav
          aria-label="Main"
          className="rk-glass align-items-center d-flex justify-content-between min-h-[var(--size-header)] p-[var(--space-xs)_var(--space-md)] rounded-[var(--radius-full)]"
        >
          <Link href="/" className="navbar-brand fs-[var(--font-size-lg)] fw-[var(--font-weight-black)]">
            AI Dev Kit
          </Link>
          <ul className="navbar-nav d-none d-lg-flex flex-row col-gap-[var(--space-md)] list-unstyled">
            {HEADER_NAV_LINKS.map((link) => (
              <li key={link.label}>
                <NavLink href={link.href} className="nav-link rk-nav-link fs-[var(--font-size-sm)]">
                  {link.label}
                </NavLink>
              </li>
            ))}
          </ul>
          <div className="align-items-center col-gap-[var(--space-xs)] d-flex">
            <SoundToggle />
            <ThemeToggle />
            <a
              href={REPO_URL}
              className="btn btn-primary rk-lamp rk-control rk-desktop-only fs-[var(--font-size-sm)] rounded-[var(--radius-pill)]"
            >
              <GithubIcon />
              GitHub
            </a>
            <button
              type="button"
              className="navbar-toggler rk-control rk-mobile-only fs-[var(--font-size-sm)] rounded-[var(--radius-pill)]"
              aria-label="Menu"
              data-st-toggle="offcanvas"
              data-st-target={`#${NAV_DRAWER_ID}`}
              aria-controls={NAV_DRAWER_ID}
            >
              <Menu size={18} strokeWidth={2.25} />
            </button>
          </div>
        </nav>
      </header>
      <div
        id={NAV_DRAWER_ID}
        className="offcanvas rk-glass"
        data-st-side="right"
        aria-hidden="true"
        aria-modal="false"
        aria-label="Site menu"
      >
        <div className="offcanvas-header">
          <span className="offcanvas-title fs-[var(--font-size-lg)] fw-[var(--font-weight-black)]">AI Dev Kit</span>
          <button type="button" data-st-dismiss="offcanvas" className="btn-close" aria-label="Close menu" />
        </div>
        <div className="offcanvas-body">
          <ul className="navbar-nav list-unstyled row-gap-[var(--space-xs)]">
            {SITE_NAV_LINKS.map((link) => (
              <li key={link.label}>
                <NavLink href={link.href} className="nav-link rk-nav-link fs-[var(--font-size-md)]" dismiss>
                  {link.label}
                </NavLink>
              </li>
            ))}
          </ul>
          <a
            href={REPO_URL}
            className="btn btn-primary rk-lamp d-inline-block mt-[var(--space-md)] rounded-[var(--radius-pill)]"
          >
            <GithubIcon />
            GitHub
          </a>
        </div>
      </div>
    </>
  );
}
