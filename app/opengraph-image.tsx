import { ImageResponse } from "next/og";

// Social / OpenGraph share card. Geometry + colors mirror
// components/brand/Brand.tsx and app/icon.svg. Text uses @vercel/og's
// bundled default font (no network / font-load step at build time).
export const alt = "AERIE — Media Command Center";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const TILE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="148" height="148" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="8" fill="#0f1d33" stroke="#57f1db" stroke-opacity="0.35" stroke-width="0.6"/>
  <g transform="translate(16 16) scale(0.84) translate(-16 -16)" fill="none" stroke="#57f1db" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M 6 25 L 16 7 L 26 25"/>
    <path d="M 11 18.5 L 21 18.5"/>
  </g>
</svg>`;

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background:
            "radial-gradient(900px 600px at 50% 0%, #13233f 0%, #0b1326 60%)",
          color: "#e6f7fb",
        }}
      >
        { }
        <img
          width={148}
          height={148}
          alt=""
          src={`data:image/svg+xml;utf8,${encodeURIComponent(TILE_SVG)}`}
        />
        <div
          style={{
            marginTop: 40,
            fontSize: 108,
            fontWeight: 800,
            letterSpacing: 14,
            paddingLeft: 14,
          }}
        >
          AERIE
        </div>
        <div
          style={{
            marginTop: 14,
            fontSize: 34,
            color: "#57f1db",
            letterSpacing: 2,
          }}
        >
          Every service, one vantage point.
        </div>
        <div
          style={{
            marginTop: 18,
            fontSize: 22,
            color: "#7e93a8",
            letterSpacing: 1,
          }}
        >
          Private Media Command Center
        </div>
      </div>
    ),
    { ...size },
  );
}
