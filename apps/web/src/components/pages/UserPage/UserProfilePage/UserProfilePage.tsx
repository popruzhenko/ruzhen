import { UserLayout } from '../../../layouts/UserLayout/UserLayout';
import { PageState } from '../../../ui/PageState/PageState';

export const UserProfilePage = () => {
    return (
        <UserLayout>
            <PageState
                variant="empty"
                eyebrow="User profile"
                title="Profile page is not configured yet"
                description="Your account information and personal reader preferences will appear here later."
                actionLabel="Back to articles"
                actionTo="/user"
            />
        </UserLayout>
    );
};