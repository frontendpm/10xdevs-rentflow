import { describe, expect, it } from "vitest";

/**
 * Przykładowy test jednostkowy
 * Demonstruje podstawowe wzorce testowania w Vitest
 */
describe("Example Unit Tests", () => {
  describe("Basic Assertions", () => {
    it("should pass a simple equality check", () => {
      // Arrange
      const expected = 4;

      // Act
      const result = 2 + 2;

      // Assert
      expect(result).toBe(expected);
    });

    it("should check object equality", () => {
      // Arrange
      const user = {
        id: "1",
        email: "test@example.com",
        role: "owner" as const,
      };

      // Act & Assert
      expect(user).toEqual({
        id: "1",
        email: "test@example.com",
        role: "owner",
      });
    });

    it("should check array contents", () => {
      // Arrange
      const items = ["czynsz", "rachunek", "inne"];

      // Assert
      expect(items).toContain("czynsz");
      expect(items).toHaveLength(3);
    });
  });

  describe("Async Operations", () => {
    it("should handle async functions", async () => {
      // Arrange
      const fetchData = async () => {
        return Promise.resolve({ status: "success" });
      };

      // Act
      const result = await fetchData();

      // Assert
      expect(result).toHaveProperty("status", "success");
    });

    it("should handle rejected promises", async () => {
      // Arrange
      const failingOperation = async () => {
        throw new Error("Operation failed");
      };

      // Act & Assert
      await expect(failingOperation()).rejects.toThrow("Operation failed");
    });
  });

  describe("Type Checking", () => {
    it("should validate types", () => {
      // Arrange
      const value: unknown = "string value";

      // Assert
      expect(typeof value).toBe("string");
      expect(value).toBeTypeOf("string");
    });
  });
});
