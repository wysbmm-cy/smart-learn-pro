export const WRITING_MATERIAL_CATEGORIES = [
    { value: 'thesis', label: '开头立场' },
    { value: 'argument', label: '论证句型' },
    { value: 'evidence', label: '例证素材' },
    { value: 'transition', label: '连接与转折' },
    { value: 'conclusion', label: '结尾升华' },
    { value: 'vocabulary', label: '词汇替换' }
];

export const WRITING_MATERIAL_CATEGORY_LABELS = WRITING_MATERIAL_CATEGORIES.reduce((acc, item) => {
    acc[item.value] = item.label;
    return acc;
}, {});

export const normalizeMaterialCategory = (value) => {
    const v = String(value || '').trim().toLowerCase();
    if (WRITING_MATERIAL_CATEGORY_LABELS[v]) return v;
    return 'argument';
};
