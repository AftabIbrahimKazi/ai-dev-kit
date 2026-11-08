"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

interface NavLinkProps {
  href: string;
  className: string;
  children: ReactNode;
  dismiss?: boolean;
}

const CURRENT = "page" as const;
const DISMISS_VALUE = "offcanvas" as const;

export default function NavLink({ href, className, children, dismiss = false }: NavLinkProps): React.JSX.Element {
  const pathname = usePathname();
  return (
    <Link href={href} className={className} aria-current={pathname === href ? CURRENT : undefined} data-st-dismiss={dismiss ? DISMISS_VALUE : undefined}>
      {children}
    </Link>
  );
}
