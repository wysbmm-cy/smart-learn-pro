import React, { useMemo } from 'react';
import { computeDiff } from '../utils/simpleDiff';

const DiffViewer = ({ oldText, newText }) => {
    const diffs = useMemo(() => computeDiff(oldText || '', newText || ''), [oldText, newText]);

    return (
        <div className="font-serif leading-loose text-phy-text text-lg whitespace-pre-wrap">
            {diffs.map((part, idx) => {
                const colorClass =
                    part.type === 'insert' ? 'bg-emerald-500/20 text-emerald-300 px-1 rounded mx-0.5 font-bold' :
                        part.type === 'delete' ? 'bg-red-500/20 text-red-300 line-through px-1 rounded mx-0.5 opacity-70 decoration-red-400/50' :
                            'text-phy-text opacity-90';

                return (
                    <span key={idx} className={colorClass}>
                        {part.value}
                    </span>
                );
            })}
        </div>
    );
};

export default DiffViewer;
