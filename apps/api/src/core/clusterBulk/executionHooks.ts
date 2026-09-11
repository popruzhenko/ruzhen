import type { Prisma } from '@prisma/client';

/** The durable worker locks/fences its job before any cluster lock is taken. */
export interface ClusterBulkExecutionHooks {
    beforeTransaction(tx: Prisma.TransactionClient): Promise<void>;
    beforeGenerate?(): Promise<void>;
    onClaim(
        tx: Prisma.TransactionClient,
        executionRevision: string,
    ): Promise<void>;
    onSuccess(tx: Prisma.TransactionClient): Promise<void>;
}
