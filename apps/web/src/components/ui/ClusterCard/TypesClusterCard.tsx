import type { TagProps } from '../Tag/TypesTag';

export interface ClusterCardProps {
    title: string;
    summary?: string;
    tags?: TagProps[];
    badges?: Array<'fact' | 'context' | 'opinion'>;
    publishedAt?: string;
    country?: string;
    opinions?: {
        pro: number;
        contra: number;
        neutral: number;
    };
    imageUrl?: string;
    onClick?: () => void;
    className?: string;
}

export type BadgeType = 'fact' | 'context' | 'opinion';
