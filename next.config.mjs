/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // Engine source uses NodeNext-style ".js" import specifiers that point at ".ts"
  // files. Teach webpack to resolve them, and keep the native/server SDKs out of
  // the bundle (they must run in Node, never the client).
  serverExternalPackages: [
    "@croo-network/sdk",
    "@earendil-works/pi-ai",
    "@earendil-works/pi-agent-core",
  ],
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};
export default nextConfig;
