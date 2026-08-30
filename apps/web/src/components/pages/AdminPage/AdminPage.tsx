import { Outlet } from 'react-router-dom';
import { Header } from '../../ui/Header/Header';
import { NavigationDashboard } from './Dashboard/NavigationDashboard/NavigationDashboard';
import './Dashboard/NavigationDashboard/NavigationDashboard.scss';
import './AdminPage.scss';

export const AdminPage = () => {
    return (
        <>
            <Header
                variant="admin"
                userName="Vladimir Ruzhen"
                navItems={[
                    {
                        label: 'Articles',
                        to: '/admin/public-articles',
                        isActive:
                            location.pathname === '/admin/public-articles' ||
                            location.pathname.startsWith(
                                '/admin/public-articles/',
                            ),
                    },
                ]}
            />

            <div className="admin-page">
                <NavigationDashboard
                    navItems={[
                        { label: 'Publication', to: '/admin/publication' },
                        {
                            label: 'Contextualization',
                            to: '/admin/contextualization',
                        },
                        { label: 'Clustering', to: '/admin/clustering' },
                        { label: 'Raw News', to: '/admin/raw-news' },
                    ]}
                />

                <main className="admin-page__content">
                    <Outlet />
                </main>
            </div>
        </>
    );
};
