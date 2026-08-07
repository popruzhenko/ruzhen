import { type SyntheticEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Input } from '../../ui/Input/Input';
import { Button } from '../../ui/Button/Button';
import { Link } from '../../ui/Link/Link';

import { registerRequest } from '../../../features/auth/api/authApi';

import '../SignIn/SignIn.scss';

interface SignUpErrors {
    fullName?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
    form?: string;
}

const isValidEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

const isStrongEnoughPassword = (password: string) => {
    return /[A-Za-z]/.test(password) && /\d/.test(password);
};

export const SignUp = () => {
    const navigate = useNavigate();

    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    const [isLoading, setIsLoading] = useState(false);
    const [errors, setErrors] = useState<SignUpErrors>({});

    const validateForm = () => {
        const nextErrors: SignUpErrors = {};

        const trimmedFullName = fullName.trim();
        const trimmedEmail = email.trim();

        if (!trimmedFullName) {
            nextErrors.fullName = 'Full name is required.';
        } else if (trimmedFullName.length < 2) {
            nextErrors.fullName = 'Full name must be at least 2 characters.';
        }

        if (!trimmedEmail) {
            nextErrors.email = 'Email is required.';
        } else if (!isValidEmail(trimmedEmail)) {
            nextErrors.email = 'Enter a valid email address.';
        }

        if (!password) {
            nextErrors.password = 'Password is required.';
        } else if (password.length < 8) {
            nextErrors.password = 'Password must be at least 8 characters.';
        } else if (!isStrongEnoughPassword(password)) {
            nextErrors.password =
                'Password must contain at least one letter and one number.';
        }

        if (!confirmPassword) {
            nextErrors.confirmPassword = 'Please confirm your password.';
        } else if (password !== confirmPassword) {
            nextErrors.confirmPassword = 'Passwords do not match.';
        }

        return nextErrors;
    };

    const clearFieldError = (field: keyof SignUpErrors) => {
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
            await registerRequest({
                email: email.trim(),
                password,
            });

            navigate('/login', { replace: true });
        } catch (error) {
            setErrors({
                form:
                    error instanceof Error
                        ? error.message
                        : 'Failed to create account.',
            });
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <div className="auth">
            <div className="auth__logo">Ruzhen</div>

            <div className="auth__card">
                <div className="auth__header">
                    <h1 className="auth__title">Create your account</h1>

                    <p className="auth__subtitle">
                        Set up your account to start using Ruzhen.
                    </p>
                </div>

                <form className="auth__form" onSubmit={handleSubmit}>
                    <Input
                        label="Full name"
                        placeholder="Enter your full name"
                        requiredMark
                        value={fullName}
                        error={errors.fullName}
                        autoComplete="name"
                        disabled={isLoading}
                        onChange={(event) => {
                            setFullName(event.target.value);
                            clearFieldError('fullName');
                        }}
                    />

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
                        placeholder="Create a password"
                        requiredMark
                        value={password}
                        error={errors.password}
                        autoComplete="new-password"
                        disabled={isLoading}
                        onChange={(event) => {
                            setPassword(event.target.value);
                            clearFieldError('password');
                            clearFieldError('confirmPassword');
                        }}
                    />

                    <Input
                        label="Confirm password"
                        type="password"
                        placeholder="Repeat your password"
                        requiredMark
                        value={confirmPassword}
                        error={errors.confirmPassword}
                        autoComplete="new-password"
                        disabled={isLoading}
                        onChange={(event) => {
                            setConfirmPassword(event.target.value);
                            clearFieldError('confirmPassword');
                        }}
                    />

                    {errors.form && (
                        <div className="auth__error">
                            {errors.form}
                        </div>
                    )}

                    <Button
                        variants="primary"
                        disabled={isLoading}
                    >
                        {isLoading ? 'Creating account...' : 'Create account'}
                    </Button>
                </form>

                <div className="auth__footer">
                    <span>Already have an account?</span>

                    <Link href="/login" disabled={false}>
                        Sign in
                    </Link>
                </div>
            </div>
        </div>
    );
};