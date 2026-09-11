import type { useClusterBulk } from './useClusterBulk';

export interface ClusterBulkPanelProps {
    action: 'CONTEXTUALIZE' | 'PUBLISH';
    bulk: ReturnType<typeof useClusterBulk>;
    disabled?: boolean;
    disabledReason?: string;
    onStart?: () => Promise<void>;
    onRetry?: () => Promise<void>;
}
