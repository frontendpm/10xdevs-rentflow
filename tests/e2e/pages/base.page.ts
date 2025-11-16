import { type Locator, type Page } from "@playwright/test";

/**
 * Bazowa klasa Page Object Model
 * Wszystkie page objects powinny dziedziczyć z tej klasy
 */
export abstract class BasePage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Nawiguj do strony
   */
  abstract goto(): Promise<void>;

  /**
   * Sprawdź czy strona jest załadowana
   */
  abstract isLoaded(): Promise<boolean>;

  /**
   * Poczekaj na załadowanie strony
   */
  async waitForLoad(): Promise<void> {
    await this.page.waitForLoadState("networkidle");
  }

  /**
   * Pobierz tytuł strony
   */
  async getTitle(): Promise<string> {
    return this.page.title();
  }

  /**
   * Pobierz aktualny URL
   */
  getUrl(): string {
    return this.page.url();
  }

  /**
   * Wykonaj zrzut ekranu
   */
  async takeScreenshot(name: string): Promise<void> {
    await this.page.screenshot({ path: `test-results/screenshots/${name}.png` });
  }

  /**
   * Helper do znajdowania elementów po test-id
   */
  getByTestId(testId: string): Locator {
    return this.page.getByTestId(testId);
  }

  /**
   * Helper do znajdowania elementów po roli ARIA
   */
  getByRole(role: Parameters<Page["getByRole"]>[0], options?: Parameters<Page["getByRole"]>[1]): Locator {
    return this.page.getByRole(role, options);
  }

  /**
   * Helper do znajdowania elementów po tekście
   */
  getByText(text: string | RegExp): Locator {
    return this.page.getByText(text);
  }
}
