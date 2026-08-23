export type ContextBlockType = 'FACT' | 'CONTEXT' | 'OPINION';

export type OpinionStance = 'PRO' | 'CONTRA' | 'NEUTRAL';

export interface ContextualizationBlockItem {
    id: string;
    type: ContextBlockType;
    title: string | null;
    content: string;
    position: number;
    sourceName: string | null;
    sourceUrl: string | null;
    authorName: string | null;
    stance: OpinionStance | null;
    createdAt?: string;
    updatedAt?: string;
}

export interface ContextualizationCardProps {
    block: ContextualizationBlockItem;
    onUpdateBlock: (
        blockId: string,
        field:
            | 'title'
            | 'content'
            | 'stance'
            | 'sourceUrl'
            | 'sourceName'
            | 'authorName',
        value: string,
    ) => void;
    onRemoveBlock: (blockId: string) => void;
}
