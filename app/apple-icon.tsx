import { ImageResponse } from "next/og";

// iOS home-screen icon. Geometry mirrors components/brand/Brand.tsx.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

const MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 120 120">
  <circle cx="60" cy="60" r="60" fill="#0b1326"/>
  <g fill="none" stroke="#57f1db" stroke-width="7.5" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="16,86 50,40 70,66"/>
    <polyline points="58,74 80,50 100,80" stroke-opacity="0.55"/>
  </g>
  <circle cx="60" cy="60" r="59" fill="none" stroke="#57f1db" stroke-opacity="0.32" stroke-width="2"/>
</svg>`;

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
