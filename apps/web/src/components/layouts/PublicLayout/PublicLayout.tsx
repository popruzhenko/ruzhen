import type { ReactNode } from 'react';

import { Header } from '../../ui/Header/Header';
import { Footer } from '../../ui/Footer/Footer';

import './PublicLayout.scss';

interface PublicLayoutProps {
    children: ReactNode;
}

const publicNavItems = [
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

export const PublicLayout = ({ children }: PublicLayoutProps) => {
    return (
        <main className="public-layout">
            <Header
                variant="public"
                navItems={publicNavItems}
            />

            <div className="public-layout__content">
                {children}
            </div>

            <Footer  basePath="" />
        </main>
    );
};