import { describe, expect, it } from 'vitest';

import { getAuthRedirectPath, getSafeRedirectPath } from './authRedirect';

describe('getSafeRedirectPath', () => {
    it.each(['/', '/user', '/admin/articles?status=RAW&page=2', '/user#saved'])(
        'preserves the internal destination %s',
        (path) => {
            expect(getSafeRedirectPath(path)).toBe(path);
        },
    );

    it.each([
        null,
        '',
        'user',
        'https://external.example',
        '//external.example',
        '///external.example',
        'javascript:alert(1)',
        ' /user',
        '/\\external.example',
        '/user\\profile',
        '/\n/external.example',
        '/\r/external.example',
        '/\t/external.example',
        '/user\u0000',
        '/user\u007f',
    ])('rejects an unsafe or missing destination %j', (path) => {
        expect(getSafeRedirectPath(path)).toBeNull();
    });
});

describe('getAuthRedirectPath', () => {
    it.each([
        ['USER', '/user'],
        ['ADMIN', '/admin'],
    ] as const)('defaults %s to %s', (role, expected) => {
        expect(getAuthRedirectPath({ role })).toBe(expected);
    });

    it.each(['USER', 'ADMIN'] as const)(
        'honors a safe redirect for %s',
        (role) => {
            expect(
                getAuthRedirectPath({
                    role,
                    redirectTo: '/articles?category=science',
                }),
            ).toBe('/articles?category=science');
        },
    );

    it.each([
        ['USER', '/user'],
        ['ADMIN', '/admin'],
    ] as const)(
        'falls back to the role destination for unsafe %s redirects',
        (role, expected) => {
            expect(
                getAuthRedirectPath({ role, redirectTo: '//external.example' }),
            ).toBe(expected);
            expect(getAuthRedirectPath({ role, redirectTo: null })).toBe(
                expected,
            );
        },
    );
});
