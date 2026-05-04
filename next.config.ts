import type { NextConfig } from "next";

const withBundleAnalyzer =
  process.env.ANALYZE === "true"
    ? // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("@next/bundle-analyzer")({ enabled: true })
    : (cfg: NextConfig) => cfg;

const nextConfig: NextConfig = {
  experimental: {
    viewTransition: true,
  },
  images: {
    loader: "custom",
    loaderFile: "./src/lib/image-loader.ts",
    /** Stable sheet/CDN URLs — improves cache hits on remaining `/_next/image` requests. */
    minimumCacheTTL: 60 * 60 * 24 * 7,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
  async headers() {
    const allowed = new Set<string>([
      "https://creativewaco.org",
      "https://www.creativewaco.org",
    ]);

    for (const origin of (process.env.EMBED_ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)) {
      allowed.add(origin);
    }

    const frameAncestors = ["'self'", ...Array.from(allowed)].join(" ");

    return [
      {
        source: "/embed/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: `frame-ancestors ${frameAncestors};`,
          },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
};

export default withBundleAnalyzer(nextConfig);
