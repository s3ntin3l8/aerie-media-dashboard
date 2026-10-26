// iOS launch-screen (apple-touch-startup-image) variants. iOS picks a splash by an exact
// device-width/height/pixel-ratio/orientation media query, so there is one image per device
// class. Shared by the metadata in app/layout.tsx and the image route in
// app/pwa/splash/[size]/route.tsx so the two can't drift.
//
// The route segment is `<W>x<H>` in DEVICE pixels (CSS size × DPR), e.g. /pwa/splash/1290x2796.

type Device = { width: number; height: number; dpr: number; landscape: boolean };

// CSS-pixel portrait sizes. iPads also get a landscape variant; iPhones launch portrait-only.
const IPHONES: [number, number, number][] = [
  [440, 956, 3],
  [420, 912, 3],
  [402, 874, 3],
  [430, 932, 3],
  [393, 852, 3],
  [428, 926, 3],
  [390, 844, 3],
  [375, 812, 3],
  [414, 896, 3],
  [414, 896, 2],
  [375, 667, 2],
];
const IPADS: [number, number, number][] = [
  [1032, 1376, 2],
  [1024, 1366, 2],
  [834, 1210, 2],
  [834, 1194, 2],
  [820, 1180, 2],
  [810, 1080, 2],
  [744, 1133, 2],
];

const DEVICES: Device[] = [
  ...IPHONES.map(([width, height, dpr]) => ({ width, height, dpr, landscape: false })),
  ...IPADS.flatMap(([width, height, dpr]) => [
    { width, height, dpr, landscape: false },
    { width: height, height: width, dpr, landscape: true },
  ]),
];

export type SplashImage = {
  /** Image size in device pixels. */
  width: number;
  height: number;
  /** Route segment: `<W>x<H>` in device pixels. */
  size: string;
  url: string;
  media: string;
};

export const SPLASH_IMAGES: SplashImage[] = DEVICES.map(({ width, height, dpr, landscape }) => {
  const px = { width: width * dpr, height: height * dpr };
  const size = `${px.width}x${px.height}`;
  return {
    ...px,
    size,
    url: `/pwa/splash/${size}`,
    media:
      `(device-width: ${width}px) and (device-height: ${height}px) and ` +
      `(-webkit-device-pixel-ratio: ${dpr}) and (orientation: ${landscape ? "landscape" : "portrait"})`,
  };
});

/** Shape Next's `metadata.appleWebApp.startupImage` expects. */
export const APPLE_STARTUP_IMAGES = SPLASH_IMAGES.map(({ url, media }) => ({ url, media }));
