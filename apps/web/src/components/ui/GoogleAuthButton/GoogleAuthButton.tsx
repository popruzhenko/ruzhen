import { useEffect, useRef, useState } from 'react';

import { Button } from '../Button/Button';
import { Icon } from '../Icon/Icon';

interface GoogleAuthButtonProps {
    disabled?: boolean;
    onCredential: (credential: string) => void;
    onError?: (message: string) => void;
}

interface GoogleCredentialResponse {
    credential?: string;
}

interface GooglePromptMomentNotification {
    isNotDisplayed: () => boolean;
    isSkippedMoment: () => boolean;
    getNotDisplayedReason: () => string;
    getSkippedReason: () => string;
}

declare global {
    interface Window {
        google?: {
            accounts: {
                id: {
                    initialize: (config: {
                        client_id: string;
                        callback: (
                            response: GoogleCredentialResponse,
                        ) => void;
                    }) => void;
                    prompt: (
                        momentListener?: (
                            notification: GooglePromptMomentNotification,
                        ) => void,
                    ) => void;
                    cancel: () => void;
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

export const GoogleAuthButton = ({
    disabled = false,
    onCredential,
    onError,
}: GoogleAuthButtonProps) => {
    const [isReady, setIsReady] = useState(false);
    const isInitializedRef = useRef(false);

    useEffect(() => {
        const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as
            | string
            | undefined;

        if (!googleClientId) {
            onError?.('Google client id is not configured.');
            return;
        }

        let isMounted = true;

        loadGoogleScript()
            .then(() => {
                if (!isMounted) return;

                if (!window.google) {
                    throw new Error(
                        'Google Identity Services is not available.',
                    );
                }

                if (!isInitializedRef.current) {
                    window.google.accounts.id.initialize({
                        client_id: googleClientId,
                        callback: (response) => {
                            if (!response.credential) {
                                onError?.(
                                    'Google credential was not returned.',
                                );
                                return;
                            }

                            onCredential(response.credential);
                        },
                    });

                    isInitializedRef.current = true;
                }

                setIsReady(true);
            })
            .catch((error) => {
                onError?.(
                    error instanceof Error
                        ? error.message
                        : 'Failed to initialize Google login.',
                );
            });

        return () => {
            isMounted = false;
        };
    }, [onCredential, onError]);

    const handleClick = () => {
        if (disabled) {
            return;
        }

        if (!isReady || !window.google) {
            onError?.('Google login is not ready yet.');
            return;
        }

        window.google.accounts.id.prompt((notification) => {
            if (notification.isNotDisplayed()) {
                onError?.(
                    `Google login was not displayed: ${notification.getNotDisplayedReason()}`,
                );
                return;
            }

            if (notification.isSkippedMoment()) {
                onError?.(
                    `Google login was skipped: ${notification.getSkippedReason()}`,
                );
            }
        });
    };

    return (
        <Button
            type="button"
            variants="secondary"
            disabled={disabled || !isReady}
            leftIcon={<Icon name="google" size={18} />}
            onClick={handleClick}
            className='google-auth-button'
        >
            Continue with Google
        </Button>
    );
};