import type { ReactNode } from 'react';

import { getStoredUser } from '../../../features/auth/lib/authStorage';

import { PublicLayout } from '../PublicLayout/PublicLayout';
import { UserLayout } from '../UserLayout/UserLayout';
import { USER_ROLE } from '../../../features/auth/lib/authConstants';

interface ReadableLayoutProps {
    children: ReactNode;
}

export const ReadableLayout = ({ children }: ReadableLayoutProps) => {
    const user = getStoredUser();

    if (user?.role === USER_ROLE.USER) {
        return <UserLayout>{children}</UserLayout>;
    }

    return <PublicLayout>{children}</PublicLayout>;
};
