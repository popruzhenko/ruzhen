export const ColorIcon = ({
    size = 16,
    color,
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
        <rect
            xmlns="http://www.w3.org/2000/svg"
            x="2"
            y="2"
            width="12"
            height="12"
            rx="4"
            fill={color || '#323749'}
        />
    </svg>
);
