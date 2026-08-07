import { PageState } from '../../../ui/PageState/PageState';

export const AdminProfilePage = () => {
    return (
        <PageState
            variant="empty"
            eyebrow="Admin profile"
            title="Profile page is not configured yet"
            description="Admin profile settings will appear here later."
            actionLabel="Back to Raw News"
            actionTo="/admin/raw-news"
        />
    );
};