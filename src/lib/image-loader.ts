/**
 * Custom Next.js image loader: Cloudinary URLs are resized/format-optimized on
 * Cloudinary so requests bypass `/_next/image` (reduces Vercel Image
 * Transformations usage). Airtable attachment URLs are served directly (they
 * already provide CDN variants; Vercel re-optimizing them is wasted).
 * Other URLs keep using the built-in optimizer.
 *
 * @see https://nextjs.org/docs/app/api-reference/config/next-config-js/images#loaderfile
 */
import type { ImageLoaderProps } from "next/image";

function nextImageOptimizerUrl(src: string, width: number, quality: number): string {
  const params = new URLSearchParams();
  params.set("url", src);
  params.set("w", String(width));
  params.set("q", String(quality));
  return `/_next/image?${params.toString()}`;
}

function devWarnUsingNextImageOptimizer(src: string) {
  if (process.env.NODE_ENV === "production") return;
  if (typeof window === "undefined") return;

  let host = "";
  try {
    host = new URL(src).hostname || "";
  } catch {
    host = "(invalid-url)";
  }

  const g = globalThis as unknown as { __publicArtMapImageWarnedHosts?: Set<string> };
  if (!g.__publicArtMapImageWarnedHosts) g.__publicArtMapImageWarnedHosts = new Set();
  const key = host || "(unknown-host)";
  if (g.__publicArtMapImageWarnedHosts.has(key)) return;
  g.__publicArtMapImageWarnedHosts.add(key);

  console.warn(
    `[public-art-map] next/image is using Vercel image optimization for host "${key}". ` +
      `This counts toward Vercel Image Transformations. Source: ${src}`,
  );
}

function isAirtableAssetUrl(src: string): boolean {
  try {
    const u = new URL(src);
    const h = u.hostname.toLowerCase();
    return (
      h === "dl.airtable.com" ||
      h === "airtableusercontent.com" ||
      h.endsWith(".airtableusercontent.com")
    );
  } catch {
    return false;
  }
}

function airtableWithWidth(src: string, width: number, quality: number): string {
  // next/image requires the loader to vary by width. Airtable CDN URLs don't accept documented
  // width params, but adding a querystring satisfies the contract while still bypassing `/_next/image`.
  try {
    const u = new URL(src);
    u.searchParams.set("w", String(width));
    u.searchParams.set("q", String(quality));
    return u.toString();
  } catch {
    const joiner = src.includes("?") ? "&" : "?";
    return `${src}${joiner}w=${encodeURIComponent(String(width))}&q=${encodeURIComponent(String(quality))}`;
  }
}

function isCloudinaryDeliveryUrl(src: string): boolean {
  try {
    const u = new URL(src);
    return u.hostname === "res.cloudinary.com" && u.pathname.includes("/image/upload/");
  } catch {
    return false;
  }
}

/** Insert transformation segment immediately after `/image/upload/`. */
function cloudinaryWithAutoLimit(src: string, width: number): string {
  const marker = "/image/upload/";
  const at = src.indexOf(marker);
  if (at === -1) return src;
  const head = src.slice(0, at + marker.length);
  const tail = src.slice(at + marker.length);
  // `c_limit` keeps aspect ratio; width caps decoded pixels for layout (DPR handled via srcset widths).
  const transforms = `c_limit,w_${width},f_auto,q_auto/`;
  return `${head}${transforms}${tail}`;
}

export default function imageLoader({ src, width, quality }: ImageLoaderProps): string {
  const q = quality ?? 75;
  if (isCloudinaryDeliveryUrl(src)) {
    return cloudinaryWithAutoLimit(src, width);
  }
  if (isAirtableAssetUrl(src)) {
    // Airtable attachments are already CDN-hosted; avoid Vercel `/_next/image` billing.
    return airtableWithWidth(src, width, q);
  }
  devWarnUsingNextImageOptimizer(src);
  return nextImageOptimizerUrl(src, width, q);
}
