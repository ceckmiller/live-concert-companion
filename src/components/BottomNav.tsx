"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/artists", label: "Künstler" },
  { href: "/", label: "Konzerte" },
  { href: "/songs", label: "Songs" },
  { href: "/profile", label: "Profil" },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  if (pathname === "/login" || pathname.startsWith("/auth/")) return null;

  return (
    <div className="bottom-nav" role="navigation" aria-label="Hauptnavigation">
      {TABS.map((tab) => {
        const active =
          tab.href === "/"
            ? pathname === "/" || pathname.startsWith("/concert") || pathname.startsWith("/admin")
            : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link key={tab.href} href={tab.href} className={active ? "active" : undefined}>
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
