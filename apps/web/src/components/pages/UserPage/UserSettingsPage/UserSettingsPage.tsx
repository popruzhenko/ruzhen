import { UserLayout } from '../../../layouts/UserLayout/UserLayout';
import { PageState } from '../../../ui/PageState/PageState';

export const UserSettingsPage = () => {
    return (
        <UserLayout>
            <PageState
                variant="empty"
                eyebrow="User settings"
                title="Settings page is not configured yet"
                description="Notification preferences, saved topics and reading preferences will appear here later."
                actionLabel="Back to articles"
                actionTo="/user"
            />
        </UserLayout>
    );
};