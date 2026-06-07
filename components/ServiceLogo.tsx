"use client";

import React, { useState } from "react";
import type { Service } from "@/lib/types";
import { Icon, catColor } from "@/components/primitives";
import { DashboardIconImg } from "@/components/DashboardIconImg";

interface ServiceLogoProps {
  service: Pick<Service, "icon" | "cat" | "logoSlug">;
  size: number;
  radius?: number;
}

export function ServiceLogo({ service, size, radius }: ServiceLogoProps) {
  const [imgOk, setImgOk] = useState(true);
  const c = catColor(service.cat);
  const r = radius ?? Math.round(size * 0.25);
  const showLogo = Boolean(service.logoSlug) && imgOk;

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: r,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: showLogo
          ? "var(--surface-container)"
          : `color-mix(in srgb, ${c} 14%, transparent)`,
        overflow: "hidden",
        position: "relative",
      }}
    >
      {!showLogo && (
        <Icon name={service.icon} size={Math.round(size * 0.5)} color={c} />
      )}
      {service.logoSlug && (
        <DashboardIconImg
          slug={service.logoSlug}
          loading="lazy"
          onAllFailed={() => setImgOk(false)}
          style={{
            position: "absolute",
            inset: "15%",
            width: "70%",
            height: "70%",
            objectFit: "contain",
          }}
        />
      )}
    </div>
  );
}
