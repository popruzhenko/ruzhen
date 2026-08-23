import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { USER_ROLE } from '../../../features/auth/lib/authConstants';

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

    if (user?.role !== USER_ROLE.ADMIN) {
        return <Navigate to="/user/forbidden" replace />;
    }

    return <Outlet />;
};
