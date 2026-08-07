export type ClusterBlockType =
    | 'FACT'
    | 'CONTEXT'
    | 'OPINION'
    | 'fact'
    | 'context'
    | 'opinion';

export type ClusterBlockStance = 'PRO' | 'CONTRA' | 'NEUTRAL' | null;

export interface ClusterBlockProps {
    id: string;
    type: ClusterBlockType;
    title?: string | null;
    content: string;
    sourceName?: string | null;
    sourceUrl?: string | null;
    stance?: ClusterBlockStance;
    className?: string;
}