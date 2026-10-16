import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Meine Konzerte",
    short_name: "Meine Konzerte",
    description: "Deine Konzerte mit Setlists, Videos und Erinnerungen.",
    lang: "de",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#08090c",
    theme_color: "#08090c",
    icons: [
      { src: "/icons/meine-konzerte-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/meine-konzerte-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
