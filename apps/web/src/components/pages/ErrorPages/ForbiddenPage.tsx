import { ReadableLayout } from '../../layouts/ReadableLayout/ReadableLayout';
import { PageState } from '../../ui/PageState/PageState';

export const ForbiddenPage = () => {
    return (
        <ReadableLayout>
            <PageState
                variant="forbidden"
                eyebrow="Access denied"
                title="You do not have access to this page"
                description="This page is restricted or unavailable for your current permissions."
                actionLabel="Back to articles"
                actionTo="/articles"
            />
        </ReadableLayout>
    );
};
