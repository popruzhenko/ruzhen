import { Button } from '../Button/Button';
import { classesJoined } from '../Utils/classesJoined';

import type { PaginationProps } from './TypesPagination';

import './Pagination.scss';

export const Pagination = ({
    page,
    totalPages,
    hasNextPage,
    hasPreviousPage,
    onPageChange,
    className,
}: PaginationProps) => {
    const pages = Array.from({ length: totalPages }, (_, index) => index + 1);

    return (
        <nav
            className={classesJoined(['ui-pagination', className])}
            aria-label="Pagination"
        >
            <Button
                variants="secondary"
                disabled={!hasPreviousPage}
                onClick={() => onPageChange(page - 1)}
            >
                ←
            </Button>

            <div className="ui-pagination__pages">
                {pages.map((pageNumber) => (
                    <button
                        key={pageNumber}
                        type="button"
                        className={classesJoined([
                            'ui-pagination__page',
                            pageNumber === page &&
                                'ui-pagination__page--active',
                        ])}
                        onClick={() => onPageChange(pageNumber)}
                    >
                        {pageNumber}
                    </button>
                ))}
            </div>

            <Button
                variants="secondary"
                disabled={!hasNextPage}
                onClick={() => onPageChange(page + 1)}
            >
                →
            </Button>
        </nav>
    );
};
