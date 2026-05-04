# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Vercel Web Analytics instrumentation via `@vercel/analytics/next`.
- Airtable data provider support for artwork reads (`DATA_PROVIDER=airtable`) with base/table/view env configuration and paginated API fetching.
- Airtable attachment image ingestion in the artwork loader (attachment arrays now resolve to image URL lists the UI can render directly).
- Expanded `/api/health` diagnostics with provider/config visibility and Airtable field compatibility checks (required/recommended/optional + alias readiness).
- **`ArtworkMapPreview`** (`src/components/ArtworkMapPreview.tsx`): portaled **map selection preview** for the home map (title, image, prev/next, links) positioned from the map projection and sized to the available map column.
- **Collections browsing routes:** add `/collections` index and `/collections/[slug]` fullscreen map pages with collection metadata, JSON-LD, and slug-stable routing from sheet collection names.
- **Collection map experience:** add a bottom artwork carousel, previous/next collection controls, and map/detail link context that preserves the selected collection via `coll=` query state.
- **Collection metadata integration:** add Airtable collection metadata reads from **`Public Art Map Collections`** for collection descriptions and SEO copy, with UI support on `/collections` cards and `/collections/[slug]` summary/footer.

### Fixed

- Airtable API error reporting now includes upstream error type/message (for example `VIEW_NAME_NOT_FOUND`) instead of only HTTP status.
- Health checks now aggregate Airtable fields across sampled records so sparse rows do not produce false “missing column” signals.
- **Airtable linked collection labels:** resolve linked-record IDs (`rec...`) to human collection names so `/collections` no longer shows raw Airtable record IDs.
- **Artwork detail map backdrop:** fix broken static-map background rendering on `/art/[slug]` so map imagery appears instead of a flat gray background.
- **Collections index cards:** remove the secondary **View on map** link so each card has a single primary action and cleaner vertical spacing.
- **Home `art=` in the address bar:** compare `router.replace` deduping to the **real** query string so `art=<slug>` actually syncs when you select a list row or map marker.
- **Map preview flicker / double URL updates:** merge the two **`pushFilterUrl` effects** into one so a single selection does not fire **`router.replace` twice**; derive facet state from the query string **with `art` stripped** so syncing **`art=`** does not rebuild **`filtered`** and retrigger map effects.
- **Map popup teardown:** keep **`homeQueryString`** off the popup effect dependency list and read it from a **ref** so URL-only updates do not remove and rebuild the popup for the same artwork.
- **Map overview on first paint:** register **`load` and `idle`** before the first **`fitBounds`** so the camera still runs when the style finishes before `once("load")` is attached (avoids staying on the default center until a pin click).
- **Map overview after closing preview:** increment **`previewClosedSignal`** from the home page when preview selection clears, and consume it in **`MapView`**, so **`fitBounds`** reliably returns to **all markers for the current filter** after **×** or map background (works with **`map.stop()`** so an in-flight **`flyTo`** does not block **`fitBounds`**).
- **Map camera with filters + a selected artwork:** while the list is **narrowed** and a pin/row (or URL artwork) is active, **skip** the wide **`fitBounds`** pass so **`flyTo`** keeps that artwork in frame; the wide pass runs again when the preview clears or when nothing is selected.
- **Stable map effect deps:** use **`artworksSlugsKey`** / **`boundsKey`** and a **`router` ref** for the popup so referential churn does not constantly recreate the Mapbox popup.
- **Selected dot on first load:** apply the “focused” circle styling once the Mapbox layer exists (handles **URL `art=`** selection on first paint).
- **Preview arrow visibility:** allow the arrow to extend outside the rounded card (inner wrapper keeps content clipped, arrow stays visible).
- **Arrow-to-dot alignment:** compute the camera offset relative to the **padded** map viewport so the selected dot sits under the arrow even with the floating panel.

### Changed

- `next/image` now uses a custom loader: Cloudinary delivery URLs are resized/format-optimized by Cloudinary (bypassing `/_next/image` where possible) and other URLs fall back to the built-in optimizer; set a 7-day `minimumCacheTTL`.
- **`NEXT_PUBLIC_SUBMIT_ENABLED`** semantics: public submit (`/submit` + CTAs) is **on by default**; set to **`false`** or **`0`** to disable (previously required **`true`** with no env entry treated as off).
- Public **`/submit`** replaces the in-app Cloudinary upload form with an **embedded Airtable** “New Public Artwork Submission” form; the iframe uses a **responsive height** (`clamp(480px, 75dvh, 1200px)`) because cross-origin embeds cannot auto-size to form content.
- Admin map editing is now read-only: `/api/admin/sheet-row` returns `410`, save behavior is removed from the admin map editor, and docs now direct map updates through Airtable workflows.
- README now documents Airtable-first read configuration, locked Airtable schema expectations, and disabled admin write semantics.
- **Collection page SEO:** `/collections/[slug]` titles now use **`{Collection Name} Collection - Waco Public Art Map`** and descriptions pull from the Airtable collections table.
- **Runtime geocoding:** remove app-side fallback geocoding for missing coordinates; the app now expects `lat`/`lng` to be populated in source data (for example via Airtable automation).
- **Collection map layout:** tune fullscreen map/footer spacing and clamp preview bounds so the selected artwork card stays clear of the top/bottom chrome while keeping marker-arrow alignment.
- **Artwork SEO (`/art/[slug]`):** document titles use **`{title} - {artist} - Waco Public Art Map`** (absolute title; artist segment omitted when blank); meta descriptions combine **category, year,** and **description** from the sheet, with sensible fallbacks. Open Graph/Twitter titles match. **`/embed/art/[slug]`** uses the same title pattern for the `<title>` tag (still **noindex**).
- **Home map camera:** animate the **first** **`fitBounds`** overview for a **narrowed** list when no artwork is selected (same easing as the full-catalog overview).
- **`stripArtSlugFromQueryString`** in **`home-filter-url.ts`** to support facet parsing without **`art=`** churn.
- **Filter-selection sync effect** depends on **`filteredSlugsKey`** instead of **`filtered`** identity alone.
- **`SiteBrandBar`** / **`SiteNavigation`:** add **`data-site-brand-bar`** and **`data-site-nav`** hooks for tests or automation.
- **Home map preview:** replace the Mapbox **`Popup`** with a **portaled** React preview so the **map** (not the list) can be **dimmed** reliably; **ease** dim + map card chrome in/out instead of an instant cut.
- **Preview layout:** constrain preview **width** to the space beside the **floating list** and the viewport edge; let the **image** block **height** follow each photo (with a **viewport max-height** cap) instead of a fixed box with empty bands.
- **Default Mapbox style:** when **`NEXT_PUBLIC_MAPBOX_STYLE_URL`** is unset, fall back to this app’s **Creative Waco** Mapbox Studio style (override per deployment as needed).

## [0.2.0] - 2026-04-24

### Added

- **Home map URLs:** optional **`art=<slug>`** query parameter for the **selected artwork** (parsed on the server for first paint; the address bar updates when the highlighted list row or map preview changes).
- **`getArtSlugFromPageSearchParams`**, **`serializeHomeMapQueryString`**, and **`homeMapQueryStringsEqual`** in **`home-filter-url.ts`** to build and compare full home map query strings (filters + **`fs`** + **`art`**).
- **Home panel:** when exactly **one collection** facet is active, a short **Curated collection by** footer with the **Creative Waco** logo appears under the list.
- **`filterArtworksByHomeUrlQuery`** (`src/lib/home-filter-match.ts`) so **`/art/[slug]`** prev/next uses the same **facet + year** rules as the home map when the URL carries home filter query keys.
- **Artwork detail** (‹ ›) controls to step through the **current filtered set** (query string preserved); **map popup** (‹ ›) cycles **filtered** artworks; **Details** links from the home list and popup include the home **query string** (filters + **`fs`** when present).
- Google Sheet **`image`** cells may list **multiple https URLs** (comma/newline-separated); the parser fills **`images`** and keeps **`image`** as the first URL.
- Home hero section (headline + description + CTAs) above the interactive map.
- `pnpm psi` script (`scripts/psi.mjs`) to run PageSpeed Insights from the terminal.
- Home panel search input (refines the map + list).
- Home panel now toggles between **Filters** and **List** modes (only one visible at a time).
- Fullscreen map **Exit map** control (button) plus **Escape** key shortcut.
- Map home **filter query parameters** (`cat`, `comm`, `coll`, `ymin`, `ymax`) so filter state is **shareable** and works with **browser history**.
- **Admin** password sign-in (`ADMIN_PASSWORD`) with an **HTTP-only session cookie** (JWT via **`jose`**), **`POST /api/admin/auth`**, **`/admin/login`**, **middleware** protecting **`/admin`** and **`/api/admin/*`** (except the auth route), **Sign out** on the admin page, and an admin **toolbar**.
- **Admin** layout **site navigation** (Map, Art, optional Submit, Admin) for quick moves between sections.
- **`NEXT_PUBLIC_SUBMIT_ENABLED`**: when set to `true`, enables the home **Submit** control, **`/submit`**, and includes **`/submit`** in **`sitemap.xml`**; when off, **`/submit`** redirects to **`/`**.
- pnpm script **`test:sheet`** running **`scripts/test-sheet-connection.mjs`** to smoke-test sheet / Apps Script configuration (read-only checks when possible).
- Google Sheet **Submissions** tab: append submission rows on finalize (`src/lib/google-sheets-submissions.ts`), optional `SHEET_SUBMISSIONS_RANGE`, and `scripts/submissions-sheet-header-row.csv` for the header row template.
- Admin **Public submissions** reads completed submissions from that sheet tab (Google Sheets API) instead of Cloudinary metadata files.
- Artwork directory page at `/art` with search, category filtering, and sorting.
- Add `/art` to `sitemap.xml`.
- Public **submit** flow at `/submit` with `POST /api/submissions/prepare` and `POST /api/submissions/finalize` (Cloudinary photo uploads + Google Sheet row for metadata when Sheets API env is configured).
- Admin `/admin`: **Public submissions** (sheet-backed when configured), **Edit map info** (collapsible artwork list, dense form, image preview + replace via `POST /api/admin/cloudinary`; location is **address** or **latitude/longitude**, not both), with **stacked** full-width sections at all breakpoints.
- `POST /api/admin/sheet-row` for optional Google Sheet row patches (Apps Script web app or Google Sheets API; no caller secret — see `.env.example`).
- pnpm scripts: `download:drive-photos`, `images:web-ready`, `cloudinary:upload-web-ready`, `cloudinary:upload-and-update-sheet`, `cloudinary:order-csv-like-public-sheet`.
- Cloudinary admin endpoints:
  - `POST /api/admin/cloudinary` (convert + upload)
  - `GET /api/admin/cloudinary/library` (list images, scoped to `CLOUDINARY_FOLDER` when set)
- Cloudinary helpers:
  - `src/lib/cloudinary.ts` (signed uploads)
  - `src/lib/cloudinary-admin.ts` (Admin API listing)
- `sharp` dependency for server-side image processing.
- JSON API endpoints: `/api/health`, `/api/artworks` (supports `q`, `category`, `limit`), and `/api/artworks/[slug]`.
- Cloudinary migration helpers:
  - `scripts/migrate-maphub-to-cloudinary.mjs` (uploads MapHub image URLs; writes `cloudinary-image-urls.csv`)
  - `scripts/migrate-drive-to-cloudinary.mjs` (downloads Google Drive images; macOS `sips` conversion for HEIC/huge; writes `gdrive-cloudinary-image-urls.csv`)
- Address-based fallback geocoding (Mapbox) for sheet rows missing `lat`/`lng` (`GEOCODE_MISSING_COORDS=true`).
- Title-derived slug generation when the sheet `slug` column is blank (with de-duping suffixes).
- Artwork detail page **Nearby art** section (sorted by distance) with thumbnail tiles; distance is shown inline with the title.
- Geo helpers (`haversineDistanceKm`, `kmToMiles`) for computing “nearby” distances.
- **`SiteBrandBar`** (`src/components/SiteBrandBar.tsx`) and **`src/lib/site.ts`** (`SITE_PRODUCT_NAME`, default metadata title template) so **Public Art Map** + Creative Waco logo stay consistent on **home**, **`/art/[slug]`**, **404**, and the **embed** artwork header link.
- **View Transitions** (Next `experimental.viewTransition`) for **map home ↔ `/art/[slug]`** navigations, with **nav-forward** / **nav-back** CSS, shared **logo** `view-transition-name` anchor, and **Details** (list + map popup) / **← Map** / 404 back using `transitionTypes` on `Link` or `router.push`.
- **Art detail shell** (`art-detail-shell.module.css`): same **Creative Waco** wordmark; **centered** frosted **panel**; **page-level scroll** for long copy; **Mapbox Static Images** snapshot of the artwork’s **lat/lng** (same `NEXT_PUBLIC_MAPBOX_TOKEN` + `NEXT_PUBLIC_MAPBOX_STYLE_URL` as the map) with a **dark** top-to-bottom **overlay**; **gradient fallback** when the API is not used.
- **`mapbox-static.ts`**: build **Static Images** preview URLs (zoomed block context) for the detail backdrop.
- **Home list:** per-row **Details** control to open the SEO page with a **forward** view transition; main row still **selects** the map + popup.
- **Artwork detail** content in **section + `dl` / `dt` / `dd` blocks** for **Artist**, **Description**, **Placement** (commission + collection), and **Year**; **image placeholder** when there is no photo URL.
- **Tailwind CSS v4** with PostCSS (`postcss.config.mjs`), **shadcn/ui** (`components.json`, `cn` helper, sample `Button`), and **Tangerine**-aligned design tokens in `globals.css` (imported theme registry URL).
- **Theme-aware Mapbox UI**: marker and popup styles via CSS modules using the same semantic color variables as the rest of the app.
- **Map popup preview** for the selected artwork (title, image when present, links) anchored above the marker; selection clears when clicking the map background.
- Smooth **fly-to** animation when selecting an artwork from the list or a marker.
- Fullscreen Mapbox map with a floating left panel and marker highlighting.
- **Filters** (collapsible): **category** (pill toggles + map colors), **commission**, **collection**, and **year** range; badge and **Clear** when refinements are active.
- **Marker and list dot colors** by category (`category-colors`); fixed hues for **Decommissioned art**, **Sculptures**, and **Fountains** so they stay distinct from green-heavy hash slots.
- Google Sheet **published CSV** ingestion with validation and flexible column mapping; optional **`image_id`** + **`NEXT_PUBLIC_ARTWORK_IMAGE_URL_TEMPLATE`** (`{id}`) when no direct image URL column.
- Sheet-backed fields on artworks: **year**, **artist**, **commission**, **collection**, **external URL** (`url` / `link` / `website` column variants) for the **map popup** and data (not a direct “More information” block on the detail card).
- SEO routes for artwork detail pages (`/art/[slug]`) and Webflow-friendly embed routes (`/embed/art/[slug]`).
- `sitemap.xml` + `robots.txt` generation based on current sheet rows.

### Changed

- **Home Clear filters:** also clears **search** and **map/list selection** so the UI returns to the full catalog in one step (including dropping **`art=`** from the URL when synced).
- **Home map camera:** when the map is showing the **full catalog** (every artwork in the sheet is in the filtered list), the camera stays on a single **`fitBounds`** that keeps **all markers visible** with **list/bottom-sheet padding** and **does not `flyTo`** on row or dot selection (popup still opens). When the list is **narrowed** by filters or search, selection still **`flyTo`**s the pin with the preview popup.
- **Home list:** subtle **background** on the **selected** row (no inset bar).
- **Curated collection** footer: **frosted** bar and padding when a single collection facet is active.
- **Home map selection:** when filters, year range, or search change, the map preview **follows the filtered list** (keeps the current artwork when it still matches, otherwise selects the first match, or clears when there are no refinements) instead of always clearing the selection.
- **Shareable home URLs** mount the interactive map when the URL includes **facet**, **year**, or **`art=`** parameters (not only **`fs=1`**), and **Details** / map popup links carry a **serialized home query** when the live client search string is still empty on first paint.
- **Map popup** preview: tighter spacing between the **title** and the **meta** line (artist/year/category), **bottom-aligned** header row with the close control, and a slightly smaller close button.
- Home landing styles: invert to a light background with dark text; keep **Explore the map** primary button hover as a primary gradient (avoid white hover fill).
- Home map now loads on interaction, and **Explore the map** expands the map into a full-viewport mode (scroll locked while active).
- Home landing layout redesigned (centered intro + rounded map card) and the interactive Mapbox map is now **deferred until clicking Explore the map** (poster image shown before load for better PageSpeed).
- Home route (`/`) is **server-rendered with `searchParams`** so the first response matches **shareable filter URLs** and **`/?fs=1`** deep links (replacing a single static shell for `/`).
- **← Map** / site **Map** nav / **404** / embed header link to **`/?fs=1`** so returning from detail lands in the same immersive map entry point.
- Desktop/tablet now auto-mounts the interactive map; mobile keeps click-to-load and enters fullscreen map layout after mounting.
- Home background updated to a site-wide dark gradient, with a subtle map-card glow.
- Home landing background includes a subtle **lighter top wash** so the fixed logo bar stays readable.
- Map dots are rendered as a Mapbox **GeoJSON layer** (instead of DOM markers) to reduce main-thread work.
- **`POST /api/admin/sheet-row`** prefers **direct Google Sheets API** updates when **`SHEET_ID`** + **`GOOGLE_SERVICE_ACCOUNT_JSON`** are configured; **Apps Script** (`SHEET_EDIT_API_URL` + token) is used **only** when that service-account path is incomplete.
- **`.env.example`**: documents **admin password** auth, **`NEXT_PUBLIC_SUBMIT_ENABLED`**, and **Sheets API–first** sheet edits (Apps Script as fallback).
- Public submission **finalize** persists metadata to the **Submissions** Google Sheet (requires `SHEET_ID` + `GOOGLE_SERVICE_ACCOUNT_JSON`); Cloudinary stores **photos only** (no `submission.json` raw asset).
- **Edit map info** admin UI: collapsible artwork picker (closed by default), tighter layout, and slug-based **Replace image** uploads.
- `POST /api/admin/sheet-row` no longer requires `ADMIN_SHEET_SECRET` (still protect publicly exposed deployments at the host).
- OpenGraph and Twitter images now render the hostname from `NEXT_PUBLIC_SITE_URL` (instead of a hardcoded domain).
- Admin `/admin` replaces the in-page Cloudinary **uploader** and **library grid** with **public submissions** + an **edit map info** scaffold (sheet writes still go through `POST /api/admin/sheet-row` when configured).
- Update one MapHub source URL to the smaller `544_400` variant.
- Stop treating the sheet `id` column as a slug source (only use `slug`, otherwise derive from `title`).
- Home list meta line now shows **Collection, Artist, Year** (no category/address).
- Category color overrides: **Murals** (yellow) and **Other** (blue) stay visually distinct.
- Show full artwork images (no crop) in the **detail panel**, **Nearby art** thumbnails, and the **map popup** preview.
- Increase the **map popup** preview size, with responsive sizing on mobile to avoid overflow.
- **Mobile home panel (bottom sheet):** reduce height from ~50% to ~30% of the viewport.
- **Map popup preview:** show **Artist, Year** (when available) in the meta line instead of category/address.
- **Branding copy:** visible product title is **Public Art Map** (replacing **Waco** in that label); browser titles use **`SITE_METADATA_DEFAULT_TITLE`** / **`SITE_METADATA_TITLE_TEMPLATE`** from `site.ts`.
- **Artwork detail (`/art/[slug]`):** same fixed **logo + title** chrome as the map home (via **`SiteBrandBar`**); removed the duplicate product label from the panel **← Map** row.
- **Home filters:** **Filters** `<details>` sits flush inside the panel (drop legacy negative horizontal margins); summary row is a compact bordered control with optional **active count** badge on the **right**; inner filter grid padding aligned with the panel.
- **Embed (`/embed/art/[slug]`):** header link to **`/`** labeled with **`SITE_PRODUCT_NAME`**.
- **Artwork detail page** layout and copy: removed **PUBLIC ART** kicker, visible **Placement** section title, **latitude/longitude** grid, and the **detail-page** external **More information** link (`externalUrl` still powers **Website →** on the **map popup** when set).
- **Facet selection pruning:** compute **effective** category/commission/collection sets with **`deriveFacetUi`** during render instead of **`useEffect`** + `setState` (avoids cascading-render lint while keeping impossible chip selections pruned).
- **Mapbox selection popup** (artwork preview on the map): **rounded corners**, **card** background, and **border / shadow** from the design system (overrides Mapbox’s default flat box).
- **Home filters:** add **collection** (sheet column) beside category and commission; facet toggles start **unselected** (no filtering on that dimension until you pick chips); selecting chips **includes** matching artworks (**OR** within each facet). **Any** clears one facet only (replaces prior **All / None** controls).
- **Responsive facet lists:** category, commission, and collection chips shown for each facet reflect the **other** facets plus the **year** range; selections that become invalid when options shrink are **pruned** automatically.
- **Visual theme**: map panel, filters, list, artwork detail cards, embed layout, art detail route, and not-found page use shared **semantic tokens** (foreground, muted, primary, card, border, shadows, radius) instead of hardcoded grays and accent hex values.
- Root fonts: **Inter**, **JetBrains Mono**, and **Source Serif 4** via `next/font/google` (replacing Geist) to match the theme stack.
- Left panel: **pinned header** (title + Filters) with a **scrollable list** below; **Showing X of Y** stays at the bottom of the scroll area with smaller type.
- **Map markers and sidebar list dots**: drop the dark **foreground border ring** (shadow only).
- **Filter fit**: when results change, the map **animates fitBounds** to filtered markers using **floating panel / bottom-sheet padding**, with **debouncing** so quick filter tweaks (e.g. year typing) trigger one camera move.
- Panel typography and controls unified (pill toggles for filters vs checkbox lists).
- **`REVALIDATE_SECONDS`**: **`0`** disables fetch caching (`cache: "no-store"`) for always-fresh CSV; otherwise ISR revalidation in seconds (default **300**).

### Removed

- Server-side Cloudinary upload of submission bundle **`submission.json`** (`uploadSubmissionMetadataJson`); submission records live in Google Sheets instead.
- **In-admin** Cloudinary **ImageUploader** and **CloudinaryLibrary** UI (upload + browse grid on `/admin`); server routes `POST /api/admin/cloudinary` and `GET /api/admin/cloudinary/library` remain for scripts and integrations.
- Apps Script–based live Google Sheet editing from `/admin`.
- **Map popup preview:** remove the **Embed →** link (embed routes still exist for Webflow iframes).
- Home floating **Submit Public Art** button (submit CTA lives in the intro when enabled).
- Home rotating featured artwork hero (replaced by a simpler intro + deferred map poster).
- Home map poster image placeholder (replaced by a lightweight “Tap to load map” button to reduce LCP impact on mobile).

### Fixed

- **Home map:** share links and filter changes **reframe the camera** reliably (reset cached **`fitBounds`** state when the map instance is torn down; popup camera waits on **`load`** and **`idle`** so the style is ready).
- **Pasted facet/year home URLs** stay aligned on the first client render when **`useSearchParams()`** is temporarily empty by reusing the **server-parsed** filter object until the live query string is available.
- **Facet URLs** normalize **`+`** as a space in category, commission, and collection query values so pasted links match sheet labels (e.g. `coll=sculpture+zoo` vs **Sculpture Zoo**).
- **Fullscreen map deep links:** opening **`/?fs=1`** (or a filter URL that includes **`fs=1`**) in a new tab restores the immersive map on **desktop and mobile**, and **`fs=1` is no longer dropped** on first map mount; **Explore the map** no longer needs a second tap when the URL flag raced hydration.
- **Browser history:** leaving **`fs=1`** via Back/Forward exits immersive map mode without an extra control press.
- Mobile fullscreen map: prevent “Exit map” from immediately re-entering fullscreen, and adjust button placement so it doesn’t overlap map UI.
- Map dots are clickable reliably by attaching the Mapbox layer click handler after the layer is added (and after style reloads).
- Cloudinary **signed upload** parameters for browser-direct `image/upload` and server `raw`/`image` uploads align with Cloudinary’s signature verification (omit `resource_type` from the signed parameter set for those endpoints).
- `sitemap.xml` and `robots.txt` now default to `https://map.creativewaco.org` in production (avoids `localhost` URLs when `NEXT_PUBLIC_SITE_URL` is unset).
- Add descriptive `alt` text to **Nearby art** thumbnails for better accessibility/SEO.
- Document required `NEXT_PUBLIC_MAPBOX_TOKEN` env var on Vercel to avoid client-side Mapbox GL initialization errors (“This page couldn’t load”).
- **Mobile map popup:** move the popup card further upward so the marker dot stays visible beneath it.
- **Map selection `flyTo`:** measure themed popup height off-DOM (plus tail slack) and use a **single smooth `flyTo`** with a vertical **`offset`** so the **popup card** (not just the marker) lands centered within the padded map chrome after selection.
- Mobile artwork popup uses a **bottom** anchor and upward offset so the tip sits **above** the marker and points **down** at it (not through the dot).
- Selection **flies straight** to the artwork (no intermediate refit-to-all-markers) and marker clicks stay selected (map background click no longer clears selection in the same gesture).
- Fix production build failure caused by duplicate route definitions (removed legacy `/(site)` route group).

### Security

- Restrict iframe embedding on `/embed/*` with `Content-Security-Policy: frame-ancestors` (defaults to Creative Waco domains, extensible via `EMBED_ALLOWED_ORIGINS`).
