export type BadgeVariants =
    | 'fact'
    | 'context'
    | 'opinion'
    | 'pro'
    | 'contra'
    | 'neutral'
    | 'other'
    | 'new'
    | 'raw'
    | 'needs-review'
    | 'reviewed'
    | 'approved'
    | 'rejected'
    | 'embedded'
    | 'clustered'
    | 'processing'
    | 'error'
    | 'done'
    | 'pending'
    | 'primary'
    | 'draft'
    | 'published'
    | 'archived';

export interface TypesBadgeProps extends React.HTMLAttributes<HTMLDivElement> {
    type: BadgeVariants;
}

export const LabelMap: Record<BadgeVariants, string> = {
    fact: 'Fact',
    context: 'Context',
    opinion: 'Opinion',
    contra: 'Contra',
    pro: 'Pro',
    neutral: 'Neutral',
    other: 'Other',
    new: 'New',
    raw: 'Raw',
    'needs-review': 'Needs Review',
    reviewed: 'Reviewed',
    approved: 'Approved',
    rejected: 'Rejected',
    embedded: 'Embedded',
    clustered: 'Clustered',
    processing: 'Processing',
    error: 'Error',
    done: 'Done',
    pending: 'Pending',
    primary: 'Primary',
    draft: 'Draft',
    published: 'Published',
    archived: 'Archived',
};
