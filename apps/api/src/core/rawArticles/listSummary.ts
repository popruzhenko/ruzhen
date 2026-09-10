import { Prisma } from '@prisma/client';
import { buildRawArticleFilterFromSql, rawArticleNonBlankSql } from './filters';
import type { RawArticleFilters } from './validation';

// This mirrors isCurrentFullTextAssessment: compare JSON types as well as
// values, and hash the original UTF-8 article text without trimming it. The
// built-in PostgreSQL sha256 function needs no database extension.
export function rawArticleFullTextVerifiedSql(): Prisma.Sql {
    return Prisma.sql`COALESCE(CASE WHEN
        a."contentAssessment" -> 'version' = '1'::jsonb
        AND a."contentAssessment" -> 'fullText' = 'true'::jsonb
        AND a."contentAssessment" -> 'method' IN (
            '"READABILITY"'::jsonb, '"JSON_LD"'::jsonb, '"MANUAL"'::jsonb
        )
        AND a."contentAssessment" -> 'reasons' = '[]'::jsonb
        AND a."contentAssessment" -> 'signals' -> 'documentComplete' = 'true'::jsonb
        AND a."contentAssessment" -> 'signals' -> 'identityMatched' = 'true'::jsonb
        AND a."contentAssessment" -> 'signals' -> 'paywall' = 'false'::jsonb
        AND a."contentAssessment" -> 'signals' -> 'truncated' = 'false'::jsonb
    THEN a."contentAssessment" -> 'textHash' = to_jsonb(
        encode(sha256(convert_to(COALESCE(a."content", ''), 'UTF8')), 'hex')
    ) ELSE false END, false)`;
}

export function buildRawArticleListSummarySql(
    filters: RawArticleFilters,
): Prisma.Sql {
    return Prisma.sql`
        WITH matched AS MATERIALIZED (
            SELECT a."status", a."url",
                NOT EXISTS (
                    SELECT 1 FROM "ClusterArticle" link WHERE link."articleId" = a."id"
                ) AS unlinked,
                ${rawArticleNonBlankSql(Prisma.sql`a."title"`)}
                    AND ${rawArticleNonBlankSql(Prisma.sql`a."summary"`)}
                    AND ${rawArticleNonBlankSql(Prisma.sql`a."sourceId"`)} AS metadata_ready,
                ${rawArticleFullTextVerifiedSql()} AS full_text_verified
            ${buildRawArticleFilterFromSql(filters)}
        )
        SELECT count(*) AS total,
            count(*) FILTER (WHERE unlinked AND "status" IN (
                'NEW', 'NEEDS_REVIEW', 'REVIEWED'
            )) AS recheck,
            count(*) FILTER (WHERE unlinked AND "status" NOT IN (
                'CLUSTERED', 'REJECTED'
            )) AS reject,
            count(*) FILTER (WHERE unlinked AND "status" NOT IN (
                'CLUSTERED', 'REJECTED'
            ) AND NOT full_text_verified) AS enrich,
            COALESCE(array_agg("url") FILTER (
                WHERE unlinked AND "status" = 'REVIEWED'
                    AND metadata_ready AND full_text_verified
            ), ARRAY[]::text[]) AS "approvalUrls"
        FROM matched
    `;
}

export async function getRawArticleListSummary(
    tx: Prisma.TransactionClient,
    filters: RawArticleFilters,
) {
    const [row] = await tx.$queryRaw<
        Array<{
            total: bigint;
            recheck: bigint;
            reject: bigint;
            enrich: bigint;
            approvalUrls: string[];
        }>
    >(buildRawArticleListSummarySql(filters));
    // SQL already checked status, links, metadata and exact full-text evidence.
    // Only URLs cross the boundary for approval: WHATWG URL parsing accepts
    // forms a SQL regex cannot reproduce reliably (IDN, IPv4, backslashes).
    const approve = row.approvalUrls.filter((value) => {
        try {
            const url = new URL(value.trim());
            return url.protocol === 'http:' || url.protocol === 'https:';
        } catch {
            return false;
        }
    }).length;
    const count = (value: bigint) => {
        const result = Number(value);
        if (!Number.isSafeInteger(result) || result < 0)
            throw new Error('Raw article count exceeds the supported range.');
        return result;
    };
    return {
        total: count(row.total),
        eligibility: {
            RECHECK: count(row.recheck),
            APPROVE: approve,
            REJECT: count(row.reject),
        },
        enrichmentEligibleCount: count(row.enrich),
    };
}
