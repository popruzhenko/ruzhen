import type { AuthUser } from '../api/authApi';

const ACCESS_TOKEN_KEY = 'ruzhen_access_token';
const SESSION_TOKEN_KEY = 'ruzhen_session_token';
const USER_KEY = 'ruzhen_user';

export function saveAuthData(params: {
    accessToken: string;
    sessionToken: string;
    user: AuthUser;
}) {
    localStorage.setItem(ACCESS_TOKEN_KEY, params.accessToken);
    localStorage.setItem(SESSION_TOKEN_KEY, params.sessionToken);
    localStorage.setItem(USER_KEY, JSON.stringify(params.user));
}

export function getAccessToken(): string | null {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getSessionToken(): string | null {
    return localStorage.getItem(SESSION_TOKEN_KEY);
}

export function getStoredUser(): AuthUser | null {
    const rawUser = localStorage.getItem(USER_KEY);

    if (!rawUser) {
        return null;
    }

    try {
        return JSON.parse(rawUser) as AuthUser;
    } catch {
        clearAuthData();

        return null;
    }
}

export function clearAuthData() {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(SESSION_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
}

export function hasAuthSession() {
    return Boolean(getAccessToken());
}