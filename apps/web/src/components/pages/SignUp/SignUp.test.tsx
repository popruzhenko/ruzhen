import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
    loginWithGoogleRequest,
    registerRequest,
    type LoginResponse,
} from '../../../features/auth/api/authApi';
import {
    getAccessToken,
    getSessionToken,
    getStoredUser,
} from '../../../features/auth/lib/authStorage';
import { SignUp } from './SignUp';

vi.mock('../../../features/auth/api/authApi', () => ({
    registerRequest: vi.fn(),
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
    vi.mocked(registerRequest).mockReset();
    vi.mocked(loginWithGoogleRequest).mockReset();
});

function renderSignUp() {
    const router = createMemoryRouter(
        [
            { path: '/register', element: <SignUp /> },
            { path: '*', element: <h1>Destination page</h1> },
        ],
        { initialEntries: ['/register'] },
    );
    render(<RouterProvider router={router} />);
    return router;
}

async function fillForm(
    user: ReturnType<typeof userEvent.setup>,
    values: {
        fullName?: string;
        email?: string;
        password?: string;
        confirmPassword?: string;
    } = {},
) {
    await user.type(
        screen.getByLabelText(/^Full name/),
        values.fullName ?? 'Reader Example',
    );
    await user.type(
        screen.getByLabelText(/^Email/),
        values.email ?? 'reader@example.com',
    );
    await user.type(
        screen.getByLabelText(/^Password/),
        values.password ?? 'Password1!',
    );
    await user.type(
        screen.getByLabelText(/^Confirm password/),
        values.confirmPassword ?? 'Password1!',
    );
}

describe('SignUp', () => {
    it('renders labeled fields, a login link, and appropriate autocomplete hints', () => {
        renderSignUp();

        expect(
            screen.getByRole('heading', { name: 'Create your account' }),
        ).toBeInTheDocument();
        expect(screen.getByLabelText(/^Full name/)).toHaveAttribute(
            'autocomplete',
            'name',
        );
        expect(screen.getByLabelText(/^Email/)).toHaveAttribute(
            'autocomplete',
            'email',
        );
        expect(screen.getByLabelText(/^Password/)).toHaveAttribute(
            'autocomplete',
            'new-password',
        );
        expect(screen.getByLabelText(/^Confirm password/)).toHaveAttribute(
            'autocomplete',
            'new-password',
        );
        expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
            'href',
            '/login',
        );
    });

    it('requires all four fields without contacting the registration API', async () => {
        const user = userEvent.setup();
        renderSignUp();

        await user.click(
            screen.getByRole('button', { name: 'Create account' }),
        );

        expect(screen.getByLabelText(/^Full name/)).toHaveAccessibleDescription(
            'Full name is required.',
        );
        expect(screen.getByLabelText(/^Email/)).toHaveAccessibleDescription(
            'Email is required.',
        );
        expect(screen.getByLabelText(/^Password/)).toHaveAccessibleDescription(
            'Password is required.',
        );
        expect(
            screen.getByLabelText(/^Confirm password/),
        ).toHaveAccessibleDescription('Please confirm your password.');
        expect(registerRequest).not.toHaveBeenCalled();
    });

    it.each([
        [{ fullName: ' A ' }, 'Full name must be at least 2 characters.'],
        [{ fullName: '   ' }, 'Full name is required.'],
        [{ email: 'reader@localhost' }, 'Enter a valid email address.'],
        [
            { password: 'Pass1', confirmPassword: 'Pass1' },
            'Password must be at least 8 characters.',
        ],
        [
            { password: 'password', confirmPassword: 'password' },
            'Password must contain at least one letter and one number.',
        ],
        [
            { password: '12345678', confirmPassword: '12345678' },
            'Password must contain at least one letter and one number.',
        ],
        [{ confirmPassword: 'Different1' }, 'Passwords do not match.'],
    ])('rejects invalid registration values: %j', async (values, error) => {
        const user = userEvent.setup();
        renderSignUp();
        await fillForm(user, values);

        await user.click(
            screen.getByRole('button', { name: 'Create account' }),
        );

        expect(screen.getByText(error)).toBeInTheDocument();
        expect(registerRequest).not.toHaveBeenCalled();
    });

    it('clears the password and confirmation errors when the password changes', async () => {
        const user = userEvent.setup();
        renderSignUp();
        await fillForm(user, {
            password: 'short',
            confirmPassword: 'different',
        });
        await user.click(
            screen.getByRole('button', { name: 'Create account' }),
        );
        expect(
            screen.getByText('Password must be at least 8 characters.'),
        ).toBeInTheDocument();
        expect(screen.getByText('Passwords do not match.')).toBeInTheDocument();

        await user.type(screen.getByLabelText(/^Password/), '1');

        expect(
            screen.queryByText('Password must be at least 8 characters.'),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByText('Passwords do not match.'),
        ).not.toBeInTheDocument();
    });

    it('registers trimmed credentials and replaces the page with login without creating a session', async () => {
        const user = userEvent.setup();
        vi.mocked(registerRequest).mockResolvedValue({
            message: 'Created',
            user: response.user,
        });
        const router = renderSignUp();
        await fillForm(user, {
            email: ' reader@example.com ',
            password: 'Pass1234',
            confirmPassword: 'Pass1234',
        });

        await user.click(
            screen.getByRole('button', { name: 'Create account' }),
        );

        expect(
            await screen.findByRole('heading', { name: 'Destination page' }),
        ).toBeInTheDocument();
        expect(registerRequest).toHaveBeenCalledExactlyOnceWith({
            email: 'reader@example.com',
            password: 'Pass1234',
        });
        expect(router.state.location.pathname).toBe('/login');
        expect(router.state.historyAction).toBe('REPLACE');
        expect(getAccessToken()).toBeNull();
        expect(getStoredUser()).toBeNull();
    });

    it('disables every field and both submission methods while registration is pending', async () => {
        const user = userEvent.setup();
        let rejectRequest!: (error: Error) => void;
        vi.mocked(registerRequest).mockReturnValue(
            new Promise((_resolve, reject) => {
                rejectRequest = reject;
            }),
        );
        renderSignUp();
        await fillForm(user);

        await user.click(
            screen.getByRole('button', { name: 'Create account' }),
        );

        for (const label of [
            /^Full name/,
            /^Email/,
            /^Password/,
            /^Confirm password/,
        ]) {
            expect(screen.getByLabelText(label)).toBeDisabled();
        }
        expect(
            screen.getByRole('button', { name: 'Creating account...' }),
        ).toBeDisabled();
        expect(
            screen.getByRole('button', { name: 'Continue with Google' }),
        ).toBeDisabled();
        await user.click(
            screen.getByRole('button', { name: 'Creating account...' }),
        );
        expect(registerRequest).toHaveBeenCalledTimes(1);

        await act(async () => rejectRequest(new Error('Failed')));

        expect(
            screen.getByRole('button', { name: 'Create account' }),
        ).toBeEnabled();
        for (const label of [
            /^Full name/,
            /^Email/,
            /^Password/,
            /^Confirm password/,
        ]) {
            expect(screen.getByLabelText(label)).toBeEnabled();
        }
    });

    it.each([
        [new Error('Email already exists'), 'Email already exists'],
        ['unknown failure', 'Failed to create account.'],
    ])(
        'shows a registration failure and allows correcting and resubmitting the form',
        async (failure, message) => {
            const user = userEvent.setup();
            vi.mocked(registerRequest).mockRejectedValueOnce(failure);
            vi.mocked(registerRequest).mockResolvedValueOnce({
                message: 'Created',
                user: response.user,
            });
            renderSignUp();
            await fillForm(user);
            await user.click(
                screen.getByRole('button', { name: 'Create account' }),
            );
            expect(await screen.findByText(message)).toBeInTheDocument();
            expect(screen.getByLabelText(/^Full name/)).toHaveValue(
                'Reader Example',
            );

            await user.clear(screen.getByLabelText(/^Email/));
            await user.type(screen.getByLabelText(/^Email/), 'new@example.com');
            expect(screen.queryByText(message)).not.toBeInTheDocument();
            await user.click(
                screen.getByRole('button', { name: 'Create account' }),
            );

            expect(
                await screen.findByRole('heading', {
                    name: 'Destination page',
                }),
            ).toBeInTheDocument();
            expect(registerRequest).toHaveBeenLastCalledWith({
                email: 'new@example.com',
                password: 'Password1!',
            });
        },
    );

    it('creates a session with Google and navigates to the user page without submitting credentials', async () => {
        const user = userEvent.setup();
        vi.mocked(loginWithGoogleRequest).mockResolvedValue(response);
        const router = renderSignUp();

        await user.click(
            screen.getByRole('button', { name: 'Continue with Google' }),
        );

        expect(
            await screen.findByRole('heading', { name: 'Destination page' }),
        ).toBeInTheDocument();
        expect(loginWithGoogleRequest).toHaveBeenCalledExactlyOnceWith({
            code: 'google-code',
        });
        expect(registerRequest).not.toHaveBeenCalled();
        expect(getAccessToken()).toBe(response.accessToken);
        expect(getSessionToken()).toBe(response.sessionToken);
        expect(getStoredUser()).toEqual(response.user);
        expect(router.state.location.pathname).toBe('/user');
        expect(router.state.historyAction).toBe('REPLACE');
    });

    it.each([
        [new Error('Google account unavailable'), 'Google account unavailable'],
        ['unknown failure', 'Google registration failed.'],
    ])(
        'shows a Google registration failure and restores the controls',
        async (failure, message) => {
            const user = userEvent.setup();
            vi.mocked(loginWithGoogleRequest).mockRejectedValue(failure);
            renderSignUp();

            await user.click(
                screen.getByRole('button', { name: 'Continue with Google' }),
            );

            expect(await screen.findByText(message)).toBeInTheDocument();
            expect(
                screen.getByRole('button', { name: 'Continue with Google' }),
            ).toBeEnabled();
            expect(getAccessToken()).toBeNull();
        },
    );

    it('shows a Google popup failure without contacting the server', async () => {
        const user = userEvent.setup();
        renderSignUp();

        await user.click(
            screen.getByRole('button', { name: 'Simulate Google failure' }),
        );

        expect(
            screen.getByText('Google popup was closed.'),
        ).toBeInTheDocument();
        expect(loginWithGoogleRequest).not.toHaveBeenCalled();
    });
});
