import { ImageResponse } from "next/og";
import { MARK_SVG } from "../_brand-mark";

// PWA any-purpose icon (Android home screen / install). Referenced by the
// web app manifest (app/manifest.ts).
export const dynamic = "force-static";
const SIZE = 192;

export function GET() {
  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%" }}>
        <img
          width={SIZE}
          height={SIZE}
          alt="AERIE"
          src={`data:image/svg+xml;utf8,${encodeURIComponent(MARK_SVG)}`}
        />
      </div>
    ),
    { width: SIZE, height: SIZE },
  );
}
