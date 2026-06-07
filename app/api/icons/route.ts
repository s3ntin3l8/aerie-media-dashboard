import { type NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface IconMeta {
  base: string;
  aliases: string[];
  categories: string[];
  colors?: { light?: string; dark?: string };
}

export interface IconResult {
  slug: string;
  name: string;
  categories: string[];
}

const CDN_BASE = "https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons";
const METADATA_URL = `${CDN_BASE}@main/metadata.json`;

let metaCache: Map<string, IconMeta> | null = null;
let metaCacheAt = 0;
const META_TTL = 60 * 60 * 1000;

async function getMetadata(): Promise<Map<string, IconMeta>> {
  if (metaCache && Date.now() - metaCacheAt < META_TTL) return metaCache;
  const res = await fetch(METADATA_URL, {
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`metadata fetch failed: ${res.status}`);
  const raw = (await res.json()) as Record<string, IconMeta>;
  metaCache = new Map(Object.entries(raw));
  metaCacheAt = Date.now();
  return metaCache;
}

function slugToName(slug: string): string {
  return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function score(slug: string, meta: IconMeta, q: string): number {
  if (slug === q) return 4;
  if (slug.startsWith(q)) return 3;
  if (slug.includes(q)) return 2;
  if (meta.aliases.some((a) => a.toLowerCase().includes(q))) return 1;
  if (meta.categories.some((cat) => cat.toLowerCase().includes(q))) return 0;
  return -1;
}

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().toLowerCase();
  if (!q) return NextResponse.json([]);

  try {
    const metadata = await getMetadata();
    const results: (IconResult & { _score: number })[] = [];

    for (const [slug, meta] of metadata) {
      const s = score(slug, meta, q);
      if (s >= 0) {
        results.push({
          slug,
          name: slugToName(slug),
          categories: meta.categories,
          _score: s,
        });
      }
    }

    results.sort((a, b) => b._score - a._score || a.slug.localeCompare(b.slug));

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const out: IconResult[] = results.slice(0, 30).map(({ _score, ...r }) => r);
    return NextResponse.json(out, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json([], { headers: { "Cache-Control": "no-store" } });
  }
}
