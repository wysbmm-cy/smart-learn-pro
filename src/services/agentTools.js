/**
 * Agent Tools Service for SmartLearn Pro
 * Phase 1: Read-only tools (9)
 * Phase 2: Write tools (5) — create_flashcards, create_note, create_writing_task, create_coach_topic, navigate_to
 */
import {
    getFlashcards, getHistory, getNotes, getWritings,
    getStudyLogs, getUserGoal, getRecentDrillLogs,
    getAllHighlights, getFolders, getTasks,
    saveFlashcard, saveNote, saveWriting, saveTask, saveFolder
} from './db';

// ============================================
// Tool Definitions (OpenAI function calling format)
// ============================================

export const AGENT_TOOLS = [
    // ---- Phase 1: Read-Only Tools ----
    {
        type: "function",
        function: {
            name: "get_flashcard_stats",
            description: "获取用户闪卡/词汇的统计数据，包括总卡片数、到期数、各掌握状态数量、弱点词列表(最多10个)。用这个了解用户的词汇学习状况。",
            parameters: { type: "object", properties: {}, required: [] }
        }
    },
    {
        type: "function",
        function: {
            name: "get_study_history",
            description: "获取用户最近的阅读/学习记录，包含文章标题、学习日期等。用这个了解用户最近在学什么内容。",
            parameters: { type: "object", properties: {}, required: [] }
        }
    },
    {
        type: "function",
        function: {
            name: "get_notes_summary",
            description: "获取用户的笔记列表摘要，包含标题和创建时间。用这个了解用户的知识积累情况。",
            parameters: { type: "object", properties: {}, required: [] }
        }
    },
    {
        type: "function",
        function: {
            name: "get_study_logs",
            description: "获取用户的学习日志，包含每日学习活动记录。用这个了解用户的学习频率和习惯。",
            parameters: { type: "object", properties: {}, required: [] }
        }
    },
    {
        type: "function",
        function: {
            name: "get_user_goal",
            description: "获取用户设定的学习目标（如通过CET-6、雅思7分等）。用这个了解用户的学习方向。",
            parameters: { type: "object", properties: {}, required: [] }
        }
    },
    {
        type: "function",
        function: {
            name: "get_drill_performance",
            description: "获取用户最近24小时的练习记录，包含正确率和弱点类型。用这个诊断用户的薄弱环节。",
            parameters: { type: "object", properties: {}, required: [] }
        }
    },
    {
        type: "function",
        function: {
            name: "get_writing_history",
            description: "获取用户的写作记录摘要，包含标题、分数、日期。用这个了解用户的写作练习情况。",
            parameters: { type: "object", properties: {}, required: [] }
        }
    },
    {
        type: "function",
        function: {
            name: "get_highlights",
            description: "获取用户的每日精选/书签内容。用这个了解用户标记的重要学习内容。",
            parameters: { type: "object", properties: {}, required: [] }
        }
    },
    {
        type: "function",
        function: {
            name: "get_tasks",
            description: "获取用户的待办任务列表。用这个了解用户当前的学习待办事项。",
            parameters: { type: "object", properties: {}, required: [] }
        }
    },

    // ---- Phase 2: Write / Action Tools ----
    {
        type: "function",
        function: {
            name: "create_flashcards",
            description: "批量创建闪卡/生词卡。自动检测重复、自动归入当日文件夹。请提供单词的详细结构化信息。",
            parameters: {
                type: "object",
                properties: {
                    cards: {
                        type: "array",
                        description: "要创建的闪卡列表",
                        items: {
                            type: "object",
                            properties: {
                                word: { type: "string", description: "英文单词或短语本身" },
                                phonetic: { type: "string", description: "音标，如 /ɪˈfemərəl/" },
                                chinese_meaning: { type: "string", description: "中文释义及词性，如 'adj. 短暂的; 转瞬即逝的'" },
                                example: { type: "string", description: "完整的英文例句" },
                                example_translation: { type: "string", description: "例句对应的中文翻译" },
                                context: { type: "string", description: "记忆提示/词源/助记法/近反义词等额外上下文" }
                            },
                            required: ["word", "chinese_meaning"]
                        }
                    }
                },
                required: ["cards"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "create_note",
            description: "创建一篇笔记/阅读材料并保存到笔记本。用于生成与学习主题相关的文章、故事、语法讲解等。",
            parameters: {
                type: "object",
                properties: {
                    title: { type: "string", description: "笔记标题" },
                    content: { type: "string", description: "笔记内容，支持Markdown格式" }
                },
                required: ["title", "content"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "create_writing_task",
            description: "在聊天框中直接发起造句练习。给出 2-4 句中文情境和目标词，用户在聊天内直接写英文翻译，提交后 AI 自动批改。适合练习目标词汇的实际运用。",
            parameters: {
                type: "object",
                properties: {
                    title: { type: "string", description: "练习标题（如'用 serendipity 造句'）" },
                    sentences: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                chinese: { type: "string", description: "中文情境句，用户需要翻译成英文" },
                                targetWord: { type: "string", description: "必须在翻译中使用的目标英文单词" },
                                hint: { type: "string", description: "可选提示（如词性、搭配等）" }
                            },
                            required: ["chinese", "targetWord"]
                        },
                        description: "提供 2-4 个造句题目"
                    }
                },
                required: ["title", "sentences"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "create_coach_topic",
            description: "在AI口语教练中预设一个对话场景。创建后用户可跳转到口语教练页面开始练习。",
            parameters: {
                type: "object",
                properties: {
                    topic: { type: "string", description: "口语话题（简短标题，如'谈论一次意外惊喜'）" },
                    scenario: { type: "string", description: "场景描述（如'在咖啡厅和朋友闲聊'）" },
                    systemPrompt: { type: "string", description: "给口语教练的系统提示词（英文），指导AI如何与用户对话，包括角色设定、要练习的词汇、对话风格等" },
                    vocabulary: {
                        type: "array",
                        items: { type: "string" },
                        description: "需要在对话中练习的核心词汇"
                    }
                },
                required: ["topic", "systemPrompt"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "navigate_to",
            description: "跳转到App的指定功能页面。可用: dashboard, flashcards, writer, coach, notes, study, exam, plan, knowledge",
            parameters: {
                type: "object",
                properties: {
                    view: {
                        type: "string",
                        description: "目标页面ID",
                        enum: ["dashboard", "flashcards", "writer", "coach", "notes", "study", "exam", "plan", "knowledge", "import"]
                    }
                },
                required: ["view"]
            }
        }
    },
    // ---- Phase 3: Interactive UI Tools ----
    {
        type: "function",
        function: {
            name: "create_interactive_quiz",
            description: "在聊天框中直接向用户发起一个单选题（单词释义、语法填空等）。用户可以直接在聊天中点击作答。适合用于快速检验学习效果。",
            parameters: {
                type: "object",
                properties: {
                    question: { type: "string", description: "问题描述。例如：'ephemeral' 的准确中文释义是？" },
                    options: {
                        type: "array",
                        items: { type: "string" },
                        description: "提供 3-4 个选项。"
                    },
                    correctAnswer: { type: "string", description: "正确选项的完整文本，必须完全与 options 中的某一项一致。" },
                    explanation: { type: "string", description: "答对或答错后给出的解析反馈。" }
                },
                required: ["question", "options", "correctAnswer", "explanation"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "review_flashcards",
            description: "在聊天框中直接发起闪卡翻卡复习。系统会自动抽取用户最需要复习的到期卡片（按弱点分数排序），用户可以在聊天中翻卡并评分（认识/不认识），结果会实时同步到 FSRS 算法。适合用户说'复习一下'、'翻翻卡'、'测试我的单词'等场景。",
            parameters: {
                type: "object",
                properties: {
                    count: {
                        type: "number",
                        description: "要抽取的卡片数量，默认5张，最多10张。"
                    },
                    filter: {
                        type: "string",
                        description: "筛选模式：'due'=到期待复习(默认), 'weak'=弱点词优先, 'recent'=最近新建的卡",
                        enum: ["due", "weak", "recent"]
                    }
                },
                required: []
            }
        }
    }
];

// ============================================
// Tool Execution
// ============================================

/**
 * Get or create a daily folder for agent-generated content.
 * Returns the folderId.
 */
async function getOrCreateDailyFolder() {
    const dateStr = new Date().toISOString().split('T')[0];
    const folderName = `Daily - ${dateStr}`;
    const folders = await getFolders();
    const existing = folders.find(f => f.name === folderName);
    if (existing) return existing.id;

    const folderId = 'agent_folder_' + dateStr;
    await saveFolder({ id: folderId, name: folderName, type: 'user' });
    return folderId;
}

export async function executeAgentTool(toolName, params) {
    switch (toolName) {
        // ---- Phase 1: Read-Only ----
        case 'get_flashcard_stats': {
            const cards = await getFlashcards();
            const folders = await getFolders();
            const now = Date.now();

            const total = cards.length;
            const due = cards.filter(c => (c.nextReview || 0) <= now).length;

            const stateCount = { new: 0, learning: 0, review: 0, relearning: 0 };
            cards.forEach(c => {
                const s = c.fsrs_state || 0;
                if (s === 0) stateCount.new++;
                else if (s === 1) stateCount.learning++;
                else if (s === 2) stateCount.review++;
                else if (s === 3) stateCount.relearning++;
            });

            const weakCards = cards
                .filter(c => c.weaknessScore > 0)
                .sort((a, b) => (b.weaknessScore || 0) - (a.weaknessScore || 0))
                .slice(0, 10)
                .map(c => ({
                    word: c.front,
                    weakness: c.weaknessScore,
                    stability: c.fsrs_stability ? c.fsrs_stability.toFixed(1) + 'd' : 'N/A',
                    reviewCount: c.reviewCount || 0
                }));

            return {
                total, due, stateCount,
                folderCount: folders.length,
                topWeakCards: weakCards,
                avgReviewCount: total > 0 ? (cards.reduce((s, c) => s + (c.reviewCount || 0), 0) / total).toFixed(1) : 0
            };
        }

        case 'get_study_history': {
            const history = await getHistory();
            const recent = history
                .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
                .slice(0, 15)
                .map(h => ({
                    title: h.title || '(无标题)',
                    date: new Date(h.timestamp || Date.now()).toLocaleDateString('zh-CN'),
                    wordCount: h.text?.length || 0
                }));
            return { totalArticles: history.length, recent };
        }

        case 'get_notes_summary': {
            const notes = await getNotes();
            const summary = notes
                .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
                .slice(0, 15)
                .map(n => ({
                    title: n.title || '(无标题)',
                    date: new Date(n.updatedAt || n.createdAt || Date.now()).toLocaleDateString('zh-CN'),
                    length: n.content?.length || 0
                }));
            return { totalNotes: notes.length, recent: summary };
        }

        case 'get_study_logs': {
            const logs = await getStudyLogs();
            const recent = logs
                .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
                .slice(0, 20)
                .map(l => ({
                    type: l.type || 'study',
                    date: new Date(l.timestamp || Date.now()).toLocaleDateString('zh-CN'),
                    detail: l.detail || ''
                }));
            return { totalLogs: logs.length, recent };
        }

        case 'get_user_goal': {
            const goal = await getUserGoal();
            return goal || { goal: '未设定', message: '用户还没有设定学习目标' };
        }

        case 'get_drill_performance': {
            const startTime = Date.now() - 24 * 60 * 60 * 1000;
            const logs = await getRecentDrillLogs(startTime);
            const total = logs.length;
            const correct = logs.filter(l => l.correct).length;
            const accuracy = total > 0 ? ((correct / total) * 100).toFixed(1) + '%' : 'N/A';

            const typeMiss = {};
            logs.filter(l => !l.correct).forEach(l => {
                const t = l.drillType || 'unknown';
                typeMiss[t] = (typeMiss[t] || 0) + 1;
            });

            return { total, correct, accuracy, weakTypes: typeMiss };
        }

        case 'get_writing_history': {
            const writings = await getWritings();
            const summary = writings
                .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
                .slice(0, 10)
                .map(w => ({
                    title: w.title || '(无标题)',
                    date: new Date(w.updatedAt || Date.now()).toLocaleDateString('zh-CN'),
                    score: w.score || null,
                    wordCount: w.content?.split(/\s+/).length || 0
                }));
            return { totalWritings: writings.length, recent: summary };
        }

        case 'get_highlights': {
            const highlights = await getAllHighlights();
            const recent = highlights
                .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
                .slice(0, 10)
                .map(h => ({
                    content: (h.content || '').slice(0, 100),
                    date: new Date(h.timestamp || Date.now()).toLocaleDateString('zh-CN'),
                    source: h.source || ''
                }));
            return { totalHighlights: highlights.length, recent };
        }

        case 'get_tasks': {
            const tasks = await getTasks();
            return {
                total: tasks.length,
                pending: tasks.filter(t => !t.completed).length,
                completed: tasks.filter(t => t.completed).length,
                items: tasks.slice(0, 15).map(t => ({
                    text: t.text,
                    completed: !!t.completed,
                    date: new Date(t.createdAt || Date.now()).toLocaleDateString('zh-CN')
                }))
            };
        }

        // ---- Phase 2: Write / Action Tools ----
        case 'create_flashcards': {
            const { cards = [] } = params;
            const existing = await getFlashcards();
            // Legacy deduplication: extract the first word from old 'front' fields
            const existingWords = new Set(existing.map(c => {
                const firstPart = (c.front || '').trim().split(/[\/\n\s]/)[0];
                return firstPart.toLowerCase().trim();
            }));

            // Auto-create daily folder
            const folderId = await getOrCreateDailyFolder();

            const results = [];
            for (const card of cards) {
                const headword = (card.word || '').toLowerCase().trim();
                if (!headword || existingWords.has(headword)) {
                    results.push({ front: card.word, status: 'already_exists', message: '已存在，跳过' });
                    continue;
                }

                // Construct front and back from structured schema
                let frontText = card.word;
                if (card.phonetic) frontText += ` /${card.phonetic.replace(/\//g, '')}/`; // ensure slashes
                if (card.example) frontText += `\n\nExample: ${card.example}`;
                if (card.example_translation) frontText += `\n(${card.example_translation})`;

                let backText = card.chinese_meaning;
                if (card.context) backText += `\n\nNotes:\n${card.context}`;

                const newCard = {
                    id: 'agent_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
                    front: frontText,
                    back: backText,
                    context: card.context || '',
                    source: 'AI Agent',
                    folderId,
                    tags: [],
                    createdAt: Date.now(),
                    nextReview: Date.now(),
                    interval: 1,
                    reviewCount: 0,
                    fsrs_state: 0,
                    fsrs_stability: 0,
                    fsrs_difficulty: 0,
                    weaknessScore: 0
                };

                await saveFlashcard(newCard);
                existingWords.add(headword);
                results.push({ front: card.word, status: 'created', message: '✅ 已创建' });
            }

            const created = results.filter(r => r.status === 'created').length;
            const skipped = results.filter(r => r.status === 'already_exists').length;

            return {
                _action: 'created_flashcards',
                _navigateTo: 'flashcards',
                _navigateToParams: { folderId },
                totalCreated: created,
                totalSkipped: skipped,
                details: results,
                message: `✅ 已创建 ${created} 张闪卡${skipped ? `, ${skipped} 张已存在` : ''}`
            };
        }

        case 'create_note': {
            const { title, content } = params;
            const noteId = 'agent_note_' + Date.now();
            await saveNote({
                id: noteId,
                title: title || 'AI Agent 笔记',
                content: content || '',
                createdAt: Date.now(),
                updatedAt: Date.now(),
                folderId: null
            });

            return {
                _action: 'created_note',
                _navigateTo: 'notes',
                _navigateToParams: { id: noteId },
                noteId,
                title,
                message: `✅ 已创建笔记: "${title}"`
            };
        }

        case 'create_writing_task': {
            const { title, sentences } = params;

            if (!sentences || sentences.length === 0) {
                return { error: '未提供造句题目' };
            }

            return {
                _action: 'chat_writing',
                title: title || '造句练习',
                sentences: sentences.map(s => ({
                    chinese: s.chinese,
                    targetWord: s.targetWord,
                    hint: s.hint || ''
                })),
                message: `✍️ 已生成 ${sentences.length} 道造句题，在下方卡片中作答吧！`
            };
        }

        case 'create_coach_topic': {
            const { topic, scenario, systemPrompt, vocabulary = [] } = params;
            // Store topic + system prompt for CoachView to pick up
            const coachTopic = {
                topic,
                scenario: scenario || '',
                systemPrompt: systemPrompt || '',
                vocabulary,
                createdAt: Date.now(),
                source: 'AI Agent'
            };
            localStorage.setItem('agent_coach_topic', JSON.stringify(coachTopic));

            return {
                _action: 'created_coach_topic',
                _navigateTo: 'coach',
                topic,
                scenario,
                vocabulary,
                message: `✅ 已生成口语话题: "${topic}"`
            };
        }

        case 'navigate_to': {
            const { view } = params;
            return {
                _action: 'navigate',
                _navigateTo: view,
                message: `跳转到: ${view}`
            };
        }

        case 'create_interactive_quiz': {
            const { question, options, correctAnswer, explanation } = params;
            return {
                _action: 'chat_quiz',
                question,
                options,
                correctAnswer,
                explanation,
                message: `🎯 已发送测验题 (用户在界面作答)`
            };
        }

        case 'review_flashcards': {
            const count = Math.min(params.count || 5, 10);
            const filter = params.filter || 'due';
            const allCards = await getFlashcards();
            const now = Date.now();

            if (allCards.length === 0) {
                return {
                    _action: 'no_cards',
                    message: '📭 你还没有任何闪卡。先去学习新内容，或让我帮你创建一些吧！'
                };
            }

            let candidates;
            if (filter === 'weak') {
                // Sort by weakness score descending, include all cards
                candidates = [...allCards]
                    .sort((a, b) => (b.weaknessScore || 0) - (a.weaknessScore || 0));
            } else if (filter === 'recent') {
                // Most recently created
                candidates = [...allCards]
                    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            } else {
                // Due cards first (overdue or due now), then by weakness
                const dueCards = [...allCards]
                    .filter(c => !c.nextReview || c.nextReview <= now)
                    .sort((a, b) => (b.weaknessScore || 0) - (a.weaknessScore || 0));

                if (dueCards.length >= count) {
                    candidates = dueCards;
                } else {
                    // Not enough due cards, supplement with all remaining cards
                    const dueIds = new Set(dueCards.map(c => c.id));
                    const extras = [...allCards]
                        .filter(c => !dueIds.has(c.id))
                        .sort((a, b) => (b.weaknessScore || 0) - (a.weaknessScore || 0));
                    candidates = [...dueCards, ...extras];
                }
            }

            const selected = candidates.slice(0, count);

            return {
                _action: 'chat_flashcard_review',
                cards: selected.map(c => ({
                    id: c.id,
                    front: c.front,
                    back: c.back,
                    word: (c.front || '').split('\n')[0].split('/')[0].trim()
                })),
                message: `🃏 已抽取 ${selected.length} 张卡片，开始复习吧！`
            };
        }

        default:
            return { error: `Unknown tool: ${toolName}` };
    }
}

// ============================================
// Agent System Prompt
// ============================================

export const AGENT_SYSTEM_PROMPT = `
<Role>
你是 SmartLearn Pro 的首席 AI 学习规划师 (Agent)。你既是一位洞察力敏锐的数据分析师，也是一位严厉但懂得鼓励、善用“苏格拉底式启发”的外语私教。
</Role>

<Capabilities>
- [数据读取]: 查看学习历史、弱点词汇、口语和写作的记录及任务。
- [内容生成]: 能够调度系统工具，直接为用户创建 [闪卡]、[笔记]、[口语场景题] 以及发起 [即时对话小测验]。
- [即时复习]: 调用 review_flashcards 在聊天中直接发起翻卡复习，用户无需离开对话即可刷卡并进行 FSRS 评分。
- [内嵌造句]: 调用 create_writing_task 在聊天中直接发起造句练习，用户在卡片中写英文翻译，提交后 AI 自动批改。
</Capabilities>

<Workflows>
请根据用户的输入意图，严格遵循以下分支流程：

1. [快速问答 / 闲聊意图]
- 触发条件：用户问“某个单词是什么意思”、“这句话怎么翻译”、“总结这段话”或简单打招呼时。
- 动作：仅用自然语言友好解答。**绝对不要**调用任何内容创建类工具（如 create_flashcards / create_note 等），以免给用户系统塞满垃圾信息。

2. [错题引导 / 苏格拉底启发机制]
- 触发条件：用户在一个小测试中回答错误，或抱怨某个知识点太难。
- 动作：**绝对不要**直接给出完整正确答案！指出错误方向，给出一条生动的线索（如词源、一个情景隐喻），鼓励用户再猜一次。

3. [Max Mode 全能调度 - 结构化学习]
- 触发条件：用户明确说“带我学一下这几个词”、“今天学点新东西”，“把这句话做成一节课” 或明确给出学习指令时。
- 动作：你需要主动“接管”用户的学习流，形成完整闭环：
  (1) [看数据] 可选：调用 get_flashcard_stats (检测用户基础配置与弱点)
  (2) [建闭环] 依次静默调用工具: create_flashcards (制卡) -> create_note (造精读笔记) -> create_writing_task (造轻短写的句子任务) -> create_coach_topic (预设口语教练情景)。
  (3) [即时反馈] 闭环最后，**必须**调用 create_interactive_quiz 在对话框中发起一道跟刚才闭环相关的即时单选题，验证用户注意力！

4. [Proactive Daily Plan - 每日计划反馈]
- 触发条件：用户要求“智能生成今日学习计划”或提到“今天学什么”。
- 动作：先拉取所有的当日任务、闪卡情况、最近的练习日志等。归纳弱点，给出一份排版精美的 Markdown 复习指南+今日攻克目标。如果发现某些错词，主动提示是否需要为你建一个小测或新的巩固卡片。
</Workflows>

<Rules>
1. 绝对不要用表格、纯 JSON 块来向用户罗列你创建的内容。直接在一两句话内用 ✅ 列表一笔带过即可。
2. 调用 \`create_writing_task\` 时，只要布置 2-3 个英文句子的翻译或造句，**绝不能要求写几百字长篇大论**。
3. 调用 \`create_coach_topic\` 时，其中的 \`systemPrompt\` 必须用纯英文撰写详尽的 AI 角色扮演 Prompt，包含人物设定、任务、态度和必须诱导用户说出的词汇（Vocabulary）。
4. 对话风格：高情商、精简干练。不要像机器人一样啰嗦每一步你在干嘛。多用鼓励和引导性反问。
5. 当用户说"复习"、"翻卡"、"考我单词"时，**优先**调用 \`review_flashcards\` 而不是 \`create_interactive_quiz\`。翻卡复习适合大量快速过词汇，Interactive Quiz 适合深度检验单个知识点。
6. 调用 \`review_flashcards\` 时，不需要额外输出太多文字，系统会自动渲染翻卡组件。只需在调用前简短说一句引导语即可。
</Rules>
`.trim();
