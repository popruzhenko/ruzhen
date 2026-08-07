import { Navigate } from 'react-router-dom';

import { getStoredUser } from '../../../features/auth/lib/authStorage';

import { ForbiddenPage } from './ForbiddenPage';

export const RoleAwareForbiddenPage = () => {
    const user = getStoredUser();

    if (user?.role === 'ADMIN') {
        return <Navigate to="/admin/forbidden" replace />;
    }

    if (user?.role === 'USER') {
        return <Navigate to="/user/forbidden" replace />;
    }

    return <ForbiddenPage />;
};
