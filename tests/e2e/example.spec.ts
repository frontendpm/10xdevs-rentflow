import { expect, test } from "@playwright/test";

/**
 * Przykładowe testy E2E
 * Demonstrują podstawowe wzorce testowania w Playwright
 */
test.describe("Example E2E Tests", () => {
  test("should load the home page", async ({ page }) => {
    // Navigate to home page
    await page.goto("/");

    // Wait for page to load
    await page.waitForLoadState("networkidle");

    // Check that page has loaded
    await expect(page).toHaveURL("/");
  });

  test("should have correct page title", async ({ page }) => {
    // Navigate to home page
    await page.goto("/");

    // Check page title contains expected text
    await expect(page).toHaveTitle(/Rentflow|10x/i);
  });

  test("should be accessible via keyboard", async ({ page }) => {
    // Navigate to home page
    await page.goto("/");

    // Tab through focusable elements
    await page.keyboard.press("Tab");

    // Check that an element is focused
    const focusedElement = page.locator(":focus");
    await expect(focusedElement).toBeVisible();
  });

  test.describe("Responsive Design", () => {
    test("should work on mobile viewport", async ({ page }) => {
      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });

      // Navigate to home page
      await page.goto("/");

      // Page should still be accessible
      await expect(page).toHaveURL("/");
    });

    test("should work on tablet viewport", async ({ page }) => {
      // Set tablet viewport
      await page.setViewportSize({ width: 768, height: 1024 });

      // Navigate to home page
      await page.goto("/");

      // Page should still be accessible
      await expect(page).toHaveURL("/");
    });
  });
});
