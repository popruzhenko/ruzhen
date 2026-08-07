import { Navigate } from 'react-router-dom';

import { getStoredUser } from '../../../features/auth/lib/authStorage';

import { NotFoundPage } from './NotFoundPage';

export const RoleAwareNotFoundPage = () => {
    const user = getStoredUser();

    if (user?.role === 'ADMIN') {
        return <Navigate to="/admin/not-found" replace />;
    }

    if (user?.role === 'USER') {
        return <Navigate to="/user/not-found" replace />;
    }

    return <NotFoundPage />;
};