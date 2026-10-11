import { beforeEach, describe, expect, it, vi } from 'vitest';

import { saveAuthData } from '../lib/authStorage';
import {
    loginRequest,
    loginWithGoogleRequest,
    logoutRequest,
    meRequest,
    registerRequest,
} from './authApi';

const user = {
    id: 'reader-1',
    email: 'reader@example.com',
    role: 'USER' as const,
    createdAt: '2026-10-04T12:00:00.000Z',
};
const credentials = { email: user.email, password: 'Password1!' };
const fetchMock = vi.fn<typeof fetch>();
const API_URL = 'https://api.test.invalid';

beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
});

describe.each([
    {
        name: 'registerRequest',
        call: () => registerRequest(credentials),
        endpoint: '/auth/register',
        method: 'POST',
        payload: credentials,
        token: undefined,
        fallback: 'Registration failed',
    },
    {
        name: 'loginRequest',
        call: () => loginRequest(credentials),
        endpoint: '/auth/login',
        method: 'POST',
        payload: credentials,
        token: undefined,
        fallback: 'Login failed',
    },
    {
        name: 'loginWithGoogleRequest',
        call: () => loginWithGoogleRequest({ code: 'google-auth-code' }),
        endpoint: '/auth/google',
        method: 'POST',
        payload: { code: 'google-auth-code' },
        token: undefined,
        fallback: 'Google login failed',
    },
    {
        name: 'meRequest',
        call: () => meRequest('explicit-access-token'),
        endpoint: '/auth/me',
        method: 'GET',
        payload: undefined,
        token: 'explicit-access-token',
        fallback: 'Failed to fetch user information',
    },
])('$name', ({ call, endpoint, method, payload, token, fallback }) => {
    it('sends the expected request and returns the response data', async () => {
        const data = {
            message: 'Success',
            user,
            accessToken: 'access-1',
            sessionToken: 'session-1',
        };
        fetchMock.mockResolvedValue(Response.json(data));

        await expect(call()).resolves.toEqual(data);
        expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
            `${API_URL}${endpoint}`,
            {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                ...(payload ? { body: JSON.stringify(payload) } : {}),
            },
        );
    });

    it('surfaces the message from an unsuccessful JSON response', async () => {
        fetchMock.mockResolvedValue(
            Response.json({ message: 'Account is blocked' }, { status: 403 }),
        );

        await expect(call()).rejects.toThrow('Account is blocked');
    });

    it.each([{}, { message: '' }])(
        'uses the fallback when the error response has no message: %j',
        async (body) => {
            fetchMock.mockResolvedValue(Response.json(body, { status: 500 }));

            await expect(call()).rejects.toThrow(fallback);
        },
    );

    it('uses the fallback for a non-JSON error response', async () => {
        fetchMock.mockResolvedValue(
            new Response('<html>Unavailable</html>', { status: 502 }),
        );

        await expect(call()).rejects.toThrow(fallback);
    });

    it('propagates a network failure', async () => {
        const error = new TypeError('Network connection lost');
        fetchMock.mockRejectedValue(error);

        await expect(call()).rejects.toBe(error);
    });
});

describe('logoutRequest', () => {
    function signIn() {
        saveAuthData({
            accessToken: 'stored-access-token',
            sessionToken: 'session-1',
            user,
        });
    }

    it('does not contact the server when no access token is stored', async () => {
        await expect(logoutRequest()).resolves.toBeUndefined();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('sends the stored access token and accepts an empty successful response', async () => {
        signIn();
        fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

        await expect(logoutRequest()).resolves.toBeUndefined();
        expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
            `${API_URL}/auth/logout`,
            {
                method: 'POST',
                headers: { Authorization: 'Bearer stored-access-token' },
            },
        );
    });

    it('accepts an expired session without trying to parse its response', async () => {
        signIn();
        fetchMock.mockResolvedValue(
            new Response('Unauthorized', { status: 401 }),
        );

        await expect(logoutRequest()).resolves.toBeUndefined();
    });

    it('surfaces the server error message', async () => {
        signIn();
        fetchMock.mockResolvedValue(
            Response.json(
                { message: 'Session could not be revoked' },
                { status: 500 },
            ),
        );

        await expect(logoutRequest()).rejects.toThrow(
            'Session could not be revoked',
        );
    });

    it('uses a fallback when the server error has no message', async () => {
        signIn();
        fetchMock.mockResolvedValue(Response.json({}, { status: 500 }));

        await expect(logoutRequest()).rejects.toThrow('Logout failed');
    });

    it('uses a fallback when the server returns a non-JSON error', async () => {
        signIn();
        fetchMock.mockResolvedValue(
            new Response('Unavailable', { status: 503 }),
        );

        await expect(logoutRequest()).rejects.toThrow('Logout failed');
    });

    it('propagates a network failure', async () => {
        signIn();
        const error = new TypeError('Network connection lost');
        fetchMock.mockRejectedValue(error);

        await expect(logoutRequest()).rejects.toBe(error);
    });
});
