import { type SyntheticEvent, useCallback, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { Input } from '../../ui/Input/Input';
import { Button } from '../../ui/Button/Button';
import { Link } from '../../ui/Link/Link';

import { saveAuthData } from '../../../features/auth/lib/authStorage';
import {
    loginRequest,
    loginWithGoogleRequest,
} from '../../../features/auth/api/authApi';
import { GoogleAuthButton } from '../../ui/GoogleAuthButton/GoogleAuthButton';

import './SignIn.scss';

interface SignInErrors {
    email?: string;
    password?: string;
    form?: string;
}

const getSafeRedirectPath = (redirectTo: string | null) => {
    if (!redirectTo) return null;
    if (!redirectTo.startsWith('/')) return null;
    if (redirectTo.startsWith('//')) return null;

    return redirectTo;
};

const isValidEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

export const SignIn = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    const [isLoading, setIsLoading] = useState(false);
    const [errors, setErrors] = useState<SignInErrors>({});

    const navigateAfterAuth = useCallback(
        (role: 'USER' | 'ADMIN') => {
            const redirectTo = getSafeRedirectPath(
                searchParams.get('redirectTo'),
            );

            if (redirectTo) {
                navigate(redirectTo, { replace: true });
                return;
            }

            if (role === 'ADMIN') {
                navigate('/admin', { replace: true });
                return;
            }

            navigate('/user', { replace: true });
        },
        [navigate, searchParams],
    );

    const validateForm = () => {
        const nextErrors: SignInErrors = {};

        const trimmedEmail = email.trim();

        if (!trimmedEmail) {
            nextErrors.email = 'Email is required.';
        } else if (!isValidEmail(trimmedEmail)) {
            nextErrors.email = 'Enter a valid email address.';
        }

        if (!password) {
            nextErrors.password = 'Password is required.';
        }

        return nextErrors;
    };

    const handleEmailChange = (value: string) => {
        setEmail(value);

        setErrors((currentErrors) => ({
            ...currentErrors,
            email: undefined,
            form: undefined,
        }));
    };

    const handlePasswordChange = (value: string) => {
        setPassword(value);

        setErrors((currentErrors) => ({
            ...currentErrors,
            password: undefined,
            form: undefined,
        }));
    };

    async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
        event.preventDefault();

        const validationErrors = validateForm();

        if (Object.keys(validationErrors).length > 0) {
            setErrors(validationErrors);
            return;
        }

        setErrors({});
        setIsLoading(true);

        try {
            const data = await loginRequest({
                email: email.trim(),
                password,
            });

            saveAuthData({
                accessToken: data.accessToken,
                sessionToken: data.sessionToken,
                user: data.user,
            });

            navigateAfterAuth(data.user.role);
        } catch {
            setErrors({
                form: 'Invalid email or password.',
            });
        } finally {
            setIsLoading(false);
        }
    }

    const handleGoogleCredential = useCallback(
        async (credential: string) => {
            setErrors({});
            setIsLoading(true);

            try {
                const data = await loginWithGoogleRequest({
                    credential,
                });

                saveAuthData({
                    accessToken: data.accessToken,
                    sessionToken: data.sessionToken,
                    user: data.user,
                });

                navigateAfterAuth(data.user.role);
            } catch (error) {
                setErrors({
                    form:
                        error instanceof Error
                            ? error.message
                            : 'Google login failed.',
                });
            } finally {
                setIsLoading(false);
            }
        },
        [navigateAfterAuth],
    );

    return (
        <div className="auth">
            <div className="auth__logo">Ruzhen</div>

            <div className="auth__card">
                <div className="auth__header">
                    <h1 className="auth__title">Log in to Ruzhen</h1>

                    <p className="auth__subtitle">
                        Enter your credentials to access your account.
                    </p>
                </div>

                <form className="auth__form" onSubmit={handleSubmit}>
                    <Input
                        label="Email"
                        type="email"
                        placeholder="you@example.com"
                        requiredMark
                        value={email}
                        error={errors.email}
                        autoComplete="email"
                        disabled={isLoading}
                        onChange={(event) =>
                            handleEmailChange(event.target.value)
                        }
                    />

                    <Input
                        label="Password"
                        type="password"
                        placeholder="Enter your password"
                        requiredMark
                        value={password}
                        error={errors.password}
                        autoComplete="current-password"
                        disabled={isLoading}
                        onChange={(event) =>
                            handlePasswordChange(event.target.value)
                        }
                    />

                    {errors.form && (
                        <div className="auth__error">{errors.form}</div>
                    )}

                    <Button variants="primary" disabled={isLoading}>
                        {isLoading ? 'Logging in...' : 'Log in'}
                    </Button>
                </form>

                <div className="auth__divider">
                    <span>or</span>
                </div>

                <GoogleAuthButton
                    disabled={isLoading}
                    onCredential={handleGoogleCredential}
                    onError={(message) => {
                        setErrors({
                            form: message,
                        });
                    }}
                />

                <div className="auth__footer">
                    <span>Don’t have an account?</span>

                    <Link href="/register" disabled={false}>
                        Sign up
                    </Link>
                </div>
            </div>
        </div>
    );
};