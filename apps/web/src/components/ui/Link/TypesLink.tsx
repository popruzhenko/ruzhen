export type PolymorphicLinkProps<C extends React.ElementType> = {
    as?: C;
    disabled?: boolean;
    className?: string;
    children: React.ReactNode;
} & Omit<React.ComponentPropsWithoutRef<C>, 'as' | 'className' | 'children'>;
