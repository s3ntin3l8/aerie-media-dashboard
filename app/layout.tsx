import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";

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

export const metadata: Metadata = {
  title: "AERIE — Media Command Center",
  description: "Private media portal — every service, one vantage point.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Default theme is dark; a client effect keeps `.dark` in sync with the
  // user's theme preference once the portal mounts.
  return (
    <html lang="en" className={`dark ${jetbrainsMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
