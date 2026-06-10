import type { MetadataRoute } from "next";
import { env } from "@/lib/env";
import { buildCollectionSlugMaps } from "@/lib/collection-routes";
import { getArtworks } from "@/lib/sheet";
import { WACO_MURALS_PAGE_PATH } from "@/lib/waco-murals";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = env.NEXT_PUBLIC_SITE_URL();
  const artworks = await getArtworks();
  const { slugToName } = buildCollectionSlugMaps(artworks);
  const now = new Date();
  const submitEnabled = env.submitPublicArtEnabled();

  return [
    {
      url: new URL("/", baseUrl).toString(),
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 1,
    },
    {
      url: new URL("/collections", baseUrl).toString(),
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.85,
    },
    {
      url: new URL(WACO_MURALS_PAGE_PATH, baseUrl).toString(),
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.9,
    },
    ...[...slugToName.keys()].map((slug) => ({
      url: new URL(`/collections/${slug}`, baseUrl).toString(),
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.75,
    })),
    {
      url: new URL("/art", baseUrl).toString(),
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.9,
    },
    ...(submitEnabled
      ? [
          {
            url: new URL("/submit", baseUrl).toString(),
            lastModified: now,
            changeFrequency: "monthly" as const,
            priority: 0.6,
          },
        ]
      : []),
    ...artworks.map((a) => ({
      url: new URL(`/art/${a.slug}`, baseUrl).toString(),
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}

