import { describe, expect, it } from "vitest";
import { hasActiveLease, hasAnyLease } from "./lease";
import type { ApartmentDetailsDTO, LeaseInfo, TenantInfo } from "@/types";

/**
 * Unit tests for lease utility functions
 * Tests cover business logic for checking lease status
 */

// =============================================================================
// TEST DATA FACTORIES
// =============================================================================

const createTenant = (overrides?: Partial<TenantInfo>): TenantInfo => ({
  id: "tenant-123",
  full_name: "Jan Kowalski",
  email: "jan@example.com",
  ...overrides,
});

const createLease = (
  status: "active" | "archived",
  overrides?: Partial<LeaseInfo>
): LeaseInfo => ({
  id: "lease-456",
  status,
  start_date: "2024-01-01",
  tenant: createTenant(),
  ...overrides,
});

const createApartment = (
  lease?: LeaseInfo
): ApartmentDetailsDTO => ({
  id: "apt-789",
  name: "Apartament Centrum",
  address: "ul. Główna 10, 00-001 Warszawa",
  owner_id: "owner-001",
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
  lease,
});

// =============================================================================
// hasActiveLease TESTS
// =============================================================================

describe("hasActiveLease", () => {
  describe("gdy najem nie istnieje", () => {
    it("powinno zwrócić false gdy lease jest undefined", () => {
      // Arrange
      const apartment = createApartment(undefined);

      // Act
      const result = hasActiveLease(apartment);

      // Assert
      expect(result).toBe(false);
    });

    it("powinno zwrócić false gdy lease jest explicit undefined", () => {
      // Arrange
      const apartment: ApartmentDetailsDTO = {
        ...createApartment(),
        lease: undefined,
      };

      // Act
      const result = hasActiveLease(apartment);

      // Assert
      expect(result).toBe(false);
    });
  });

  describe("gdy najem istnieje ze statusem active", () => {
    it("powinno zwrócić true dla aktywnego najmu", () => {
      // Arrange
      const apartment = createApartment(createLease("active"));

      // Act
      const result = hasActiveLease(apartment);

      // Assert
      expect(result).toBe(true);
    });

    it("powinno zwrócić true niezależnie od danych lokatora", () => {
      // Arrange
      const apartment = createApartment(
        createLease("active", {
          tenant: createTenant({
            id: "other-tenant",
            full_name: "Anna Nowak",
            email: "anna@test.pl",
          }),
        })
      );

      // Act
      const result = hasActiveLease(apartment);

      // Assert
      expect(result).toBe(true);
    });

    it("powinno zwrócić true niezależnie od daty rozpoczęcia", () => {
      // Arrange - stary najem
      const oldLease = createApartment(
        createLease("active", { start_date: "2020-01-01" })
      );

      // Arrange - nowy najem
      const newLease = createApartment(
        createLease("active", { start_date: "2025-01-01" })
      );

      // Act & Assert
      expect(hasActiveLease(oldLease)).toBe(true);
      expect(hasActiveLease(newLease)).toBe(true);
    });
  });

  describe("gdy najem istnieje ale nie jest aktywny", () => {
    it("powinno zwrócić false dla archiwalnego najmu", () => {
      // Arrange
      const apartment = createApartment(createLease("archived"));

      // Act
      const result = hasActiveLease(apartment);

      // Assert
      expect(result).toBe(false);
    });

    it("powinno być case-sensitive dla statusu", () => {
      // Arrange - symulacja nieprawidłowych danych
      const apartment = createApartment({
        ...createLease("active"),
        status: "Active" as "active", // Type assertion for test
      });

      // Act
      const result = hasActiveLease(apartment);

      // Assert - "Active" !== "active"
      expect(result).toBe(false);
    });
  });

  describe("warunki brzegowe", () => {
    it("powinno obsługiwać mieszkanie z minimalnymi danymi", () => {
      // Arrange
      const minimalApartment: ApartmentDetailsDTO = {
        id: "min-id",
        name: "A",
        address: "X",
        owner_id: "o",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      // Act
      const result = hasActiveLease(minimalApartment);

      // Assert
      expect(result).toBe(false);
    });

    it("powinno zawsze zwracać wartość boolean", () => {
      // Arrange
      const withLease = createApartment(createLease("active"));
      const withoutLease = createApartment(undefined);
      const archivedLease = createApartment(createLease("archived"));

      // Act & Assert - sprawdzenie typu
      expect(hasActiveLease(withLease)).toBeTypeOf("boolean");
      expect(hasActiveLease(withoutLease)).toBeTypeOf("boolean");
      expect(hasActiveLease(archivedLease)).toBeTypeOf("boolean");

      // Wartości dokładne
      expect(hasActiveLease(withLease)).toBe(true);
      expect(hasActiveLease(withoutLease)).toBe(false);
      expect(hasActiveLease(archivedLease)).toBe(false);
    });
  });

  describe("spójność z regułami biznesowymi", () => {
    it("powinno zwrócić false gdy mieszkanie ma archiwalne dane lokatora", () => {
      // Arrange - najem jest archiwalny, więc nie powinien być "aktywny"
      const apartment = createApartment(createLease("archived"));

      // Act
      const result = hasActiveLease(apartment);

      // Assert - zgodnie z PRD: "jedno mieszkanie = jeden aktywny lokator"
      expect(result).toBe(false);
    });

    it("powinno zwrócić true tylko gdy status === 'active'", () => {
      // Arrange
      const testCases: Array<{ status: "active" | "archived"; expected: boolean }> = [
        { status: "active", expected: true },
        { status: "archived", expected: false },
      ];

      // Act & Assert
      testCases.forEach(({ status, expected }) => {
        const apartment = createApartment(createLease(status));
        const result = hasActiveLease(apartment);
        expect(result).toBe(expected);
      });
    });
  });
});

// =============================================================================
// hasAnyLease TESTS
// =============================================================================

describe("hasAnyLease", () => {
  it("powinno zwrócić false gdy brak najmu", () => {
    // Arrange
    const apartment = createApartment(undefined);

    // Act
    const result = hasAnyLease(apartment);

    // Assert
    expect(result).toBe(false);
  });

  it("powinno zwrócić true dla aktywnego najmu", () => {
    // Arrange
    const apartment = createApartment(createLease("active"));

    // Act
    const result = hasAnyLease(apartment);

    // Assert
    expect(result).toBe(true);
  });

  it("powinno zwrócić true dla archiwalnego najmu", () => {
    // Arrange
    const apartment = createApartment(createLease("archived"));

    // Act
    const result = hasAnyLease(apartment);

    // Assert
    expect(result).toBe(true);
  });
});

// =============================================================================
// INLINE SNAPSHOT TESTS (dla czytelności w code review)
// =============================================================================

describe("lease status snapshot", () => {
  it("powinno poprawnie określać stany najmu", () => {
    const scenarios = {
      noLease: hasActiveLease(createApartment(undefined)),
      activeLease: hasActiveLease(createApartment(createLease("active"))),
      archivedLease: hasActiveLease(createApartment(createLease("archived"))),
    };

    expect(scenarios).toMatchInlineSnapshot(`
      {
        "activeLease": true,
        "archivedLease": false,
        "noLease": false,
      }
    `);
  });
});
