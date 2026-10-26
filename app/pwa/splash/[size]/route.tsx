import { ImageResponse } from "next/og";
import { MARK_SVG } from "../../../_brand-mark";
import { SPLASH_IMAGES } from "../../../_splash";

// iOS apple-touch-startup-image. One pre-rendered image per device size (see app/_splash.ts);
// the `[size]` segment is `<W>x<H>` in device pixels. Look mirrors app/opengraph-image.tsx.
// Rendered once at build time; any size not in the table 404s instead of rendering on demand.
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return SPLASH_IMAGES.map(({ size }) => ({ size }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params;
  const image = SPLASH_IMAGES.find((i) => i.size === size);
  if (!image) return new Response("Not found", { status: 404 });

  const { width, height } = image;
  const short = Math.min(width, height);
  const mark = Math.round(short * 0.28);

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
          background: `radial-gradient(${Math.round(short * 1.2)}px ${Math.round(short * 0.9)}px at 50% 0%, #13233f 0%, #0b1326 60%)`,
          color: "#e6f7fb",
        }}
      >
        { }
        <img
          width={mark}
          height={mark}
          alt=""
          src={`data:image/svg+xml;utf8,${encodeURIComponent(MARK_SVG)}`}
        />
        <div
          style={{
            marginTop: Math.round(mark * 0.28),
            fontSize: Math.round(mark * 0.3),
            fontWeight: 800,
            letterSpacing: Math.round(mark * 0.04),
            paddingLeft: Math.round(mark * 0.04),
          }}
        >
          AERIE
        </div>
      </div>
    ),
    { width, height },
  );
}
