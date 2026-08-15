function optional(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() ? value : undefined;
}

function normalizeOrigin(raw: string): string {
  // Keep only scheme + host (+ port). Also strips trailing slash.
  try {
    return new URL(raw).origin;
  } catch {
    // Allow passing bare domains like "map.creativewaco.org"
    const withScheme = raw.startsWith("http://") || raw.startsWith("https://") ? raw : `https://${raw}`;
    return new URL(withScheme).origin;
  }
}

/**
 * Public `/submit` + home submit CTA. **Default on** (no Vercel env required).
 * Set `NEXT_PUBLIC_SUBMIT_ENABLED` to `false` or `0` to disable and redirect `/submit` → `/`.
 * Safe in client components (only reads `NEXT_PUBLIC_*`).
 */
export function isSubmitPublicArtEnabled(): boolean {
  const v = optional("NEXT_PUBLIC_SUBMIT_ENABLED");
  if (v === "false" || v === "0") return false;
  return true;
}

export const env = {
  /** `sheet` (default) or `airtable` for artwork read source. */
  DATA_PROVIDER: (): "sheet" | "airtable" =>
    optional("DATA_PROVIDER") === "airtable" ? "airtable" : "sheet",
  NEXT_PUBLIC_SITE_URL: () =>
    normalizeOrigin(
      optional("NEXT_PUBLIC_SITE_URL") ??
        (process.env.VERCEL_ENV === "production"
          ? // Prefer the custom domain for canonical URLs on production.
            // (VERCEL_URL is the deployment *.vercel.app URL.)
            optional("VERCEL_PROJECT_PRODUCTION_URL") ?? "https://map.creativewaco.org"
          : // Vercel provides VERCEL_URL as "<project>.vercel.app" (no scheme)
            optional("VERCEL_URL") ??
            (process.env.NODE_ENV === "production"
              ? "https://map.creativewaco.org"
              : "http://localhost:3000")),
    ),
  SHEET_CSV_URL: () => optional("SHEET_CSV_URL") ?? "",
  AIRTABLE_API_TOKEN: () => optional("AIRTABLE_API_TOKEN") ?? "",
  AIRTABLE_BASE_ID: () => optional("AIRTABLE_BASE_ID") ?? "",
  AIRTABLE_TABLE: () => optional("AIRTABLE_TABLE") ?? "Artworks",
  AIRTABLE_VIEW: () => optional("AIRTABLE_VIEW") ?? "",
  NEXT_PUBLIC_MAPBOX_TOKEN: () => optional("NEXT_PUBLIC_MAPBOX_TOKEN") ?? "",
  /**
   * Mapbox Studio default for this app. Override with `NEXT_PUBLIC_MAPBOX_STYLE_URL` (e.g. on Vercel).
   * https://studio.mapbox.com
   */
  NEXT_PUBLIC_MAPBOX_STYLE_URL: () =>
    optional("NEXT_PUBLIC_MAPBOX_STYLE_URL") ??
    "mapbox://styles/joshrizzocw/cmodpjicm00bv01scddibghqk",
  /** If true, attempt to geocode address when lat/lng missing. */
  GEOCODE_MISSING_COORDS: () => {
    const raw = optional("GEOCODE_MISSING_COORDS");
    if (!raw) return false;
    return raw === "1" || raw.toLowerCase() === "true" || raw.toLowerCase() === "yes";
  },
  /** 0 = fetch CSV on every request (no Next.js fetch cache). */
  REVALIDATE_SECONDS: () => {
    const raw = process.env.REVALIDATE_SECONDS;
    if (!raw) return 300;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return 300;
    if (parsed === 0) return 0;
    return parsed > 0 ? parsed : 300;
  },
  /**
   * Revalidate window for Airtable API reads.
   * Same as `REVALIDATE_SECONDS`, but floors `0` to **300** so Airtable never uses
   * `cache: "no-store"` (sheet CSV may still honor `0`).
   */
  AIRTABLE_REVALIDATE_SECONDS: (): number => {
    const seconds = env.REVALIDATE_SECONDS();
    return seconds === 0 ? 300 : seconds;
  },
  EMBED_ALLOWED_ORIGINS: () =>
    (process.env.EMBED_ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),

  /** Google Sheet ID (from the spreadsheet URL). Required for admin row updates. */
  SHEET_ID: () => optional("SHEET_ID") ?? "",
  /**
   * Same tab/range as scripts (e.g. `'Live Sheet'!A:Z`). Must include header row + data.
   */
  SHEET_ADMIN_RANGE: () =>
    optional("SHEET_ADMIN_RANGE") ?? "'Live Sheet'!A:Z",
  /** Tab/range for public submission rows (`append` after finalize). Header row required. */
  SHEET_SUBMISSIONS_RANGE: () =>
    optional("SHEET_SUBMISSIONS_RANGE") ?? "'Submissions'!A:Z",
  /** Full JSON for a Google Cloud service account that has Editor access to the sheet. */
  GOOGLE_SERVICE_ACCOUNT_JSON: () =>
    optional("GOOGLE_SERVICE_ACCOUNT_JSON") ?? "",
  /** Apps Script URL for sheet row updates (used when SHEET_ID / GOOGLE_SERVICE_ACCOUNT_JSON incomplete). */
  SHEET_EDIT_API_URL: () => optional("SHEET_EDIT_API_URL") ?? "",
  /** Token your Apps Script validates (sent only server-side in the POST body). */
  SHEET_EDIT_API_TOKEN: () => optional("SHEET_EDIT_API_TOKEN") ?? "",

  /** Plain password for `/admin` UI + `/api/admin/*`. Set in production (e.g. Vercel). */
  ADMIN_PASSWORD: () => optional("ADMIN_PASSWORD") ?? "",
  /**
   * Public `/submit` + home submit CTA. **Default on** (no env needed on Vercel).
   * Set `NEXT_PUBLIC_SUBMIT_ENABLED` to `false` or `0` to disable and redirect `/submit` → `/`.
   */
  submitPublicArtEnabled: () => isSubmitPublicArtEnabled(),
};
