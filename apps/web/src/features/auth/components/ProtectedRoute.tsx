import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { hasAuthSession } from '../lib/authStorage';

export const ProtectedRoute = () => {
    const location = useLocation();

    if (!hasAuthSession()) {
        const redirectTo = encodeURIComponent(
            location.pathname + location.search,
        );

        return (
            <Navigate
                to={`/login?redirectTo=${redirectTo}`}
                replace
            />
        );
    }

    return <Outlet />;
};