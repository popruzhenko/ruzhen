import { UserLayout } from '../../layouts/UserLayout/UserLayout';
import { PageState } from '../../ui/PageState/PageState';

export const UserForbiddenPage = () => {
    return (
        <UserLayout>
            <PageState
                variant="forbidden"
                eyebrow="Access denied"
                title="You do not have access to this page"
                description="This section is restricted or unavailable for your current permissions."
                actionLabel="Back to articles"
                actionTo="/user"
            />
        </UserLayout>
    );
};