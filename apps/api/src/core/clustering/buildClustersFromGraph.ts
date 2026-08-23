import { SimilarityGraph, ClusterGroup } from './clustering.types';

export function buildClustersFromGraph(graph: SimilarityGraph): ClusterGroup[] {
    const visited = new Set<string>();
    const clusters: ClusterGroup[] = [];

    function dfs(start: string, group: string[]) {
        const stack = [start];

        while (stack.length > 0) {
            const node = stack.pop()!;

            if (visited.has(node)) {
                continue;
            }

            visited.add(node);
            group.push(node);

            for (const neighbor of graph[node]) {
                if (!visited.has(neighbor.to)) {
                    stack.push(neighbor.to);
                }
            }
        }
    }

    for (const node of Object.keys(graph)) {
        if (!visited.has(node)) {
            const group: string[] = [];
            dfs(node, group);

            clusters.push({
                articleIds: group,
            });
        }
    }

    return clusters;
}
