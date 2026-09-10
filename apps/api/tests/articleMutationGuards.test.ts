import assert from 'node:assert/strict';
import test from 'node:test';
import {
    ArticleStatus,
    ContentAvailability,
    Prisma,
    type PrismaClient,
} from '@prisma/client';
import { updateArticleSafely } from '../src/core/articles/updateArticle';
import { ArticleMutationError } from '../src/core/articles/articleMutationError';
import { reviewArticleContentById } from '../src/core/ingestionNews/review/reviewArticleContent.service';
import { embedArticleById } from '../src/core/embedding/embedArticle.services';
import {
    makeManualContentAssessment,
    isCurrentFullTextAssessment,
} from '../src/core/ingestionNews/enrich/articleContentQuality';

function fixture() {
    return {
        id: 'article-1',
        sourceId: 'source-1',
        url: 'https://example.org/story',
        title: 'A complete news article',
        summary: 'A substantial summary of the reported event for review.',
        content: 'Full article text. '.repeat(100),
        contentAssessment: makeManualContentAssessment(
            'Full article text. '.repeat(100),
        ) as unknown,
        contentProvenance: null as unknown,
        cleanedAccessibleText: null as string | null,
        contentAvailability:
            ContentAvailability.FULL_TEXT as ContentAvailability,
        status: ArticleStatus.REVIEWED as ArticleStatus,
        embedding: [1, 2] as number[] | null,
        embeddingBasis: 'FULL_TEXT' as string | null,
        embeddingModel: 'existing-model' as string | null,
        updatedAt: new Date('2026-09-09T12:00:00.000Z'),
        _count: { clusterLinks: 0 },
        source: { isActive: true },
        raw: null,
    };
}

// A small persistence double checks the conditions sent by the application.
// These tests do not connect to PostgreSQL or request remote embeddings.
function database(initial = fixture()) {
    const state = structuredClone(initial);
    let beforeUpdate: (() => void) | undefined;
    const writes: Array<Record<string, unknown>> = [];
    const versions: Array<Record<string, unknown>> = [];
    let failVersion = false;
    const articleContentVersion = {
        create: async ({ data }: { data: Record<string, unknown> }) => {
            if (failVersion) throw new Error('Version storage unavailable');
            const version = { id: `version-${versions.length + 1}`, ...data };
            versions.push(version);
            return version;
        },
    };
    const article = {
        findUnique: async () => structuredClone(state),
        findUniqueOrThrow: async () => structuredClone(state),
        updateMany: async ({
            where,
            data,
        }: {
            where: {
                id: string;
                updatedAt: Date;
                status: ArticleStatus;
                clusterLinks: unknown;
                embedding?: unknown;
                source?: unknown;
            };
            data: Record<string, unknown>;
        }) => {
            assert.deepEqual(where.clusterLinks, { none: {} });
            beforeUpdate?.();
            beforeUpdate = undefined;
            if (
                where.id !== state.id ||
                where.status !== state.status ||
                where.updatedAt.getTime() !== state.updatedAt.getTime() ||
                state._count.clusterLinks > 0 ||
                (where.embedding && state.embedding !== null) ||
                (where.source && !state.source.isActive)
            ) {
                return { count: 0 };
            }
            writes.push(data);
            for (const [key, value] of Object.entries(data)) {
                if (value !== undefined)
                    Reflect.set(
                        state,
                        key,
                        value === Prisma.DbNull ? null : value,
                    );
            }
            return { count: 1 };
        },
    };
    return {
        state,
        writes,
        versions,
        failVersion: () => {
            failVersion = true;
        },
        beforeUpdate: (callback: () => void) => {
            beforeUpdate = callback;
        },
        prisma: {
            article,
            $transaction: async <T>(run: (tx: unknown) => Promise<T>) => {
                const before = structuredClone(state);
                try {
                    return await run({ article, articleContentVersion });
                } catch (error) {
                    // The concurrent editor is outside this transaction; only our
                    // successful writes are rolled back by this persistence double.
                    if (writes.length) Object.assign(state, before);
                    throw error;
                }
            },
        } as unknown as PrismaClient,
    };
}

function isConflict(error: unknown) {
    return error instanceof ArticleMutationError && error.statusCode === 409;
}

test('stale manual saves cannot overwrite a completed bulk action', async () => {
    const db = database();
    const version = db.state.updatedAt.toISOString();
    db.state.status = ArticleStatus.REJECTED;
    db.state.updatedAt = new Date(db.state.updatedAt.getTime() + 1);
    await assert.rejects(
        updateArticleSafely(db.prisma, db.state.id, {
            content: 'Old form text',
            status: ArticleStatus.REVIEWED,
            expectedUpdatedAt: version,
        }),
        isConflict,
    );
    assert.equal(db.state.status, ArticleStatus.REJECTED);
    assert.equal(db.state.content, fixture().content);
    assert.equal(db.writes.length, 0);
});

test('an edit winning after the initial read is protected by the write condition', async () => {
    const db = database();
    db.beforeUpdate(() => {
        db.state.summary = 'Another editor saved this summary.';
        db.state.updatedAt = new Date(db.state.updatedAt.getTime() + 1);
    });
    await assert.rejects(
        updateArticleSafely(db.prisma, db.state.id, {
            summary: 'Stale summary',
        }),
        isConflict,
    );
    assert.equal(db.state.summary, 'Another editor saved this summary.');
    assert.equal(db.writes.length, 0);
});

test('manual text changes recompute availability and clear stale embeddings', async () => {
    const db = database();
    db.state.status = ArticleStatus.EMBEDDED;
    const result = await updateArticleSafely(db.prisma, db.state.id, {
        content: 'A short fragment',
        expectedUpdatedAt: db.state.updatedAt.toISOString(),
    });
    assert.equal(result.status, ArticleStatus.REVIEWED);
    assert.equal(result.contentAvailability, ContentAvailability.PARTIAL_TEXT);
    assert.equal(result.embedding, null);
    assert.equal(result.embeddingBasis, null);
    assert.equal(result.embeddingModel, null);
    assert.equal(db.versions.length, 1);
    assert.equal(db.versions[0].reason, 'MANUAL_EDIT');
    assert.equal(
        isCurrentFullTextAssessment(
            result.content ?? '',
            result.contentAssessment,
        ),
        false,
    );
});

test('short full articles require explicit confirmation and editing invalidates it', async () => {
    const db = database();
    const content =
        'The council voted today. The new rules take effect on Monday.';
    await assert.rejects(
        updateArticleSafely(db.prisma, db.state.id, {
            content,
            status: ArticleStatus.APPROVED,
        }),
        /full/i,
    );
    const saved = await updateArticleSafely(
        db.prisma,
        db.state.id,
        {
            content,
            confirmFullText: true,
            status: ArticleStatus.APPROVED,
        },
        'editor-1',
    );
    assert.equal(saved.contentAvailability, ContentAvailability.FULL_TEXT);
    assert.equal(saved.status, ArticleStatus.APPROVED);
    assert.equal(
        isCurrentFullTextAssessment(
            saved.content ?? '',
            saved.contentAssessment,
        ),
        true,
    );
    assert.equal(db.versions[0].actorUserId, 'editor-1');
    assert.equal(db.versions[0].reason, 'MANUAL_VERIFICATION');
    const changed = await updateArticleSafely(db.prisma, db.state.id, {
        content: 'A changed fragment.',
    });
    assert.equal(changed.status, ArticleStatus.REVIEWED);
    assert.equal(changed.contentAvailability, ContentAvailability.PARTIAL_TEXT);
    assert.equal(
        isCurrentFullTextAssessment(
            changed.content ?? '',
            changed.contentAssessment,
        ),
        false,
    );
});

test('manual content cannot be saved without its version and invalid confirmation is rejected', async () => {
    const db = database();
    const original = structuredClone(db.state);
    db.failVersion();
    await assert.rejects(
        updateArticleSafely(db.prisma, db.state.id, {
            content: 'An edited paragraph.',
        }),
        /Version storage/,
    );
    assert.deepEqual(db.state, original);
    for (const input of [
        { content: '  ', confirmFullText: true },
        { confirmFullText: 'true' },
    ]) {
        await assert.rejects(
            updateArticleSafely(db.prisma, db.state.id, input),
            (error: unknown) =>
                error instanceof ArticleMutationError &&
                error.statusCode === 400,
        );
    }
});

test('approval validates the current text instead of trusting stale FULL_TEXT metadata', async () => {
    const db = database();
    db.state.content = 'Only a teaser';
    await assert.rejects(
        updateArticleSafely(db.prisma, db.state.id, {
            status: ArticleStatus.APPROVED,
        }),
        (error: unknown) =>
            error instanceof ArticleMutationError && error.statusCode === 400,
    );
    assert.equal(db.writes.length, 0);
    db.state.content = fixture().content;
    db.state.url = 'javascript:alert(1)';
    await assert.rejects(
        updateArticleSafely(db.prisma, db.state.id, {
            status: ArticleStatus.APPROVED,
        }),
        /HTTP/,
    );
});

test('linked articles and invalid bodies do not reach editorial writes', async () => {
    const db = database();
    db.state._count.clusterLinks = 1;
    await assert.rejects(
        updateArticleSafely(db.prisma, db.state.id, {
            status: ArticleStatus.REJECTED,
        }),
        isConflict,
    );
    for (const input of [
        null,
        [],
        { content: 10 },
        { status: 'EMBEDDED' },
        { expectedUpdatedAt: 'bad', title: 'T' },
    ]) {
        await assert.rejects(
            updateArticleSafely(db.prisma, db.state.id, input),
            (error: unknown) =>
                error instanceof ArticleMutationError &&
                error.statusCode === 400,
        );
    }
    assert.equal(db.writes.length, 0);
});

test('single recheck preserves downstream and rejected states and checks the saved version', async () => {
    for (const status of [
        ArticleStatus.APPROVED,
        ArticleStatus.EMBEDDED,
        ArticleStatus.CLUSTERED,
        ArticleStatus.REJECTED,
    ]) {
        const db = database();
        db.state.status = status;
        await assert.rejects(
            reviewArticleContentById(db.prisma, db.state.id),
            isConflict,
        );
        assert.equal(db.writes.length, 0);
    }
    const db = database();
    await assert.rejects(
        reviewArticleContentById(
            db.prisma,
            db.state.id,
            '2026-09-08T12:00:00Z',
        ),
        isConflict,
    );
    db.state.status = ArticleStatus.NEW;
    const result = await reviewArticleContentById(
        db.prisma,
        db.state.id,
        db.state.updatedAt.toISOString(),
    );
    assert.equal(result.article.status, ArticleStatus.REVIEWED);
    assert.equal(result.article.content, fixture().content);
    assert.equal(result.review.previousStatus, ArticleStatus.NEW);
});

test('a late embedding response cannot resurrect an article rejected during generation', async () => {
    const db = database();
    db.state.status = ArticleStatus.APPROVED;
    db.state.embedding = null;
    let calls = 0;
    const result = await embedArticleById(
        db.prisma,
        {
            createEmbedding: async () => {
                calls++;
                db.state.status = ArticleStatus.REJECTED;
                db.state.updatedAt = new Date(db.state.updatedAt.getTime() + 1);
                return [0.3, 0.8];
            },
        },
        db.state.id,
    );
    assert.equal(calls, 1);
    assert.equal(result.embedded, false);
    assert.equal(db.state.status, ArticleStatus.REJECTED);
    assert.equal(db.state.embedding, null);
    assert.equal(db.writes.length, 0);
});

test('embedding skips ineligible articles before calling the provider and still saves eligible results', async () => {
    let calls = 0;
    const provider = {
        createEmbedding: async () => {
            calls++;
            return [0.3, 0.8];
        },
    };
    const db = database();
    await embedArticleById(db.prisma, provider, db.state.id);
    assert.equal(calls, 0);
    db.state.status = ArticleStatus.APPROVED;
    db.state.embedding = null;
    const result = await embedArticleById(db.prisma, provider, db.state.id);
    assert.equal(result.embedded, true);
    assert.equal(calls, 1);
    assert.equal(db.state.status, ArticleStatus.EMBEDDED);
    assert.deepEqual(db.state.embedding, [0.3, 0.8]);
});
