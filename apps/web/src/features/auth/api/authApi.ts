import { getAccessToken } from '../lib/authStorage';
import type { UserRole } from '../lib/authConstants';
export type { UserRole } from '../lib/authConstants';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export interface AuthUser {
    id: string;
    email: string;
    role: UserRole;
    createdAt: string;
}

export interface LoginResponse {
    message: string;
    accessToken: string;
    sessionToken: string;
    user: AuthUser;
}

export interface RegisterResponse {
    message: string;
    user: AuthUser;
}

interface AuthCredentials {
    email: string;
    password: string;
}

export interface GoogleLoginPayload {
    code: string;
}

export async function registerRequest(
    credentials: AuthCredentials,
): Promise<RegisterResponse> {
    const response = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(credentials),
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.message || 'Registration failed');
    }

    return data;
}

export async function loginRequest(
    credentials: AuthCredentials,
): Promise<LoginResponse> {
    const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(credentials),
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.message || 'Login failed');
    }

    return data;
}

interface AuthErrorResponse {
    message?: string;
}

async function parseAuthResponse<T>(
    response: Response,
    fallbackMessage: string,
): Promise<T> {
    const data = (await response.json()) as T & AuthErrorResponse;

    if (!response.ok) {
        throw new Error(data.message || fallbackMessage);
    }

    return data;
}

export async function loginWithGoogleRequest(
    payload: GoogleLoginPayload,
): Promise<LoginResponse> {
    const response = await fetch(`${API_URL}/auth/google`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    return parseAuthResponse<LoginResponse>(response, 'Google login failed');
}

export async function logoutRequest(): Promise<void> {
    const accessToken = getAccessToken();

    if (!accessToken) {
        return;
    }

    const response = await fetch(`${API_URL}/auth/logout`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
        },
    });

    if (response.status === 401) {
        return;
    }

    if (!response.ok) {
        let message = 'Logout failed';

        try {
            const data = await response.json();
            message = data.message ?? message;
        } catch {
            // Backend returned non-JSON error response.
        }

        throw new Error(message);
    }
}

export async function meRequest(
    accessToken: string,
): Promise<{ user: AuthUser }> {
    const response = await fetch(`${API_URL}/auth/me`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
        },
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.message || 'Failed to fetch user information');
    }

    return data;
}
