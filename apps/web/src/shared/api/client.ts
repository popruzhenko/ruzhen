import {
    clearAuthData,
    getAccessToken,
} from '../../features/auth/lib/authStorage';

const API_BASE_URL = import.meta.env.VITE_API_URL;

if (!API_BASE_URL) {
    throw new Error('VITE_API_URL is not defined');
}

interface RequestOptions extends RequestInit {
    json?: unknown;
    skipAuthRedirect?: boolean;
}

const redirectToLogin = () => {
    const currentPath = window.location.pathname + window.location.search;

    if (window.location.pathname === '/login') {
        return;
    }

    clearAuthData();

    const redirectUrl = new URL('/login', window.location.origin);

    if (currentPath && currentPath !== '/login') {
        redirectUrl.searchParams.set('redirectTo', currentPath);
    }

    window.location.replace(redirectUrl.toString());
};

export async function apiClient<T>(
    endpoint: string,
    options: RequestOptions = {},
): Promise<T> {
    const { json, headers, skipAuthRedirect, ...restOptions } = options;
    const accessToken = getAccessToken();

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...restOptions,
        headers: {
            'Content-Type': 'application/json',
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
            ...headers,
        },
        body: json !== undefined ? JSON.stringify(json) : restOptions.body,
    });

    if (response.status === 401) {
        if (!skipAuthRedirect) {
            redirectToLogin();
        }

        throw new Error('Unauthorized');
    }

    if (!response.ok) {
        const errorText = await response.text();

        throw new Error(
            `API request failed with status ${response.status}: ${errorText}`,
        );
    }

    if (response.status === 204) {
        return null as T;
    }

    return response.json() as Promise<T>;
}