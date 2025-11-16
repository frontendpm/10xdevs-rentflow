import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Automatyczne czyszczenie po każdym teście
afterEach(() => {
  cleanup();
});

// Mock dla matchMedia (wymagany przez niektóre komponenty UI)
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock dla ResizeObserver (wymagany przez Radix UI)
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock dla IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock dla scrollTo
window.scrollTo = vi.fn();

// Wyłącz console.error dla oczekiwanych błędów w testach
const originalError = console.error;
console.error = (...args: unknown[]) => {
  // Ignoruj błędy act() z React Testing Library
  if (typeof args[0] === "string" && args[0].includes("act(")) {
    return;
  }
  originalError.call(console, ...args);
};
