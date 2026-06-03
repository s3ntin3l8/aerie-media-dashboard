import type { Metadata, Viewport } from "next";
import { JetBrains_Mono } from "next/font/google";
import { env } from "@/lib/env";

// Design-system foundations (ported verbatim from the AERIE design bundle).
import "../styles/fonts.css";
import "../styles/colors_and_type.css";
import "../styles/components.css";
// App-shell base + --font-mono override (must load after colors_and_type.css).
import "./globals.css";

// Self-host JetBrains Mono; globals.css wires it into --font-mono.
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

// Critical for mobile: without this, browsers render at ~980px and every
// breakpoint is dead. mobile-web-app-capable gives the portal a native feel.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  // Required so the auto-discovered icon / opengraph-image / twitter-image
  // routes resolve to absolute URLs.
  metadataBase: new URL(env.portalUrl),
  title: "AERIE — Media Command Center",
  description: "Private media portal — every service, one vantage point.",
};

// Inline script that runs synchronously before first paint — reads the
// persisted theme from localStorage and applies/removes the `dark` class
// on <html> before any CSS or React hydration. This eliminates the flash
// that would occur if we relied on a useEffect in Login or PortalProvider.
// suppressHydrationWarning is needed because the server always emits `dark`
// but the script may switch it to light before React takes over.
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("aerie.theme");if(t==="light"){document.documentElement.classList.remove("dark")}else{document.documentElement.classList.add("dark")}}catch(e){}})()`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`dark ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <head>
        {/* Blocking theme script — must run before any paint */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
