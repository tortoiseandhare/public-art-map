import type { Metadata } from "next";
import Link from "next/link";
import { getArtworks } from "@/lib/sheet";
import { artworksInCollection, getCollectionIndexEntries } from "@/lib/collection-routes";
import { getCollectionSeoMapByName } from "@/lib/airtable-collections";
import {
  WACO_MURALS_DISPLAY_NAME,
  WACO_MURALS_INTRO,
  WACO_MURALS_PAGE_PATH,
  getWacoMurals,
} from "@/lib/waco-murals";
import { SiteBrandBar } from "@/components/SiteBrandBar";
import shellStyles from "../art/art-detail-shell.module.css";
import { CollectionsClient } from "./CollectionsClient";
import dirStyles from "../art/art-directory.module.css";

export const metadata: Metadata = {
  title: "Collections",
  description:
    "Browse public art in Waco by collection — including Waco murals, Sculpture Zoo, utility box art, and more on full-screen map pages.",
  alternates: { canonical: "/collections" },
};

export default async function CollectionsPage() {
  const artworks = await getArtworks();
  const baseEntries = getCollectionIndexEntries(artworks);
  const seoByName = await getCollectionSeoMapByName(baseEntries.map((e) => e.name));
  const wacoMurals = getWacoMurals(artworks);
  const wacoMuralsHero = wacoMurals.find((a) => a.image || a.images?.[0]);
  const entries = [
    {
      name: WACO_MURALS_DISPLAY_NAME,
      count: wacoMurals.length,
      slug: "waco-murals",
      description: WACO_MURALS_INTRO,
      imageUrl: wacoMuralsHero?.image ?? wacoMuralsHero?.images?.[0],
      href: WACO_MURALS_PAGE_PATH,
    },
    ...baseEntries.map((entry) => {
      const inCollection = artworksInCollection(entry.name, artworks);
      const featuredArtwork = inCollection.find((a) => a.image || a.images?.[0]);
      const imageUrl = featuredArtwork?.image ?? featuredArtwork?.images?.[0];
      return {
        ...entry,
        description: seoByName.get(entry.name)?.description,
        imageUrl,
      };
    }),
  ];

  return (
    <div className={shellStyles.shell}>
      <div
        className={`${shellStyles.bg} ${shellStyles.bgFallback}`}
        aria-hidden
      />

      <SiteBrandBar titleAs="p" />

      <main className={shellStyles.panel}>
        <header className={shellStyles.backRow}>
          <Link href="/" className={shellStyles.backLink} transitionTypes={["nav-back"]}>
            ← Map
          </Link>
        </header>

        <div className={`${shellStyles.panelInner} ${shellStyles.panelInnerIndex}`}>
          <header className="mb-4 space-y-1">
            <h1 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
              Collections
            </h1>
          </header>

          {entries.length ? (
            <CollectionsClient entries={entries} />
          ) : (
            <section className={dirStyles.empty} aria-label="No collections">
              <p className={dirStyles.emptyTitle}>No collections are set yet.</p>
              <p className={dirStyles.emptySub}>
                When the sheet includes a value in the <strong>Collection</strong> column,
                groupings appear here. You can still browse all artworks in the directory.
              </p>
              <Link
                href="/art"
                className={`${dirStyles.emptyBtn} inline-block no-underline`}
                transitionTypes={["nav-forward"]}
              >
                Browse artworks
              </Link>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
