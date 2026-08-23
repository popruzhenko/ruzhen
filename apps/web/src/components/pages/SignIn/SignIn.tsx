import { type SyntheticEvent, useCallback, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { Input } from '../../ui/Input/Input';
import { Button } from '../../ui/Button/Button';
import { Link } from '../../ui/Link/Link';

import {
    loginRequest,
    loginWithGoogleRequest,
    type LoginResponse,
} from '../../../features/auth/api/authApi';

import { saveAuthData } from '../../../features/auth/lib/authStorage';
import { getAuthRedirectPath } from '../../../features/auth/lib/authRedirect';
import { isValidEmail } from '../../../features/auth/lib/authValidation';
import { GoogleAuthButton } from '../../../components/ui/GoogleAuthButton/GoogleAuthButton';

import './SignIn.scss';

interface SignInErrors {
    email?: string;
    password?: string;
    form?: string;
}

export const SignIn = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    const [isLoading, setIsLoading] = useState(false);
    const [errors, setErrors] = useState<SignInErrors>({});

    const handleAuthSuccess = useCallback(
        (data: LoginResponse) => {
            saveAuthData({
                accessToken: data.accessToken,
                sessionToken: data.sessionToken,
                user: data.user,
            });

            const redirectPath = getAuthRedirectPath({
                role: data.user.role,
                redirectTo: searchParams.get('redirectTo'),
            });

            navigate(redirectPath, { replace: true });
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

    const clearFieldError = (field: keyof SignInErrors) => {
        setErrors((currentErrors) => ({
            ...currentErrors,
            [field]: undefined,
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

            handleAuthSuccess(data);
        } catch {
            setErrors({
                form: 'Invalid email or password.',
            });
        } finally {
            setIsLoading(false);
        }
    }

    const handleGoogleCode = useCallback(
        async (code: string) => {
            setErrors({});
            setIsLoading(true);

            try {
                const data = await loginWithGoogleRequest({
                    code,
                });

                handleAuthSuccess(data);
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
        [handleAuthSuccess],
    );

    const handleGoogleError = useCallback((message: string) => {
        setErrors({
            form: message,
        });
    }, []);

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
                        onChange={(event) => {
                            setEmail(event.target.value);
                            clearFieldError('email');
                        }}
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
                        onChange={(event) => {
                            setPassword(event.target.value);
                            clearFieldError('password');
                        }}
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
                    onCode={handleGoogleCode}
                    onError={handleGoogleError}
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
