import { Prisma } from '@prisma/client';
import type { RawArticleFilters } from './validation';

// PostgreSQL btrim uses this explicit ECMAScript trim character set, including
// tabs, newlines and non-breaking spaces used by the previous browser filter.
const TRIM_CHARACTERS =
    '\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff';

export function rawArticleNonBlankSql(column: Prisma.Sql): Prisma.Sql {
    return Prisma.sql`btrim(COALESCE(${column}, ''), ${TRIM_CHARACTERS}) <> ''`;
}

export function buildRawArticleFilterFromSql(
    filters: RawArticleFilters,
    ids?: string[],
): Prisma.Sql {
    const clauses: Prisma.Sql[] = [];
    if (filters.search) {
        const pattern = `%${filters.search.replace(/[\\%_]/g, '\\$&')}%`;
        clauses.push(
            Prisma.sql`(a."title" ILIKE ${pattern} OR a."summary" ILIKE ${pattern} OR a."url" ILIKE ${pattern} OR a."id" ILIKE ${pattern} OR s."name" ILIKE ${pattern})`,
        );
    }
    if (filters.status)
        clauses.push(Prisma.sql`a."status"::text = ${filters.status}`);
    if (filters.contentAvailability)
        clauses.push(
            Prisma.sql`a."contentAvailability"::text = ${filters.contentAvailability}`,
        );
    if (filters.sourceName)
        clauses.push(Prisma.sql`s."name" = ${filters.sourceName}`);
    if (filters.fetchedFrom)
        clauses.push(Prisma.sql`a."createdAt" >= ${filters.fetchedFrom}`);
    if (filters.fetchedTo)
        clauses.push(Prisma.sql`a."createdAt" < ${filters.fetchedTo}`);
    if (filters.onlyProblematic) {
        clauses.push(Prisma.sql`(
            a."status" = 'NEEDS_REVIEW'
            OR a."contentAvailability" IS DISTINCT FROM 'FULL_TEXT'
            OR btrim(COALESCE(a."title", ''), ${TRIM_CHARACTERS}) = ''
            OR btrim(COALESCE(a."summary", ''), ${TRIM_CHARACTERS}) = ''
            OR btrim(COALESCE(a."url", ''), ${TRIM_CHARACTERS}) = ''
        )`);
    }
    // A selected scope can contain more IDs than PostgreSQL's bind limit.
    if (ids)
        clauses.push(
            Prisma.sql`a."id" IN (SELECT jsonb_array_elements_text(${JSON.stringify(ids)}::jsonb))`,
        );
    return Prisma.sql`
        FROM "Article" a JOIN "Source" s ON s."id" = a."sourceId"
        ${clauses.length ? Prisma.sql`WHERE ${Prisma.join(clauses, ' AND ')}` : Prisma.empty}
    `;
}

export function buildRawArticleFilterSql(
    filters: RawArticleFilters,
    ids?: string[],
): Prisma.Sql {
    return Prisma.sql`
        SELECT a."id" ${buildRawArticleFilterFromSql(filters, ids)}
        ORDER BY a."createdAt" DESC, a."id" ASC
    `;
}

export function buildRawArticlePageSql(
    filters: RawArticleFilters,
    limit: number,
    offset: number,
): Prisma.Sql {
    return Prisma.sql`${buildRawArticleFilterSql(filters)} LIMIT ${limit} OFFSET ${offset}`;
}
