/**
 * File Validation Utilities
 *
 * Funkcje pomocnicze do walidacji plików przesyłanych jako załączniki
 * do opłat i protokołów.
 */

/**
 * Dozwolone typy MIME dla załączników do opłat
 */
const ALLOWED_MIME_TYPES = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png'
} as const;

/**
 * Maksymalny rozmiar pliku: 5MB
 */
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB w bajtach

/**
 * Wynik walidacji pliku
 */
export type FileValidationResult = {
  valid: boolean;
  error?: string;
  extension?: string;
};

/**
 * Walidacja pliku załącznika do opłaty
 *
 * Sprawdza:
 * - Czy plik istnieje
 * - Czy typ MIME jest dozwolony (PDF, JPG, PNG)
 * - Czy rozmiar pliku nie przekracza 5MB
 *
 * @param file - Plik do walidacji
 * @returns Wynik walidacji z błędem lub rozszerzeniem
 */
export function validateAttachmentFile(file: File | null | undefined): FileValidationResult {
  // Sprawdź czy plik istnieje
  if (!file) {
    return { valid: false, error: 'NO_FILE_UPLOADED' };
  }

  // Walidacja typu MIME
  if (!(file.type in ALLOWED_MIME_TYPES)) {
    return { valid: false, error: 'INVALID_FILE_TYPE' };
  }

  // Walidacja rozmiaru pliku
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: 'FILE_TOO_LARGE' };
  }

  // Pobierz rozszerzenie na podstawie typu MIME
  const extension = ALLOWED_MIME_TYPES[file.type as keyof typeof ALLOWED_MIME_TYPES];

  return { valid: true, extension };
}

/**
 * Mapowanie kodów błędów walidacji na komunikaty użytkownika
 */
export const FILE_VALIDATION_ERROR_MESSAGES: Record<string, string> = {
  'NO_FILE_UPLOADED': 'Nie przesłano pliku',
  'INVALID_FILE_TYPE': 'Nieprawidłowy format pliku. Dozwolone: PDF, JPG, PNG',
  'FILE_TOO_LARGE': 'Rozmiar pliku nie może przekraczać 5MB'
};

/**
 * Mapowanie kodów błędów walidacji na kody statusu HTTP
 */
export const FILE_VALIDATION_ERROR_STATUS: Record<string, number> = {
  'NO_FILE_UPLOADED': 400,
  'INVALID_FILE_TYPE': 400,
  'FILE_TOO_LARGE': 413
};
