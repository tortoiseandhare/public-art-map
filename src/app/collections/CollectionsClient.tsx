"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { type CollectionIndexEntry } from "@/lib/collection-routes";
import dirStyles from "../art/art-directory.module.css";
import nearbyStyles from "../art/nearby-art.module.css";
import styles from "./collections.module.css";

const SEARCH_ID = "collections-search";

function toNormalizedSearch(value: string): string {
  return value.trim().toLowerCase();
}

export function CollectionsClient({ entries }: { entries: CollectionIndexEntry[] }) {
  const [query, setQuery] = React.useState("");
  const normalizedQuery = React.useMemo(() => toNormalizedSearch(query), [query]);

  const filtered = React.useMemo(() => {
    if (!normalizedQuery) return entries;
    return entries.filter((e) => toNormalizedSearch(e.name).includes(normalizedQuery));
  }, [entries, normalizedQuery]);

  return (
    <>
      <div className={dirStyles.toolbar}>
        <div className={dirStyles.toolbarRow}>
          <div className={`${dirStyles.toolbarField} ${dirStyles.toolbarSearch}`}>
            <input
              id={SEARCH_ID}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter collections…"
              inputMode="search"
              autoComplete="off"
              className={dirStyles.toolbarInput}
            />
          </div>
          {query.trim() ? (
            <button
              type="button"
              className={dirStyles.resetBtn}
              onClick={() => setQuery("")}
            >
              Clear
            </button>
          ) : null}
        </div>
      </div>

      {filtered.length ? (
        <ul className={`${nearbyStyles.grid} ${styles.list}`} aria-label="Collections">
          {filtered.map((e) => (
            <li key={e.name} className="min-w-0">
              <div className={nearbyStyles.cardFlat}>
                <div className={styles.cardStack}>
                  <Link
                    href={e.href ?? `/collections/${e.slug}`}
                    className={styles.cardMain}
                    transitionTypes={["nav-forward"]}
                  >
                    <div className={styles.cardThumbWrap}>
                      {e.imageUrl ? (
                        <Image
                          src={e.imageUrl}
                          alt=""
                          fill
                          sizes="(min-width: 720px) 33vw, 50vw"
                          className={styles.cardThumb}
                        />
                      ) : (
                        <div className={styles.cardThumbFallback}>No photo</div>
                      )}
                    </div>
                    <p className={styles.cardTitle}>{e.name}</p>
                    {e.description ? <p className={styles.cardDescription}>{e.description}</p> : null}
                    <p className={styles.cardMeta}>
                      {e.count === 1
                        ? "1 artwork"
                        : `${e.count.toLocaleString()} artworks`}
                    </p>
                    <span className={styles.cardCta}>Open collection</span>
                  </Link>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <section aria-label="No results" className={dirStyles.empty}>
          <p className={dirStyles.emptyTitle}>No collections match your search.</p>
          <p className={dirStyles.emptySub}>Try a different term or clear the filter.</p>
          {query.trim() ? (
            <button type="button" className={dirStyles.emptyBtn} onClick={() => setQuery("")}>
              Clear search
            </button>
          ) : null}
        </section>
      )}
    </>
  );
}
