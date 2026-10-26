/**
 * Generated artwork for the fictional catalogue: posters, backdrops and avatars as
 * dependency-free SVG, so the demo needs no image files and no network. The Aerie
 * artwork proxy passes the content type through, and an <img> renders SVG, so
 * nothing downstream needs a raster image.
 */
import { CATALOG, titleById, userById } from "./catalog.mjs";

const escapeXml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** Greedy word wrap on a character budget; the last line is clipped if it still overflows. */
function wrap(text, maxChars, maxLines) {
  const lines = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    if (line && `${line} ${word}`.length > maxChars) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, maxLines);
}

const SIZES = { poster: [300, 450], backdrop: [960, 540], avatar: [96, 96] };

/** An SVG for one catalogue entry. `kind`: poster (2:3), backdrop (16:9) or avatar (square). */
export function posterSvg({ title, year, palette, kind = "poster" }) {
  const [w, h] = SIZES[kind] ?? SIZES.poster;
  const [a, b] = palette;
  if (kind === "avatar") {
    const initial = escapeXml(title.trim().charAt(0).toUpperCase() || "?");
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${a}"/><text x="50%" y="50%" dy=".35em" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="48" fill="#fff">${initial}</text></svg>`;
  }
  const fontSize = kind === "poster" ? 30 : 54;
  const lines = wrap(title, kind === "poster" ? 14 : 26, 4);
  const lineHeight = fontSize * 1.15;
  const baseY = kind === "poster" ? h - 70 - (lines.length - 1) * lineHeight : h - 90 - (lines.length - 1) * lineHeight;
  const tspans = lines
    .map((l, i) => `<tspan x="${kind === "poster" ? 24 : 56}" y="${baseY + i * lineHeight}">${escapeXml(l)}</tspan>`)
    .join("");
  const yearY = kind === "poster" ? h - 34 : h - 48;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>
<linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset=".45" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".62"/></linearGradient></defs>
<rect width="${w}" height="${h}" fill="url(#g)"/>
<circle cx="${w * 0.72}" cy="${h * 0.3}" r="${h * 0.22}" fill="#fff" fill-opacity=".14"/>
<circle cx="${w * 0.3}" cy="${h * 0.18}" r="${h * 0.09}" fill="#fff" fill-opacity=".1"/>
<rect width="${w}" height="${h}" fill="url(#s)"/>
<text font-family="sans-serif" font-weight="700" font-size="${fontSize}" fill="#fff">${tspans}</text>
<text x="${kind === "poster" ? 24 : 56}" y="${yearY}" font-family="sans-serif" font-size="${kind === "poster" ? 15 : 24}" fill="#fff" fill-opacity=".78">${escapeXml(year)}</text>
</svg>`;
}

const svg = (body) => ({ contentType: "image/svg+xml", body });

/** Artwork for a title id, as `{ contentType, body }`. Unknown ids get a neutral grey card. */
export function posterForTitle(tmdbId, kind = "poster") {
  const t = titleById(tmdbId);
  return svg(posterSvg({ title: t?.title ?? "Untitled", year: t?.year ?? "", palette: t?.palette ?? ["#546e7a", "#263238"], kind }));
}

/** Artwork for a user id (a round-ish tinted initial). */
export function avatarForUser(userId) {
  const u = userById(userId);
  return svg(posterSvg({ title: u?.name ?? "?", year: "", palette: [u?.color ?? "#546e7a", "#263238"], kind: "avatar" }));
}

/**
 * Artwork for an Overseerr/*arr poster ref such as "/demo-9101.jpg" (also matches
 * "/MediaCover/9101/poster.jpg" and "/library/metadata/9101/thumb/1"). Falls back to the first
 * catalogue entry's palette when the ref carries no known id.
 */
export function posterForRef(ref, kind = "poster") {
  const id = /(\d{4})/.exec(String(ref))?.[1];
  return id ? posterForTitle(id, kind) : svg(posterSvg({ title: CATALOG[0].title, year: "", palette: CATALOG[0].palette, kind }));
}

/** A neutral rounded tile with the slug's initial; stands in for a dashboard-icons CDN logo. */
export function iconTile(slug) {
  const initial = escapeXml(String(slug).trim().charAt(0).toUpperCase() || "?");
  const hue = [...String(slug)].reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) % 360, 7);
  return svg(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64"><rect width="64" height="64" rx="14" fill="hsl(${hue} 38% 42%)"/><text x="50%" y="50%" dy=".35em" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="32" fill="#fff">${initial}</text></svg>`,
  );
}
