import { ReadableLayout } from '../../layouts/ReadableLayout/ReadableLayout';
import { PageState } from '../../ui/PageState/PageState';

export const ServerErrorPage = () => {
    return (
        <ReadableLayout>
            <PageState
                variant="error"
                eyebrow="Server error"
                title="Something went wrong"
                description="The server could not complete the request. Please try again later."
                actionLabel="Back to articles"
                actionTo="/articles"
            />
        </ReadableLayout>
    );
};