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
        to: '/articles',
    },
    {
        label: 'About Us',
        to: '/about',
    },
    {
        label: 'Contact',
        to: '/contact',
    },
    {
        label: 'Privacy Policy',
        to: '/privacy'
    }
];

export const UserLayout = ({ children }: UserLayoutProps) => {
    return (
        <div className="user-layout">
            <Header
                variant="user"
                navItems={userNavItems}
            />

            <main className="user-layout__content">
                {children}
            </main>

            <Footer basePath="/user" />
        </div>
    );
};