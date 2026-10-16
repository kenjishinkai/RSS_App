import type { NextConfig } from "next";

/** ブラウザから見える API は /backend/*（同一オリジン）。実体はこの URL へ転送する。 */
const backendProxyTarget = (
  process.env.BACKEND_PROXY_URL ??
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "http://127.0.0.1:8000"
).replace(/\/$/, "");

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  async rewrites() {
    return [
      {
        source: "/backend/:path*",
        destination: `${backendProxyTarget}/:path*`,
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
