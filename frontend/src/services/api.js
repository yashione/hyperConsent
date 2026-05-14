const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

async function request(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.detail || 'Request failed');
  }
  return data;
}

export const api = {
  status() {
    return request('/system/status');
  },
  login(username, password) {
    const body = new URLSearchParams({ username, password });
    return request('/login', { method: 'POST', body });
  },
  listConsents(token) {
    return request('/consents', {
      headers: { Authorization: `Bearer ${token}` }
    });
  },
  createConsent(token, payload) {
    return request('/consents', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
  },
  revokeConsent(token, id) {
    return request(`/consents/${id}/revoke`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` }
    });
  }
};
