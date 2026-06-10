import type { Artwork } from "@/lib/sheet";
import { slugify } from "@/lib/sheet";
import { getCollectionSummaries } from "@/lib/collection-summaries";

/** Sorted unique non-empty collection labels from the sheet. */
export function uniqueCollectionNames(artworks: Artwork[]): string[] {
  const set = new Set<string>();
  for (const a of artworks) {
    const t = a.collection?.trim();
    if (t) set.add(t);
  }
  return [...set].sort((x, y) => x.localeCompare(y));
}

/**
 * Stable URL slug per collection name. If two names slugify to the same base,
 * later names get numeric suffixes (`name-2`, `name-3`, …).
 */
export function buildCollectionSlugMaps(artworks: Artwork[]): {
  nameToSlug: Map<string, string>;
  slugToName: Map<string, string>;
} {
  const names = uniqueCollectionNames(artworks);
  const used = new Set<string>();
  const nameToSlug = new Map<string, string>();

  for (const name of names) {
    let base = slugify(name);
    if (!base) base = "collection";
    let candidate = base;
    let n = 2;
    while (used.has(candidate)) {
      candidate = `${base}-${n}`;
      n++;
    }
    used.add(candidate);
    nameToSlug.set(name, candidate);
  }

  const slugToName = new Map<string, string>();
  for (const [name, slug] of nameToSlug) {
    slugToName.set(slug, name);
  }
  return { nameToSlug, slugToName };
}

export function artworksInCollection(name: string, artworks: Artwork[]): Artwork[] {
  return artworks
    .filter((a) => a.collection?.trim() === name)
    .sort((a, b) => a.title.localeCompare(b.title));
}

export function centroidOfArtworks(items: Artwork[]): { lat: number; lng: number } | null {
  let lat = 0;
  let lng = 0;
  let n = 0;
  for (const a of items) {
    if (Number.isFinite(a.lat) && Number.isFinite(a.lng)) {
      lat += a.lat;
      lng += a.lng;
      n++;
    }
  }
  if (!n) return null;
  return { lat: lat / n, lng: lng / n };
}

/** Same token as `normalizeHomeFacetToken` in `home-filter-url` (for `coll` query). */
export function collectionFacetParam(name: string): string {
  return name.trim().toLowerCase().replace(/\+/g, " ");
}

/** Query string (no `?`) — pass through to artwork detail links so “map context” returns here. */
export function collectionArtDetailQueryString(collectionDisplayName: string): string {
  const p = new URLSearchParams();
  p.append("coll", collectionFacetParam(collectionDisplayName));
  return p.toString();
}

/** For map deep links / filters — same token as home `coll` query. */
export function collectionMapHref(name: string): string {
  const p = new URLSearchParams();
  p.append("coll", collectionFacetParam(name));
  return `/?${p.toString()}`;
}

export type CollectionIndexEntry = {
  name: string;
  count: number;
  slug: string;
  description?: string;
  imageUrl?: string;
  /** When set, cards link here instead of `/collections/[slug]`. */
  href?: string;
};

/** Index rows for `/collections` — includes stable slug for detail URLs. */
export function getCollectionIndexEntries(artworks: Artwork[]): CollectionIndexEntry[] {
  const summaries = getCollectionSummaries(artworks);
  const { nameToSlug } = buildCollectionSlugMaps(artworks);
  return summaries.map((s) => ({
    name: s.name,
    count: s.count,
    slug: nameToSlug.get(s.name)!,
  }));
}
