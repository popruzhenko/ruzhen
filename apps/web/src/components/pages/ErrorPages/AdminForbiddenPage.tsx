import { PageState } from '../../ui/PageState/PageState';

export const AdminForbiddenPage = () => {
    return (
        <PageState
            variant="forbidden"
            eyebrow="Access denied"
            title="You do not have access to this admin section"
            description="Your account is authenticated, but this admin resource is restricted or unavailable for your permissions."
            actionLabel="Back to Raw News"
            actionTo="/admin/raw-news"
        />
    );
};
