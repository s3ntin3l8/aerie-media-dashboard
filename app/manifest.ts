import type { MetadataRoute } from "next";

// PWA web app manifest. Next.js serves this at /manifest.webmanifest and
// auto-injects <link rel="manifest">. Colors are the locked dark-theme
// tokens from styles/colors_and_type.css (--background #0b1326).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AERIE — Media Command Center",
    short_name: "AERIE",
    description: "Private media portal — every service, one vantage point.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b1326",
    theme_color: "#0b1326",
    icons: [
      { src: "/icon.svg", type: "image/svg+xml", sizes: "any" },
      { src: "/icon-192.png", type: "image/png", sizes: "192x192", purpose: "any" },
      { src: "/icon-512.png", type: "image/png", sizes: "512x512", purpose: "any" },
      { src: "/icon-maskable.png", type: "image/png", sizes: "512x512", purpose: "maskable" },
    ],
  };
}
