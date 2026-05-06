import type { Metadata } from "next";
import { Suspense } from "react";
import { HomeClient } from "../home/HomeClient";
import {
  getArtSlugFromPageSearchParams,
  parseHomeFiltersFromPageSearchParams,
  type HomeFiltersFromUrl,
} from "../home/home-filter-url";
import { env } from "@/lib/env";
import { getArtworks } from "@/lib/sheet";

export const metadata: Metadata = {
  title: { absolute: "Waco Public Art Map (Embed)" },
  robots: { index: false, follow: true },
  alternates: { canonical: "/" },
};

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function EmbedMapPage({ searchParams }: Props) {
  const mapboxStyleUrl = env.NEXT_PUBLIC_MAPBOX_STYLE_URL();
  const sp = await searchParams;
  const parsed = parseHomeFiltersFromPageSearchParams(sp);

  // Embeds should always mount in fullscreen map mode.
  const initialFiltersFromUrl: HomeFiltersFromUrl = { ...parsed, fullscreen: true };
  const initialArtSlug = getArtSlugFromPageSearchParams(sp);

  const artworks = await getArtworks();
  const submitEnabled = false;

  return (
    <Suspense fallback={null}>
      <HomeClient
        artworks={artworks}
        mapboxStyleUrl={mapboxStyleUrl}
        submitEnabled={submitEnabled}
        initialFiltersFromUrl={initialFiltersFromUrl}
        initialArtSlug={initialArtSlug}
        embedSelectFirstWhenNone
      />
    </Suspense>
  );
}

