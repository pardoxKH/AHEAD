import type { NextConfig } from "next";

interface WebpackConfig {
  resolve: { extensionAlias?: Record<string, string[]> };
  module: { rules: unknown[] };
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Workspace packages are TypeScript source; let Next compile them.
  transpilePackages: ["@ahead/db", "@ahead/google"],
  // Built with webpack (`--webpack`): the packages import siblings with NodeNext `.js` suffixes,
  // which Turbopack does not map to `.ts` files.
  webpack: (config: WebpackConfig) => {
    config.resolve.extensionAlias = { ".js": [".ts", ".tsx", ".js"] };
    // @ahead/db's migrate.ts points at its SQL folder with `new URL("../drizzle", import.meta.url)`.
    // The app never runs migrations itself (the start script does), so don't bundle that folder.
    config.module.rules.push({
      test: /[\\/]packages[\\/]db[\\/]src[\\/]migrate\.ts$/,
      parser: { url: false },
    });
    return config;
  },
};

export default nextConfig;
