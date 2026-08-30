import styles from './OpinionBar.module.scss';
import { type OpinionBarProps } from './TypesOpinionBar';

export const OpinionBar = ({ pro, contra, neutral }: OpinionBarProps) => {
    const total = pro + contra + neutral;

    const proWidth = total ? (pro / total) * 100 : 0;
    const contraWidth = total ? (contra / total) * 100 : 0;
    const neutralWidth = total ? (neutral / total) * 100 : 0;

    return (
        <div className={styles.wrapper}>
            <div className={styles.bar}>
                <div className={styles.pro} style={{ width: `${proWidth}%` }} />
                <div
                    className={styles.contra}
                    style={{ width: `${contraWidth}%` }}
                />
                <div
                    className={styles.neutral}
                    style={{ width: `${neutralWidth}%` }}
                />
            </div>

            <div className={styles.meta}>
                <span>Pro {pro}</span>
                <span>Contra {contra}</span>
                <span>Neutral {neutral}</span>
            </div>
        </div>
    );
};
