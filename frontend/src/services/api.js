
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.trim() || '/api';

// Share one refresh request between concurrent callers.
// This prevents duplicate token rotation in React Strict Mode.
let refreshPromise = null;

/**
 * Reusable API request handler.
 */
export async function apiRequest(
  path,
  { method = 'GET', body, token, headers = {} } = {}
) {
  const requestHeaders = {
    Accept: 'application/json',
    ...headers,
  };

  if (body !== undefined) {
    requestHeaders['Content-Type'] = 'application/json';
  }

  if (token) {
    requestHeaders.Authorization = `Bearer ${token}`;
  }

  let response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: requestHeaders,
      credentials: 'include',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Unable to connect to SeeFixit server.');
  }

  const responseData = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(
      responseData?.message || `Request failed with status ${response.status}`
    );

    error.status = response.status;
    error.data = responseData;

    throw error;
  }

  return responseData;
}

/**
 * Refresh session with concurrent-request protection.
 */
function refreshSession() {
  if (!refreshPromise) {
    refreshPromise = apiRequest('/auth/refresh', {
      method: 'POST',
    }).finally(() => {
      refreshPromise = null;
    });
  }

  return refreshPromise;
}

/**
 * Authentication APIs.
 */
export const authApi = {
  register: (userData) =>
    apiRequest('/auth/register', {
      method: 'POST',
      body: userData,
    }),

  login: (credentials) =>
    apiRequest('/auth/login', {
      method: 'POST',
      body: credentials,
    }),

  googleLogin: (idToken) =>
    apiRequest('/auth/google', {
      method: 'POST',
      body: { idToken },
    }),

  refresh: () => refreshSession(),

  logout: () =>
    apiRequest('/auth/logout', {
      method: 'POST',
    }),
};

/**
 * Citizen report APIs.
 */
export const reportApi = {
  create: (reportData, token) =>
    apiRequest('/reports', {
      method: 'POST',
      body: reportData,
      token,
    }),
};
