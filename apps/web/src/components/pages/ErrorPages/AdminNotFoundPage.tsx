import { PageState } from '../../ui/PageState/PageState';

export const AdminNotFoundPage = () => {
    return (
        <PageState
            variant="not-found"
            eyebrow="Admin page not found"
            title="This admin page does not exist"
            description="The admin route may be incorrect, moved, or not implemented yet."
            actionLabel="Back to Raw News"
            actionTo="/admin/raw-news"
        />
    );
};
