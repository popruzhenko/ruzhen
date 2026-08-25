import { getAccessToken } from '../lib/authStorage';
import type { UserRole } from '../lib/authConstants';

export type { UserRole } from '../lib/authConstants';

const API_URL = import.meta.env.VITE_API_URL;

if (!API_URL) {
    throw new Error('VITE_API_URL is not defined');
}

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

interface AuthErrorResponse {
    message?: string;
}

async function parseAuthResponse<T>(
    response: Response,
    fallbackMessage: string,
): Promise<T> {
    let data: T & AuthErrorResponse;

    try {
        data = (await response.json()) as T & AuthErrorResponse;
    } catch {
        if (!response.ok) {
            throw new Error(fallbackMessage);
        }

        return null as T;
    }

    if (!response.ok) {
        throw new Error(data.message || fallbackMessage);
    }

    return data;
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

    return parseAuthResponse<RegisterResponse>(response, 'Registration failed');
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

    return parseAuthResponse<LoginResponse>(response, 'Login failed');
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
            const data = (await response.json()) as AuthErrorResponse;
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

    return parseAuthResponse<{ user: AuthUser }>(
        response,
        'Failed to fetch user information',
    );
}
