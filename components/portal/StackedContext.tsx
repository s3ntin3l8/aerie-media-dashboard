"use client";
// ============================================================
// AERIE — stacked (mobile) flag for dashboard widgets
// Provided by GridDashboard (which owns the 720px container
// breakpoint) and read by leaf panels via useStacked(), so any
// widget can tighten its layout on the single-column mobile stack
// without prop-threading. Default false ⇒ panels used elsewhere
// (Status/Services) and SSR render at desktop density.
// ============================================================
import { createContext, useContext } from "react";

/** True when a dashboard widget is rendering in the single-column stacked (mobile) layout. */
export const StackedContext = createContext(false);

export const useStacked = () => useContext(StackedContext);
