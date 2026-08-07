import type { ReactNode } from 'react';

import { getStoredUser } from '../../../features/auth/lib/authStorage';

import { PublicLayout } from '../PublicLayout/PublicLayout';
import { UserLayout } from '../UserLayout/UserLayout';

interface ReadableLayoutProps {
    children: ReactNode;
}

export const ReadableLayout = ({ children }: ReadableLayoutProps) => {
    const user = getStoredUser();

    if (user?.role === 'USER') {
        return <UserLayout>{children}</UserLayout>;
    }

    return <PublicLayout>{children}</PublicLayout>;
};
