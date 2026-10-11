import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
    loginRequest,
    loginWithGoogleRequest,
    type LoginResponse,
} from '../../../features/auth/api/authApi';
import {
    getAccessToken,
    getSessionToken,
    getStoredUser,
} from '../../../features/auth/lib/authStorage';
import { SignIn } from './SignIn';

vi.mock('../../../features/auth/api/authApi', () => ({
    loginRequest: vi.fn(),
    loginWithGoogleRequest: vi.fn(),
}));

vi.mock('../../ui/GoogleAuthButton/GoogleAuthButton', () => ({
    GoogleAuthButton: ({
        disabled,
        onCode,
        onError,
    }: {
        disabled?: boolean;
        onCode: (code: string) => void;
        onError: (message: string) => void;
    }) => (
        <>
            <button
                type="button"
                disabled={disabled}
                onClick={() => onCode('google-code')}
            >
                Continue with Google
            </button>
            <button
                type="button"
                disabled={disabled}
                onClick={() => onError('Google popup was closed.')}
            >
                Simulate Google failure
            </button>
        </>
    ),
}));

const response: LoginResponse = {
    message: 'Logged in',
    accessToken: 'access-1',
    sessionToken: 'session-1',
    user: {
        id: 'reader-1',
        email: 'reader@example.com',
        role: 'USER',
        createdAt: '2026-10-04',
    },
};

beforeEach(() => {
    vi.mocked(loginRequest).mockReset();
    vi.mocked(loginWithGoogleRequest).mockReset();
});

function renderSignIn(path = '/login') {
    const router = createMemoryRouter(
        [
            { path: '/login', element: <SignIn /> },
            { path: '*', element: <h1>Destination page</h1> },
        ],
        { initialEntries: [path] },
    );
    render(<RouterProvider router={router} />);
    return router;
}

async function fillCredentials(
    user: ReturnType<typeof userEvent.setup>,
    email = 'reader@example.com',
    password = 'Password1!',
) {
    await user.type(screen.getByLabelText(/^Email/), email);
    await user.type(screen.getByLabelText(/^Password/), password);
}

describe('SignIn', () => {
    it('renders labeled credentials, the registration link, and expected autocomplete hints', () => {
        renderSignIn();

        expect(
            screen.getByRole('heading', { name: 'Log in to Ruzhen' }),
        ).toBeInTheDocument();
        expect(screen.getByLabelText(/^Email/)).toHaveAttribute(
            'autocomplete',
            'email',
        );
        expect(screen.getByLabelText(/^Password/)).toHaveAttribute(
            'autocomplete',
            'current-password',
        );
        expect(screen.getByRole('link', { name: 'Sign up' })).toHaveAttribute(
            'href',
            '/register',
        );
    });

    it('shows accessible required errors without calling the login API', async () => {
        const user = userEvent.setup();
        renderSignIn();

        await user.click(screen.getByRole('button', { name: 'Log in' }));

        expect(screen.getByLabelText(/^Email/)).toHaveAccessibleDescription(
            'Email is required.',
        );
        expect(screen.getByLabelText(/^Password/)).toHaveAccessibleDescription(
            'Password is required.',
        );
        expect(vi.mocked(loginRequest)).not.toHaveBeenCalled();
    });

    it('rejects an email without a domain suffix', async () => {
        const user = userEvent.setup();
        renderSignIn();
        await fillCredentials(user, 'reader@localhost');

        await user.click(screen.getByRole('button', { name: 'Log in' }));

        expect(screen.getByLabelText(/^Email/)).toHaveAccessibleDescription(
            'Enter a valid email address.',
        );
        expect(vi.mocked(loginRequest)).not.toHaveBeenCalled();
    });

    it('clears only the edited field error as the user corrects the form', async () => {
        const user = userEvent.setup();
        renderSignIn();
        await user.click(screen.getByRole('button', { name: 'Log in' }));

        await user.type(screen.getByLabelText(/^Email/), 'reader@example.com');

        expect(
            screen.queryByText('Email is required.'),
        ).not.toBeInTheDocument();
        expect(screen.getByText('Password is required.')).toBeInTheDocument();
    });

    it.each([
        ['USER', '/login', '/user'],
        ['ADMIN', '/login', '/admin'],
        [
            'USER',
            '/login?redirectTo=%2Farticles%3Fcategory%3Dscience',
            '/articles?category=science',
        ],
        ['ADMIN', '/login?redirectTo=%2F%2Fexternal.example', '/admin'],
    ] as const)(
        'stores a %s session and replaces %s with %s',
        async (role, initialPath, destination) => {
            const user = userEvent.setup();
            const data = { ...response, user: { ...response.user, role } };
            vi.mocked(loginRequest).mockResolvedValue(data);
            const router = renderSignIn(initialPath);
            await fillCredentials(
                user,
                '  reader@example.com  ',
                ' Password1! ',
            );

            await user.click(screen.getByRole('button', { name: 'Log in' }));

            expect(
                await screen.findByRole('heading', {
                    name: 'Destination page',
                }),
            ).toBeInTheDocument();
            expect(loginRequest).toHaveBeenCalledExactlyOnceWith({
                email: 'reader@example.com',
                password: ' Password1! ',
            });
            expect(getAccessToken()).toBe(data.accessToken);
            expect(getSessionToken()).toBe(data.sessionToken);
            expect(getStoredUser()).toEqual(data.user);
            expect(
                router.state.location.pathname + router.state.location.search,
            ).toBe(destination);
            expect(router.state.historyAction).toBe('REPLACE');
        },
    );

    it('disables credentials and both login methods until the request finishes', async () => {
        const user = userEvent.setup();
        let rejectRequest!: (error: Error) => void;
        vi.mocked(loginRequest).mockReturnValue(
            new Promise((_resolve, reject) => {
                rejectRequest = reject;
            }),
        );
        renderSignIn();
        await fillCredentials(user);

        await user.click(screen.getByRole('button', { name: 'Log in' }));

        expect(screen.getByLabelText(/^Email/)).toBeDisabled();
        expect(screen.getByLabelText(/^Password/)).toBeDisabled();
        expect(
            screen.getByRole('button', { name: 'Logging in...' }),
        ).toBeDisabled();
        expect(
            screen.getByRole('button', { name: 'Continue with Google' }),
        ).toBeDisabled();
        await user.click(screen.getByRole('button', { name: 'Logging in...' }));
        expect(loginRequest).toHaveBeenCalledTimes(1);

        await act(async () => rejectRequest(new Error('Failed')));

        expect(screen.getByRole('button', { name: 'Log in' })).toBeEnabled();
        expect(screen.getByLabelText(/^Email/)).toBeEnabled();
        expect(screen.getByLabelText(/^Password/)).toBeEnabled();
        expect(
            screen.getByRole('button', { name: 'Continue with Google' }),
        ).toBeEnabled();
    });

    it('shows a generic credential error, keeps the entered values, and clears the error when editing', async () => {
        const user = userEvent.setup();
        vi.mocked(loginRequest).mockRejectedValue(
            new Error('Internal server detail'),
        );
        renderSignIn();
        await fillCredentials(user);

        await user.click(screen.getByRole('button', { name: 'Log in' }));

        expect(
            await screen.findByText('Invalid email or password.'),
        ).toBeInTheDocument();
        expect(
            screen.queryByText('Internal server detail'),
        ).not.toBeInTheDocument();
        expect(screen.getByLabelText(/^Email/)).toHaveValue(
            'reader@example.com',
        );
        expect(screen.getByLabelText(/^Password/)).toHaveValue('Password1!');
        expect(getAccessToken()).toBeNull();

        await user.type(screen.getByLabelText(/^Password/), '2');

        expect(
            screen.queryByText('Invalid email or password.'),
        ).not.toBeInTheDocument();
    });

    it('signs in with a Google code without requiring credential fields', async () => {
        const user = userEvent.setup();
        vi.mocked(loginWithGoogleRequest).mockResolvedValue(response);
        const router = renderSignIn('/login?redirectTo=%2Fuser%2Fsaved');

        await user.click(
            screen.getByRole('button', { name: 'Continue with Google' }),
        );

        expect(
            await screen.findByRole('heading', { name: 'Destination page' }),
        ).toBeInTheDocument();
        expect(loginWithGoogleRequest).toHaveBeenCalledExactlyOnceWith({
            code: 'google-code',
        });
        expect(loginRequest).not.toHaveBeenCalled();
        expect(getAccessToken()).toBe(response.accessToken);
        expect(router.state.location.pathname).toBe('/user/saved');
    });

    it.each([
        [
            new Error('Google account is unavailable'),
            'Google account is unavailable',
        ],
        ['unknown failure', 'Google login failed.'],
    ])(
        'shows a Google API failure and restores the controls',
        async (failure, message) => {
            const user = userEvent.setup();
            vi.mocked(loginWithGoogleRequest).mockRejectedValue(failure);
            renderSignIn();

            await user.click(
                screen.getByRole('button', { name: 'Continue with Google' }),
            );

            expect(await screen.findByText(message)).toBeInTheDocument();
            await waitFor(() =>
                expect(
                    screen.getByRole('button', {
                        name: 'Continue with Google',
                    }),
                ).toBeEnabled(),
            );
            expect(getAccessToken()).toBeNull();
        },
    );

    it('shows a Google popup failure without contacting the auth API', async () => {
        const user = userEvent.setup();
        renderSignIn();

        await user.click(
            screen.getByRole('button', { name: 'Simulate Google failure' }),
        );

        expect(
            screen.getByText('Google popup was closed.'),
        ).toBeInTheDocument();
        expect(loginWithGoogleRequest).not.toHaveBeenCalled();
    });
});
