import { UserLayout } from '../../layouts/UserLayout/UserLayout';
import { PageState } from '../../ui/PageState/PageState';

export const UserNotFoundPage = () => {
    return (
        <UserLayout>
            <PageState
                variant="not-found"
                eyebrow="Page not found"
                title="This user page does not exist"
                description="The page may have been moved, deleted, or the URL may be incorrect."
                actionLabel="Back to articles"
                actionTo="/user"
            />
        </UserLayout>
    );
};
