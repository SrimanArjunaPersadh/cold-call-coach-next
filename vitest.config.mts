import { defineConfig } from "vitest/config"

// Phase 2 tests one pure, dependency-free function (§6), so this is deliberately
// bare: no jsdom, no React plugin, no path-alias plugin. Component tests, if
// they ever arrive, bring their own configuration with them.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
})
