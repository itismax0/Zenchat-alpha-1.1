
// On Render, Frontend and Backend are on the same domain.
// Use relative path '/api' so it works automatically.
// For local dev, Vite proxy handles '/api' -> 'localhost:3001'

const API_URL = ''; // Relative path is best for unified deployment

// Helper to handle requests
const request = async (endpoint: string, options: RequestInit = {}) => {
    try {
        const url = `${API_URL}${endpoint}`;
        
        // Retrieve Token
        const token = localStorage.getItem('zenchat_token');
        
        // Fix: Re-enabled Authorization header
        const headers = {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
            ...options.headers,
        };

        // Add timeout
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 15000); // 15s timeout for cold starts

        const response = await fetch(url, { 
            ...options, 
            headers,
            signal: controller.signal
        });
        
        clearTimeout(id);

        const text = await response.text();

        // Try to parse JSON
        let data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            console.error("Server returned non-JSON response:", text.substring(0, 200));
            throw new Error(`Server Error: The backend might be offline or returning HTML.`);
        }

        if (!response.ok) {
            throw new Error(data.error || 'API Request failed');
        }

        return data;
    } catch (error: any) {
        if (error.name === 'AbortError') {
            throw new Error('Connection timeout. The server might be waking up (Render free tier). Please try again in 30 seconds.');
        }
        console.error(`API Error (${endpoint}):`, error);
        throw error;
    }
};

export const api = {
    register: (name: string, email: string, password: string) => 
        request('/api/register', {
            method: 'POST',
            body: JSON.stringify({ name, email, password })
        }),

    login: (loginIdentifier: string, password: string) => 
        request('/api/login', {
            method: 'POST',
            body: JSON.stringify({ loginIdentifier, password }) // CRITICAL FIX: Send as 'loginIdentifier'
        }),

    // CODE RED: Emergency Reset
    resetPassword: (loginIdentifier: string, newPassword: string) =>
        request('/api/emergency-reset', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('zenchat_token')}` }, // Authorization re-enabled here
            body: JSON.stringify({ loginIdentifier, newPassword }) // Correctly send as 'loginIdentifier'
        }),

    updateProfile: (id: string, updates: any) =>
        request(`/api/users/${id}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('zenchat_token')}` }, // Authorization re-enabled here
            body: JSON.stringify(updates)
        }),

    // Fix: Added changePassword API method
    changePassword: (id: string, currentPassword: string, newPassword: string) =>
        request(`/api/users/${id}/password`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('zenchat_token')}` }, // Authorization re-enabled here
            body: JSON.stringify({ currentPassword, newPassword })
        }),

    createGroup: (name: string, type: string, members: string[], avatarUrl: string, ownerId: string) =>
        request('/api/groups', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('zenchat_token')}` }, // Authorization re-enabled here
            body: JSON.stringify({ name, type, members, avatarUrl, ownerId })
        }),

    searchUsers: (query: string, currentUserId: string) =>
        request(`/api/users/search?query=${encodeURIComponent(query)}&currentUserId=${currentUserId}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('zenchat_token')}` }, // Authorization re-enabled here
        }),

    syncData: (userId: string) =>
        request(`/api/sync/${userId}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('zenchat_token')}` }, // Authorization re-enabled here
        })
};