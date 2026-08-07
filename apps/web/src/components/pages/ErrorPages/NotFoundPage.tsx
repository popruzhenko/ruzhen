import { ReadableLayout } from '../../layouts/ReadableLayout/ReadableLayout';
import { PageState } from '../../ui/PageState/PageState';

export const NotFoundPage = () => {
    return (
        <ReadableLayout>
            <PageState
                variant="not-found"
                eyebrow="Page not found"
                title="This page does not exist"
                description="The page may have been moved, deleted, or the URL may be incorrect."
                actionLabel="Back to articles"
                actionTo="/articles"
            />
        </ReadableLayout>
    );
};