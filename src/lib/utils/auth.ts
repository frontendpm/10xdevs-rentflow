/**
 * Pobiera token autoryzacji z localStorage
 */
export function getAuthToken(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return localStorage.getItem('rentflow_auth_token');
}

/**
 * Zwraca standardowe headers z tokenem autoryzacji
 */
export function getAuthHeaders(): HeadersInit {
  const token = getAuthToken();
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return headers;
}

/**
 * Usuwa dane autoryzacji z localStorage i cookies, przekierowuje na login
 */
export function logout(redirectTo: string = '/login'): void {
  if (typeof window === 'undefined') {
    return;
  }
  
  // Usuń z localStorage
  localStorage.removeItem('rentflow_auth_token');
  localStorage.removeItem('rentflow_refresh_token');
  
  // Usuń cookies (ustaw wygaśnięcie na przeszłość)
  document.cookie = 'rentflow_auth_token=; path=/; max-age=0';
  document.cookie = 'rentflow_refresh_token=; path=/; max-age=0';
  
  window.location.href = redirectTo;
}

