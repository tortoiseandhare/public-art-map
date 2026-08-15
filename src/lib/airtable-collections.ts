import { listAirtableCollectionRecords } from "@/lib/airtable-client";
import { slugify } from "@/lib/sheet";

export type CollectionSeoFields = {
  name: string;
  description?: string;
};

function normalizeRowKeys(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    const key = k.trim().toLowerCase().replace(/\s+/g, "_");
    out[key] = typeof v === "string" ? v.trim() : v;
  }
  return out;
}

function pickFirstString(row: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = row[key];
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

function normalizeForCompare(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Shared Collections table rows (same Airtable list cache as artwork name resolution). */
async function fetchCollectionRows(): Promise<Record<string, unknown>[]> {
  const records = await listAirtableCollectionRecords();
  return records.map((r) => r.fields);
}

export async function getCollectionSeoByName(
  collectionName: string,
): Promise<CollectionSeoFields | null> {
  const target = normalizeForCompare(collectionName);
  const targetSlug = slugify(collectionName);
  if (!target) return null;

  const rows = await fetchCollectionRows();
  for (const row of rows) {
    const normalized = normalizeRowKeys(row);
    const name = pickFirstString(normalized, [
      "name",
      "title",
      "collection",
      "collection_name",
      "collection_title",
    ]);
    if (!name) continue;
    const nameMatches = normalizeForCompare(name) === target;
    const derivedSlugMatches = !!targetSlug && slugify(name) === targetSlug;
    if (!nameMatches && !derivedSlugMatches) continue;

    const description = pickFirstString(normalized, [
      "description",
      "seo_description",
      "meta_description",
      "summary",
    ]);
    return {
      name,
      description,
    };
  }

  return null;
}

export async function getCollectionSeoMapByName(
  collectionNames: string[],
): Promise<Map<string, CollectionSeoFields>> {
  const rows = await fetchCollectionRows();
  if (!rows.length || !collectionNames.length) return new Map();

  const byNormalizedName = new Map<string, CollectionSeoFields>();
  for (const row of rows) {
    const normalized = normalizeRowKeys(row);
    const name = pickFirstString(normalized, [
      "name",
      "title",
      "collection",
      "collection_name",
      "collection_title",
    ]);
    if (!name) continue;
    const description = pickFirstString(normalized, [
      "description",
      "seo_description",
      "meta_description",
      "summary",
    ]);
    byNormalizedName.set(normalizeForCompare(name), { name, description });
  }

  const out = new Map<string, CollectionSeoFields>();
  for (const sourceName of collectionNames) {
    const key = normalizeForCompare(sourceName);
    const direct = byNormalizedName.get(key);
    if (direct) {
      out.set(sourceName, direct);
      continue;
    }
    const sourceSlug = slugify(sourceName);
    const fuzzy = [...byNormalizedName.values()].find((entry) => slugify(entry.name) === sourceSlug);
    if (fuzzy) out.set(sourceName, fuzzy);
  }
  return out;
}
