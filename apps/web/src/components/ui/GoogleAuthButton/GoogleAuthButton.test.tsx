import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GoogleAuthButton } from './GoogleAuthButton';

interface GoogleClientConfiguration {
    client_id: string;
    scope: string;
    ux_mode: 'popup';
    callback: (response: { code?: string; error?: string }) => void;
}

const SCRIPT_ID = 'google-identity-services-script';
const requestCode = vi.fn();
let configuration: GoogleClientConfiguration;
const initCodeClient = vi.fn((config: GoogleClientConfiguration) => {
    configuration = config;
    return { requestCode };
});

beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'test-google-client-id');
    requestCode.mockReset();
    initCodeClient.mockReset();
    initCodeClient.mockImplementation((config) => {
        configuration = config;
        return { requestCode };
    });
    vi.stubGlobal('google', { accounts: { oauth2: { initCodeClient } } });
});

afterEach(() => {
    document.getElementById(SCRIPT_ID)?.remove();
});

async function finishScriptLoading() {
    const script = document.getElementById(SCRIPT_ID);
    expect(script).toBeInTheDocument();
    await act(async () => {
        fireEvent.load(script!);
        await vi.advanceTimersByTimeAsync(100);
    });
}

describe('GoogleAuthButton', () => {
    it('reports missing configuration without inserting a script or enabling the button', () => {
        vi.stubEnv('VITE_GOOGLE_CLIENT_ID', undefined);
        const onError = vi.fn();

        render(<GoogleAuthButton onCode={vi.fn()} onError={onError} />);

        expect(onError).toHaveBeenCalledExactlyOnceWith(
            'Google client id is not configured.',
        );
        expect(document.getElementById(SCRIPT_ID)).toBeNull();
        expect(
            screen.getByRole('button', { name: 'Continue with Google' }),
        ).toBeDisabled();
        expect(initCodeClient).not.toHaveBeenCalled();
    });

    it('loads the identity script and initializes the OAuth code client before enabling the button', async () => {
        render(<GoogleAuthButton onCode={vi.fn()} />);
        const script = document.getElementById(SCRIPT_ID) as HTMLScriptElement;

        expect(script.src).toBe('https://accounts.google.com/gsi/client');
        expect(script.async).toBe(true);
        expect(script.defer).toBe(true);
        expect(
            screen.getByRole('button', { name: 'Continue with Google' }),
        ).toBeDisabled();
        fireEvent.click(
            screen.getByRole('button', { name: 'Continue with Google' }),
        );
        expect(requestCode).not.toHaveBeenCalled();

        await finishScriptLoading();

        expect(initCodeClient).toHaveBeenCalledExactlyOnceWith({
            client_id: 'test-google-client-id',
            scope: 'openid email profile',
            ux_mode: 'popup',
            callback: expect.any(Function),
        });
        expect(
            screen.getByRole('button', { name: 'Continue with Google' }),
        ).toBeEnabled();
        fireEvent.click(
            screen.getByRole('button', { name: 'Continue with Google' }),
        );
        expect(requestCode).toHaveBeenCalledTimes(1);
    });

    it('reuses an existing script instead of inserting a duplicate', async () => {
        const script = document.createElement('script');
        script.id = SCRIPT_ID;
        document.body.appendChild(script);

        render(<GoogleAuthButton onCode={vi.fn()} />);
        await act(async () => {
            await vi.advanceTimersByTimeAsync(100);
        });

        expect(document.querySelectorAll(`#${SCRIPT_ID}`)).toHaveLength(1);
        expect(initCodeClient).toHaveBeenCalledTimes(1);
        expect(
            screen.getByRole('button', { name: 'Continue with Google' }),
        ).toBeEnabled();
    });

    it('forwards the authorization code from Google', async () => {
        const onCode = vi.fn();
        const onError = vi.fn();
        render(<GoogleAuthButton onCode={onCode} onError={onError} />);
        await finishScriptLoading();

        act(() => configuration.callback({ code: 'authorization-code' }));

        expect(onCode).toHaveBeenCalledExactlyOnceWith('authorization-code');
        expect(onError).not.toHaveBeenCalled();
    });

    it.each([
        [{ error: 'access_denied' }, 'Google login failed: access_denied'],
        [{}, 'Google authorization code was not returned.'],
        [{ code: '' }, 'Google authorization code was not returned.'],
        [
            { error: 'access_denied', code: 'ignored' },
            'Google login failed: access_denied',
        ],
    ])(
        'reports an unsuccessful OAuth callback: %j',
        async (callbackResponse, message) => {
            const onCode = vi.fn();
            const onError = vi.fn();
            render(<GoogleAuthButton onCode={onCode} onError={onError} />);
            await finishScriptLoading();

            act(() => configuration.callback(callbackResponse));

            expect(onError).toHaveBeenCalledExactlyOnceWith(message);
            expect(onCode).not.toHaveBeenCalled();
        },
    );

    it('uses the latest callbacks after rerender without recreating the OAuth client', async () => {
        const oldCode = vi.fn();
        const oldError = vi.fn();
        const newCode = vi.fn();
        const newError = vi.fn();
        const { rerender } = render(
            <GoogleAuthButton onCode={oldCode} onError={oldError} />,
        );
        await finishScriptLoading();

        rerender(<GoogleAuthButton onCode={newCode} onError={newError} />);
        act(() => configuration.callback({ code: 'new-code' }));
        act(() => configuration.callback({ error: 'access_denied' }));

        expect(newCode).toHaveBeenCalledExactlyOnceWith('new-code');
        expect(newError).toHaveBeenCalledExactlyOnceWith(
            'Google login failed: access_denied',
        );
        expect(oldCode).not.toHaveBeenCalled();
        expect(oldError).not.toHaveBeenCalled();
        expect(initCodeClient).toHaveBeenCalledTimes(1);
    });

    it('respects the disabled prop after initialization and becomes usable when re-enabled', async () => {
        const onCode = vi.fn();
        const { rerender } = render(
            <GoogleAuthButton disabled onCode={onCode} />,
        );
        await finishScriptLoading();

        expect(
            screen.getByRole('button', { name: 'Continue with Google' }),
        ).toBeDisabled();
        fireEvent.click(
            screen.getByRole('button', { name: 'Continue with Google' }),
        );
        expect(requestCode).not.toHaveBeenCalled();

        rerender(<GoogleAuthButton onCode={onCode} />);
        fireEvent.click(
            screen.getByRole('button', { name: 'Continue with Google' }),
        );
        expect(requestCode).toHaveBeenCalledTimes(1);
    });

    it('reports a script load failure and keeps the button disabled', async () => {
        const onError = vi.fn();
        render(<GoogleAuthButton onCode={vi.fn()} onError={onError} />);

        await act(async () => {
            fireEvent.error(document.getElementById(SCRIPT_ID)!);
        });

        expect(onError).toHaveBeenCalledExactlyOnceWith(
            'Failed to load Google script.',
        );
        expect(initCodeClient).not.toHaveBeenCalled();
        expect(
            screen.getByRole('button', { name: 'Continue with Google' }),
        ).toBeDisabled();
    });

    it('times out when the identity script loads but the OAuth service never appears', async () => {
        vi.stubGlobal('google', undefined);
        const onError = vi.fn();
        render(<GoogleAuthButton onCode={vi.fn()} onError={onError} />);

        await act(async () => {
            fireEvent.load(document.getElementById(SCRIPT_ID)!);
            await vi.advanceTimersByTimeAsync(3000);
        });

        expect(onError).toHaveBeenCalledExactlyOnceWith(
            'Google OAuth service is not available.',
        );
        expect(
            screen.getByRole('button', { name: 'Continue with Google' }),
        ).toBeDisabled();
        expect(vi.getTimerCount()).toBe(0);
    });

    it.each([
        [
            new Error('OAuth initialization failed'),
            'OAuth initialization failed',
        ],
        ['unexpected failure', 'Failed to initialize Google login.'],
    ])('reports an OAuth initialization failure', async (failure, message) => {
        initCodeClient.mockImplementation(() => {
            throw failure;
        });
        const onError = vi.fn();
        render(<GoogleAuthButton onCode={vi.fn()} onError={onError} />);

        await finishScriptLoading();

        expect(onError).toHaveBeenCalledExactlyOnceWith(message);
        expect(
            screen.getByRole('button', { name: 'Continue with Google' }),
        ).toBeDisabled();
    });

    it('does not initialize an OAuth client after the component unmounts during loading', async () => {
        const { unmount } = render(<GoogleAuthButton onCode={vi.fn()} />);
        const script = document.getElementById(SCRIPT_ID)!;

        unmount();
        await act(async () => {
            fireEvent.load(script);
            await vi.advanceTimersByTimeAsync(100);
        });

        expect(initCodeClient).not.toHaveBeenCalled();
    });
});
