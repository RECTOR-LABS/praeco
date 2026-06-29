import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node", // engine tests; .tsx tests opt in via `// @vitest-environment jsdom`
    setupFiles: ["./test/setup.ts"],
    globals: true,
    include: ["src/**/*.test.ts", "server/**/*.test.ts", "components/**/*.test.{ts,tsx}", "app/**/*.test.{ts,tsx}", "test/**/*.test.ts"],
  },
  resolve: { alias: { "@": new URL(".", import.meta.url).pathname } },
});
