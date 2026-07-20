"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav className="app-shell-nav">
      <Link href="/" className={pathname === "/" ? "active" : undefined}>
        Übersicht
      </Link>
      <Link href="/admin" className={pathname === "/admin" ? "active" : undefined}>
        Konzert hinzufügen
      </Link>
    </nav>
  );
}
