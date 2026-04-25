const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

const parseResponse = async (response) => {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data?.error || `Request failed with ${response.status}`);
    }
    return data;
};

export const authApi = {
    async me() {
        const response = await fetch(`${API_BASE}/auth/me`, {
            method: 'GET',
            credentials: 'include',
        });
        return parseResponse(response);
    },

    async login({ email, password }) {
        const response = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });
        return parseResponse(response);
    },

    async register({ email, password, nickname }) {
        const response = await fetch(`${API_BASE}/auth/register`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, nickname }),
        });
        return parseResponse(response);
    },

    async logout() {
        const response = await fetch(`${API_BASE}/auth/logout`, {
            method: 'POST',
            credentials: 'include',
        });
        return parseResponse(response);
    },
};
