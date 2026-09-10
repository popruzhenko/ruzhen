import { Button } from '../Button/Button';
import { classesJoined } from '../Utils/classesJoined';

import type { PaginationProps } from './TypesPagination';

import './Pagination.scss';

function visiblePages(page: number, totalPages: number, compact: boolean) {
    if (!compact || totalPages <= 7) {
        return Array.from({ length: totalPages }, (_, index) => index + 1);
    }
    const start = Math.max(2, Math.min(page - 1, totalPages - 4));
    const end = Math.min(totalPages - 1, Math.max(page + 1, 5));
    const pages: Array<number | 'earlier' | 'later'> = [1];
    if (start > 2) pages.push(start === 3 ? 2 : 'earlier');
    for (let current = start; current <= end; current++) pages.push(current);
    if (end < totalPages - 1)
        pages.push(end === totalPages - 2 ? totalPages - 1 : 'later');
    pages.push(totalPages);
    return pages;
}

export const Pagination = ({
    page,
    totalPages,
    hasNextPage,
    hasPreviousPage,
    onPageChange,
    className,
    compact = false,
}: PaginationProps) => {
    const pages = visiblePages(page, totalPages, compact);

    return (
        <nav
            className={classesJoined(['ui-pagination', className])}
            aria-label="Pagination"
        >
            <Button
                type="button"
                variants="secondary"
                aria-label="Previous page"
                disabled={!hasPreviousPage}
                onClick={() => onPageChange(page - 1)}
            >
                ←
            </Button>

            <div className="ui-pagination__pages">
                {pages.map((pageNumber) =>
                    typeof pageNumber === 'number' ? (
                        <button
                            key={pageNumber}
                            type="button"
                            aria-label={`Go to page ${pageNumber}`}
                            aria-current={
                                pageNumber === page ? 'page' : undefined
                            }
                            className={classesJoined([
                                'ui-pagination__page',
                                pageNumber === page &&
                                    'ui-pagination__page--active',
                            ])}
                            onClick={() => onPageChange(pageNumber)}
                        >
                            {pageNumber}
                        </button>
                    ) : (
                        <span
                            key={pageNumber}
                            className="ui-pagination__ellipsis"
                            aria-hidden="true"
                        >
                            …
                        </span>
                    ),
                )}
            </div>

            <Button
                type="button"
                variants="secondary"
                aria-label="Next page"
                disabled={!hasNextPage}
                onClick={() => onPageChange(page + 1)}
            >
                →
            </Button>
        </nav>
    );
};
