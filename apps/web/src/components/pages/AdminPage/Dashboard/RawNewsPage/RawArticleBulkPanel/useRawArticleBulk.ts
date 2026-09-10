import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
    executeRawArticleBulk,
    previewRawArticleBulk,
} from '../../../../../../entities/raw-news/api/rawArticles';
import { invalidateRawArticleQueries } from '../../../../../../entities/raw-news/hooks/invalidateRawArticleQueries';
import type {
    RawArticleBulkAction,
    RawArticleBulkPreview,
    RawArticleBulkResult,
    RawArticleBulkScope,
} from '../../../../../../entities/raw-news/model/rawArticles';
import type {
    RawArticleReport,
    RawArticleReportRow,
} from './TypesRawArticleBulkPanel';

const messageFrom = (error: unknown) =>
    error instanceof Error
        ? error.message
        : 'The request failed. Please try again.';
const BATCH_SIZE = 25;

export function useRawArticleBulk(
    acquireLock: () => boolean,
    releaseLock: () => void,
) {
    const queryClient = useQueryClient();
    const [preview, setPreview] = useState<RawArticleBulkPreview | null>(null);
    const [report, setReport] = useState<RawArticleReport | null>(null);
    const [isPreparing, setIsPreparing] = useState(false);
    const [isRunning, setIsRunning] = useState(false);
    const [isStopping, setIsStopping] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const mounted = useRef(true);
    const running = useRef(false);
    const stopRequested = useRef(false);
    const previewAbort = useRef<AbortController | null>(null);

    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
            stopRequested.current = true;
            previewAbort.current?.abort();
        };
    }, []);

    useEffect(() => {
        if (!isRunning) return;
        const beforeUnload = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', beforeUnload);
        return () => window.removeEventListener('beforeunload', beforeUnload);
    }, [isRunning]);

    const prepare = async (
        action: RawArticleBulkAction,
        scope: RawArticleBulkScope,
    ) => {
        if (!acquireLock()) return;
        setIsPreparing(true);
        setError(null);
        const controller = new AbortController();
        previewAbort.current = controller;
        try {
            const result = await previewRawArticleBulk(
                action,
                scope,
                controller.signal,
            );
            if (mounted.current) setPreview(result);
        } catch (cause) {
            if (mounted.current) {
                setError(messageFrom(cause));
                releaseLock();
            }
        } finally {
            if (mounted.current) setIsPreparing(false);
            previewAbort.current = null;
        }
    };

    const cancelPreview = () => {
        if (running.current || isPreparing) return;
        setPreview(null);
        releaseLock();
    };

    const execute = async (
        snapshot: RawArticleReport,
        items: RawArticleReportRow[],
    ) => {
        if (running.current) return;
        running.current = true;
        stopRequested.current = false;
        setIsRunning(true);
        setIsStopping(false);
        setError(null);
        let nextReport = snapshot;
        let sentRequest = false;
        try {
            for (let offset = 0; offset < items.length; offset += BATCH_SIZE) {
                if (stopRequested.current || !mounted.current) break;
                const batch = items.slice(offset, offset + BATCH_SIZE);
                let results: RawArticleBulkResult[];
                try {
                    sentRequest = true;
                    const response = await executeRawArticleBulk(
                        snapshot.action,
                        batch.flatMap(({ id, updatedAt }) =>
                            updatedAt ? [{ id, updatedAt }] : [],
                        ),
                    );
                    results = response.results;
                } catch (cause) {
                    const reason = messageFrom(cause);
                    results = batch.map(({ id, title }) => ({
                        id,
                        title,
                        outcome: 'ERROR',
                        reason,
                    }));
                    stopRequested.current = true;
                    if (mounted.current) {
                        setError(
                            'A batch request failed. Its outcome could not be confirmed; the report keeps earlier results. Retry errors to check these article versions again.',
                        );
                    }
                }
                const byId = new Map(
                    results.map((result) => [result.id, result]),
                );
                const batchIds = new Set(batch.map(({ id }) => id));
                nextReport = {
                    ...nextReport,
                    rows: nextReport.rows.map((row) => {
                        if (!batchIds.has(row.id)) return row;
                        const result = byId.get(row.id);
                        return {
                            ...row,
                            outcome: result?.outcome ?? 'ERROR',
                            reason:
                                result?.reason ??
                                'The server did not return a result for this article.',
                        };
                    }),
                };
                if (mounted.current) setReport(nextReport);
            }
        } finally {
            // Refresh errors must never turn a completed write into a failed write.
            if (sentRequest) await invalidateRawArticleQueries(queryClient);
            running.current = false;
            if (mounted.current) {
                setIsRunning(false);
                setIsStopping(false);
                releaseLock();
            }
        }
    };

    const confirm = async () => {
        if (!preview || running.current) return;
        const snapshot: RawArticleReport = {
            action: preview.action,
            rows: preview.items.map((item) => ({
                ...item,
                outcome:
                    item.eligible && item.updatedAt ? 'PENDING' : 'SKIPPED',
                reason:
                    item.eligible && item.updatedAt
                        ? 'Not processed yet.'
                        : (item.reason ?? 'Not eligible for this action.'),
            })),
        };
        setPreview(null);
        setReport(snapshot);
        await execute(
            snapshot,
            snapshot.rows.filter(({ outcome }) => outcome === 'PENDING'),
        );
    };

    const retry = async (outcome: 'ERROR' | 'PENDING') => {
        if (!report || running.current || !acquireLock()) return;
        await execute(
            report,
            report.rows.filter((row) => row.outcome === outcome),
        );
    };

    const stop = () => {
        stopRequested.current = true;
        setIsStopping(true);
    };

    return {
        preview,
        report,
        isPreparing,
        isRunning,
        isStopping,
        error,
        prepare,
        cancelPreview,
        confirm,
        retry,
        stop,
    };
}
