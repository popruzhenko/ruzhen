import type { ReactNode } from 'react';

import { Header } from '../../ui/Header/Header';
import { Footer } from '../../ui/Footer/Footer';

import './UserLayout.scss';

interface UserLayoutProps {
    children: ReactNode;
}

const userNavItems = [
    {
        label: 'Articles',
        to: '/user/articles',
    },
    {
        label: 'About Us',
        to: '/user/about',
    },
    {
        label: 'Contact',
        to: '/user/contact',
    },
    {
        label: 'Privacy Policy',
        to: '/user/privacy',
    },
];

export const UserLayout = ({ children }: UserLayoutProps) => {
    return (
        <div className="user-layout">
            <Header variant="user" navItems={userNavItems} />

            <main className="user-layout__content">{children}</main>

            <Footer basePath="/user" />
        </div>
    );
};
