export interface ExistingClusterSuggestionsProps {
    disabled: boolean;
    hasUnsavedChanges: boolean;
    dataRevision: string;
    onBusyChange: (busy: boolean) => void;
    onOpenCluster: (clusterId: string) => void;
}

export type PendingAction = {
    type: 'generate' | 'attach' | 'reject';
    candidateId?: string;
};
