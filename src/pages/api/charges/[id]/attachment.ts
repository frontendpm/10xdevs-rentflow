import type { APIContext } from 'astro';
import { ChargesService } from '@/lib/services/charges.service';
import {
  FILE_VALIDATION_ERROR_MESSAGES,
  FILE_VALIDATION_ERROR_STATUS
} from '@/lib/utils/file-validation';

export const prerender = false;

/**
 * POST /api/charges/:id/attachment
 *
 * Dodaje załącznik do opłaty (tylko właściciel).
 * Tylko 1 załącznik na opłatę - nowy załącznik zastępuje istniejący.
 *
 * Walidacja:
 * - Dozwolone typy: PDF, JPG, PNG
 * - Maksymalny rozmiar: 5MB
 *
 * Autoryzacja:
 * - Tylko owner może dodawać załączniki (RLS)
 *
 * Request body (multipart/form-data):
 * - file: File (PDF/JPG/PNG, max 5MB)
 *
 * @returns 200 - UploadChargeAttachmentResponseDTO
 * @returns 400 - Validation Error (brak pliku, nieprawidłowy typ)
 * @returns 401 - Unauthorized
 * @returns 403 - Forbidden (nie jest właścicielem)
 * @returns 404 - Not Found (opłata nie istnieje)
 * @returns 413 - Payload Too Large (plik > 5MB)
 * @returns 500 - Internal Server Error
 */
export async function POST(context: APIContext): Promise<Response> {
  const { params, request, locals } = context;
  const { supabase, user } = locals;

  // 1. Sprawdzenie autoryzacji
  if (!user) {
    return new Response(
      JSON.stringify({
        error: 'Unauthorized',
        message: 'Brak autoryzacji'
      }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // 2. Sprawdzenie czy user jest właścicielem
  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (userError || !userData) {
    console.error('[POST /api/charges/:id/attachment] Błąd pobierania roli:', {
      userId: user.id,
      error: userError
    });
    return new Response(
      JSON.stringify({
        error: 'Internal Server Error',
        message: 'Błąd weryfikacji użytkownika'
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (userData.role !== 'owner') {
    return new Response(
      JSON.stringify({
        error: 'Forbidden',
        message: 'Tylko właściciele mogą dodawać załączniki'
      }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // 3. Walidacja chargeId
  const chargeId = params.id;
  if (!chargeId) {
    return new Response(
      JSON.stringify({
        error: 'Bad Request',
        message: 'Brak ID opłaty'
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Walidacja formatu UUID
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(chargeId)) {
    return new Response(
      JSON.stringify({
        error: 'Bad Request',
        message: 'Nieprawidłowy format ID opłaty'
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // 4. Parsowanie multipart/form-data
  let formData;
  try {
    formData = await request.formData();
  } catch {
    return new Response(
      JSON.stringify({
        error: 'Bad Request',
        message: 'Nieprawidłowy format danych'
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const file = formData.get('file') as File;

  // 5. Wywołanie serwisu
  try {
    const chargesService = new ChargesService(supabase);
    const result = await chargesService.uploadAttachment(chargeId, file);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('[POST /api/charges/:id/attachment] Error:', {
      userId: user.id,
      chargeId,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });

    // Obsługa błędów walidacji pliku
    if (error.message in FILE_VALIDATION_ERROR_MESSAGES) {
      const errorCode = error.message;
      return new Response(
        JSON.stringify({
          error: FILE_VALIDATION_ERROR_STATUS[errorCode] === 413 ? 'Payload Too Large' : 'Validation Error',
          message: FILE_VALIDATION_ERROR_MESSAGES[errorCode]
        }),
        {
          status: FILE_VALIDATION_ERROR_STATUS[errorCode],
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Obsługa innych błędów
    if (error.message === 'CHARGE_NOT_FOUND') {
      return new Response(
        JSON.stringify({
          error: 'Not Found',
          message: 'Opłata nie została znaleziona'
        }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (error.message === 'STORAGE_UPLOAD_ERROR') {
      return new Response(
        JSON.stringify({
          error: 'Internal Server Error',
          message: 'Błąd przesyłania pliku do Storage'
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Błąd ogólny
    return new Response(
      JSON.stringify({
        error: 'Internal Server Error',
        message: 'Wystąpił błąd podczas przesyłania załącznika'
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * DELETE /api/charges/:id/attachment
 *
 * Usuwa załącznik z opłaty (tylko właściciel).
 *
 * Autoryzacja:
 * - Tylko owner może usuwać załączniki (RLS)
 *
 * @returns 204 - No Content (załącznik usunięty)
 * @returns 400 - Bad Request
 * @returns 401 - Unauthorized
 * @returns 403 - Forbidden (nie jest właścicielem)
 * @returns 404 - Not Found (opłata nie istnieje lub brak załącznika)
 * @returns 500 - Internal Server Error
 */
export async function DELETE(context: APIContext): Promise<Response> {
  const { params, locals } = context;
  const { supabase, user } = locals;

  // 1. Sprawdzenie autoryzacji
  if (!user) {
    return new Response(
      JSON.stringify({
        error: 'Unauthorized',
        message: 'Brak autoryzacji'
      }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // 2. Sprawdzenie czy user jest właścicielem
  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (userError || !userData) {
    console.error('[DELETE /api/charges/:id/attachment] Błąd pobierania roli:', {
      userId: user.id,
      error: userError
    });
    return new Response(
      JSON.stringify({
        error: 'Internal Server Error',
        message: 'Błąd weryfikacji użytkownika'
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (userData.role !== 'owner') {
    return new Response(
      JSON.stringify({
        error: 'Forbidden',
        message: 'Tylko właściciele mogą usuwać załączniki'
      }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // 3. Walidacja chargeId
  const chargeId = params.id;
  if (!chargeId) {
    return new Response(
      JSON.stringify({
        error: 'Bad Request',
        message: 'Brak ID opłaty'
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Walidacja formatu UUID
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(chargeId)) {
    return new Response(
      JSON.stringify({
        error: 'Bad Request',
        message: 'Nieprawidłowy format ID opłaty'
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // 4. Wywołanie serwisu
  try {
    const chargesService = new ChargesService(supabase);
    await chargesService.deleteAttachment(chargeId);

    // Success - 204 No Content
    return new Response(null, { status: 204 });

  } catch (error: any) {
    console.error('[DELETE /api/charges/:id/attachment] Error:', {
      userId: user.id,
      chargeId,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });

    // Obsługa specyficznych błędów
    if (error.message === 'CHARGE_NOT_FOUND') {
      return new Response(
        JSON.stringify({
          error: 'Not Found',
          message: 'Opłata nie została znaleziona'
        }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (error.message === 'NO_ATTACHMENT') {
      return new Response(
        JSON.stringify({
          error: 'Not Found',
          message: 'Brak załącznika do usunięcia'
        }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Błąd ogólny
    return new Response(
      JSON.stringify({
        error: 'Internal Server Error',
        message: 'Wystąpił błąd podczas usuwania załącznika'
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
