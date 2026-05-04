/**
 * Custom Next.js image loader: Cloudinary URLs are resized/format-optimized on
 * Cloudinary so requests bypass `/_next/image` (reduces Vercel Image
 * Transformations usage). Other URLs keep using the built-in optimizer.
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
  return nextImageOptimizerUrl(src, width, q);
}
