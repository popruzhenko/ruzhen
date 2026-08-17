import { Navigate } from 'react-router-dom';

import { getStoredUser } from '../../../features/auth/lib/authStorage';

import { ForbiddenPage } from './ForbiddenPage';
import { USER_ROLE } from '../../../features/auth/lib/authConstants';

export const RoleAwareForbiddenPage = () => {
    const user = getStoredUser();

    if (user?.role === USER_ROLE.ADMIN) {
        return <Navigate to="/admin/forbidden" replace />;
    }

    if (user?.role === USER_ROLE.USER) {
        return <Navigate to="/user/forbidden" replace />;
    }

    return <ForbiddenPage />;
};
