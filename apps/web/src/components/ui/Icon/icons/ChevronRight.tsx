export const ChevronRightIcon = ({
    size = 16,
    color = '#323749',
}: {
    size?: number;
    color?: string;
}) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
    >
        <path
            xmlns="http://www.w3.org/2000/svg"
            d="M1 1L6.33333 6.33333L1 11.6667"
            stroke={color}
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
        />
    </svg>
);
