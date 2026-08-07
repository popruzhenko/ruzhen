import type { ContextualizationCardProps } from './TypesContextualizationCard';
import type { BadgeVariants } from '../../../../../ui/Badge/TypesBadge';

import './ContextualizationCard.scss';

import { Badge } from '../../../../../ui/Badge/Badge';
import { Button } from '../../../../../ui/Button/Button';
import { Icon } from '../../../../../ui/Icon/Icon';
import { DropDown } from '../../../../../ui/DropDown/DropDown';

const stanceOptions = [
    {
        label: 'Neutral',
        value: 'NEUTRAL',
    },
    {
        label: 'Pro',
        value: 'PRO',
    },
    {
        label: 'Contra',
        value: 'CONTRA',
    },
];

export const ContextualizationCard = ({
    block,
    onUpdateBlock,
    onRemoveBlock,
}: ContextualizationCardProps) => {
    return (
        <article className="contextualization_card">
            <div className="contextualization_card__top">
                <Badge
                    type={block.type.toLowerCase() as BadgeVariants}
                    style={{ marginBottom: 'auto' }}
                />

                {block.type === 'OPINION' && (
                    <DropDown
                        className="contextualization_card__stance"
                        label="Stance"
                        options={stanceOptions}
                        value={block.stance ?? 'NEUTRAL'}
                        onChange={(value) =>
                            onUpdateBlock(block.id, 'stance', value)
                        }
                    />
                )}

                <Button
                    type="button"
                    variants="secondary"
                    leftIcon={<Icon name="trash" color="black" size={16} />}
                    onClick={() => onRemoveBlock(block.id)}
                >
                    Remove
                </Button>
            </div>

            <label className="contextualization_card__field">
                <span>Block title</span>

                <input
                    value={block.title ?? ''}
                    onChange={(event) =>
                        onUpdateBlock(block.id, 'title', event.target.value)
                    }
                    placeholder="Block title"
                />
            </label>

            <label className="contextualization_card__field contextualization_card__field--content">
                <span>Block content</span>

                <textarea
                    value={block.content}
                    onChange={(event) =>
                        onUpdateBlock(block.id, 'content', event.target.value)
                    }
                    placeholder="Write the meaning of this block"
                />
            </label>

            <label className="contextualization_card__field">
                <span>Source name</span>

                <input
                    value={block.sourceName ?? ''}
                    onChange={(event) =>
                        onUpdateBlock(
                            block.id,
                            'sourceName',
                            event.target.value,
                        )
                    }
                    placeholder="BBC, Reuters, AP..."
                />
            </label>

            <label className="contextualization_card__field">
                <span>Source URL</span>

                <input
                    value={block.sourceUrl ?? ''}
                    onChange={(event) =>
                        onUpdateBlock(
                            block.id,
                            'sourceUrl',
                            event.target.value,
                        )
                    }
                    placeholder="https://..."
                />
            </label>

        </article>
    );
};