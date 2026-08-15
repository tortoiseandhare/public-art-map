import { unstable_cache } from "next/cache";
import { env } from "@/lib/env";

/** Linked-record / SEO metadata table used alongside Artworks. */
export const AIRTABLE_COLLECTIONS_TABLE = "Public Art Map Collections";

export type AirtableRecord = {
  id: string;
  fields: Record<string, unknown>;
};

export type ListAirtableRecordsOptions = {
  table: string;
  view?: string;
  /**
   * When true, missing config or non-OK responses return `[]` instead of throwing.
   * Used for optional tables (collections metadata).
   */
  softFail?: boolean;
};

/** Fetch cache options for Airtable reads — never `cache: "no-store"`. */
export function airtableFetchOptions(): { next: { revalidate: number } } {
  return { next: { revalidate: env.AIRTABLE_REVALIDATE_SECONDS() } };
}

async function fetchAirtableListPage(args: {
  token: string;
  baseId: string;
  table: string;
  view?: string;
  offset?: string;
}): Promise<{ records: AirtableRecord[]; offset?: string; ok: boolean; status: number; errorText?: string }> {
  const url = new URL(
    `https://api.airtable.com/v0/${encodeURIComponent(args.baseId)}/${encodeURIComponent(args.table)}`,
  );
  url.searchParams.set("pageSize", "100");
  if (args.view) url.searchParams.set("view", args.view);
  if (args.offset) url.searchParams.set("offset", args.offset);

  const res = await fetch(url.toString(), {
    ...airtableFetchOptions(),
    headers: { Authorization: `Bearer ${args.token}` },
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as
      | { error?: { type?: string; message?: string } }
      | null;
    const apiType = body?.error?.type?.trim();
    const apiMessage = body?.error?.message?.trim();
    const details = [apiType, apiMessage].filter(Boolean).join(": ");
    return {
      records: [],
      ok: false,
      status: res.status,
      errorText: details
        ? `Failed to fetch Airtable (${res.status}) - ${details}`
        : `Failed to fetch Airtable (${res.status})`,
    };
  }

  const json = (await res.json()) as {
    records?: Array<{ id?: string; fields?: Record<string, unknown> }>;
    offset?: string;
  };

  const records: AirtableRecord[] = [];
  for (const r of json.records ?? []) {
    const id = r.id?.trim();
    if (!id || !r.fields || typeof r.fields !== "object") continue;
    records.push({ id, fields: r.fields });
  }

  return { records, offset: json.offset, ok: true, status: res.status };
}

async function paginateAirtableList(args: {
  token: string;
  baseId: string;
  table: string;
  view: string;
}): Promise<AirtableRecord[]> {
  const records: AirtableRecord[] = [];
  let offset: string | undefined;

  do {
    const page = await fetchAirtableListPage({
      token: args.token,
      baseId: args.baseId,
      table: args.table,
      view: args.view || undefined,
      offset,
    });

    if (!page.ok) {
      throw new Error(page.errorText ?? `Failed to fetch Airtable (${page.status})`);
    }

    records.push(...page.records);
    offset = page.offset;
  } while (offset);

  return records;
}

/**
 * Paginated Airtable list for a table/view.
 * Dedupes across requests via `unstable_cache` (keyed by base/table/view).
 */
export async function listAirtableRecords(
  options: ListAirtableRecordsOptions,
): Promise<AirtableRecord[]> {
  const token = env.AIRTABLE_API_TOKEN().trim();
  const baseId = env.AIRTABLE_BASE_ID().trim();
  const table = options.table.trim();
  const view = (options.view ?? "").trim();
  const softFail = Boolean(options.softFail);
  const revalidate = env.AIRTABLE_REVALIDATE_SECONDS();

  if (!token || !baseId || !table) {
    if (softFail) return [];
    throw new Error(
      "Airtable provider requires AIRTABLE_API_TOKEN, AIRTABLE_BASE_ID, and a table name.",
    );
  }

  try {
    return await unstable_cache(
      async () =>
        paginateAirtableList({
          token,
          baseId,
          table,
          view,
        }),
      ["airtable-list", baseId, table, view],
      {
        revalidate,
        tags: [`airtable:${baseId}:${table}`],
      },
    )();
  } catch (error) {
    // Soft-fail outside the cache so transient API errors are not stored as `[]`.
    if (softFail) return [];
    throw error;
  }
}

/** Shared Collections table fetch (soft-fail; same cache as artwork collection-name resolution). */
export async function listAirtableCollectionRecords(): Promise<AirtableRecord[]> {
  return listAirtableRecords({
    table: AIRTABLE_COLLECTIONS_TABLE,
    softFail: true,
  });
}
