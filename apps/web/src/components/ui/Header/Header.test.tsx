import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Header } from './Header';
import { logoutRequest } from '../../../features/auth/api/authApi';
import {
    getAccessToken,
    getSessionToken,
    getStoredUser,
    saveAuthData,
} from '../../../features/auth/lib/authStorage';
import type { HeaderProps } from './TypesHeader';

vi.mock('../../../features/auth/api/authApi', () => ({
    logoutRequest: vi.fn(),
}));

const Location = () => (
    <output aria-label="Current location">{useLocation().pathname}</output>
);
const renderHeader = (props: HeaderProps = {}) =>
    render(
        <MemoryRouter initialEntries={['/articles']}>
            <Header {...props} />
            <Location />
        </MemoryRouter>,
    );

beforeEach(() => {
    vi.mocked(logoutRequest).mockReset().mockResolvedValue(undefined);
});

describe('Header', () => {
    it('routes public login and honors an explicit login callback', async () => {
        const user = userEvent.setup();
        const onLoginClick = vi.fn();
        const { unmount } = renderHeader({ onLoginClick });
        await user.click(screen.getByRole('button', { name: 'Log in' }));
        expect(onLoginClick).toHaveBeenCalledOnce();
        expect(screen.getByRole('status')).toHaveTextContent('/articles');
        unmount();
        renderHeader();
        await user.click(screen.getByRole('button', { name: 'Log in' }));
        expect(screen.getByRole('status')).toHaveTextContent('/login');
    });

    it('renders route links, external links and navigation callbacks', async () => {
        const user = userEvent.setup();
        const onClick = vi.fn();
        renderHeader({
            navItems: [
                { label: 'Articles', to: '/articles', isActive: true },
                { label: 'Docs', href: 'https://docs.example' },
                { label: 'Refresh', onClick },
            ],
        });
        expect(screen.getByRole('link', { name: 'Articles' })).toHaveClass(
            'ui-header__nav-link--active',
        );
        expect(screen.getByRole('link', { name: 'Docs' })).toHaveAttribute(
            'href',
            'https://docs.example',
        );
        await user.click(screen.getByRole('button', { name: 'Refresh' }));
        expect(onClick).toHaveBeenCalledOnce();
    });

    it.each([
        ['user', 'Profile', '/user/profile'],
        ['user', 'Settings', '/user/settings'],
        ['admin', 'Profile', '/admin/profile'],
        ['admin', 'Settings', '/admin/settings'],
        ['admin', 'Dashboard', '/admin/raw-news'],
    ] as const)(
        'routes %s account action %s correctly',
        async (variant, action, expectedPath) => {
            const user = userEvent.setup();
            renderHeader({ variant, userName: 'Alex' });
            expect(
                screen.queryByRole('button', { name: 'Log in' }),
            ).not.toBeInTheDocument();
            expect(
                screen.getByRole('link', { name: 'RUZHEN' }),
            ).toHaveAttribute(
                'href',
                variant === 'admin' ? '/admin/raw-news' : '/user',
            );
            await user.click(screen.getByRole('button', { name: 'Alex Menu' }));
            if (variant === 'user')
                expect(
                    screen.queryByRole('button', { name: 'Dashboard' }),
                ).not.toBeInTheDocument();
            await user.click(screen.getByRole('button', { name: action }));
            expect(screen.getByRole('status')).toHaveTextContent(expectedPath);
            expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
        },
    );

    it.each([false, true])(
        'clears auth and returns to login after logout (API rejection: %s)',
        async (fails) => {
            const user = userEvent.setup();
            saveAuthData({
                accessToken: 'access',
                sessionToken: 'session',
                user: {
                    id: 'reader',
                    email: 'reader@example.com',
                    role: 'USER',
                    createdAt: '2026-01-01',
                },
            });
            const error = new Error('Server unavailable');
            const consoleError = vi
                .spyOn(console, 'error')
                .mockImplementation(() => {});
            if (fails) vi.mocked(logoutRequest).mockRejectedValueOnce(error);
            renderHeader({ variant: 'user' });
            await user.click(screen.getByRole('button', { name: /Menu/ }));
            await user.click(screen.getByRole('button', { name: 'Logout' }));
            await waitFor(() =>
                expect(screen.getByRole('status')).toHaveTextContent('/login'),
            );
            expect(logoutRequest).toHaveBeenCalledOnce();
            expect(getAccessToken()).toBeNull();
            expect(getSessionToken()).toBeNull();
            expect(getStoredUser()).toBeNull();
            if (fails)
                expect(consoleError).toHaveBeenCalledWith(
                    'Logout failed:',
                    error,
                );
        },
    );
});
