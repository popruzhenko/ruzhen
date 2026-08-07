import { useQuery } from '@tanstack/react-query';
import { getClusterById } from '../api/getClusterById';

export function useClusterByIdQuery(clusterId: string | null) {
    return useQuery({
        queryKey: ['cluster', clusterId],
        queryFn: () => getClusterById(clusterId as string),
        enabled: Boolean(clusterId),
    });
}
