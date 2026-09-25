import { fileURLToPath } from "node:url";
const apiOrigin = (process.env.API_ORIGIN || "http://localhost:3001").replace(
  /\/$/,
  "",
);
if (!/^https?:\/\//.test(apiOrigin))
  throw new Error("API_ORIGIN deve ser uma URL HTTP(S) absoluta.");

export default {
  poweredByHeader: false,
  turbopack: { root: fileURLToPath(new URL("../..", import.meta.url)) },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiOrigin}/:path*` }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};
