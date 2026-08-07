import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { getStoredUser, hasAuthSession } from '../lib/authStorage';

export const AdminRoute = () => {
    const location = useLocation();

    if (!hasAuthSession()) {
        const redirectTo = encodeURIComponent(
            location.pathname + location.search,
        );

        return <Navigate to={`/login?redirectTo=${redirectTo}`} replace />;
    }

    const user = getStoredUser();

    if (user?.role !== 'ADMIN') {
        return <Navigate to="/user/forbidden" replace />;
    }

    return <Outlet />;
};
