import type { Artwork } from "@/lib/sheet";

export const WACO_MURALS_PAGE_PATH = "/waco-murals";

export const WACO_MURALS_DISPLAY_NAME = "Waco Murals";

/** Primary SEO title — keyword-first, matches collection page pattern. */
export const WACO_MURALS_DOCUMENT_TITLE = "Waco Murals - Waco Public Art Map";

/** Meta / Open Graph description (~155 chars, keyword-rich). */
export const WACO_MURALS_META_DESCRIPTION =
  "Explore Waco murals on an interactive map. Discover street art, building murals, and community artwork across downtown Waco and beyond — with photos, artists, and locations.";

/** Visible H1 + footer copy on the map page. */
export const WACO_MURALS_INTRO =
  "Browse Waco murals on an interactive map — from downtown street art and building wraps to neighborhood community pieces. Each pin links to photos, artists, and location details across the city.";

export function isMuralsCategory(artwork: Artwork): boolean {
  return artwork.category?.trim().toLowerCase() === "murals";
}

export function getWacoMurals(artworks: Artwork[]): Artwork[] {
  return artworks.filter(isMuralsCategory).sort((a, b) => a.title.localeCompare(b.title));
}

/** Map + artwork detail back-links (`cat=murals`). */
export function wacoMuralsMapQueryString(): string {
  return "cat=murals";
}
