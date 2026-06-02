export const MOBILE_BOTTOM_TAB_LIMIT = 6;

export const DEFAULT_MOBILE_BOTTOM_TAB_IDS = [
    'dashboard',
    'exam',
    'flashcards',
    'review',
    'writer',
    'coach'
];

export const MOBILE_NAV_ITEMS = [
    { id: 'dashboard', label: '首页', shortLabel: '首页', icon: 'home' },
    { id: 'exam', label: '阅读与考试', shortLabel: '阅读', icon: 'bookOpen' },
    { id: 'flashcards', label: '闪卡复习', shortLabel: '闪卡', icon: 'layers' },
    { id: 'review', label: '记忆曲线复习', shortLabel: '曲线', icon: 'target' },
    { id: 'writer', label: 'AI 写作', shortLabel: '写作', icon: 'penTool' },
    { id: 'coach', label: '口语教练', shortLabel: '口语', icon: 'mic' },
    { id: 'notes', label: '我的笔记', shortLabel: '笔记', icon: 'notebookPen' },
    { id: 'translation', label: '翻译挑战', shortLabel: '翻译', icon: 'languages' },
    { id: 'listening', label: '听力实验室', shortLabel: '听力', icon: 'headphones' },
    { id: 'flow', label: '学习流画布', shortLabel: '学习流', icon: 'route' },
    { id: 'import', label: '导入', shortLabel: '导入', icon: 'upload' },
    { id: 'video', label: '视频学习', shortLabel: '视频', icon: 'playCircle' },
    { id: 'knowledge', label: '知识图谱', shortLabel: '图谱', icon: 'share2' },
    { id: 'library', label: '文件库', shortLabel: '文件', icon: 'folderOpen' }
];

const MOBILE_NAV_ID_SET = new Set(MOBILE_NAV_ITEMS.map((item) => item.id));

export const normalizeMobileBottomTabs = (value) => {
    if (!Array.isArray(value)) return DEFAULT_MOBILE_BOTTOM_TAB_IDS;

    const seen = new Set();
    const normalized = value
        .map((id) => String(id || '').trim())
        .filter((id) => {
            if (!MOBILE_NAV_ID_SET.has(id) || seen.has(id)) return false;
            seen.add(id);
            return true;
        })
        .slice(0, MOBILE_BOTTOM_TAB_LIMIT);

    return normalized.length ? normalized : DEFAULT_MOBILE_BOTTOM_TAB_IDS;
};

