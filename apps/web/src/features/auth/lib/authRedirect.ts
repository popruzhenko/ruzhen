import type { UserRole } from '../api/authApi';

export function getSafeRedirectPath(redirectTo: string | null) {
    if (!redirectTo) return null;
    if (!redirectTo.startsWith('/')) return null;
    if (redirectTo.startsWith('//')) return null;

    return redirectTo;
}

interface GetAuthRedirectPathParams {
    role: UserRole;
    redirectTo?: string | null;
}

export function getAuthRedirectPath({
    role,
    redirectTo,
}: GetAuthRedirectPathParams) {
    const safeRedirectPath = getSafeRedirectPath(redirectTo ?? null);

    if (safeRedirectPath) {
        return safeRedirectPath;
    }

    if (role === 'ADMIN') {
        return '/admin';
    }

    return '/user';
}
