import { defineConfig, devices } from "@playwright/test";

/**
 * Konfiguracja Playwright dla testów E2E
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  /* Katalog z testami E2E */
  testDir: "./tests/e2e",

  /* Maksymalny czas na pojedynczy test */
  timeout: 30 * 1000,

  /* Oczekiwanie na elementy */
  expect: {
    timeout: 5000,
  },

  /* Równoległe uruchamianie testów */
  fullyParallel: true,

  /* Nie ponawiaj testów na CI */
  forbidOnly: !!process.env.CI,

  /* Liczba ponownych prób przy niepowodzeniu */
  retries: process.env.CI ? 2 : 0,

  /* Liczba workerów */
  workers: process.env.CI ? 1 : undefined,

  /* Reporter */
  reporter: [["html", { outputFolder: "playwright-report" }], ["list"]],

  /* Globalna konfiguracja dla wszystkich testów */
  use: {
    /* Bazowy URL aplikacji */
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:4321",

    /* Zbieraj trace przy pierwszym ponowieniu */
    trace: "on-first-retry",

    /* Zrzuty ekranu przy niepowodzeniu */
    screenshot: "only-on-failure",

    /* Nagrywanie wideo przy niepowodzeniu */
    video: "retain-on-failure",

    /* Timeout dla akcji */
    actionTimeout: 10000,

    /* Timeout dla nawigacji */
    navigationTimeout: 30000,
  },

  /* Konfiguracja projektów/przeglądarek */
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
    /* Mobile viewport dla testów RWD */
    {
      name: "mobile-chrome",
      use: {
        ...devices["Pixel 5"],
      },
    },
  ],

  /* Serwer deweloperski - uruchamiany przed testami */
  webServer: {
    command: "npm run dev",
    url: "http://localhost:4321",
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },

  /* Katalog na wyniki testów */
  outputDir: "test-results",
});
