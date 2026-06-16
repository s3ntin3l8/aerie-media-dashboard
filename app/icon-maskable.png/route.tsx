import { ImageResponse } from "next/og";
import { MASKABLE_SVG } from "../_brand-mark";

// PWA maskable icon: square full-bleed background with the mark inside the
// safe zone, so the OS can crop it to any shape. Referenced by the web app
// manifest (app/manifest.ts) with purpose: "maskable".
export const dynamic = "force-static";
const SIZE = 512;

export function GET() {
  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%" }}>
        <img
          width={SIZE}
          height={SIZE}
          alt="AERIE"
          src={`data:image/svg+xml;utf8,${encodeURIComponent(MASKABLE_SVG)}`}
        />
      </div>
    ),
    { width: SIZE, height: SIZE },
  );
}
