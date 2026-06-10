import type { Metadata } from "next";
import { Suspense } from "react";
import { HomeClient } from "./home/HomeClient";
import {
  getArtSlugFromPageSearchParams,
  parseHomeFiltersFromPageSearchParams,
  type HomeFiltersFromUrl,
} from "./home/home-filter-url";
import { env } from "@/lib/env";
import { getArtworks } from "@/lib/sheet";
import {
  WACO_MURALS_DISPLAY_NAME,
  WACO_MURALS_META_DESCRIPTION,
  WACO_MURALS_PAGE_PATH,
  getWacoMurals,
} from "@/lib/waco-murals";
import styles from "./home/home.module.css";

export const metadata: Metadata = {
  alternates: {
    canonical: "/",
  },
};

type HomePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function Home({ searchParams }: HomePageProps) {
  const mapboxStyleUrl = env.NEXT_PUBLIC_MAPBOX_STYLE_URL();
  const sp = await searchParams;
  const initialFiltersFromUrl = parseHomeFiltersFromPageSearchParams(sp);
  const initialArtSlug = getArtSlugFromPageSearchParams(sp);
  return (
    <HomeServer
      mapboxStyleUrl={mapboxStyleUrl}
      initialFiltersFromUrl={initialFiltersFromUrl}
      initialArtSlug={initialArtSlug}
    />
  );
}

async function HomeServer({
  mapboxStyleUrl,
  initialFiltersFromUrl,
  initialArtSlug,
}: {
  mapboxStyleUrl: string;
  initialFiltersFromUrl: HomeFiltersFromUrl;
  initialArtSlug?: string;
}) {
  const artworks = await getArtworks();
  const murals = getWacoMurals(artworks);
  const submitEnabled = env.submitPublicArtEnabled();
  return (
    <>
      <Suspense fallback={null}>
        <HomeClient
          artworks={artworks}
          mapboxStyleUrl={mapboxStyleUrl}
          submitEnabled={submitEnabled}
          initialFiltersFromUrl={initialFiltersFromUrl}
          initialArtSlug={initialArtSlug}
        />
      </Suspense>
      <section className={styles.srOnly} aria-label="Artwork index">
        <h2>Public art in Waco</h2>
        <p>
          Browse artwork detail pages for Creative Waco&apos;s Public Art Map.
        </p>
        <h3>{WACO_MURALS_DISPLAY_NAME}</h3>
        <p>{WACO_MURALS_META_DESCRIPTION}</p>
        <p>
          <a href={WACO_MURALS_PAGE_PATH}>Browse all {WACO_MURALS_DISPLAY_NAME.toLowerCase()}</a>
        </p>
        <ul>
          {murals.map((a) => (
            <li key={a.slug}>
              <a href={`/art/${a.slug}`}>{a.title}</a>
            </li>
          ))}
        </ul>
        <ul>
          {artworks.slice(0, 250).map((a) => (
            <li key={a.slug}>
              <a href={`/art/${a.slug}`}>{a.title}</a>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
