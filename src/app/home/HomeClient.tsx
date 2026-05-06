"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ViewTransition } from "react";
import type { CSSProperties, TransitionEvent } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Artwork } from "@/lib/sheet";
import { filterArtworksByHomeUrlQuery } from "@/lib/home-filter-match";
import { markerColorForCategory } from "@/lib/category-colors";
import { BrandLogo } from "@/components/BrandLogo";
import { SiteBrandBar } from "@/components/SiteBrandBar";
import {
  type HomeFiltersFromUrl,
  homeMapQueryStringsEqual,
  parseHomeFiltersFromUrlSearchParams,
  serializeHomeFiltersToQueryString,
  serializeHomeMapQueryString,
  stripArtSlugFromQueryString,
} from "./home-filter-url";
import styles from "./home.module.css";
import embedStyles from "./embed-modal.module.css";

type Props = {
  artworks: Artwork[];
  mapboxStyleUrl?: string;
  submitEnabled: boolean;
  /** Parsed from `searchParams` on the server — matches first client paint when using filters in the URL. */
  initialFiltersFromUrl: HomeFiltersFromUrl;
  /** Optional `art` query param — selected artwork slug for shareable map links. */
  initialArtSlug?: string;
  /**
   * Embed map: when there is no `art=` and no share-link facet/year selection, select the first
   * catalog row so the iframe opens with a map preview immediately.
   */
  embedSelectFirstWhenNone?: boolean;
};

type FacetOption = { key: string; label: string };

const UNCATEGORIZED_KEY = "__uncategorized__";
const NO_COMMISSION_KEY = "__none__";
const NO_COLLECTION_KEY = "__none__";

const MapView = dynamic(
  () => import("@/components/MapView").then((m) => m.MapView),
  { ssr: false },
);

const EMPTY_SET = new Set<string>();

function categoryFacetKey(a: Artwork): string {
  const t = a.category?.trim();
  return t ? t.toLowerCase() : UNCATEGORIZED_KEY;
}

function commissionFacetKey(a: Artwork): string {
  const t = a.commission?.trim();
  return t ? t.toLowerCase() : NO_COMMISSION_KEY;
}

function collectionFacetKey(a: Artwork): string {
  const t = a.collection?.trim();
  return t ? t.toLowerCase() : NO_COLLECTION_KEY;
}

type YearParsed = {
  ymin: number | null;
  ymax: number | null;
  yminOk: boolean;
  ymaxOk: boolean;
  hasYearFilter: boolean;
};

function parseYearInputs(yearMin: string, yearMax: string): YearParsed {
  let ymin = yearMin.trim() === "" ? null : Number(yearMin);
  let ymax = yearMax.trim() === "" ? null : Number(yearMax);
  const yminOk = ymin !== null && !Number.isNaN(ymin);
  const ymaxOk = ymax !== null && !Number.isNaN(ymax);
  if (yminOk && ymaxOk && ymin! > ymax!) {
    const t = ymin;
    ymin = ymax;
    ymax = t;
  }
  const hasYearFilter = yminOk || ymaxOk;
  return { ymin, ymax, yminOk, ymaxOk, hasYearFilter };
}

function artworkMatchesYear(a: Artwork, y: YearParsed): boolean {
  if (!y.hasYearFilter) return true;
  if (a.year == null || !Number.isFinite(a.year)) return false;
  if (y.yminOk && a.year < y.ymin!) return false;
  if (y.ymaxOk && a.year > y.ymax!) return false;
  return true;
}

/** Which facet's own selections to ignore when listing options for that facet */
type OmitFacet = "category" | "commission" | "collection";

function artworkMatchesOtherFacetFilters(
  a: Artwork,
  selectedCategories: Set<string>,
  selectedCommissions: Set<string>,
  selectedCollections: Set<string>,
  omit: OmitFacet,
): boolean {
  if (
    omit !== "category" &&
    selectedCategories.size > 0 &&
    !selectedCategories.has(categoryFacetKey(a))
  ) {
    return false;
  }
  if (
    omit !== "commission" &&
    selectedCommissions.size > 0 &&
    !selectedCommissions.has(commissionFacetKey(a))
  ) {
    return false;
  }
  if (
    omit !== "collection" &&
    selectedCollections.size > 0 &&
    !selectedCollections.has(collectionFacetKey(a))
  ) {
    return false;
  }
  return true;
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

function pruneSelectionToAllowed(
  prev: Set<string>,
  allowedKeys: Iterable<string>,
): Set<string> {
  const allowed = new Set(allowedKeys);
  const next = new Set<string>();
  for (const k of prev) if (allowed.has(k)) next.add(k);
  return setsEqual(prev, next) ? prev : next;
}

function collectCategoryOptions(pool: Artwork[]): FacetOption[] {
  const labels = new Map<string, string>();
  for (const a of pool) {
    const key = categoryFacetKey(a);
    if (labels.has(key)) continue;
    labels.set(key, a.category?.trim() || "Uncategorized");
  }
  return [...labels.entries()]
    .map(([key, label]) => ({ key, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function collectCommissionOptions(pool: Artwork[]): FacetOption[] {
  const labels = new Map<string, string>();
  for (const a of pool) {
    const key = commissionFacetKey(a);
    if (labels.has(key)) continue;
    labels.set(key, a.commission?.trim() || "Not listed");
  }
  return [...labels.entries()]
    .map(([key, label]) => ({ key, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function collectCollectionOptions(pool: Artwork[]): FacetOption[] {
  const labels = new Map<string, string>();
  for (const a of pool) {
    const key = collectionFacetKey(a);
    if (labels.has(key)) continue;
    labels.set(key, a.collection?.trim() || "Not listed");
  }
  return [...labels.entries()]
    .map(([key, label]) => ({ key, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

type FacetUi = {
  effectiveCategories: Set<string>;
  effectiveCommissions: Set<string>;
  effectiveCollections: Set<string>;
  categoryOptions: FacetOption[];
  commissionOptions: FacetOption[];
  collectionOptions: FacetOption[];
};

/** Prunes facet selections against current option lists; iterates until stable (no useEffect). */
function deriveFacetUi(
  artworks: Artwork[],
  yearParsed: YearParsed,
  selectedCategories: Set<string>,
  selectedCommissions: Set<string>,
  selectedCollections: Set<string>,
): FacetUi {
  let cat = selectedCategories;
  let comm = selectedCommissions;
  let coll = selectedCollections;

  for (let i = 0; i < 24; i++) {
    const poolForCategoryOptions = artworks.filter(
      (a) =>
        artworkMatchesOtherFacetFilters(a, cat, comm, coll, "category") &&
        artworkMatchesYear(a, yearParsed),
    );
    const categoryOptions = collectCategoryOptions(poolForCategoryOptions);
    const catNext = pruneSelectionToAllowed(
      cat,
      categoryOptions.map((o) => o.key),
    );

    const poolForCommissionOptions = artworks.filter(
      (a) =>
        artworkMatchesOtherFacetFilters(a, catNext, comm, coll, "commission") &&
        artworkMatchesYear(a, yearParsed),
    );
    const commissionOptions = collectCommissionOptions(poolForCommissionOptions);
    const commNext = pruneSelectionToAllowed(
      comm,
      commissionOptions.map((o) => o.key),
    );

    const poolForCollectionOptions = artworks.filter(
      (a) =>
        artworkMatchesOtherFacetFilters(
          a,
          catNext,
          commNext,
          coll,
          "collection",
        ) && artworkMatchesYear(a, yearParsed),
    );
    const collectionOptions = collectCollectionOptions(poolForCollectionOptions);
    const collNext = pruneSelectionToAllowed(
      coll,
      collectionOptions.map((o) => o.key),
    );

    if (
      setsEqual(catNext, cat) &&
      setsEqual(commNext, comm) &&
      setsEqual(collNext, coll)
    ) {
      return {
        effectiveCategories: catNext,
        effectiveCommissions: commNext,
        effectiveCollections: collNext,
        categoryOptions,
        commissionOptions,
        collectionOptions,
      };
    }

    cat = catNext;
    comm = commNext;
    coll = collNext;
  }

  const poolForCategoryOptions = artworks.filter(
    (a) =>
      artworkMatchesOtherFacetFilters(a, cat, comm, coll, "category") &&
      artworkMatchesYear(a, yearParsed),
  );
  const categoryOptions = collectCategoryOptions(poolForCategoryOptions);
  const poolForCommissionOptions = artworks.filter(
    (a) =>
      artworkMatchesOtherFacetFilters(a, cat, comm, coll, "commission") &&
      artworkMatchesYear(a, yearParsed),
  );
  const commissionOptions = collectCommissionOptions(poolForCommissionOptions);
  const poolForCollectionOptions = artworks.filter(
    (a) =>
      artworkMatchesOtherFacetFilters(a, cat, comm, coll, "collection") &&
      artworkMatchesYear(a, yearParsed),
  );
  const collectionOptions = collectCollectionOptions(poolForCollectionOptions);

  return {
    effectiveCategories: pruneSelectionToAllowed(
      cat,
      categoryOptions.map((o) => o.key),
    ),
    effectiveCommissions: pruneSelectionToAllowed(
      comm,
      commissionOptions.map((o) => o.key),
    ),
    effectiveCollections: pruneSelectionToAllowed(
      coll,
      collectionOptions.map((o) => o.key),
    ),
    categoryOptions,
    commissionOptions,
    collectionOptions,
  };
}

function filtersFromEffectiveAndYear(
  effectiveCategories: Set<string>,
  effectiveCommissions: Set<string>,
  effectiveCollections: Set<string>,
  yearMin: string,
  yearMax: string,
  fullscreen: boolean,
): HomeFiltersFromUrl {
  return {
    categories: [...effectiveCategories].sort(),
    commissions: [...effectiveCommissions].sort(),
    collections: [...effectiveCollections].sort(),
    yearMin: yearMin.trim(),
    yearMax: yearMax.trim(),
    fullscreen,
  };
}

function initialShareLinkHasFacetsOrYear(f: HomeFiltersFromUrl): boolean {
  return (
    f.categories.length > 0 ||
    f.commissions.length > 0 ||
    f.collections.length > 0 ||
    f.yearMin.trim() !== "" ||
    f.yearMax.trim() !== ""
  );
}

function shouldMountMapInitially(
  f: HomeFiltersFromUrl,
  initialArt?: string,
): boolean {
  if (initialArt?.trim()) return true;
  return f.fullscreen || initialShareLinkHasFacetsOrYear(f);
}

/** Initial row selection: optional `art` slug, else first match for server-parsed share filters. */
function resolveInitialSelectedSlug(
  artworkList: Artwork[],
  initial: HomeFiltersFromUrl,
  initialArt?: string,
  embedSelectFirstWhenNone?: boolean,
): string | undefined {
  const qs = serializeHomeFiltersToQueryString({
    categories: initial.categories,
    commissions: initial.commissions,
    collections: initial.collections,
    yearMin: initial.yearMin,
    yearMax: initial.yearMax,
    fullscreen: false,
  });
  const hasFacetOrYear = initialShareLinkHasFacetsOrYear(initial);
  const filtered =
    hasFacetOrYear && qs
      ? filterArtworksByHomeUrlQuery(artworkList, qs)
      : artworkList;
  const art = initialArt?.trim();
  if (art && filtered.some((a) => a.slug === art)) return art;
  if (hasFacetOrYear && qs) {
    return filterArtworksByHomeUrlQuery(artworkList, qs)[0]?.slug;
  }
  if (embedSelectFirstWhenNone) {
    return filtered[0]?.slug;
  }
  return undefined;
}

export function HomeClient({
  artworks,
  mapboxStyleUrl,
  submitEnabled,
  initialFiltersFromUrl,
  initialArtSlug,
  embedSelectFirstWhenNone = false,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const isEmbedRoute = pathname.startsWith("/embed");
  const [embedDrawerOpen, setEmbedDrawerOpen] = useState(() => !isEmbedRoute);

  const [embedOpen, setEmbedOpen] = useState(false);
  const [embedCopied, setEmbedCopied] = useState(false);

  const [selectedSlug, setSelectedSlug] = useState<string | undefined>(() =>
    resolveInitialSelectedSlug(
      artworks,
      initialFiltersFromUrl,
      initialArtSlug,
      embedSelectFirstWhenNone,
    ),
  );
  /**
   * Bumps when map/list preview goes from a slug → none so `MapView` can refit even if internal
   * refs/effect ordering miss the transition.
   */
  const [previewClosedSignal, setPreviewClosedSignal] = useState(0);
  const prevSelectedSlugForMapSignalRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const prev = prevSelectedSlugForMapSignalRef.current;
    if (
      typeof prev === "string" &&
      prev.length > 0 &&
      selectedSlug === undefined
    ) {
      setPreviewClosedSignal((n) => n + 1);
    }
    prevSelectedSlugForMapSignalRef.current = selectedSlug;
  }, [selectedSlug]);
  const [hoveredSlug, setHoveredSlug] = useState<string | undefined>(undefined);
  const [filtersOpen, setFiltersOpen] = useState(false);
  /** Mount map for `fs=1` or any shareable facet/year params from the server (see `page.tsx`). */
  const [mountMap, setMountMap] = useState(() =>
    shouldMountMapInitially(initialFiltersFromUrl, initialArtSlug),
  );
  const [mapAbsolute, setMapAbsolute] = useState(() => !!initialFiltersFromUrl.fullscreen);
  const mapSectionRef = useRef<HTMLElement | null>(null);
  const didAutoFullscreenMapRef = useRef(!!initialFiltersFromUrl.fullscreen);
  /** Tracks whether the last applied URL had `fs=1` (for Back / history dropping `fs`). */
  const hadFullscreenInUrlRef = useRef(!!initialFiltersFromUrl.fullscreen);
  const [searchQuery, setSearchQuery] = useState("");

  /** Preview dim: keeps backdrop mounted for opacity exit so the fade is smooth both ways. */
  const previewDimWanted = mountMap && !!selectedSlug;
  const [mapPreviewBackdropMount, setMapPreviewBackdropMount] = useState(false);
  const [mapPreviewBackdropVisible, setMapPreviewBackdropVisible] = useState(false);

  useEffect(() => {
    if (!previewDimWanted) {
      setMapPreviewBackdropVisible(false);
      return;
    }
    setMapPreviewBackdropMount(true);
    let cancelled = false;
    const raf1 = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!cancelled) setMapPreviewBackdropVisible(true);
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf1);
    };
  }, [previewDimWanted]);

  const onMapPreviewBackdropTransitionEnd = useCallback(
    (e: TransitionEvent<HTMLDivElement>) => {
      if (e.propertyName !== "opacity") return;
      if (!previewDimWanted) setMapPreviewBackdropMount(false);
    },
    [previewDimWanted],
  );

  // UX: show the interactive map immediately on larger screens; keep mobile "click to load"
  // to protect performance and avoid loading Mapbox unnecessarily on small devices.
  useEffect(() => {
    if (mountMap) return;
    if (typeof window === "undefined") return;
    if (window.matchMedia?.("(min-width: 641px)")?.matches) {
      setMountMap(true);
    }
  }, [mountMap]);

  // Embed UX: treat the left panel as a drawer (desktop open by default, mobile closed).
  useEffect(() => {
    if (!isEmbedRoute) return;
    if (typeof window === "undefined") return;
    const mql = window.matchMedia?.("(min-width: 641px)");
    const next = mql?.matches ? true : false;
    setEmbedDrawerOpen(next);
  }, [isEmbedRoute]);

  // Mobile UX: once the map is mounted on narrow screens, force fullscreen map layout.
  // This avoids leaving the map in a partially-sized "card" state on mobile.
  useEffect(() => {
    if (!mountMap) return;
    if (mapAbsolute) return;
    if (typeof window === "undefined") return;
    if (window.matchMedia?.("(max-width: 640px)")?.matches) {
      if (didAutoFullscreenMapRef.current) return;
      didAutoFullscreenMapRef.current = true;
      setMapAbsolute(true);
    }
  }, [mountMap, mapAbsolute]);

  /**
   * Facet chips follow the query string. On the first client render `useSearchParams()` can be empty
   * while the server already parsed `initialFiltersFromUrl` — merge so pasted share links hydrate correctly.
   */
  const searchKey = searchParams.toString();
  /** Facets/year/fs only — stable while `art=` is added or removed for the map preview. */
  const filterUrlSearchKey = useMemo(
    () => stripArtSlugFromQueryString(searchKey),
    [searchKey],
  );

  const urlFilters = useMemo((): HomeFiltersFromUrl => {
    if (filterUrlSearchKey !== "") {
      return parseHomeFiltersFromUrlSearchParams(new URLSearchParams(filterUrlSearchKey));
    }
    if (
      initialShareLinkHasFacetsOrYear(initialFiltersFromUrl) ||
      initialFiltersFromUrl.fullscreen
    ) {
      return initialFiltersFromUrl;
    }
    return parseHomeFiltersFromUrlSearchParams(new URLSearchParams(""));
  }, [filterUrlSearchKey, initialFiltersFromUrl]);

  const filterQueryString = useMemo(() => {
    if (searchKey !== "") return filterUrlSearchKey;
    return serializeHomeFiltersToQueryString(urlFilters);
  }, [filterUrlSearchKey, searchKey, urlFilters]);

  const mapAndLinkQueryString = useMemo(() => {
    const p = new URLSearchParams(filterQueryString || "");
    if (selectedSlug) p.set("art", selectedSlug);
    else p.delete("art");
    return p.toString();
  }, [filterQueryString, selectedSlug]);

  const embedUrl = useMemo(() => {
    const base =
      typeof window !== "undefined" && window.location?.origin
        ? window.location.origin
        : "";
    const qs = mapAndLinkQueryString ? `?${mapAndLinkQueryString}` : "";
    return `${base}/embed${qs}`;
  }, [mapAndLinkQueryString]);

  const embedCode = useMemo(() => {
    return `<iframe src="${embedUrl}" width="100%" height="600" style="border:0" loading="lazy" allowfullscreen></iframe>`;
  }, [embedUrl]);

  useEffect(() => {
    if (!embedOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setEmbedOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [embedOpen]);

  useEffect(() => {
    if (!embedOpen) return;
    setEmbedCopied(false);
  }, [embedOpen]);

  // Apply `fs=1` before paint so a follow-up effect cannot strip it from the URL first (desktop paste / share links).
  useLayoutEffect(() => {
    if (!urlFilters.fullscreen) return;
    setMountMap(true);
    didAutoFullscreenMapRef.current = true;
    setMapAbsolute(true);
  }, [urlFilters.fullscreen]);

  // When history removes `fs` (Back/Forward), leave immersive map mode without requiring another click.
  useEffect(() => {
    const hadFs = hadFullscreenInUrlRef.current;
    hadFullscreenInUrlRef.current = urlFilters.fullscreen;
    if (hadFs && !urlFilters.fullscreen && mapAbsolute) {
      setMapAbsolute(false);
    }
  }, [urlFilters.fullscreen, mapAbsolute]);

  // Performance: until the map/list UI is mounted, skip expensive filtering/facet work.
  const selectedCategories = useMemo(() => {
    if (!mountMap) return EMPTY_SET;
    return new Set(urlFilters.categories);
  }, [mountMap, urlFilters.categories]);
  const selectedCommissions = useMemo(() => {
    if (!mountMap) return EMPTY_SET;
    return new Set(urlFilters.commissions);
  }, [mountMap, urlFilters.commissions]);
  const selectedCollections = useMemo(() => {
    if (!mountMap) return EMPTY_SET;
    return new Set(urlFilters.collections);
  }, [mountMap, urlFilters.collections]);

  /** Year inputs stay editable while typing; URL updates are debounced separately. */
  const [yearMin, setYearMin] = useState(initialFiltersFromUrl.yearMin);
  const [yearMax, setYearMax] = useState(initialFiltersFromUrl.yearMax);

  const yearParsed = useMemo(
    () => parseYearInputs(yearMin, yearMax),
    [yearMin, yearMax],
  );

  const facetUi = useMemo(() => {
    if (!mountMap) {
      return {
        effectiveCategories: EMPTY_SET,
        effectiveCommissions: EMPTY_SET,
        effectiveCollections: EMPTY_SET,
        categoryOptions: [] as FacetOption[],
        commissionOptions: [] as FacetOption[],
        collectionOptions: [] as FacetOption[],
      };
    }
    return deriveFacetUi(
      artworks,
      yearParsed,
      selectedCategories as Set<string>,
      selectedCommissions as Set<string>,
      selectedCollections as Set<string>,
    );
  }, [
    mountMap,
    artworks,
    yearParsed,
    selectedCategories,
    selectedCommissions,
    selectedCollections,
  ]);

  const {
    effectiveCategories,
    effectiveCommissions,
    effectiveCollections,
    categoryOptions,
    commissionOptions,
    collectionOptions,
  } = facetUi;

  const yearBounds = useMemo(() => {
    if (!mountMap) {
      return {
        min: undefined as number | undefined,
        max: undefined as number | undefined,
      };
    }
    const years = artworks
      .map((a) => a.year)
      .filter((y): y is number => y != null && Number.isFinite(y));
    if (years.length === 0) {
      return { min: undefined as number | undefined, max: undefined as number | undefined };
    }
    return { min: Math.min(...years), max: Math.max(...years) };
  }, [mountMap, artworks]);

  const filtered = useMemo(() => {
    if (!mountMap) return [];
    const q = searchQuery.trim().toLowerCase();
    return artworks.filter((a) => {
      if (q) {
        const haystack = [
          a.title,
          a.artist,
          a.category,
          a.collection,
          a.commission,
          a.address,
          a.description,
        ]
          .filter((x): x is string => typeof x === "string" && x.trim() !== "")
          .join(" · ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (
        effectiveCategories.size > 0 &&
        !effectiveCategories.has(categoryFacetKey(a))
      ) {
        return false;
      }
      if (
        effectiveCommissions.size > 0 &&
        !effectiveCommissions.has(commissionFacetKey(a))
      ) {
        return false;
      }
      if (
        effectiveCollections.size > 0 &&
        !effectiveCollections.has(collectionFacetKey(a))
      ) {
        return false;
      }
      return artworkMatchesYear(a, yearParsed);
    });
  }, [
    artworks,
    effectiveCategories,
    effectiveCommissions,
    effectiveCollections,
    yearParsed,
    searchQuery,
  ]);

  /** Stable when only `filtered` array identity churns — keeps selection sync from re-firing. */
  const filteredSlugsKey = useMemo(
    () => filtered.map((a) => a.slug).join("\0"),
    [filtered],
  );

  /** When the query string changes from history navigation, align year fields with `ymin` / `ymax`. */
  /* eslint-disable react-hooks/set-state-in-effect -- year inputs are local for typing; history navigation must rest them from the URL. */
  useEffect(() => {
    if (!mountMap) return;
    setYearMin(urlFilters.yearMin);
    setYearMax(urlFilters.yearMax);
  }, [mountMap, urlFilters.yearMin, urlFilters.yearMax]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const pushFilterUrl = useCallback(() => {
    const desired = filtersFromEffectiveAndYear(
      effectiveCategories,
      effectiveCommissions,
      effectiveCollections,
      yearMin,
      yearMax,
      mapAbsolute,
    );
    const nextQs = serializeHomeMapQueryString(desired, selectedSlug);
    // Compare to the real address bar — not `mapAndLinkQueryString`, which is derived from the same
    // state as `nextQs`, so it was always "equal" and `router.replace` never ran (`art=` never appeared).
    if (homeMapQueryStringsEqual(nextQs, searchKey)) return;
    const href = nextQs ? `${pathname}?${nextQs}` : pathname;
    router.replace(href, { scroll: false });
  }, [
    effectiveCategories,
    effectiveCommissions,
    effectiveCollections,
    mapAbsolute,
    pathname,
    router,
    searchKey,
    selectedSlug,
    yearMax,
    yearMin,
  ]);

  /**
   * Single URL sync — previously two effects both depended on `pushFilterUrl`, so one map click
   * fired `pushFilterUrl()` twice (facet effect + selection effect), doubling `router.replace`.
   */
  useEffect(() => {
    if (!mountMap) return;
    pushFilterUrl();
  }, [
    mountMap,
    effectiveCategories,
    effectiveCommissions,
    effectiveCollections,
    pushFilterUrl,
    selectedSlug,
  ]);

  /** Debounce year typing so we don’t rewrite the URL on every keystroke. */
  useEffect(() => {
    if (!mountMap) return;
    const id = window.setTimeout(() => pushFilterUrl(), 400);
    return () => clearTimeout(id);
  }, [mountMap, yearMin, yearMax, pushFilterUrl]);

  const replaceQueryWith = useCallback(
    (nextFilters: HomeFiltersFromUrl) => {
      const qs = serializeHomeFiltersToQueryString(nextFilters);
      const href = qs ? `${pathname}?${qs}` : pathname;
      router.replace(href, { scroll: false });
    },
    [pathname, router],
  );

  const toggleCategory = useCallback(
    (key: string) => {
      const parsed = parseHomeFiltersFromUrlSearchParams(searchParams);
      const next = new Set(parsed.categories);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      replaceQueryWith({
        categories: [...next].sort(),
        commissions: parsed.commissions,
        collections: parsed.collections,
        yearMin: yearMin.trim(),
        yearMax: yearMax.trim(),
        fullscreen: parsed.fullscreen,
      });
    },
    [replaceQueryWith, searchParams, yearMin, yearMax],
  );

  const toggleCommission = useCallback(
    (key: string) => {
      const parsed = parseHomeFiltersFromUrlSearchParams(searchParams);
      const next = new Set(parsed.commissions);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      replaceQueryWith({
        categories: parsed.categories,
        commissions: [...next].sort(),
        collections: parsed.collections,
        yearMin: yearMin.trim(),
        yearMax: yearMax.trim(),
        fullscreen: parsed.fullscreen,
      });
    },
    [replaceQueryWith, searchParams, yearMin, yearMax],
  );

  const toggleCollection = useCallback(
    (key: string) => {
      const parsed = parseHomeFiltersFromUrlSearchParams(searchParams);
      const next = new Set(parsed.collections);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      replaceQueryWith({
        categories: parsed.categories,
        commissions: parsed.commissions,
        collections: [...next].sort(),
        yearMin: yearMin.trim(),
        yearMax: yearMax.trim(),
        fullscreen: parsed.fullscreen,
      });
    },
    [replaceQueryWith, searchParams, yearMin, yearMax],
  );

  const clearFilters = useCallback(() => {
    setYearMin("");
    setYearMax("");
    setSearchQuery("");
    setSelectedSlug(undefined);
    const parsed = parseHomeFiltersFromUrlSearchParams(searchParams);
    replaceQueryWith({
      categories: [],
      commissions: [],
      collections: [],
      yearMin: "",
      yearMax: "",
      fullscreen: parsed.fullscreen,
    });
  }, [replaceQueryWith, searchParams]);

  const clearCategoryFacet = useCallback(() => {
    const parsed = parseHomeFiltersFromUrlSearchParams(searchParams);
    replaceQueryWith({
      categories: [],
      commissions: parsed.commissions,
      collections: parsed.collections,
      yearMin: yearMin.trim(),
      yearMax: yearMax.trim(),
      fullscreen: parsed.fullscreen,
    });
  }, [replaceQueryWith, searchParams, yearMin, yearMax]);

  const clearCommissionFacet = useCallback(() => {
    const parsed = parseHomeFiltersFromUrlSearchParams(searchParams);
    replaceQueryWith({
      categories: parsed.categories,
      commissions: [],
      collections: parsed.collections,
      yearMin: yearMin.trim(),
      yearMax: yearMax.trim(),
      fullscreen: parsed.fullscreen,
    });
  }, [replaceQueryWith, searchParams, yearMin, yearMax]);

  const clearCollectionFacet = useCallback(() => {
    const parsed = parseHomeFiltersFromUrlSearchParams(searchParams);
    replaceQueryWith({
      categories: parsed.categories,
      commissions: parsed.commissions,
      collections: [],
      yearMin: yearMin.trim(),
      yearMax: yearMax.trim(),
      fullscreen: parsed.fullscreen,
    });
  }, [replaceQueryWith, searchParams, yearMin, yearMax]);

  const activeFilterCount =
    effectiveCategories.size +
    effectiveCommissions.size +
    effectiveCollections.size +
    (yearMin.trim() !== "" || yearMax.trim() !== "" ? 1 : 0);

  /** Mirrors list narrowing used for selection sync — passed to the map so it can refit when this flips false. */
  const listRefinementActive = useMemo(
    () =>
      effectiveCategories.size > 0 ||
      effectiveCommissions.size > 0 ||
      effectiveCollections.size > 0 ||
      yearParsed.hasYearFilter ||
      searchQuery.trim() !== "",
    [
      effectiveCategories,
      effectiveCommissions,
      effectiveCollections,
      yearParsed.hasYearFilter,
      searchQuery,
    ],
  );

  /** Stable key so we only react to filter/search changes, not unrelated `filtered` identity churn. */
  const filterDriveSelectionKey = useMemo(
    () =>
      JSON.stringify({
        cats: [...effectiveCategories].sort(),
        comms: [...effectiveCommissions].sort(),
        colls: [...effectiveCollections].sort(),
        ymin: yearMin.trim(),
        ymax: yearMax.trim(),
        q: searchQuery.trim(),
      }),
    [
      effectiveCategories,
      effectiveCommissions,
      effectiveCollections,
      yearMin,
      yearMax,
      searchQuery,
    ],
  );

  const onSelectArtwork = useCallback((slug: string) => {
    setSelectedSlug(slug);
  }, []);

  const onClearSelection = useCallback(() => {
    setSelectedSlug(undefined);
  }, []);

  const skipInitialFilterSelectionSyncRef = useRef(true);
  const prevFilterDriveKeyRef = useRef<string | null>(null);
  /* eslint-disable react-hooks/set-state-in-effect -- Map preview follows filter / year / search; same-key pass fixes URL loads where selection was never set. */
  useEffect(() => {
    if (!mountMap) return;
    const key = filterDriveSelectionKey;

    const hasRefinements = listRefinementActive;

    if (skipInitialFilterSelectionSyncRef.current) {
      skipInitialFilterSelectionSyncRef.current = false;
      prevFilterDriveKeyRef.current = key;
      if (filtered.length > 0) {
        const inList =
          selectedSlug != null && filtered.some((a) => a.slug === selectedSlug);
        if (!inList && (hasRefinements || isEmbedRoute)) {
          setSelectedSlug(filtered[0]!.slug);
        }
      }
      return;
    }

    if (!hasRefinements) {
      if (prevFilterDriveKeyRef.current !== key) {
        prevFilterDriveKeyRef.current = key;
        setSelectedSlug(undefined);
      }
      return;
    }

    if (prevFilterDriveKeyRef.current === key) {
      const inList =
        selectedSlug != null && filtered.some((a) => a.slug === selectedSlug);
      // Only recover a stale row selection — do not re-pick the first item when the user cleared
      // preview (map background / popup ×); MapView will refit bounds for the empty selection.
      if (selectedSlug != null && !inList && filtered.length > 0) {
        setSelectedSlug(filtered[0]!.slug);
      }
      return;
    }

    prevFilterDriveKeyRef.current = key;
    const first = filtered[0];
    setSelectedSlug(first ? first.slug : undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `filtered` keyed by `filteredSlugsKey` to avoid URL `art=` churn
  }, [
    mountMap,
    filterDriveSelectionKey,
    filteredSlugsKey,
    listRefinementActive,
    selectedSlug,
    isEmbedRoute,
  ]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const scrollToMap = useCallback(() => {
    mapSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    setMountMap(true);
    if (typeof window !== "undefined" && window.matchMedia?.("(max-width: 640px)")?.matches) {
      didAutoFullscreenMapRef.current = true;
    }
    setMapAbsolute(true);
    const parsed = parseHomeFiltersFromUrlSearchParams(searchParams);
    if (!parsed.fullscreen) {
      replaceQueryWith({ ...parsed, fullscreen: true });
    }
  }, [replaceQueryWith, searchParams]);

  const exitFullscreenMap = useCallback(() => {
    setMapAbsolute(false);
    const parsed = parseHomeFiltersFromUrlSearchParams(searchParams);
    if (parsed.fullscreen) {
      replaceQueryWith({ ...parsed, fullscreen: false });
    }
    // Keep map mounted; just return to normal page flow.
    mapSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [replaceQueryWith, searchParams]);

  useEffect(() => {
    if (!mapAbsolute) return;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    const prevBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.body.style.overflow = prevBodyOverflow;
    };
  }, [mapAbsolute]);

  useEffect(() => {
    if (!mapAbsolute) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") exitFullscreenMap();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mapAbsolute, exitFullscreenMap]);

  const heroStats = useMemo(() => {
    const categories = new Set<string>();
    let minYear: number | null = null;
    let maxYear: number | null = null;

    for (const a of artworks) {
      if (a.category?.trim()) categories.add(a.category.trim());
      if (a.year != null && Number.isFinite(a.year)) {
        minYear = minYear == null ? a.year : Math.min(minYear, a.year);
        maxYear = maxYear == null ? a.year : Math.max(maxYear, a.year);
      }
    }

    const yearRange =
      minYear != null && maxYear != null
        ? minYear === maxYear
          ? String(minYear)
          : `${minYear}–${maxYear}`
        : null;

    return {
      artworkCount: artworks.length,
      categoryCount: categories.size,
      yearRange,
    };
  }, [artworks]);

  return (
    <ViewTransition
      enter={{
        "nav-forward": "nav-forward",
        "nav-back": "nav-back",
        default: "none",
      }}
      exit={{
        "nav-forward": "nav-forward",
        "nav-back": "nav-back",
        default: "none",
      }}
      default="none"
    >
      <div className={styles.shell}>
        <SiteBrandBar titleAs="p" />

        {isEmbedRoute && mountMap && embedDrawerOpen ? (
          <button
            type="button"
            className="fixed inset-0 z-[25] bg-black/10 sm:hidden"
            aria-label="Close drawer"
            onClick={() => setEmbedDrawerOpen(false)}
          />
        ) : null}

        {mapAbsolute ? (
          <button
            type="button"
            className={styles.exitMapBtn}
            onClick={exitFullscreenMap}
            aria-label="Exit fullscreen map"
          >
            Exit map
          </button>
        ) : null}

        <header className={styles.intro} aria-label="Page introduction">
          <div className={styles.introInner}>
            <h1 className={styles.heroTitle}>Waco’s Public Art Map</h1>
            <p className={styles.heroLead}>
              Find murals, sculptures, fountains, and more. Filter by category,
              commission, collection, or year — then jump from the map to details.
            </p>
            <div className={styles.heroActions}>
              <button
                type="button"
                className={`${styles.heroBtn} ${styles.heroBtnPrimary}`}
                onClick={scrollToMap}
              >
                Explore the map
              </button>
              <button
                type="button"
                className={styles.heroBtn}
                onClick={() => setEmbedOpen(true)}
              >
                Embed
              </button>
              {submitEnabled ? (
                <Link className={styles.heroBtn} href="/submit" prefetch={false}>
                  Submit public art
                </Link>
              ) : (
                <span
                  className={`${styles.heroBtn} ${styles.heroBtnDisabled}`}
                  aria-disabled="true"
                  title="Submissions are paused"
                >
                  Submit public art
                </span>
              )}
            </div>
          </div>
        </header>

        <section
          ref={(el) => {
            mapSectionRef.current = el;
          }}
          className={`${styles.mapSection}${mapAbsolute ? ` ${styles.mapSectionAbsolute}` : ""}`}
          aria-label="Interactive map"
        >
          <div
            className={`${styles.mapCard}${!mountMap ? ` ${styles.mapCardPoster}` : ""}${
              mapAbsolute ? ` ${styles.mapCardAbsolute}` : ""
            }${mountMap && selectedSlug ? ` ${styles.mapCardPreviewOpen}` : ""}`}
          >
            <div className={styles.mapViewport}>
              {mapPreviewBackdropMount ? (
                <div
                  className={`${styles.mapPreviewBackdrop}${
                    mapPreviewBackdropVisible ? ` ${styles.mapPreviewBackdropVisible}` : ""
                  }`}
                  aria-hidden
                  onTransitionEnd={onMapPreviewBackdropTransitionEnd}
                />
              ) : null}
              {mountMap ? (
                <MapView
                  artworks={filtered}
                  selectedSlug={selectedSlug}
                  highlightSlug={hoveredSlug}
                  onSelectSlug={onSelectArtwork}
                  onClearSelection={onClearSelection}
                  styleUrl={mapboxStyleUrl}
                  homeQueryString={mapAndLinkQueryString}
                  previewClosedSignal={previewClosedSignal}
                  mapShowsFullCatalog={
                    artworks.length > 0 && filtered.length === artworks.length
                  }
                />
              ) : (
                <button
                  type="button"
                  className={styles.mapLoadBtn}
                  onClick={() => {
                    setMountMap(true);
                    if (window.matchMedia?.("(max-width: 640px)")?.matches) {
                      didAutoFullscreenMapRef.current = true;
                      setMapAbsolute(true);
                    }
                    const parsed = parseHomeFiltersFromUrlSearchParams(searchParams);
                    if (!parsed.fullscreen) {
                      replaceQueryWith({ ...parsed, fullscreen: true });
                    }
                  }}
                  aria-label="Load interactive map"
                >
                  <span className={styles.mapLoadLabel}>
                    Tap to load map
                    <span className={styles.sub}>Interactive map loads on demand for performance.</span>
                  </span>
                </button>
              )}
            </div>

      {mountMap ? (
        <aside
          className={`${styles.panel}${filtersOpen ? ` ${styles.panelFiltersOpen}` : ""}`}
          data-home-artwork-panel
          data-embed-drawer={isEmbedRoute ? "true" : "false"}
          data-embed-drawer-open={isEmbedRoute && embedDrawerOpen ? "true" : "false"}
          id={isEmbedRoute ? "embed-drawer-panel" : undefined}
          aria-label="Artwork list"
        >
          {isEmbedRoute ? (
            <button
              type="button"
              data-embed-drawer-tab="true"
              aria-label={embedDrawerOpen ? "Hide list" : "Show list"}
              aria-expanded={embedDrawerOpen}
              aria-controls="embed-drawer-panel"
              onClick={() => setEmbedDrawerOpen((v) => !v)}
            >
              <span aria-hidden data-embed-drawer-tab-chevron="true">
                {embedDrawerOpen ? "‹" : "›"}
              </span>
            </button>
          ) : null}
          <div className={styles.filterHeader} data-embed-filter-header={isEmbedRoute ? "true" : "false"}>
            <input
              className={styles.filterSearch}
              type="search"
              placeholder="Search artworks…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
            <button
              type="button"
              className={styles.filterSummaryBtn}
              onClick={() => setFiltersOpen((v) => !v)}
              aria-expanded={filtersOpen}
              aria-controls="filters-panel"
            >
              {filtersOpen ? "List" : "Filters"}
              {activeFilterCount > 0 ? (
                <span
                  className={styles.filterBadge}
                  aria-label={`${activeFilterCount} active refinement${
                    activeFilterCount === 1 ? "" : "s"
                  }`}
                >
                  {activeFilterCount}
                </span>
              ) : null}
            </button>
          </div>

        <div className={styles.panelBody} data-embed-panel-body={isEmbedRoute ? "true" : "false"}>
          {filtersOpen ? (
            <div className={styles.filtersInner} role="group" id="filters-panel">
              <div className={styles.filterRow}>
                <span className={styles.caption}>Category</span>
                <div className={styles.filterActions}>
                  <button
                    type="button"
                    className={styles.filterLink}
                    disabled={effectiveCategories.size === 0}
                    onClick={clearCategoryFacet}
                  >
                    Any
                  </button>
                </div>
              </div>
              <ul className={styles.filterToggleList} aria-label="Categories">
                {categoryOptions.map((o) => {
                  const on = effectiveCategories.has(o.key);
                  const dotColor =
                    o.key === UNCATEGORIZED_KEY
                      ? markerColorForCategory(undefined)
                      : markerColorForCategory(o.label);
                  return (
                    <li key={o.key}>
                      <button
                        type="button"
                        className={`${styles.filterToggle}${
                          on ? ` ${styles.filterToggleCatOn}` : ""
                        }`}
                        style={{ "--cat": dotColor } as CSSProperties}
                        aria-pressed={on}
                        onClick={() => toggleCategory(o.key)}
                      >
                        <span
                          className={styles.filterToggleSwatch}
                          style={{ background: dotColor }}
                          aria-hidden
                        />
                        <span className={styles.filterToggleText}>{o.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>

              <div className={styles.filterRow}>
                <span className={styles.caption}>Commission</span>
                <div className={styles.filterActions}>
                  <button
                    type="button"
                    className={styles.filterLink}
                    disabled={effectiveCommissions.size === 0}
                    onClick={clearCommissionFacet}
                  >
                    Any
                  </button>
                </div>
              </div>
              <ul className={styles.filterToggleList} aria-label="Commission">
                {commissionOptions.map((o) => {
                  const on = effectiveCommissions.has(o.key);
                  return (
                    <li key={o.key}>
                      <button
                        type="button"
                        className={`${styles.filterToggle}${
                          on ? ` ${styles.filterToggleOn}` : ""
                        }`}
                        aria-pressed={on}
                        onClick={() => toggleCommission(o.key)}
                      >
                        <span className={styles.filterToggleText}>{o.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>

              <div className={styles.filterRow}>
                <span className={styles.caption}>Collection</span>
                <div className={styles.filterActions}>
                  <button
                    type="button"
                    className={styles.filterLink}
                    disabled={effectiveCollections.size === 0}
                    onClick={clearCollectionFacet}
                  >
                    Any
                  </button>
                </div>
              </div>
              <ul className={styles.filterToggleList} aria-label="Collection">
                {collectionOptions.map((o) => {
                  const on = effectiveCollections.has(o.key);
                  return (
                    <li key={o.key}>
                      <button
                        type="button"
                        className={`${styles.filterToggle}${
                          on ? ` ${styles.filterToggleOn}` : ""
                        }`}
                        aria-pressed={on}
                        onClick={() => toggleCollection(o.key)}
                      >
                        <span className={styles.filterToggleText}>{o.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>

              <div className={styles.yearRow}>
                <div className={styles.yearField}>
                  <label className={styles.label} htmlFor="year-from">
                    From
                  </label>
                  <input
                    id="year-from"
                    className={styles.input}
                    inputMode="numeric"
                    placeholder={
                      yearBounds.min != null ? String(yearBounds.min) : "Any"
                    }
                    value={yearMin}
                    onChange={(e) => setYearMin(e.target.value)}
                    aria-describedby="year-hint"
                  />
                </div>
                <div className={styles.yearField}>
                  <label className={styles.label} htmlFor="year-to">
                    To
                  </label>
                  <input
                    id="year-to"
                    className={styles.input}
                    inputMode="numeric"
                    placeholder={
                      yearBounds.max != null ? String(yearBounds.max) : "Any"
                    }
                    value={yearMax}
                    onChange={(e) => setYearMax(e.target.value)}
                    aria-describedby="year-hint"
                  />
                </div>
              </div>
              <p id="year-hint" className={styles.srOnly}>
                Year range only includes entries with a year listed. Leave blank
                for any year.
              </p>

              {activeFilterCount > 0 && (
                <button
                  type="button"
                  className={styles.clearFilters}
                  onClick={clearFilters}
                >
                  Clear ({activeFilterCount})
                </button>
              )}
            </div>
          ) : (
            <>
              <ul className={styles.ul}>
                {filtered.map((a) => (
                  <li key={a.slug} className={styles.li}>
                    <div
                      className={`${styles.listItemRow}${
                        selectedSlug === a.slug ? ` ${styles.listItemRowSelected}` : ""
                      }`}
                    >
                      <button
                        type="button"
                        className={`${styles.item}${
                          selectedSlug === a.slug ? ` ${styles.itemSelected}` : ""
                        }`}
                        aria-pressed={selectedSlug === a.slug}
                        onClick={() => setSelectedSlug(a.slug)}
                        onMouseEnter={() => setHoveredSlug(a.slug)}
                        onMouseLeave={() => setHoveredSlug(undefined)}
                        onFocus={() => setHoveredSlug(a.slug)}
                        onBlur={() => setHoveredSlug(undefined)}
                      >
                        <span className={styles.itemRow}>
                          <span
                            className={styles.listDot}
                            style={{
                              background: markerColorForCategory(a.category),
                            }}
                            aria-hidden
                          />
                          <span className={styles.title}>{a.title}</span>
                        </span>
                        <span className={styles.meta}>
                          {[
                            a.collection,
                            a.artist,
                            a.year != null ? String(a.year) : undefined,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </button>
                      {!isEmbedRoute ? (
                        <Link
                          href={`/art/${a.slug}${
                            mapAndLinkQueryString ? `?${mapAndLinkQueryString}` : ""
                          }`}
                          className={styles.detailLink}
                          prefetch={false}
                          transitionTypes={["nav-forward"]}
                        >
                          Details
                        </Link>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
              <p className={styles.count}>
                Showing <strong>{filtered.length}</strong> of{" "}
                <strong>{artworks.length}</strong>
              </p>
            </>
          )}
        </div>
        {effectiveCollections.size === 1 ? (
          <footer className={styles.curatedFooter}>
            <p className={styles.curatedLine}>Curated collection by</p>
            <div className={styles.curatedLogoWrap}>
              <BrandLogo
                className={styles.curatedBrandLink}
                imgClassName={styles.curatedBrandImg}
              />
            </div>
          </footer>
        ) : null}
        </aside>
      ) : null}

          </div>
        </section>
    </div>
    {embedOpen ? (
      <div
        className={embedStyles.shell}
        role="dialog"
        aria-modal="true"
        aria-label="Embed this map"
      >
        <button
          type="button"
          className={embedStyles.backdrop}
          aria-label="Close embed modal"
          onClick={() => setEmbedOpen(false)}
        />
        <div className={embedStyles.card}>
          <div className={embedStyles.headerRow}>
            <div>
              <p className={embedStyles.title}>Embed this map</p>
              <p className={embedStyles.subtitle}>
                Includes your current filters and selection.
              </p>
            </div>
            <button
              type="button"
              className={embedStyles.closeBtn}
              onClick={() => setEmbedOpen(false)}
            >
              Close
            </button>
          </div>

          <div className={embedStyles.section}>
            <label className={embedStyles.label} htmlFor="embed-code">
              Embed code
            </label>
            <textarea
              id="embed-code"
              className={embedStyles.code}
              value={embedCode}
              readOnly
              rows={4}
              onFocus={(e) => e.currentTarget.select()}
            />

            <div className={embedStyles.footerRow}>
              <p className={embedStyles.url}>{embedUrl}</p>
              <button
                type="button"
                className={embedStyles.copyBtn}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(embedCode);
                    setEmbedCopied(true);
                    window.setTimeout(() => setEmbedCopied(false), 1500);
                  } catch {
                    // Fallback: rely on textarea focus/select for manual copy.
                    setEmbedCopied(false);
                  }
                }}
              >
                {embedCopied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        </div>
      </div>
    ) : null}
    </ViewTransition>
  );
}
