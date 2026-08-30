import { PageState } from '../../../ui/PageState/PageState';

export const AdminSettingsPage = () => {
    return (
        <PageState
            variant="empty"
            eyebrow="Admin settings"
            title="Settings page is not configured yet"
            description="Admin configuration, source settings and preferences will appear here later."
            actionLabel="Back to Raw News"
            actionTo="/admin/raw-news"
        />
    );
};
