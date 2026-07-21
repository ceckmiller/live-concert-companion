import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { BottomNav } from "@/components/BottomNav";
import { ensureDbInitialized } from "@/lib/init-db";
import "./globals.css";

export const metadata: Metadata = {
  title: "Live Konzert Companion",
  description: "Meine Konzerte — Setlists, Videos & Spotify",
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
          <p>Meine Konzerte — Setlists, Videos & Spotify</p>
        </header>
        {children}
        <BottomNav />
        <footer>Live Konzert Companion · Multi-User</footer>
      </body>
    </html>
  );
}
