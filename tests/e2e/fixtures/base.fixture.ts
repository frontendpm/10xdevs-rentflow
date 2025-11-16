import AxeBuilder from "@axe-core/playwright";
import { test as base } from "@playwright/test";

/**
 * Rozszerzony fixture dla testów E2E
 * Zawiera dodatkowe narzędzia dostępne we wszystkich testach
 */
export const test = base.extend<{
  /**
   * AxeBuilder dla testów dostępności
   */
  axe: AxeBuilder;
}>({
  axe: async ({ page }, use) => {
    const axe = new AxeBuilder({ page });
    await use(axe);
  },
});

export { expect } from "@playwright/test";

/**
 * Helper do wykonywania testów dostępności
 */
export async function checkAccessibility(axe: AxeBuilder) {
  const results = await axe.analyze();
  return {
    violations: results.violations,
    passes: results.passes.length,
    hasViolations: results.violations.length > 0,
  };
}
