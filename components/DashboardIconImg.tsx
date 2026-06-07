"use client";

import React, { useEffect, useState } from "react";

const CDN_BASE = "https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons";

// dashboard-icons doesn't ship every icon as SVG — some are PNG- or WEBP-only
// (e.g. lazylibrarian). We don't know an icon's format from its slug alone, so
// the <img> walks these formats in order, falling through on each 404/error.
const FORMATS = ["svg", "png", "webp"] as const;

export function dashboardIconUrl(slug: string, format: string = FORMATS[0]): string {
  return `${CDN_BASE}/${format}/${slug}.${format}`;
}

interface DashboardIconImgProps {
  slug: string;
  alt?: string;
  loading?: "lazy" | "eager";
  style?: React.CSSProperties;
  width?: number;
  height?: number;
  /** Called when every format has failed (so callers can show a fallback). */
  onAllFailed?: () => void;
}

export function DashboardIconImg({
  slug,
  alt,
  loading,
  style,
  width,
  height,
  onAllFailed,
}: DashboardIconImgProps) {
  const [fmtIdx, setFmtIdx] = useState(0);

  // Restart the format chain whenever the slug changes.
  useEffect(() => setFmtIdx(0), [slug]);

  if (fmtIdx >= FORMATS.length) return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={dashboardIconUrl(slug, FORMATS[fmtIdx])}
      alt={alt ?? slug}
      loading={loading}
      width={width}
      height={height}
      onError={() => {
        const next = fmtIdx + 1;
        setFmtIdx(next);
        if (next >= FORMATS.length) onAllFailed?.();
      }}
      style={style}
    />
  );
}
