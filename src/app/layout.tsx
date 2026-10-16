import type { Metadata, Viewport } from "next";
import Image from "next/image";
import Link from "next/link";
import { connection } from "next/server";
import { BottomNav } from "@/components/BottomNav";
import { ensureDbInitialized } from "@/lib/init-db";
import "./globals.css";

export const metadata: Metadata = {
  title: "Meine Konzerte",
  applicationName: "Meine Konzerte",
  description: "Meine Konzerte — Setlists, Videos & Spotify",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Meine Konzerte",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icons/meine-konzerte-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/meine-konzerte-512.png", sizes: "512x512", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = { themeColor: "#08090c" };

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
              <Image className="app-logo" src="/icons/meine-konzerte-192.png" alt="" width={48} height={48} />
              <span>Meine Konzerte</span>
            </Link>
          </h1>
          <p>Setlists, Videos & Spotify</p>
        </header>
        {children}
        <BottomNav />
        <footer>Meine Konzerte · Multi-User</footer>
      </body>
    </html>
  );
}
