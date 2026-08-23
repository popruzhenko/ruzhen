import { useQuery } from '@tanstack/react-query';
import { getClusterById } from '../api/getClusterById';
import { queryKeys } from '../../../shared/lib/queryKeys';

export function useClusterByIdQuery(clusterId: string | null) {
    return useQuery({
        queryKey: queryKeys.clusters.detail(clusterId as string),
        queryFn: () => getClusterById(clusterId as string),
        enabled: Boolean(clusterId),
    });
}
