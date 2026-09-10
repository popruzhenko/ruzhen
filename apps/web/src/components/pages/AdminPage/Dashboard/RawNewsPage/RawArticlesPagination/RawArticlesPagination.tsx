import { DropDown } from '../../../../../ui/DropDown/DropDown';
import { Pagination } from '../../../../../ui/Pagination/Pagination';
import type { RawArticlesPaginationProps } from './TypesRawArticlesPagination';
import './RawArticlesPagination.scss';

export function RawArticlesPagination({
    pagination,
    disabled,
    onPageChange,
    onPageSizeChange,
}: RawArticlesPaginationProps) {
    const { page, limit, total, totalPages, hasNextPage, hasPreviousPage } =
        pagination;
    const first = total === 0 ? 0 : (page - 1) * limit + 1;
    const last = Math.min(page * limit, total);

    return (
        <fieldset
            className="raw_articles_pagination"
            disabled={disabled}
            aria-label="Raw articles pagination"
        >
            <p className="raw_articles_pagination__counter">
                Showing {first}–{last} of {total}
            </p>
            {onPageSizeChange && (
                <div className="raw_articles_pagination__size">
                    <DropDown
                        label="Articles per page"
                        value={String(limit)}
                        disabled={disabled}
                        options={[25, 50, 100].map((size) => ({
                            label: String(size),
                            value: String(size),
                        }))}
                        onChange={(value) => {
                            const size = Number(value);
                            if (
                                !disabled &&
                                (size === 25 || size === 50 || size === 100)
                            )
                                onPageSizeChange(size);
                        }}
                    />
                </div>
            )}
            <Pagination
                compact
                page={page}
                totalPages={totalPages}
                hasNextPage={hasNextPage}
                hasPreviousPage={hasPreviousPage}
                onPageChange={(next) => {
                    if (!disabled) onPageChange(next);
                }}
            />
        </fieldset>
    );
}
