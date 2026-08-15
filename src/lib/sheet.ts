import { cache } from "react";
import { unstable_cache } from "next/cache";
import { z } from "zod";
import Papa from "papaparse";
import { listAirtableCollectionRecords, listAirtableRecords } from "./airtable-client";
import { env } from "./env";

export type Artwork = {
  slug: string;
  title: string;
  lat: number;
  lng: number;
  description?: string;
  /** Back-compat: first image URL (if any). Prefer `images` for UI. */
  image?: string;
  /** One or more image URLs (supports comma/newline separated values in the sheet). */
  images?: string[];
  address?: string;
  category?: string;
  /** Link from the sheet `URL` column (external page). */
  externalUrl?: string;
  year?: number;
  artist?: string;
  /** From sheet column `Commissioned By`. */
  commission?: string;
  /** From sheet column `Collection`. */
  collection?: string;
};

type Provider = "sheet" | "airtable";
type FetchOptions =
  | { cache: "no-store" }
  | { next: { revalidate: number } };

const rawArtworkSchema = z.object({
  slug: z.string().trim().min(1),
  title: z.string().trim().min(1),
  lat: z.coerce.number().finite().min(-90).max(90),
  lng: z.coerce.number().finite().min(-180).max(180),
  description: z.string().optional(),
  // Accept either a single URL or multiple URLs separated by commas/newlines.
  // We validate/sanitize into `images` after parsing.
  image: z.string().optional().or(z.literal("")).transform((v) => (v ? v : undefined)),
  address: z.string().optional(),
  category: z.string().optional(),
  externalUrl: z
    .string()
    .url()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : undefined)),
  year: z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? undefined : v),
    z.coerce.number().int().optional(),
  ),
  artist: z.string().optional(),
  commission: z.string().optional(),
  collection: z.string().optional(),
});

/** URL-safe slug (artwork slugs, collection routes, etc.). */
export function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeRowKeys(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    const key = k.trim().toLowerCase().replace(/\s+/g, "_");
    if (typeof v === "string") {
      out[key] = v.trim();
      continue;
    }
    // Airtable attachments are arrays of objects with `url`; store as comma list.
    if (Array.isArray(v)) {
      const urls = v
        .map((item) => {
          if (typeof item === "string") return item.trim();
          if (item && typeof item === "object" && "url" in item) {
            const maybe = (item as { url?: unknown }).url;
            return typeof maybe === "string" ? maybe.trim() : "";
          }
          return "";
        })
        .filter(Boolean);
      out[key] = urls.length ? urls.join(", ") : v;
      continue;
    }
    out[key] = v;
  }
  return out;
}

function pickFirst(row: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    const v = row[key];
    if (v === undefined || v === null) continue;
    if (typeof v === "string" && !v.trim()) continue;
    return v;
  }
  return undefined;
}

/** Prefer a direct image URL column; otherwise build from `image_id` + optional public template. */
function resolveImageField(row: Record<string, unknown>): unknown {
  const direct = pickFirst(row, ["image", "image_url", "photo", "photo_url"]);
  if (typeof direct === "string" && direct.trim()) {
    return direct.trim();
  }

  const imageId = pickFirst(row, ["image_id", "imageid"]);
  const template = process.env.NEXT_PUBLIC_ARTWORK_IMAGE_URL_TEMPLATE?.trim();
  if (typeof imageId === "string" && imageId.trim() && template) {
    const id = encodeURIComponent(imageId.trim());
    return template.replace(/\{id\}/g, id);
  }
  return undefined;
}

function parseImageUrls(raw: string | undefined): string[] {
  if (!raw) return [];
  const parts = raw
    .split(/[\n,|]+/g)
    .map((s) => s.trim())
    .filter(Boolean);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of parts) {
    if (!/^https?:\/\//i.test(p)) continue;
    try {
      const u = new URL(p);
      const href = u.toString();
      if (seen.has(href)) continue;
      seen.add(href);
      out.push(href);
    } catch {
      // ignore invalid segments
    }
  }
  return out;
}

function coerceRowToArtworkShape(row: Record<string, unknown>): Record<string, unknown> {
  const rawCollection = pickFirst(row, ["collection"]);
  const collection =
    typeof rawCollection === "string"
      ? rawCollection
      : Array.isArray(rawCollection)
        ? rawCollection
            .map((v) => (typeof v === "string" ? v.trim() : ""))
            .filter(Boolean)
            .join(", ")
        : undefined;

  return {
    // IMPORTANT: do not use `id` as slug. Prefer explicit `slug` column; otherwise derive from title.
    slug: pickFirst(row, ["slug"]),
    title: pickFirst(row, ["title", "name"]),
    lat: pickFirst(row, ["lat", "latitude"]),
    lng: pickFirst(row, ["lng", "lon", "longitude", "long"]),
    description: pickFirst(row, ["description", "details", "about"]),
    image: resolveImageField(row),
    address: pickFirst(row, ["address", "location", "street_address"]),
    category: pickFirst(row, ["category", "type"]),
    externalUrl: pickFirst(row, ["external_url", "url", "link", "website"]),
    year: pickFirst(row, ["year"]),
    artist: pickFirst(row, ["artist"]),
    commission: pickFirst(row, [
      "commission",
      "commissioned_by",
      "commission_by",
      "commissionedby",
    ]),
    collection,
  };
}

async function fetchCsvText(): Promise<string> {
  const url = env.SHEET_CSV_URL();
  if (!url) return "";
  const requestOptions = getRequestOptions();
  const res = await fetch(
    url,
    requestOptions,
  );
  if (!res.ok) {
    throw new Error(`Failed to fetch SHEET_CSV_URL (${res.status})`);
  }
  return await res.text();
}

function getRequestOptions(): FetchOptions {
  const seconds = env.REVALIDATE_SECONDS();
  return seconds === 0 ? { cache: "no-store" } : { next: { revalidate: seconds } };
}

async function fetchAirtableRows(): Promise<Record<string, unknown>[]> {
  const table = env.AIRTABLE_TABLE().trim();
  const view = env.AIRTABLE_VIEW().trim();
  if (!table) {
    throw new Error(
      "Airtable provider requires AIRTABLE_API_TOKEN, AIRTABLE_BASE_ID, and AIRTABLE_TABLE.",
    );
  }

  const records = await listAirtableRecords({
    table,
    view: view || undefined,
  });

  return records.map((r) => ({
    __record_id: r.id,
    ...r.fields,
  }));
}

async function fetchAirtableCollectionNameByRecordId(): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const records = await listAirtableCollectionRecords();

  for (const record of records) {
    const normalized = normalizeRowKeys(record.fields);
    const name = pickFirst(normalized, ["name", "title", "collection", "collection_name"]);
    if (typeof name === "string" && name.trim()) {
      out.set(record.id, name.trim());
    }
  }

  return out;
}

function parseCsvRows(csvText: string): Record<string, unknown>[] {
  const parsed = Papa.parse<Record<string, unknown>>(csvText, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });
  return parsed.data;
}

async function readSourceRows(provider: Provider): Promise<Record<string, unknown>[]> {
  if (provider === "airtable") {
    return await fetchAirtableRows();
  }
  const csvText = await fetchCsvText();
  if (!csvText) return [];
  return parseCsvRows(csvText);
}

async function loadArtworks(): Promise<Artwork[]> {
  const provider = env.DATA_PROVIDER();
  const rows = await readSourceRows(provider);
  const collectionNameByRecordId =
    provider === "airtable" ? await fetchAirtableCollectionNameByRecordId() : new Map<string, string>();

  const results: Artwork[] = [];
  const usedSlugs = new Set<string>();
  for (const row of rows) {
    const normalized = normalizeRowKeys(row);
    const coerced = coerceRowToArtworkShape(normalized);
    if (provider === "airtable" && typeof coerced.collection === "string") {
      const ids = coerced.collection
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
      if (ids.length > 0 && ids.every((id) => /^rec[a-zA-Z0-9]{10,}$/.test(id))) {
        const names = ids
          .map((id) => collectionNameByRecordId.get(id))
          .filter((v): v is string => !!v);
        if (names.length) {
          coerced.collection = names.join(", ");
        }
      }
    }

    // If id/slug is missing, derive from title (best effort).
    const rawSlug = coerced.slug;
    const hasSlug =
      typeof rawSlug === "string" ? Boolean(rawSlug.trim()) : rawSlug !== undefined;
    if (!hasSlug) {
      const title = coerced.title;
      if (typeof title === "string" && title.trim()) {
        const base = slugify(title) || "artwork";
        let candidate = base;
        let i = 2;
        while (usedSlugs.has(candidate)) {
          candidate = `${base}-${i++}`;
        }
        coerced.slug = candidate;
      }
    }

    const maybe = rawArtworkSchema.safeParse(coerced);
    if (!maybe.success) continue;
    usedSlugs.add(maybe.data.slug);
    const images = parseImageUrls(maybe.data.image);
    results.push({
      ...maybe.data,
      images: images.length ? images : undefined,
      image: images[0] ?? undefined,
    });
  }

  results.sort((a, b) => a.title.localeCompare(b.title));
  return results;
}

function artworksCacheKeyParts(): string[] {
  const provider = env.DATA_PROVIDER();
  if (provider === "airtable") {
    return [
      "artworks",
      "airtable",
      env.AIRTABLE_BASE_ID().trim(),
      env.AIRTABLE_TABLE().trim(),
      env.AIRTABLE_VIEW().trim(),
    ];
  }
  return ["artworks", "sheet", env.SHEET_CSV_URL()];
}

/**
 * Catalog loader. React `cache()` dedupes within a single request (e.g. generateMetadata + page).
 * `unstable_cache` reuses the parsed catalog across requests (Airtable always; sheet when revalidate > 0).
 */
export const getArtworks = cache(async (): Promise<Artwork[]> => {
  const provider = env.DATA_PROVIDER();

  if (provider === "airtable") {
    const revalidate = env.AIRTABLE_REVALIDATE_SECONDS();
    return unstable_cache(async () => loadArtworks(), artworksCacheKeyParts(), {
      revalidate,
      tags: ["artworks"],
    })();
  }

  const seconds = env.REVALIDATE_SECONDS();
  if (seconds === 0) {
    // Honor no-store sheet fetches; still request-deduped via React cache().
    return loadArtworks();
  }

  return unstable_cache(async () => loadArtworks(), artworksCacheKeyParts(), {
    revalidate: seconds,
    tags: ["artworks"],
  })();
});

export async function getArtworkBySlug(slug: string): Promise<Artwork | null> {
  const artworks = await getArtworks();
  return artworks.find((a) => a.slug === slug) ?? null;
}

