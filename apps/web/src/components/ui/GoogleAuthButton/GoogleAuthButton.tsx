import { useEffect, useRef, useState } from 'react';

import { Button } from '../Button/Button';
import { Icon } from '../Icon/Icon';

import './GoogleAuthButton.scss';

interface GoogleAuthButtonProps {
    disabled?: boolean;
    onCode: (code: string) => void;
    onError?: (message: string) => void;
}

interface GoogleCodeResponse {
    code?: string;
    error?: string;
}

interface GoogleCodeClient {
    requestCode: () => void;
}

declare global {
    interface Window {
        google?: {
            accounts?: {
                oauth2?: {
                    initCodeClient: (config: {
                        client_id: string;
                        scope: string;
                        ux_mode: 'popup';
                        callback: (response: GoogleCodeResponse) => void;
                    }) => GoogleCodeClient;
                };
            };
        };
    }
}

const GOOGLE_SCRIPT_ID = 'google-identity-services-script';
const GOOGLE_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

const loadGoogleScript = () => {
    return new Promise<void>((resolve, reject) => {
        const existingScript = document.getElementById(GOOGLE_SCRIPT_ID);

        if (existingScript) {
            resolve();
            return;
        }

        const script = document.createElement('script');

        script.id = GOOGLE_SCRIPT_ID;
        script.src = GOOGLE_SCRIPT_SRC;
        script.async = true;
        script.defer = true;

        script.onload = () => resolve();
        script.onerror = () =>
            reject(new Error('Failed to load Google script.'));

        document.body.appendChild(script);
    });
};

const waitForGoogleOAuth = () => {
    return new Promise<void>((resolve, reject) => {
        let attempts = 0;
        const maxAttempts = 30;

        const intervalId = window.setInterval(() => {
            attempts += 1;

            if (window.google?.accounts?.oauth2) {
                window.clearInterval(intervalId);
                resolve();
                return;
            }

            if (attempts >= maxAttempts) {
                window.clearInterval(intervalId);
                reject(new Error('Google OAuth service is not available.'));
            }
        }, 100);
    });
};

export const GoogleAuthButton = ({
    disabled = false,
    onCode,
    onError,
}: GoogleAuthButtonProps) => {
    const [isReady, setIsReady] = useState(false);

    const codeClientRef = useRef<GoogleCodeClient | null>(null);
    const onCodeRef = useRef(onCode);
    const onErrorRef = useRef(onError);

    useEffect(() => {
        onCodeRef.current = onCode;
        onErrorRef.current = onError;
    }, [onCode, onError]);

    useEffect(() => {
        const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as
            | string
            | undefined;

        if (!googleClientId) {
            onErrorRef.current?.('Google client id is not configured.');
            return;
        }

        const checkedGoogleClientId = googleClientId;

        let isMounted = true;

        async function initializeGoogleAuth() {
            try {
                await loadGoogleScript();
                await waitForGoogleOAuth();

                if (!isMounted) return;

                const googleOAuth = window.google?.accounts?.oauth2;

                if (!googleOAuth) {
                    throw new Error('Google OAuth service is not available.');
                }

                codeClientRef.current = googleOAuth.initCodeClient({
                    client_id: checkedGoogleClientId,
                    scope: 'openid email profile',
                    ux_mode: 'popup',
                    callback: (response) => {
                        if (response.error) {
                            onErrorRef.current?.(
                                `Google login failed: ${response.error}`,
                            );
                            return;
                        }

                        if (!response.code) {
                            onErrorRef.current?.(
                                'Google authorization code was not returned.',
                            );
                            return;
                        }

                        onCodeRef.current(response.code);
                    },
                });

                setIsReady(true);
            } catch (error) {
                onErrorRef.current?.(
                    error instanceof Error
                        ? error.message
                        : 'Failed to initialize Google login.',
                );
            }
        }

        initializeGoogleAuth();

        return () => {
            isMounted = false;
        };
    }, []);

    const handleClick = () => {
        if (disabled) {
            return;
        }

        if (!isReady || !codeClientRef.current) {
            onErrorRef.current?.('Google login is not ready yet.');
            return;
        }

        codeClientRef.current.requestCode();
    };

    return (
        <div className="google-auth-button">
            <Button
                type="button"
                variants="secondary"
                disabled={disabled || !isReady}
                leftIcon={<Icon name="google" size={18} />}
                onClick={handleClick}
            >
                Continue with Google
            </Button>
        </div>
    );
};