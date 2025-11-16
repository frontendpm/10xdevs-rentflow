/// <reference types="vitest" />
import { getViteConfig } from "astro/config";
import react from "@vitejs/plugin-react";

export default getViteConfig({
  plugins: [react()],
  test: {
    /* Środowisko testowe */
    environment: "jsdom",

    /* Pliki setup uruchamiane przed każdym testem */
    setupFiles: ["./tests/setup.ts"],

    /* Wzorce plików testowych */
    include: ["src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}", "tests/unit/**/*.{test,spec}.{js,ts,jsx,tsx}"],

    /* Wykluczenia */
    exclude: ["node_modules", "dist", ".astro", "tests/e2e/**"],

    /* Globalne API (describe, it, expect) */
    globals: true,

    /* Coverage - uruchamiany na żądanie (--coverage) */
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      reportsDirectory: "./coverage",
      exclude: [
        "node_modules/",
        "dist/",
        ".astro/",
        "tests/",
        "**/*.d.ts",
        "**/*.config.{js,ts,mjs}",
        "**/types.ts",
        "src/components/ui/**", // Shadcn/ui components
      ],
    },

    /* Timeout dla testów (ms) */
    testTimeout: 10000,

    /* Reporter dla CI/lokalnego uruchomienia */
    reporters: ["verbose"],

    /* Ścieżki aliasów - zgodne z tsconfig */
    alias: {
      "@/": new URL("./src/", import.meta.url).pathname,
    },
  },
});
