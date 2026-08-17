import { Navigate } from 'react-router-dom';

import { getStoredUser } from '../../../features/auth/lib/authStorage';

import { NotFoundPage } from './NotFoundPage';
import { USER_ROLE } from '../../../features/auth/lib/authConstants';

export const RoleAwareNotFoundPage = () => {
    const user = getStoredUser();

    if (user?.role === USER_ROLE.ADMIN) {
        return <Navigate to="/admin/not-found" replace />;
    }

    if (user?.role === USER_ROLE.USER) {
        return <Navigate to="/user/not-found" replace />;
    }

    return <NotFoundPage />;
};
