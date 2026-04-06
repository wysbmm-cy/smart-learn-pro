
import {
    getFlashcards,
    getHistory,
    getNotes,
    getWritings,
    getStudyLogs,
    getUserGoal,
    getRecentDrillLogs,
    getAllHighlights,
    getFolders,
    getTasks,
    getWritingMaterials,
    saveFlashcard,
    saveWritingMaterial,
    saveNote,
    saveTask,
    saveFolder,
    deleteWritingMaterial,
    deleteFlashcard,
    deleteNote,
    deleteTask
} from './db';
import { resolveTodayNotesFolderName } from '../utils/noteFolders';
import { normalizeMaterialCategory } from '../data/writingMaterials';

const id = (p) => `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const firstLine = (t) => (t || '').split('\n')[0].split('/')[0].trim();
const today = () => new Date().toISOString().split('T')[0];
const isDue = (c, now = Date.now()) => !c.nextReview || c.nextReview <= now;
const arr = (v) => (Array.isArray(v) ? v.filter(Boolean) : []);
const clean = (v) => String(v ?? '').trim();
const byCount = (list, pick) => {
    const m = new Map();
    for (const item of list || []) {
        const k = pick(item) || 'unknown';
        m.set(k, (m.get(k) || 0) + 1);
    }
    return Array.from(m.entries()).map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
};

const ensureFolder = async (name) => {
    if (!name) return null;
    const folders = await getFolders();
    const hit = (folders || []).find((f) => (f.name || '').toLowerCase() === name.toLowerCase());
    if (hit) return hit;
    const folder = { id: id('agent_folder'), name, createdAt: Date.now() };
    await saveFolder(folder);
    return folder;
};

const getDefaultNoteFolderName = async () => {
    const folders = await getFolders();
    return resolveTodayNotesFolderName(folders, today());
};

const normalizeCard = (raw = {}) => {
    const front = raw.front
        ? String(raw.front).trim()
        : [raw.word, raw.phonetic, raw.example ? `Example: ${raw.example}` : ''].filter(Boolean).join('\n').trim();
    const back = raw.back
        ? String(raw.back).trim()
        : [raw.chinese_meaning, raw.example_translation ? `Example Translation: ${raw.example_translation}` : '', raw.context ? `Context: ${raw.context}` : ''].filter(Boolean).join('\n').trim();
    return { front, back };
};

const findCardByWord = (cards = [], word = '') => {
    const needle = clean(word).toLowerCase();
    if (!needle) return null;
    return cards.find((c) => firstLine(c.front).toLowerCase() === needle)
        || cards.find((c) => (c.front || '').toLowerCase().includes(needle))
        || null;
};

const generateDeepNoteMarkdown = async ({ word, context = '', translation = '', settings = {} }) => {
    const apiKey = clean(settings.apiKey);
    const apiBaseUrl = clean(settings.apiBaseUrl || 'https://api.moonshot.cn/v1');
    const modelName = clean(settings.modelName || 'kimi-k2-0905-preview');
    if (!apiKey || !apiBaseUrl) return null;

    const cleanUrl = apiBaseUrl.replace(/\/+$/, '');
    const prompt = `
You are an expert English vocabulary tutor.
Create a practical deep-learning vocabulary note in Markdown for: "${word}".
Learner context sentence: "${context || 'Not provided'}".
Reference translation/meaning: "${translation || 'Not provided'}".

Requirements:
1) Keep output concise but exam-oriented (CET/IELTS/TOEFL writing & reading).
2) Use clear Chinese explanations where helpful for Chinese learners.
3) Output strictly with this structure:

## ${word}
### 1. 词性与词源
### 2. 核心释义
### 3. 常见搭配与用法
### 4. 近义词辨析
### 5. 例句（英文 + 中文）
### 6. 提分应用建议
### 7. 记忆钩子
`.trim();

    const response = await fetch(`${cleanUrl}/chat/completions`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: modelName,
            messages: [
                { role: 'system', content: 'You are a strict but helpful English teacher. Return clean Markdown only.' },
                { role: 'user', content: prompt }
            ],
            temperature: 0.4
        })
    });

    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Deep note API error ${response.status}: ${text || 'unknown error'}`);
    }

    const data = await response.json();
    return clean(data?.choices?.[0]?.message?.content) || null;
};

const fn = (name, description, properties = {}, required = []) => ({
    type: 'function',
    function: { name, description, parameters: { type: 'object', properties, required } }
});

export const AGENT_TOOLS = [
    fn('get_flashcard_stats', 'Get flashcard statistics.'),
    fn('get_study_history', 'Get recent study/import history.', { limit: { type: 'number' } }),
    fn('get_notes_summary', 'Get notes summary.', { limit: { type: 'number' } }),
    fn('get_study_logs', 'Get study logs summary.', { limit: { type: 'number' } }),
    fn('get_user_goal', 'Get user goal.'),
    fn('get_drill_performance', 'Get drill performance.', { days: { type: 'number' } }),
    fn('get_writing_history', 'Get writing history.', { limit: { type: 'number' } }),
    fn('list_writing_materials', 'List writing materials in the writing pack.', {
        query: { type: 'string' },
        category: { type: 'string' },
        limit: { type: 'number' }
    }),
    fn('create_writing_material', 'Create a writing material item.', {
        title: { type: 'string' },
        content: { type: 'string' },
        category: { type: 'string' },
        topic: { type: 'string' },
        examType: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        source: { type: 'string' }
    }, ['title', 'content']),
    fn('update_writing_material', 'Update writing material by id.', {
        id: { type: 'string' },
        title: { type: 'string' },
        content: { type: 'string' },
        category: { type: 'string' },
        topic: { type: 'string' },
        examType: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } }
    }, ['id']),
    fn('delete_writing_materials', 'Delete writing materials by ids or titles.', {
        ids: { type: 'array', items: { type: 'string' } },
        titles: { type: 'array', items: { type: 'string' } },
        limit: { type: 'number' }
    }),
    fn('get_highlights', 'Get highlights.', { limit: { type: 'number' } }),
    fn('get_tasks', 'Get task list.', { includeCompleted: { type: 'boolean' } }),
    fn('create_flashcards', 'Create flashcards.', {
        cards: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    front: { type: 'string' },
                    back: { type: 'string' },
                    word: { type: 'string' },
                    phonetic: { type: 'string' },
                    chinese_meaning: { type: 'string' },
                    example: { type: 'string' },
                    example_translation: { type: 'string' },
                    context: { type: 'string' },
                    folderId: { type: 'string' },
                    folderName: { type: 'string' },
                    tags: { type: 'array', items: { type: 'string' } }
                }
            }
        }
    }, ['cards']),
    fn('update_flashcard', 'Update a flashcard by id, including front/back content edits.', {
        id: { type: 'string' },
        front: { type: 'string' },
        back: { type: 'string' },
        folderId: { type: 'string' },
        folderName: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        isMastered: { type: 'boolean' },
        isFlagged: { type: 'boolean' }
    }, ['id']),
    fn('delete_flashcards', 'Delete flashcards by ids or words.', {
        ids: { type: 'array', items: { type: 'string' } },
        words: { type: 'array', items: { type: 'string' } },
        limit: { type: 'number' }
    }),
    fn('create_note', 'Create note.', { title: { type: 'string' }, content: { type: 'string' }, folder: { type: 'string' } }, ['title', 'content']),
    fn('update_note', 'Update note by id.', { id: { type: 'string' }, title: { type: 'string' }, content: { type: 'string' }, folder: { type: 'string' } }, ['id']),
    fn('delete_notes', 'Delete notes by ids or titles.', {
        ids: { type: 'array', items: { type: 'string' } },
        titles: { type: 'array', items: { type: 'string' } },
        limit: { type: 'number' }
    }),
    fn('create_task_item', 'Create task.', { text: { type: 'string' }, type: { type: 'string' } }, ['text']),
    fn('update_task_item', 'Update task.', { id: { type: 'string' }, text: { type: 'string' }, completed: { type: 'boolean' } }, ['id']),
    fn('delete_task_items', 'Delete tasks.', { ids: { type: 'array', items: { type: 'string' } } }, ['ids']),
    fn('create_writing_task', 'Create in-chat writing exercise.', {
        title: { type: 'string' },
        sentences: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    chinese: { type: 'string' },
                    targetWord: { type: 'string' },
                    hint: { type: 'string' }
                },
                required: ['chinese', 'targetWord']
            }
        }
    }, ['sentences']),
    fn('create_coach_topic', 'Create coach topic and navigate.', {
        topic: { type: 'string' },
        scenario: { type: 'string' },
        systemPrompt: { type: 'string' },
        vocabulary: { type: 'array', items: { type: 'string' } }
    }, ['topic', 'systemPrompt']),
    fn('navigate_to', 'Navigate to view.', {
        view: {
            type: 'string',
            enum: ['dashboard', 'flashcards', 'writer', 'coach', 'notes', 'study', 'exam', 'plan', 'knowledge', 'import', 'review']
        }
    }, ['view']),
    fn('create_interactive_quiz', 'Create quiz widget.', {
        question: { type: 'string' },
        options: { type: 'array', items: { type: 'string' } },
        correctAnswer: { type: 'string' },
        explanation: { type: 'string' }
    }, ['question', 'options', 'correctAnswer']),
    fn('review_flashcards', 'Pick cards for in-chat review.', {
        count: { type: 'number' },
        filter: { type: 'string', enum: ['due', 'weak', 'recent'] }
    }),
    fn('generate_deep_note', 'Generate a deep vocabulary note with AI and save it into Notes; can optionally bind to a flashcard.', {
        flashcardId: { type: 'string' },
        word: { type: 'string' },
        context: { type: 'string' },
        translation: { type: 'string' },
        folder: { type: 'string' },
        title: { type: 'string' }
    })
];

export async function executeAgentTool(toolName, params = {}, options = {}) {
    const settings = options?.settings || null;
    const now = Date.now();
    switch (toolName) {
        case 'get_flashcard_stats': {
            const [cards, folders] = await Promise.all([getFlashcards(), getFolders()]);
            const folderMap = new Map((folders || []).map((f) => [f.id, f.name]));
            const t = today();
            const due = (cards || []).filter((c) => isDue(c, now));
            const reviewedToday = (cards || []).filter((c) => (c.lastReview || '').startsWith(t));
            const weakCards = [...(cards || [])]
                .sort((a, b) => (b.weaknessScore || 0) - (a.weaknessScore || 0))
                .slice(0, 10)
                .map((c) => ({ id: c.id, word: firstLine(c.front), weaknessScore: c.weaknessScore || 0, nextReview: c.nextReview || null }));
            return {
                totalCards: (cards || []).length,
                dueNow: due.length,
                reviewedToday: reviewedToday.length,
                mastered: (cards || []).filter((c) => c.isMastered).length,
                flagged: (cards || []).filter((c) => c.isFlagged).length,
                folderDistribution: byCount(cards || [], (c) => folderMap.get(c.folderId) || 'Uncategorized'),
                weakCards
            };
        }
        case 'get_study_history': {
            const limit = Math.max(1, Math.min(100, Number(params.limit) || 20));
            const list = (await getHistory()) || [];
            return { total: list.length, items: list.slice(0, limit) };
        }
        case 'get_notes_summary': {
            const limit = Math.max(1, Math.min(100, Number(params.limit) || 20));
            const notes = (await getNotes()) || [];
            return { total: notes.length, latest: notes.slice(0, limit).map((n) => ({ id: n.id, title: n.title, folder: n.folder || null, updatedAt: n.updatedAt })) };
        }
        case 'get_study_logs': {
            const limit = Math.max(1, Math.min(200, Number(params.limit) || 50));
            const logs = (await getStudyLogs()) || [];
            return { total: logs.length, byType: byCount(logs, (l) => l.type || 'unknown'), byDate: byCount(logs, (l) => l.date || 'unknown').slice(0, 14), latest: logs.slice(-limit).reverse() };
        }
        case 'get_user_goal': {
            const goal = await getUserGoal();
            return goal || { message: 'No user goal configured yet.' };
        }
        case 'get_drill_performance': {
            const days = Math.max(1, Math.min(30, Number(params.days) || 7));
            const logs = (await getRecentDrillLogs(now - days * 24 * 60 * 60 * 1000)) || [];
            const m = new Map();
            for (const l of logs) {
                const d = l.dimension || 'unknown';
                const x = m.get(d) || { dimension: d, total: 0, correct: 0 };
                x.total += 1;
                if (l.is_correct) x.correct += 1;
                m.set(d, x);
            }
            return {
                days,
                totalAttempts: logs.length,
                dimensions: Array.from(m.values()).map((x) => ({ ...x, accuracy: x.total ? Number(((x.correct / x.total) * 100).toFixed(1)) : 0 }))
            };
        }
        case 'get_writing_history': {
            const limit = Math.max(1, Math.min(100, Number(params.limit) || 20));
            const list = (await getWritings()) || [];
            return { total: list.length, latest: list.slice(0, limit).map((w) => ({ id: w.id, title: w.title, updatedAt: w.updatedAt })) };
        }
        case 'list_writing_materials': {
            const limit = Math.max(1, Math.min(200, Number(params.limit) || 50));
            const query = clean(params.query).toLowerCase();
            const category = clean(params.category).toLowerCase();
            const list = (await getWritingMaterials()) || [];
            const filtered = list.filter((m) => {
                if (category && String(m.category || '').toLowerCase() !== category) return false;
                if (!query) return true;
                const hay = `${m.title || ''}\n${m.content || ''}\n${m.topic || ''}\n${(m.tags || []).join(' ')}`.toLowerCase();
                return hay.includes(query);
            });
            return {
                total: filtered.length,
                items: filtered.slice(0, limit).map((m) => ({
                    id: m.id,
                    title: m.title,
                    category: m.category || 'argument',
                    topic: m.topic || '',
                    examType: m.examType || '',
                    tags: m.tags || [],
                    updatedAt: m.updatedAt
                }))
            };
        }
        case 'create_writing_material': {
            const title = clean(params.title);
            const content = clean(params.content);
            if (!title || !content) return { error: 'title and content are required.' };
            const material = await saveWritingMaterial({
                id: id('agent_material'),
                title,
                content,
                category: normalizeMaterialCategory(params.category),
                topic: clean(params.topic),
                examType: clean(params.examType),
                tags: arr(params.tags).map((x) => clean(x)).filter(Boolean).slice(0, 12),
                source: clean(params.source) || 'agent'
            });
            return {
                _action: 'created_writing_material',
                _navigateTo: 'writer',
                _navigateToParams: { openMaterials: true, materialId: material.id },
                id: material.id,
                message: `Created writing material: ${material.title}`
            };
        }
        case 'update_writing_material': {
            const materialId = clean(params.id);
            if (!materialId) return { error: 'Missing material id.' };
            const all = (await getWritingMaterials()) || [];
            const material = all.find((m) => m.id === materialId);
            if (!material) return { error: `Writing material not found: ${materialId}` };
            const updated = await saveWritingMaterial({
                ...material,
                ...(params.title !== undefined ? { title: clean(params.title) } : {}),
                ...(params.content !== undefined ? { content: String(params.content) } : {}),
                ...(params.category !== undefined ? { category: normalizeMaterialCategory(params.category) } : {}),
                ...(params.topic !== undefined ? { topic: clean(params.topic) } : {}),
                ...(params.examType !== undefined ? { examType: clean(params.examType) } : {}),
                ...(params.tags !== undefined ? { tags: arr(params.tags).map((x) => clean(x)).filter(Boolean).slice(0, 12) } : {})
            });
            return {
                _action: 'updated_writing_material',
                _navigateTo: 'writer',
                _navigateToParams: { openMaterials: true, materialId: updated.id },
                id: updated.id,
                message: `Updated writing material: ${updated.title}`
            };
        }
        case 'delete_writing_materials': {
            const ids = arr(params.ids).map((x) => clean(x)).filter(Boolean);
            const titles = arr(params.titles).map((x) => clean(x).toLowerCase()).filter(Boolean);
            const limit = Math.max(1, Math.min(200, Number(params.limit) || 20));
            let targetIds = [...ids];
            if (!targetIds.length && titles.length) {
                const matched = ((await getWritingMaterials()) || []).filter((m) => {
                    const title = String(m.title || '').toLowerCase();
                    return titles.some((t) => title === t || title.includes(t));
                });
                targetIds = matched.slice(0, limit).map((m) => m.id);
            }
            if (!targetIds.length) return { error: 'Provide ids or titles for deleting writing materials.' };
            for (const x of targetIds) await deleteWritingMaterial(x);
            return {
                _action: 'deleted_writing_materials',
                _navigateTo: 'writer',
                _navigateToParams: { openMaterials: true },
                deleted: targetIds.length,
                ids: targetIds,
                message: `Deleted ${targetIds.length} writing materials.`
            };
        }
        case 'get_highlights': {
            const limit = Math.max(1, Math.min(200, Number(params.limit) || 30));
            const list = (await getAllHighlights()) || [];
            return { total: list.length, latest: list.slice(0, limit) };
        }
        case 'get_tasks': {
            const includeCompleted = params.includeCompleted !== false;
            const tasks = ((await getTasks()) || []).filter((t) => includeCompleted || !t.completed);
            return { total: tasks.length, pending: tasks.filter((t) => !t.completed).length, completed: tasks.filter((t) => t.completed).length, items: tasks.slice(0, 100) };
        }
        case 'create_flashcards': {
            const cards = arr(params.cards);
            if (!cards.length) return { error: 'cards is required and must be a non-empty array.' };
            const ids = [];
            for (const raw of cards) {
                const folder = raw.folderName ? await ensureFolder(raw.folderName) : null;
                const body = normalizeCard(raw);
                if (!body.front || !body.back) continue;
                const card = {
                    id: id('agent_card'),
                    front: body.front,
                    back: body.back,
                    folderId: raw.folderId || folder?.id || null,
                    tags: arr(raw.tags),
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    reviews: 0,
                    interval: 0,
                    easeFactor: 2.5,
                    weaknessScore: 0
                };
                await saveFlashcard(card);
                ids.push(card.id);
            }
            return { _action: 'created_flashcards', _navigateTo: 'flashcards', count: ids.length, ids, message: `Created ${ids.length} flashcards.` };
        }
        case 'update_flashcard': {
            const { id: cardId } = params;
            if (!cardId) return { error: 'Missing flashcard id.' };
            const card = ((await getFlashcards()) || []).find((c) => c.id === cardId);
            if (!card) return { error: `Flashcard not found: ${cardId}` };
            let folderId = params.folderId;
            if (!folderId && params.folderName) {
                const folder = await ensureFolder(params.folderName);
                folderId = folder?.id || null;
            }
            const updated = {
                ...card,
                ...(params.front !== undefined ? { front: params.front } : {}),
                ...(params.back !== undefined ? { back: params.back } : {}),
                ...(folderId !== undefined ? { folderId } : {}),
                ...(params.tags !== undefined ? { tags: arr(params.tags) } : {}),
                ...(params.isMastered !== undefined ? { isMastered: !!params.isMastered } : {}),
                ...(params.isFlagged !== undefined ? { isFlagged: !!params.isFlagged } : {}),
                updatedAt: Date.now()
            };
            await saveFlashcard(updated);
            return { _action: 'updated_flashcard', _navigateTo: 'flashcards', id: cardId, message: `Updated flashcard: ${firstLine(updated.front) || cardId}` };
        }
        case 'delete_flashcards': {
            const ids = arr(params.ids);
            const words = arr(params.words).map((w) => String(w).trim().toLowerCase()).filter(Boolean);
            const limit = Math.max(1, Math.min(200, Number(params.limit) || 20));
            let targetIds = [...ids];
            if (!targetIds.length && words.length) {
                const matched = ((await getFlashcards()) || []).filter((c) => {
                    const w = firstLine(c.front).toLowerCase();
                    return words.some((x) => w === x || w.includes(x));
                });
                targetIds = matched.slice(0, limit).map((c) => c.id);
            }
            if (!targetIds.length) return { error: 'Provide ids or words for deleting flashcards.' };
            for (const x of targetIds) await deleteFlashcard(x);
            return { _action: 'deleted_flashcards', _navigateTo: 'flashcards', deleted: targetIds.length, ids: targetIds, message: `Deleted ${targetIds.length} flashcards.` };
        }
        case 'create_note': {
            const { title, content } = params;
            if (!title || !content) return { error: 'title and content are required.' };
            const folderName = clean(params.folder) || await getDefaultNoteFolderName();
            await ensureFolder(folderName);
            const note = {
                id: id('agent_note'),
                title: String(title).trim(),
                content: String(content),
                folder: folderName,
                date: new Date().toISOString(),
                updatedAt: Date.now()
            };
            await saveNote(note);
            return { _action: 'created_note', _navigateTo: 'notes', id: note.id, message: `Created note: ${note.title}` };
        }
        case 'update_note': {
            const { id: noteId } = params;
            if (!noteId) return { error: 'Missing note id.' };
            const note = ((await getNotes()) || []).find((n) => n.id === noteId);
            if (!note) return { error: `Note not found: ${noteId}` };
            const nextFolder = params.folder !== undefined ? String(params.folder) : note.folder;
            if (nextFolder) await ensureFolder(nextFolder);
            const updated = {
                ...note,
                ...(params.title !== undefined ? { title: String(params.title) } : {}),
                ...(params.content !== undefined ? { content: String(params.content) } : {}),
                ...(params.folder !== undefined ? { folder: nextFolder } : {}),
                updatedAt: Date.now()
            };
            await saveNote(updated);
            return { _action: 'updated_note', _navigateTo: 'notes', id: noteId, message: `Updated note: ${updated.title || noteId}` };
        }
        case 'delete_notes': {
            const ids = arr(params.ids);
            const titles = arr(params.titles).map((t) => String(t).trim().toLowerCase()).filter(Boolean);
            const limit = Math.max(1, Math.min(200, Number(params.limit) || 20));
            let targetIds = [...ids];
            if (!targetIds.length && titles.length) {
                const matched = ((await getNotes()) || []).filter((n) => {
                    const t = (n.title || '').toLowerCase();
                    return titles.some((x) => t === x || t.includes(x));
                });
                targetIds = matched.slice(0, limit).map((n) => n.id);
            }
            if (!targetIds.length) return { error: 'Provide ids or titles for deleting notes.' };
            for (const x of targetIds) await deleteNote(x);
            return { _action: 'deleted_notes', _navigateTo: 'notes', deleted: targetIds.length, ids: targetIds, message: `Deleted ${targetIds.length} notes.` };
        }
        case 'create_task_item': {
            const { text, type = 'study' } = params;
            if (!text || !String(text).trim()) return { error: 'Task text is required.' };
            const task = { id: id('agent_task'), text: String(text).trim(), type, completed: false, createdAt: Date.now() };
            await saveTask(task);
            return { _action: 'created_task', _navigateTo: 'plan', id: task.id, message: `Created task: ${task.text}` };
        }
        case 'update_task_item': {
            const { id: taskId, text, completed } = params;
            if (!taskId) return { error: 'Missing task id.' };
            const task = ((await getTasks()) || []).find((t) => t.id === taskId);
            if (!task) return { error: `Task not found: ${taskId}` };
            const updated = {
                ...task,
                ...(text !== undefined ? { text: String(text) } : {}),
                ...(completed !== undefined ? { completed: !!completed } : {}),
                updatedAt: Date.now()
            };
            await saveTask(updated);
            return { _action: 'updated_task', _navigateTo: 'plan', id: taskId, message: `Updated task: ${updated.text || taskId}` };
        }
        case 'delete_task_items': {
            const ids = arr(params.ids);
            if (!ids.length) return { error: 'Provide task ids to delete.' };
            for (const x of ids) await deleteTask(x);
            return { _action: 'deleted_tasks', _navigateTo: 'plan', deleted: ids.length, ids, message: `Deleted ${ids.length} tasks.` };
        }
        case 'create_writing_task': {
            const title = params.title || 'Sentence Writing Practice';
            const sentences = arr(params.sentences)
                .map((s) => ({ chinese: String(s.chinese || '').trim(), targetWord: String(s.targetWord || '').trim(), hint: String(s.hint || '').trim() }))
                .filter((s) => s.chinese && s.targetWord)
                .slice(0, 6);
            if (!sentences.length) return { error: 'Provide at least one valid sentence item.' };
            return { _action: 'chat_writing', title, sentences, message: `Writing practice is ready (${sentences.length} items).` };
        }
        case 'create_coach_topic': {
            const { topic, scenario, systemPrompt } = params;
            const vocabulary = arr(params.vocabulary);
            if (!topic || !systemPrompt) return { error: 'topic and systemPrompt are required.' };
            localStorage.setItem('agent_coach_topic', JSON.stringify({ topic, scenario: scenario || '', systemPrompt, vocabulary, createdAt: Date.now(), source: 'AI Agent' }));
            return { _action: 'created_coach_topic', _navigateTo: 'coach', topic, scenario, vocabulary, message: `Prepared coach topic: ${topic}` };
        }
        case 'navigate_to': {
            if (!params.view) return { error: 'Missing target view.' };
            return { _action: 'navigate', _navigateTo: params.view, message: `Navigate to ${params.view}` };
        }
        case 'create_interactive_quiz': {
            const { question, options, correctAnswer, explanation = '' } = params;
            const cleanOptions = arr(options).map((o) => String(o));
            if (!question || cleanOptions.length < 2 || !correctAnswer) {
                return { error: 'question, options (>=2) and correctAnswer are required.' };
            }
            if (!cleanOptions.includes(correctAnswer)) cleanOptions.push(String(correctAnswer));
            return {
                _action: 'chat_quiz',
                question: String(question),
                options: cleanOptions.slice(0, 6),
                correctAnswer: String(correctAnswer),
                explanation: String(explanation || 'No explanation provided.'),
                message: 'Quiz is ready.'
            };
        }
        case 'review_flashcards': {
            const count = Math.max(1, Math.min(10, Number(params.count) || 5));
            const filter = ['due', 'weak', 'recent'].includes(params.filter) ? params.filter : 'due';
            const cards = (await getFlashcards()) || [];
            if (!cards.length) return { _action: 'no_cards', message: 'No flashcards found.' };

            let selected = [];
            if (filter === 'weak') {
                selected = [...cards].sort((a, b) => (b.weaknessScore || 0) - (a.weaknessScore || 0));
            } else if (filter === 'recent') {
                selected = [...cards].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            } else {
                const due = cards.filter((c) => isDue(c, now));
                if (due.length >= count) {
                    selected = due.sort((a, b) => (b.weaknessScore || 0) - (a.weaknessScore || 0));
                } else {
                    const dueIds = new Set(due.map((c) => c.id));
                    const extras = cards.filter((c) => !dueIds.has(c.id)).sort((a, b) => (b.weaknessScore || 0) - (a.weaknessScore || 0));
                    selected = [...due, ...extras];
                }
            }

            return {
                _action: 'chat_flashcard_review',
                cards: selected.slice(0, count).map((c) => ({ id: c.id, front: c.front, back: c.back, word: firstLine(c.front) })),
                message: `Prepared ${Math.min(selected.length, count)} cards for quick review.`
            };
        }
        case 'generate_deep_note': {
            if (!settings?.apiKey) {
                return { error: 'Missing API key in settings. Please configure API key first.' };
            }

            const cards = (await getFlashcards()) || [];
            let targetCard = null;
            if (params.flashcardId) {
                targetCard = cards.find((c) => c.id === params.flashcardId) || null;
                if (!targetCard) return { error: `Flashcard not found: ${params.flashcardId}` };
            } else if (params.word) {
                targetCard = findCardByWord(cards, params.word);
            }

            const word = clean(params.word) || firstLine(targetCard?.front);
            if (!word) {
                return { error: 'Provide flashcardId or word to generate deep note.' };
            }

            const context = clean(params.context) || clean(targetCard?.context);
            const translation = clean(params.translation) || clean(targetCard?.back);
            const markdown = await generateDeepNoteMarkdown({ word, context, translation, settings });
            if (!markdown) {
                return { error: `Failed to generate deep note for "${word}".` };
            }

            let flashcardId = null;
            if (targetCard) {
                const updated = { ...targetCard, notes: markdown, updatedAt: Date.now() };
                await saveFlashcard(updated);
                flashcardId = targetCard.id;
            }

            const folder = clean(params.folder) || await getDefaultNoteFolderName();
            await ensureFolder(folder);

            const note = {
                id: targetCard ? `dn_${targetCard.id}` : id('agent_deep_note'),
                title: clean(params.title) || `深度笔记 - ${word}`,
                content: `# ${word}\n\n${translation ? `> ${translation}\n\n` : ''}${markdown}`,
                folder,
                date: new Date().toISOString(),
                updatedAt: Date.now()
            };
            await saveNote(note);

            return {
                _action: 'generated_deep_note',
                _navigateTo: 'notes',
                _navigateToParams: { id: note.id },
                noteId: note.id,
                flashcardId,
                word,
                message: `Generated deep note for ${word}.`
            };
        }
        default:
            return { error: `Unknown tool: ${toolName}` };
    }
}

export const AGENT_SYSTEM_PROMPT = `
You are SmartLearn Pro Agent.

Your role:
- Use tools to read the user's learning data.
- When asked, execute concrete actions (create/update/delete flashcards, notes, tasks, deep notes, writing materials).
- Keep actions explicit and safe.

Execution policy:
- If a user asks to do something in-app, call the matching tool.
- For deletion, prefer precise ids and keep scope limited when matching by names/words.
- For deep note requests, prefer generate_deep_note and save results into Notes.
- For coaching/writing/quiz tasks, produce practical, user-level content.

Response style:
- Be concise and actionable.
- After tool calls, summarize what changed and what to do next.
`.trim();
