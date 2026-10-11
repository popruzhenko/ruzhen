import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { saveAuthData } from '../lib/authStorage';
import { AdminRoute } from './AdminRoute';
import { ProtectedRoute } from './ProtectedRoute';

function renderGuard(guard: 'protected' | 'admin') {
    const router = createMemoryRouter(
        [
            {
                element:
                    guard === 'admin' ? <AdminRoute /> : <ProtectedRoute />,
                children: [
                    {
                        path: '/admin/articles',
                        element: <h1>Private content</h1>,
                    },
                ],
            },
            { path: '/login', element: <h1>Log in</h1> },
            { path: '/user/forbidden', element: <h1>Access denied</h1> },
        ],
        { initialEntries: ['/admin/articles?status=RAW&page=2'] },
    );
    render(<RouterProvider router={router} />);
    return router;
}

function signIn(role: 'USER' | 'ADMIN') {
    saveAuthData({
        accessToken: 'access-1',
        sessionToken: 'session-1',
        user: {
            id: 'reader-1',
            email: 'reader@example.com',
            role,
            createdAt: '2026-10-04',
        },
    });
}

describe.each(['protected', 'admin'] as const)(
    '%s route without a session',
    (guard) => {
        it('replaces the route with login and preserves the pathname and query in redirectTo', async () => {
            const router = renderGuard(guard);

            expect(
                await screen.findByRole('heading', { name: 'Log in' }),
            ).toBeInTheDocument();
            expect(router.state.location.pathname).toBe('/login');
            expect(
                new URLSearchParams(router.state.location.search).get(
                    'redirectTo',
                ),
            ).toBe('/admin/articles?status=RAW&page=2');
            expect(router.state.historyAction).toBe('REPLACE');
            expect(
                screen.queryByText('Private content'),
            ).not.toBeInTheDocument();
        });
    },
);

describe('ProtectedRoute', () => {
    it.each(['USER', 'ADMIN'] as const)(
        'renders the protected outlet for an authenticated %s',
        (role) => {
            signIn(role);

            const router = renderGuard('protected');

            expect(
                screen.getByRole('heading', { name: 'Private content' }),
            ).toBeInTheDocument();
            expect(router.state.location.pathname).toBe('/admin/articles');
        },
    );
});

describe('AdminRoute', () => {
    it('renders the outlet for an administrator', () => {
        signIn('ADMIN');
        renderGuard('admin');

        expect(
            screen.getByRole('heading', { name: 'Private content' }),
        ).toBeInTheDocument();
    });

    it('replaces the route with the forbidden page for a normal user', async () => {
        signIn('USER');
        const router = renderGuard('admin');

        expect(
            await screen.findByRole('heading', { name: 'Access denied' }),
        ).toBeInTheDocument();
        expect(router.state.location.pathname).toBe('/user/forbidden');
        expect(router.state.historyAction).toBe('REPLACE');
        expect(screen.queryByText('Private content')).not.toBeInTheDocument();
    });

    it('denies admin access when there is a token but no stored user', async () => {
        localStorage.setItem('ruzhen_access_token', 'access-1');
        renderGuard('admin');

        expect(
            await screen.findByRole('heading', { name: 'Access denied' }),
        ).toBeInTheDocument();
    });

    it('denies admin access and clears corrupt authentication data', async () => {
        signIn('ADMIN');
        localStorage.setItem('ruzhen_user', '{broken json');
        renderGuard('admin');

        expect(
            await screen.findByRole('heading', { name: 'Access denied' }),
        ).toBeInTheDocument();
        expect(localStorage.getItem('ruzhen_access_token')).toBeNull();
        expect(localStorage.getItem('ruzhen_session_token')).toBeNull();
    });
});
