import { ReadableLayout } from '../../layouts/ReadableLayout/ReadableLayout';
import { PageState } from '../../ui/PageState/PageState';

export const UnauthorizedPage = () => {
    return (
        <ReadableLayout>
            <PageState
                variant="unauthorized"
                eyebrow="Unauthorized"
                title="You need to log in"
                description="Please log in to access this page."
                actionLabel="Go to login"
                actionTo="/login"
            />
        </ReadableLayout>
    );
};