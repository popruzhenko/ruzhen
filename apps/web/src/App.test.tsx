import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { saveAuthData } from './features/auth/lib/authStorage';
import type { UserRole } from './features/auth/lib/authConstants';

// Keep the actual route tree, guards, admin navigation and error pages. Page
// bodies have their own integration tests and do not need to fetch here.
vi.mock('./components/pages/SignIn/SignIn', () => ({
    SignIn: () => <h1>Sign in</h1>,
}));
vi.mock('./components/pages/SignUp/SignUp', () => ({
    SignUp: () => <h1>Sign up</h1>,
}));
vi.mock('./components/pages/PublicArticlesPage/PublicArticlesPage', () => ({
    PublicArticlesPage: () => <h1>Public articles</h1>,
}));
vi.mock(
    './components/pages/PublicArticleDetailsPage/PublicArticleDetailsPage',
    () => ({ PublicArticleDetailsPage: () => <h1>Public article details</h1> }),
);
vi.mock('./components/pages/AboutPage/AboutPage', () => ({
    AboutPage: () => <h1>About</h1>,
}));
vi.mock('./components/pages/ContactPage/ContactPage', () => ({
    ContactPage: () => <h1>Contact</h1>,
}));
vi.mock('./components/pages/PrivacyPolicyPage/PrivacyPolicyPage', () => ({
    PrivacyPolicyPage: () => <h1>Privacy</h1>,
}));
vi.mock('./components/pages/UserPage/UserPage', () => ({
    UserPage: () => <h1>User articles</h1>,
}));
vi.mock(
    './components/pages/UserPage/UserArticleDetailsPage/UserArticleDetailsPage',
    () => ({ UserArticleDetailsPage: () => <h1>User article details</h1> }),
);
vi.mock('./components/pages/UserPage/UserProfilePage/UserProfilePage', () => ({
    UserProfilePage: () => <h1>User profile</h1>,
}));
vi.mock(
    './components/pages/UserPage/UserSettingsPage/UserSettingsPage',
    () => ({ UserSettingsPage: () => <h1>User settings</h1> }),
);
vi.mock(
    './components/pages/AdminPage/Dashboard/RawNewsPage/RawNewsPage',
    () => ({ RawNewsPage: () => <h1>Raw news</h1> }),
);
vi.mock(
    './components/pages/AdminPage/Dashboard/ClusteringPage/ClusteringPage',
    () => ({ ClusteringPage: () => <h1>Clustering</h1> }),
);
vi.mock(
    './components/pages/AdminPage/Dashboard/ContextualizationPage/ContextualizationPage',
    () => ({ ContextualizationPage: () => <h1>Contextualization</h1> }),
);
vi.mock(
    './components/pages/AdminPage/Dashboard/PublicationPage/PublicationPage',
    () => ({ PublicationPage: () => <h1>Publication</h1> }),
);
vi.mock(
    './components/pages/AdminPage/Dashboard/PublicArticlesPreviewPage/PublicArticlesPreviewPage',
    () => ({ PublicArticlesPreviewPage: () => <h1>Articles preview</h1> }),
);
vi.mock(
    './components/pages/AdminPage/Dashboard/PublicArticleDetailsPreviewPage/PublicArticleDetailsPreviewPage',
    () => ({
        PublicArticleDetailsPreviewPage: () => <h1>Article details preview</h1>,
    }),
);
vi.mock(
    './components/pages/AdminPage/AdminProfilePage/AdminProfilePage',
    () => ({ AdminProfilePage: () => <h1>Admin profile</h1> }),
);
vi.mock(
    './components/pages/AdminPage/AdminSettingsPage/AdminSettingsPage',
    () => ({ AdminSettingsPage: () => <h1>Admin settings</h1> }),
);

function Location() {
    const location = useLocation();
    return (
        <output data-testid="location">
            {location.pathname + location.search}
        </output>
    );
}

const mount = (path: string, role?: UserRole) => {
    if (role) {
        saveAuthData({
            accessToken: 'token',
            sessionToken: 'session',
            user: {
                id: 'user',
                email: 'reader@example.test',
                role,
                createdAt: '2026-01-01T00:00:00Z',
            },
        });
    }
    render(
        <MemoryRouter initialEntries={[path]}>
            <App />
            <Location />
        </MemoryRouter>,
    );
};

describe('application routes', () => {
    it.each([
        ['/', 'Public articles'],
        ['/articles', 'Public articles'],
        ['/articles/NEWS-42', 'Public article details'],
        ['/about', 'About'],
        ['/contact', 'Contact'],
        ['/privacy', 'Privacy'],
        ['/login', 'Sign in'],
        ['/register', 'Sign up'],
        ['/401', 'You need to log in'],
        ['/500', 'Something went wrong'],
    ])('opens %s for a visitor', (path, title) => {
        mount(path);
        expect(
            screen.getByRole('heading', { name: title }),
        ).toBeInTheDocument();
    });

    it.each([
        ['/user', 'User articles'],
        ['/user/articles/NEWS-42', 'User article details'],
        ['/user/profile', 'User profile'],
        ['/user/settings', 'User settings'],
        ['/user/about', 'About'],
        ['/user/contact', 'Contact'],
        ['/user/privacy', 'Privacy'],
    ])('opens %s for an authenticated reader', (path, title) => {
        mount(path, 'USER');
        expect(
            screen.getByRole('heading', { name: title }),
        ).toBeInTheDocument();
    });

    it.each([
        ['/admin/raw-news', 'Raw news'],
        ['/admin/clustering', 'Clustering'],
        ['/admin/contextualization', 'Contextualization'],
        ['/admin/publication', 'Publication'],
        ['/admin/public-articles', 'Articles preview'],
        ['/admin/public-articles/NEWS-42', 'Article details preview'],
        ['/admin/profile', 'Admin profile'],
        ['/admin/settings', 'Admin settings'],
    ])('opens %s for an administrator', (path, title) => {
        mount(path, 'ADMIN');
        expect(
            screen.getByRole('heading', { name: title }),
        ).toBeInTheDocument();
    });

    it('sends the admin index to the raw news dashboard', () => {
        mount('/admin', 'ADMIN');
        expect(
            screen.getByRole('heading', { name: 'Raw news' }),
        ).toBeInTheDocument();
        expect(screen.getByTestId('location')).toHaveTextContent(
            '/admin/raw-news',
        );
    });

    it.each([
        '/user/articles/NEWS-42?page=2',
        '/admin/publication?status=DRAFT',
    ])('preserves the requested %s path through login', (path) => {
        mount(path);
        expect(
            screen.getByRole('heading', { name: 'Sign in' }),
        ).toBeInTheDocument();
        expect(screen.getByTestId('location').textContent).toBe(
            `/login?redirectTo=${encodeURIComponent(path)}`,
        );
    });

    it('denies administrator routes to a reader', () => {
        mount('/admin/publication', 'USER');
        expect(screen.getByTestId('location')).toHaveTextContent(
            '/user/forbidden',
        );
        expect(
            screen.queryByRole('heading', { name: 'Publication' }),
        ).not.toBeInTheDocument();
    });

    it.each([
        [undefined, '/unknown', 'This page does not exist', '/unknown'],
        [
            'USER',
            '/unknown',
            'This user page does not exist',
            '/user/not-found',
        ],
        [
            'ADMIN',
            '/unknown',
            'This admin page does not exist',
            '/admin/not-found',
        ],
        [
            'USER',
            '/user/missing',
            'This user page does not exist',
            '/user/missing',
        ],
        [
            'ADMIN',
            '/admin/missing',
            'This admin page does not exist',
            '/admin/missing',
        ],
    ] as const)(
        'shows the appropriate missing page for role %s at %s',
        (role, path, title, location) => {
            mount(path, role);
            expect(
                screen.getByRole('heading', { name: title }),
            ).toBeInTheDocument();
            expect(screen.getByTestId('location')).toHaveTextContent(location);
        },
    );

    it.each([
        [undefined, '/403'],
        ['USER', '/user/forbidden'],
        ['ADMIN', '/admin/forbidden'],
    ] as const)('routes the forbidden page for role %s', (role, path) => {
        mount('/403', role);
        expect(screen.getByTestId('location')).toHaveTextContent(path);
    });

    it('marks dashboard navigation active after following a link', async () => {
        const user = userEvent.setup();
        mount('/admin/raw-news', 'ADMIN');
        expect(screen.getByRole('link', { name: 'Raw News' })).toHaveClass(
            'navigation_dashboard__item--active',
        );
        await user.click(screen.getByRole('link', { name: 'Clustering' }));
        expect(
            screen.getByRole('heading', { name: 'Clustering' }),
        ).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Clustering' })).toHaveClass(
            'navigation_dashboard__item--active',
        );
        expect(screen.getByRole('link', { name: 'Raw News' })).not.toHaveClass(
            'navigation_dashboard__item--active',
        );
    });

    it('keeps the public preview header link active on article detail routes', () => {
        mount('/admin/public-articles/NEWS-42', 'ADMIN');
        expect(screen.getByRole('link', { name: 'Articles' })).toHaveClass(
            'ui-header__nav-link--active',
        );
    });
});
