
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
  { method = 'GET', body, token, headers = {}, isFormData = false } = {}
) {
  const requestHeaders = {
    Accept: 'application/json',
    ...headers,
  };

  // Don't set Content-Type for FormData — browser sets it with boundary
  if (body !== undefined && !isFormData) {
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
      body: isFormData
        ? body
        : body !== undefined
          ? JSON.stringify(body)
          : undefined,
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
  /**
   * Create a report. Sends multipart/form-data so image is included.
   */
  create: (fields, token) => {
    const formData = new FormData();
    formData.append('title', fields.title);
    formData.append('description', fields.description);
    formData.append('category', fields.category);
    formData.append('latitude', String(fields.latitude));
    formData.append('longitude', String(fields.longitude));

    if (fields.image) {
      formData.append('image', fields.image);
    }

    return apiRequest('/reports', {
      method: 'POST',
      body: formData,
      token,
      isFormData: true,
    });
  },

  /**
   * Get the logged-in citizen's reports.
   */
  getMyReports: (token) =>
    apiRequest('/my-reports', { token }),

  /**
   * Get one of the logged-in citizen's reports.
   */
  getMyReport: (id, token) =>
    apiRequest(`/my-reports/${id}`, { token }),

  /**
   * Find nearby open issues for duplicate warning.
   */
  getNearby: ({ lat, lng, category }) => {
    const params = new URLSearchParams({
      lat: String(lat),
      lng: String(lng),
    });
    if (category) params.set('category', category);
    return apiRequest(`/issues/nearby?${params.toString()}`);
  },
};

/**
 * Public issue APIs.
 */
export const issueApi = {
  getAll: (params = {}) => {
    const query = new URLSearchParams(
      Object.fromEntries(
        Object.entries(params).filter(([, v]) => v !== undefined && v !== '')
      )
    ).toString();
    return apiRequest(`/issues${query ? `?${query}` : ''}`);
  },

  getById: (id, token) =>
    apiRequest(`/issues/${id}`, { token }),

  getHistory: (id, token) =>
    apiRequest(`/issues/${id}/history`, { token }),

  getEvidence: (id, token) =>
    apiRequest(`/issues/${id}/evidence`, { token }),

  getMapIssues: (params = {}) => {
    const query = new URLSearchParams(
      Object.fromEntries(
        Object.entries(params).filter(([, v]) => v !== undefined && v !== '')
      )
    ).toString();
    return apiRequest(`/issues/map${query ? `?${query}` : ''}`);
  },
};

/**
 * Authority / Admin APIs.
 */
export const adminApi = {
  getStats: (token) =>
    apiRequest('/admin/stats', { token }),

  getOfficers: (token) =>
    apiRequest('/admin/officers', { token }),

  getDepartments: () =>
    apiRequest('/departments'),

  assignIssue: (issueId, { assigned_to, notes }, token) =>
    apiRequest(`/issues/${issueId}/assign`, {
      method: 'POST',
      body: { assigned_to, notes },
      token,
    }),

  updateStatus: (issueId, { status, note }, token) =>
    apiRequest(`/issues/${issueId}/status`, {
      method: 'PATCH',
      body: { status, note },
      token,
    }),

  uploadEvidence: (issueId, { image, description }, token) =>
    apiRequest(`/issues/${issueId}/evidence`, {
      method: 'POST',
      body: { image, description },
      token,
    }),
};

