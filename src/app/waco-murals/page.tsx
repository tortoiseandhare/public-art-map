import type { Metadata } from "next";
import { env } from "@/lib/env";
import { getArtworks } from "@/lib/sheet";
import { getArtSlugFromPageSearchParams } from "@/app/home/home-filter-url";
import { CollectionMapClient } from "@/app/collections/CollectionMapClient";
import {
  WACO_MURALS_DISPLAY_NAME,
  WACO_MURALS_DOCUMENT_TITLE,
  WACO_MURALS_INTRO,
  WACO_MURALS_META_DESCRIPTION,
  WACO_MURALS_PAGE_PATH,
  getWacoMurals,
  wacoMuralsMapQueryString,
} from "@/lib/waco-murals";
import homeStyles from "../home/home.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const artworks = await getArtworks();
  const murals = getWacoMurals(artworks);
  const hero = pickHero(murals);
  const siteUrl = env.NEXT_PUBLIC_SITE_URL();
  const url = new URL(WACO_MURALS_PAGE_PATH, siteUrl).toString();

  return {
    title: { absolute: WACO_MURALS_DOCUMENT_TITLE },
    description: WACO_MURALS_META_DESCRIPTION,
    alternates: { canonical: WACO_MURALS_PAGE_PATH },
    keywords: [
      "Waco murals",
      "Waco street art",
      "Waco public art",
      "downtown Waco murals",
      "Texas murals",
      "Creative Waco",
    ],
    openGraph: {
      type: "website",
      title: WACO_MURALS_DOCUMENT_TITLE,
      description: WACO_MURALS_META_DESCRIPTION,
      url,
      images: hero ? [{ url: hero }] : undefined,
    },
    twitter: {
      card: hero ? "summary_large_image" : "summary",
      title: WACO_MURALS_DOCUMENT_TITLE,
      description: WACO_MURALS_META_DESCRIPTION,
      images: hero ? [hero] : undefined,
    },
  };
}

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function pickHero(murals: ReturnType<typeof getWacoMurals>): string | null {
  for (const a of murals) {
    const url = a.image ?? a.images?.[0];
    if (url) return url;
  }
  return null;
}

export default async function WacoMuralsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const artworks = await getArtworks();
  const murals = getWacoMurals(artworks);
  const siteUrl = env.NEXT_PUBLIC_SITE_URL();
  const canonicalUrl = new URL(WACO_MURALS_PAGE_PATH, siteUrl).toString();

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": canonicalUrl,
        name: WACO_MURALS_DISPLAY_NAME,
        description: WACO_MURALS_META_DESCRIPTION,
        url: canonicalUrl,
        isPartOf: {
          "@type": "WebSite",
          name: "Waco Public Art Map",
          url: siteUrl,
        },
        about: {
          "@type": "Thing",
          name: "Murals in Waco, Texas",
        },
      },
      {
        "@type": "ItemList",
        name: WACO_MURALS_DISPLAY_NAME,
        numberOfItems: murals.length,
        itemListElement: murals.map((a, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: a.title,
          url: new URL(`/art/${a.slug}`, siteUrl).toString(),
        })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Public Art Map",
            item: siteUrl,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: WACO_MURALS_DISPLAY_NAME,
            item: canonicalUrl,
          },
        ],
      },
    ],
  };

  const mapboxStyleUrl = env.NEXT_PUBLIC_MAPBOX_STYLE_URL();
  const initialArtSlug = getArtSlugFromPageSearchParams(sp);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <CollectionMapClient
        collectionName={WACO_MURALS_DISPLAY_NAME}
        collectionDescription={WACO_MURALS_INTRO}
        artworks={murals}
        mapboxStyleUrl={mapboxStyleUrl}
        collectionQueryString={wacoMuralsMapQueryString()}
        initialArtSlug={initialArtSlug}
      />
      <section className={homeStyles.srOnly} aria-label="Waco murals index">
        <h2>{WACO_MURALS_DISPLAY_NAME}</h2>
        <p>{WACO_MURALS_META_DESCRIPTION}</p>
        <ul>
          {murals.map((a) => (
            <li key={a.slug}>
              <a href={`/art/${a.slug}`}>{a.title}</a>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
