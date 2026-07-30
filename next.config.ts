import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Artwork/proof uploads go through server actions.
      bodySizeLimit: "50mb",
    },
  },
};

export default nextConfig;
