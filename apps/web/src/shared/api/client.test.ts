import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from './client';

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
});

describe('apiClient', () => {
    it('uses configured API URL, returns parsed JSON and sends authenticated JSON', async () => {
        localStorage.setItem('ruzhen_access_token', 'token');
        const controller = new AbortController();

        await expect(
            apiClient('/articles', {
                method: 'POST',
                json: { title: 'News' },
                signal: controller.signal,
            }),
        ).resolves.toEqual({ ok: true });

        expect(fetchMock).toHaveBeenCalledOnce();
        const [url, options] = fetchMock.mock.calls[0];
        expect(url).toBe('https://api.test.invalid/articles');
        expect(options).toMatchObject({
            method: 'POST',
            body: '{"title":"News"}',
            signal: controller.signal,
        });
        const headers = new Headers(options?.headers);
        expect(headers.get('Content-Type')).toBe('application/json');
        expect(headers.get('Authorization')).toBe('Bearer token');
    });

    it('omits Authorization when no token is stored and preserves raw request body', async () => {
        await apiClient('/upload', { method: 'PUT', body: 'raw body' });
        const options = fetchMock.mock.calls[0][1];
        expect(new Headers(options?.headers).has('Authorization')).toBe(false);
        expect(options?.body).toBe('raw body');
    });

    it.each([null, false, 0, ''])(
        'serializes explicit JSON value %j and prefers it to body',
        async (json) => {
            await apiClient('/resource', { json, body: 'ignored' });
            expect(fetchMock.mock.calls[0][1]?.body).toBe(JSON.stringify(json));
        },
    );

    it.each([
        {
            name: 'object',
            headers: {
                'Content-Type': 'text/plain',
                Authorization: 'Custom token',
                'X-Trace': 'trace',
            },
        },
        {
            name: 'Headers instance',
            headers: new Headers({
                'content-type': 'text/plain',
                authorization: 'Custom token',
                'X-Trace': 'trace',
            }),
        },
        {
            name: 'tuple array',
            headers: [
                ['Content-Type', 'text/plain'],
                ['Authorization', 'Custom token'],
                ['X-Trace', 'trace'],
            ] as [string, string][],
        },
    ])('merges $name headers with caller precedence', async ({ headers }) => {
        localStorage.setItem('ruzhen_access_token', 'stored');
        await apiClient('/resource', { headers });

        const sent = new Headers(fetchMock.mock.calls[0][1]?.headers);
        expect(sent.get('content-type')).toBe('text/plain');
        expect(sent.get('authorization')).toBe('Custom token');
        expect(sent.get('x-trace')).toBe('trace');
        expect([...sent.keys()]).toEqual([
            'authorization',
            'content-type',
            'x-trace',
        ]);
    });

    it('returns null for 204 without attempting to parse a JSON body', async () => {
        const response = new Response(null, { status: 204 });
        const parse = vi.spyOn(response, 'json');
        fetchMock.mockResolvedValue(response);
        await expect(
            apiClient('/resource', { method: 'DELETE' }),
        ).resolves.toBeNull();
        expect(parse).not.toHaveBeenCalled();
    });

    it.each([400, 403, 409, 500])(
        'includes server status %i and response text in errors',
        async (status) => {
            fetchMock.mockResolvedValue(
                new Response('Server detail', { status }),
            );
            await expect(apiClient('/resource')).rejects.toThrow(
                `API request failed with status ${status}: Server detail`,
            );
        },
    );

    it('preserves fetch failures and abort errors', async () => {
        const failure = new DOMException('Request canceled', 'AbortError');
        fetchMock.mockRejectedValue(failure);
        await expect(apiClient('/resource')).rejects.toBe(failure);
    });

    it('surfaces malformed successful JSON', async () => {
        fetchMock.mockResolvedValue(new Response('not JSON', { status: 200 }));
        await expect(apiClient('/resource')).rejects.toBeInstanceOf(
            SyntaxError,
        );
    });

    it('clears only auth data and redirects a 401 to login with path and query preserved', async () => {
        const replace = vi.fn();
        vi.stubGlobal('window', {
            location: {
                pathname: '/admin/articles',
                search: '?page=2&search=hello',
                origin: 'https://web.test',
                replace,
            },
        });
        localStorage.setItem('ruzhen_access_token', 'token');
        localStorage.setItem('ruzhen_session_token', 'session');
        localStorage.setItem('ruzhen_user', '{}');
        localStorage.setItem('preference', 'saved');
        fetchMock.mockResolvedValue(new Response(null, { status: 401 }));

        await expect(apiClient('/resource')).rejects.toThrow('Unauthorized');
        expect(replace).toHaveBeenCalledWith(
            'https://web.test/login?redirectTo=%2Fadmin%2Farticles%3Fpage%3D2%26search%3Dhello',
        );
        expect(localStorage.getItem('ruzhen_access_token')).toBeNull();
        expect(localStorage.getItem('ruzhen_session_token')).toBeNull();
        expect(localStorage.getItem('ruzhen_user')).toBeNull();
        expect(localStorage.getItem('preference')).toBe('saved');
    });

    it.each([true, false])(
        'avoids redirect loops and respects skipAuthRedirect=%s',
        async (skipAuthRedirect) => {
            const replace = vi.fn();
            vi.stubGlobal('window', {
                location: {
                    pathname: skipAuthRedirect ? '/admin' : '/login',
                    search: '',
                    origin: 'https://web.test',
                    replace,
                },
            });
            localStorage.setItem('ruzhen_access_token', 'token');
            fetchMock.mockResolvedValue(new Response(null, { status: 401 }));

            await expect(
                apiClient('/resource', { skipAuthRedirect }),
            ).rejects.toThrow('Unauthorized');
            expect(replace).not.toHaveBeenCalled();
            expect(localStorage.getItem('ruzhen_access_token')).toBe('token');
            expect(fetchMock.mock.calls[0][1]).not.toHaveProperty(
                'skipAuthRedirect',
            );
        },
    );

    it('fails fast when API base URL is missing', async () => {
        vi.stubEnv('VITE_API_URL', '');
        vi.resetModules();
        await expect(import('./client')).rejects.toThrow(
            'VITE_API_URL is not defined',
        );
        vi.resetModules();
    });
});
