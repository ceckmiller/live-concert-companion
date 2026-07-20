import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { AppNav } from "@/components/AppNav";
import { ensureDbInitialized } from "@/lib/init-db";
import "./globals.css";

export const metadata: Metadata = {
  title: "Live Konzert Companion",
  description: "Deine Konzerte — Setlists, Videos & Spotify",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await connection();
  await ensureDbInitialized();

  return (
    <html lang="de">
      <body>
        <header>
          <h1>
            <Link href="/" className="home-link">
              Live Konzert Companion
            </Link>
          </h1>
          <p>Deine Konzerte — Setlists, Videos & Spotify</p>
        </header>
        <AppNav />
        {children}
        <footer>Live Konzert Companion · Stand Juli 2026</footer>
      </body>
    </html>
  );
}
