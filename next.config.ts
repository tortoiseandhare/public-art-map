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
    return [
      {
        source: "/embed/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            // Allow iframe embedding from any ancestor origin (`*` cannot be combined with other sources).
            value: `frame-ancestors *;`,
          },
        ],
      },
    ];
  },
};

export default withBundleAnalyzer(nextConfig);
