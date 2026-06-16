import { ImageResponse } from "next/og";
import { MARK_SVG } from "./_brand-mark";

// iOS home-screen icon. Geometry comes from ./_brand-mark (shared with the
// favicon and the PWA icon routes).
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%" }}>
        { }
        <img
          width={180}
          height={180}
          alt="AERIE"
          src={`data:image/svg+xml;utf8,${encodeURIComponent(MARK_SVG)}`}
        />
      </div>
    ),
    { ...size },
  );
}
