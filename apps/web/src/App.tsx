import { Navigate, Route, Routes } from 'react-router-dom';

import { SignIn } from './components/pages/SignIn/SignIn';
import { SignUp } from './components/pages/SignUp/SignUp';
import { UserPage } from './components/pages/UserPage/UserPage';

import { AdminPage } from './components/pages/AdminPage/AdminPage';
import { RawNewsPage } from './components/pages/AdminPage/Dashboard/RawNewsPage/RawNewsPage';
import { ClusteringPage } from './components/pages/AdminPage/Dashboard/ClusteringPage/ClusteringPage';
import { ContextualizationPage } from './components/pages/AdminPage/Dashboard/ContextualizationPage/ContextualizationPage';
import { PublicationPage } from './components/pages/AdminPage/Dashboard/PublicationPage/PublicationPage';
import { PublicArticlesPreviewPage } from './components/pages/AdminPage/Dashboard/PublicArticlesPreviewPage/PublicArticlesPreviewPage';
import { PublicArticleDetailsPreviewPage } from './components/pages/AdminPage/Dashboard/PublicArticleDetailsPreviewPage/PublicArticleDetailsPreviewPage';

import { PublicArticlesPage } from './components/pages/PublicArticlesPage/PublicArticlesPage';
import { PublicArticleDetailsPage } from './components/pages/PublicArticleDetailsPage/PublicArticleDetailsPage';

import { UnauthorizedPage } from './components/pages/ErrorPages/UnauthorizedPage';
import { AboutPage } from './components/pages/AboutPage/AboutPage';
import { ContactPage } from './components/pages/ContactPage/ContactPage';
import { PrivacyPolicyPage } from './components/pages/PrivacyPolicyPage/PrivacyPolicyPage';
import { ServerErrorPage } from './components/pages/ErrorPages/ServerErrorPage';
import { AdminNotFoundPage } from './components/pages/ErrorPages/AdminNotFoundPage';
import { UserNotFoundPage } from './components/pages/ErrorPages/UserNotFoundPage';
import { RoleAwareNotFoundPage } from './components/pages/ErrorPages/RoleAwareNotFoundPage';
import { AdminForbiddenPage } from './components/pages/ErrorPages/AdminForbiddenPage';
import { UserForbiddenPage } from './components/pages/ErrorPages/UserForbiddenPage';
import { RoleAwareForbiddenPage } from './components/pages/ErrorPages/RoleAwareForbiddenPage';
import { AdminProfilePage } from './components/pages/AdminPage/AdminProfilePage/AdminProfilePage';
import { AdminSettingsPage } from './components/pages/AdminPage/AdminSettingsPage/AdminSettingsPage';
import { UserProfilePage } from './components/pages/UserPage/UserProfilePage/UserProfilePage';
import { UserSettingsPage } from './components/pages/UserPage/UserSettingsPage/UserSettingsPage';
import { UserArticleDetailsPage } from './components/pages/UserPage/UserArticleDetailsPage/UserArticleDetailsPage';

import { ProtectedRoute } from './features/auth/components/ProtectedRoute';
import { AdminRoute } from './features/auth/components/AdminRoute';

export function App() {
    return (
        <Routes>
            <Route path="/" element={<PublicArticlesPage />} />

            <Route path="/articles" element={<PublicArticlesPage />} />
            <Route
                path="/articles/:humanId"
                element={<PublicArticleDetailsPage />}
            />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/contact" element={<ContactPage />} />
            <Route path="/privacy" element={<PrivacyPolicyPage />} />

            <Route path="/login" element={<SignIn />} />
            <Route path="/register" element={<SignUp />} />

            <Route element={<ProtectedRoute />}>
                <Route path="/user" element={<UserPage />} />
                <Route
                    path="/user/articles/:humanId"
                    element={<UserArticleDetailsPage />}
                />
                <Route path="/user/profile" element={<UserProfilePage />} />
                <Route path="/user/settings" element={<UserSettingsPage />} />

                <Route path="/user/about" element={<AboutPage />} />
                <Route path="/user/contact" element={<ContactPage />} />
                <Route path="/user/privacy" element={<PrivacyPolicyPage />} />

                <Route path="/user/forbidden" element={<UserForbiddenPage />} />
                <Route path="/user/not-found" element={<UserNotFoundPage />} />
                <Route path="/user/*" element={<UserNotFoundPage />} />
            </Route>

            <Route element={<AdminRoute />}>
                <Route path="/admin" element={<AdminPage />}>
                    <Route index element={<Navigate to="raw-news" replace />} />
                    <Route path="raw-news" element={<RawNewsPage />} />
                    <Route path="clustering" element={<ClusteringPage />} />
                    <Route
                        path="contextualization"
                        element={<ContextualizationPage />}
                    />
                    <Route path="publication" element={<PublicationPage />} />

                    <Route
                        path="public-articles"
                        element={<PublicArticlesPreviewPage />}
                    />
                    <Route
                        path="public-articles/:humanId"
                        element={<PublicArticleDetailsPreviewPage />}
                    />

                    <Route path="profile" element={<AdminProfilePage />} />
                    <Route path="settings" element={<AdminSettingsPage />} />

                    <Route path="forbidden" element={<AdminForbiddenPage />} />
                    <Route path="not-found" element={<AdminNotFoundPage />} />
                    <Route path="*" element={<AdminNotFoundPage />} />
                </Route>
            </Route>

            <Route path="/401" element={<UnauthorizedPage />} />
            <Route path="/403" element={<RoleAwareForbiddenPage />} />
            <Route path="/500" element={<ServerErrorPage />} />

            <Route path="*" element={<RoleAwareNotFoundPage />} />
        </Routes>
    );
}
