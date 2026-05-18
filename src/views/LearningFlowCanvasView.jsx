import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    AlertTriangle,
    BrainCircuit,
    Bot,
    Check,
    Circle,
    FileQuestion,
    Languages,
    Layers,
    Move,
    NotebookPen,
    PenTool,
    Plus,
    Play,
    RotateCcw,
    Route,
    Settings2,
    Tag,
    Trash2,
    Wrench,
    X,
    ZoomIn,
    ZoomOut
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { analyzeLearningFlowBrain, sendChat } from '../services/ai';
import { AGENT_TOOLS, executeAgentTool } from '../services/agentTools';
import { getFlashcards, getHistory, getNotes, getStudyLogs, getTranslationLogs, getWritings, saveFlashcard, saveNote, saveTask, saveWritingMaterial } from '../services/db';
import { getTodayNotesFolderName } from '../utils/noteFolders';

const STORAGE_KEY = 'verbapath_learning_flow_canvas_v1';
const GUIDE_KEY = 'verbapath_learning_flow_guide';
const ZOOM_KEY = 'verbapath_learning_flow_zoom';
const FLOW_PANELS_KEY = 'verbapath_learning_flow_panels_v1';
const AGENT_TOOL_FLOW_STORAGE_KEY = 'verbapath_agent_tool_flows_v1';
const CANVAS_WIDTH = 1680;
const CANVAS_HEIGHT = 860;
const MIN_ZOOM = 0.55;
const MAX_ZOOM = 1.6;
const ZOOM_STEP = 0.1;

const clampZoom = (value) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(value) || 1));
const getLocalDateLabel = (value = Date.now()) => {
    const date = new Date(value);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

const replaceNoteTemplateTokens = (template = '学习流笔记 {date}') => {
    const now = new Date();
    return String(template || '学习流笔记 {date}')
        .replaceAll('{date}', getLocalDateLabel(now))
        .replaceAll('{time}', now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }));
};

const parseTagsText = (text = '') =>
    String(text || '')
        .split(/[,，、\n]/)
        .map((item) => item.trim())
        .filter(Boolean);

const uniqueStrings = (items = []) => Array.from(new Set(items.map((item) => String(item || '').trim()).filter(Boolean)));

const shortenText = (text = '', limit = 1800) => {
    const value = String(text || '').trim();
    if (value.length <= limit) return value;
    return `${value.slice(0, limit)}\n\n...（已截断，完整内容保存在上游节点输出中）`;
};

const nodeTypes = [
    { type: 'flashcards', label: '闪卡复习', icon: Layers, color: 'from-rose-500 to-orange-400', description: '复习到期闪卡或指定文件夹。', targetView: 'flashcards' },
    { type: 'review', label: '记忆曲线', icon: Circle, color: 'from-cyan-500 to-blue-500', description: '按记忆曲线复习需要巩固的内容。', targetView: 'review' },
    { type: 'exam', label: '阅读与考试', icon: FileQuestion, color: 'from-violet-500 to-indigo-500', description: '阅读理解、证据反驳与段落匹配。', targetView: 'exam' },
    { type: 'translation', label: '翻译挑战', icon: Languages, color: 'from-emerald-500 to-teal-400', description: '两轮翻译训练与反馈。', targetView: 'translation' },
    { type: 'writer', label: 'AI 写作', icon: PenTool, color: 'from-amber-500 to-yellow-400', description: '审题、提纲、写作和诊断。', targetView: 'writer' },
    { type: 'notes', label: '笔记整理', icon: NotebookPen, color: 'from-slate-500 to-zinc-400', description: '整理深度笔记和学习复盘。', targetView: 'notes' },
    { type: 'note_composer', label: '整理学习笔记', icon: NotebookPen, color: 'from-sky-500 to-emerald-400', description: '接收上游输入，按标签预设生成一篇学习笔记。', targetView: 'notes' },
    { type: 'practice_pack', label: '笔记转练习包', icon: FileQuestion, color: 'from-indigo-500 to-emerald-400', description: '先预览，再把笔记沉淀为闪卡、翻译句、写作素材和任务。', targetView: 'notes' },
    { type: 'ai_brain', label: 'AI 大脑', icon: BrainCircuit, color: 'from-fuchsia-500 to-cyan-400', description: '根据学习数据推荐下一步路线。', targetView: 'plan' },
    { type: 'agent_tool', label: 'Agent 工具', icon: Wrench, color: 'from-lime-500 to-emerald-400', description: '把真实 agent tool 封装成可执行学习节点。', targetView: 'plan' },
    { type: 'tool_bundle', label: '自定义工具组合', icon: Route, color: 'from-teal-500 to-lime-400', description: '把多个 Agent tool 顺序合成一个可执行节点。', targetView: 'plan' }
];

const learningFlowToolPresets = [
    {
        key: 'get_flashcard_stats',
        title: '读取闪卡状态',
        goal: '查看总卡片、到期、已掌握和薄弱卡片，作为后续节点输入。',
        toolName: 'get_flashcard_stats',
        targetView: 'flashcards',
        params: {}
    },
    {
        key: 'review_flashcards',
        title: '准备快复习闪卡',
        goal: '调用 agent tool 按到期/薄弱/最近规则挑选一组闪卡。',
        toolName: 'review_flashcards',
        targetView: 'flashcards',
        params: { count: 5, filter: 'due' }
    },
    {
        key: 'list_flashcards',
        title: '读取闪卡内容',
        goal: '按文件夹、关键词或单词读取闪卡正反面，供后续写作/测验节点使用。',
        toolName: 'list_flashcards',
        targetView: 'flashcards',
        params: { limit: 10 }
    },
    {
        key: 'create_interactive_quiz',
        title: '生成互动测验',
        goal: '把一个知识点变成可交互选择题，用于即时自测。',
        toolName: 'create_interactive_quiz',
        targetView: 'plan',
        params: {
            question: 'Which sentence sounds most natural?',
            options: ['I look forward to hearing from you.', 'I expect your hear.', 'I wait your reply.'],
            correctAnswer: 'I look forward to hearing from you.',
            explanation: 'look forward to + noun/gerund is the natural formal pattern.'
        }
    },
    {
        key: 'create_writing_task',
        title: '生成句子写作练习',
        goal: '把目标词或句型变成中译英写作训练。',
        toolName: 'create_writing_task',
        targetView: 'writer',
        params: {
            title: '学习流句子输出',
            sentences: [
                { chinese: '这个方法有助于提高学习效率。', targetWord: 'contribute to', hint: 'contribute to + noun/gerund' }
            ]
        }
    },
    {
        key: 'note_append_today_folder',
        title: '追加今日复盘笔记',
        goal: '把当前学习流的结论写入今日笔记，可选择同步到写作/翻译素材。',
        toolName: 'note_append_today_folder',
        targetView: 'notes',
        params: {
            title: 'Learning Flow Review',
            heading: '学习流复盘',
            content: '- 今天最值得保留的表达：\n- 还需要复习的问题：\n- 下一步：',
            syncKnowledge: false
        }
    },
    {
        key: 'list_writing_materials',
        title: '读取写作素材',
        goal: '从写作素材库读取可用于输出训练的表达、例句和替换词。',
        toolName: 'list_writing_materials',
        targetView: 'writer',
        params: { limit: 10 }
    },
    {
        key: 'create_task_item',
        title: '创建学习任务',
        goal: '把学习流下一步保存成计划任务。',
        toolName: 'create_task_item',
        targetView: 'plan',
        params: { text: '完成学习流中的下一个节点', type: 'learning_flow' }
    },
    {
        key: 'organize_flashcards_to_note',
        title: '闪卡整理成笔记',
        goal: '把指定闪卡文件夹整理成一篇复盘笔记。',
        toolName: 'organize_flashcards_to_note',
        targetView: 'notes',
        params: {
            sourceFolderName: '',
            noteTitle: 'Flashcards Learning Review',
            mode: 'append'
        }
    }
];

const toolPresetByName = new Map(learningFlowToolPresets.map((item) => [item.toolName, item]));

const agentToolOptions = AGENT_TOOLS.map((tool) => {
    const name = tool?.function?.name || '';
    const preset = toolPresetByName.get(name);
    return {
        key: name,
        title: preset?.title || name,
        goal: preset?.goal || tool?.function?.description || 'Agent tool',
        toolName: name,
        targetView: preset?.targetView || 'plan',
        params: preset?.params || {},
        isPreset: !!preset
    };
}).filter((item) => item.toolName);

const agentToolOptionByName = new Map(agentToolOptions.map((item) => [item.toolName, item]));

const formatToolParams = (params = {}) => JSON.stringify(params, null, 2);

const parseToolParams = (paramsJson = '') => {
    const text = String(paramsJson || '').trim();
    if (!text) return {};
    return JSON.parse(text);
};

const loadPanelState = () => {
    try {
        const parsed = JSON.parse(localStorage.getItem(FLOW_PANELS_KEY) || '{}');
        return {
            showNodeLibrary: parsed.showNodeLibrary !== false,
            showConfigPanel: parsed.showConfigPanel !== false,
            showWorkflowPanel: parsed.showWorkflowPanel !== false,
            showAiBuilder: Boolean(parsed.showAiBuilder)
        };
    } catch {
        return {
            showNodeLibrary: true,
            showConfigPanel: true,
            showWorkflowPanel: true,
            showAiBuilder: false
        };
    }
};

const inferTargetViewForTool = (toolName = '') => {
    const name = String(toolName || '');
    const option = agentToolOptionByName.get(name);
    if (option?.targetView) return option.targetView;
    if (name.includes('flashcard')) return 'flashcards';
    if (name.includes('note')) return 'notes';
    if (name.includes('writing')) return 'writer';
    if (name.includes('translation')) return 'translation';
    if (name.includes('listening')) return 'listening';
    if (name.includes('reading') || name.includes('exam')) return 'exam';
    if (name.includes('coach')) return 'coach';
    if (name.includes('task')) return 'plan';
    return 'plan';
};

const buildFallbackFlowPlan = (requirement = '') => {
    const text = String(requirement || '').toLowerCase();
    const wantsReading = /阅读|文章|exam|reading|passage/.test(text);
    const wantsListening = /听力|音频|listening|audio/.test(text);
    if (wantsReading) {
        return {
            name: '阅读到输出训练学习流',
            description: '从阅读与考试文章出发，提取学习点，沉淀闪卡/笔记，再生成输出练习。',
            steps: [
                { toolName: 'get_current_reading_exam_article', title: '读取阅读文章', goal: '读取阅读与考试当前或最近文章。', defaultParams: { source: 'current_or_latest', limit: 2 } },
                { toolName: 'extract_reading_learning_points_preview', title: '预览阅读学习点', goal: '提取生词、长难句、结构和可训练句子。', defaultParams: { source: 'current_or_latest', maxWords: 12, maxSentences: 6, includeStructure: true } },
                { toolName: 'create_flashcards', title: '写入闪卡', goal: '把确认后的生词保存成闪卡。', defaultParams: {} },
                { toolName: 'note_append_today_folder', title: '写入今日阅读笔记', goal: '把文章学习点追加到今日笔记。', defaultParams: { heading: '阅读学习流复盘', syncKnowledge: true } },
                { toolName: 'note_create_deep_note', title: '生成深度笔记', goal: '挑选重点词或语法点生成深度笔记。', defaultParams: { syncToWriting: true, syncToTranslation: true } },
                { toolName: 'review_flashcards', title: '复习阅读闪卡', goal: '抽取相关闪卡进行快速复习。', defaultParams: { count: 8, filter: 'recent' } },
                { toolName: 'note_partial_sync_to_materials', title: '同步笔记到素材', goal: '把深度笔记同步为写作/翻译素材。', defaultParams: { toWriting: true, toTranslation: true, maxItems: 20 } },
                { toolName: 'create_writing_task', title: '生成写作练习', goal: '根据阅读表达生成写作迁移练习。', defaultParams: {} }
            ]
        };
    }
    if (wantsListening) {
        return {
            name: '主题到听力训练学习流',
            description: '根据主题生成听力音频，再沉淀听力文本和复习任务。',
            steps: [
                { toolName: 'create_listening_audio', title: '生成听力音频', goal: '根据主题或内容生成听力音频并保存。', defaultParams: { topic: requirement, level: 'B1-B2', style: 'short lecture', generateQuiz: true } },
                { toolName: 'note_append_today_folder', title: '追加听力复盘', goal: '把听力文本和生词追加到今日笔记。', defaultParams: { heading: '听力学习流复盘', syncKnowledge: true } },
                { toolName: 'create_task_item', title: '创建跟读任务', goal: '安排跟读、复述和错词复习。', defaultParams: { text: '完成听力音频精听、跟读和复述', type: 'listening' } }
            ]
        };
    }
    return {
        name: '自定义学习流',
        description: '根据你的需求生成的一线式工具流程。',
        steps: [
            { toolName: 'get_flashcard_stats', title: '读取学习状态', goal: '先查看当前学习资产和复习压力。', defaultParams: {} },
            { toolName: 'note_append_today_folder', title: '记录学习输入', goal: '把本次学习输入整理进今日笔记。', defaultParams: { heading: '学习流输入', content: requirement } },
            { toolName: 'create_task_item', title: '创建下一步任务', goal: '把学习流的下一步保存为任务。', defaultParams: { text: requirement || '完成自定义学习流', type: 'learning_flow' } }
        ]
    };
};

const normalizeFlowPlan = (plan = {}, requirement = '') => {
    const fallback = buildFallbackFlowPlan(requirement);
    const steps = (Array.isArray(plan.steps) ? plan.steps : [])
        .map((step) => {
            const toolName = String(step.toolName || step.name || '').trim();
            if (!agentToolOptionByName.has(toolName)) return null;
            const option = agentToolOptionByName.get(toolName);
            return {
                toolName,
                title: String(step.title || option?.title || toolName).trim(),
                goal: String(step.goal || step.reason || option?.goal || '').trim(),
                defaultParams: step.defaultParams && typeof step.defaultParams === 'object' ? step.defaultParams : {},
                targetView: String(step.targetView || inferTargetViewForTool(toolName)).trim()
            };
        })
        .filter(Boolean)
        .slice(0, 12);
    return {
        name: String(plan.name || fallback.name).trim(),
        description: String(plan.description || fallback.description).trim(),
        steps: steps.length ? steps : fallback.steps
    };
};

const loadSavedAgentToolFlows = () => {
    try {
        const parsed = JSON.parse(localStorage.getItem(AGENT_TOOL_FLOW_STORAGE_KEY) || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

const saveAgentToolFlows = (flows = []) => {
    localStorage.setItem(AGENT_TOOL_FLOW_STORAGE_KEY, JSON.stringify(flows));
};

const getOrderedAgentToolNodes = (nodes = [], edges = []) => {
    const toolNodes = nodes.filter((node) => node.type === 'agent_tool');
    const toolIds = new Set(toolNodes.map((node) => node.id));
    if (toolNodes.length <= 1) return toolNodes;

    const toolEdges = edges.filter((edge) => toolIds.has(edge.source) && toolIds.has(edge.target));
    const incoming = new Map(toolNodes.map((node) => [node.id, 0]));
    const outgoing = new Map(toolNodes.map((node) => [node.id, []]));
    toolEdges.forEach((edge) => {
        incoming.set(edge.target, (incoming.get(edge.target) || 0) + 1);
        outgoing.get(edge.source)?.push(edge.target);
    });

    const byPosition = [...toolNodes].sort((a, b) => (a.x - b.x) || (a.y - b.y));
    const queue = byPosition.filter((node) => (incoming.get(node.id) || 0) === 0);
    const orderedIds = [];
    const visited = new Set();

    while (queue.length) {
        const node = queue.shift();
        if (!node || visited.has(node.id)) continue;
        visited.add(node.id);
        orderedIds.push(node.id);
        (outgoing.get(node.id) || []).forEach((targetId) => {
            incoming.set(targetId, (incoming.get(targetId) || 0) - 1);
            if ((incoming.get(targetId) || 0) <= 0) {
                const targetNode = toolNodes.find((item) => item.id === targetId);
                if (targetNode) queue.push(targetNode);
            }
        });
    }

    byPosition.forEach((node) => {
        if (!visited.has(node.id)) orderedIds.push(node.id);
    });

    const nodeById = new Map(toolNodes.map((node) => [node.id, node]));
    return orderedIds.map((id) => nodeById.get(id)).filter(Boolean);
};

const getToolBundleToolsFromConfig = (config = {}) => {
    try {
        const parsed = JSON.parse(config.toolsJson || '[]');
        if (Array.isArray(parsed)) {
            return parsed
                .map((item) => ({
                    toolName: String(item?.toolName || '').trim(),
                    defaultParams: item?.defaultParams && typeof item.defaultParams === 'object' ? item.defaultParams : {}
                }))
                .filter((item) => item.toolName);
        }
    } catch {
        // Fall back to the last valid tool list stored on the node.
    }
    return Array.isArray(config.tools)
        ? config.tools
            .map((item) => ({
                toolName: String(item?.toolName || '').trim(),
                defaultParams: item?.defaultParams && typeof item.defaultParams === 'object' ? item.defaultParams : {}
            }))
            .filter((item) => item.toolName)
        : [];
};

const formatToolBundleTools = (tools = []) => JSON.stringify(tools, null, 2);

const getWorkflowNodes = (nodes = [], edges = []) => {
    const workflowNodes = nodes.filter((node) => node.type === 'agent_tool' || node.type === 'tool_bundle');
    const nodeIds = new Set(workflowNodes.map((node) => node.id));
    if (workflowNodes.length <= 1) return workflowNodes;

    const workflowEdges = edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target));
    const incoming = new Map(workflowNodes.map((node) => [node.id, 0]));
    const outgoing = new Map(workflowNodes.map((node) => [node.id, []]));
    workflowEdges.forEach((edge) => {
        incoming.set(edge.target, (incoming.get(edge.target) || 0) + 1);
        outgoing.get(edge.source)?.push(edge.target);
    });

    const byPosition = [...workflowNodes].sort((a, b) => (a.x - b.x) || (a.y - b.y));
    const queue = byPosition.filter((node) => (incoming.get(node.id) || 0) === 0);
    const orderedIds = [];
    const visited = new Set();

    while (queue.length) {
        const node = queue.shift();
        if (!node || visited.has(node.id)) continue;
        visited.add(node.id);
        orderedIds.push(node.id);
        (outgoing.get(node.id) || []).forEach((targetId) => {
            incoming.set(targetId, (incoming.get(targetId) || 0) - 1);
            if ((incoming.get(targetId) || 0) <= 0) {
                const targetNode = workflowNodes.find((item) => item.id === targetId);
                if (targetNode) queue.push(targetNode);
            }
        });
    }

    byPosition.forEach((node) => {
        if (!visited.has(node.id)) orderedIds.push(node.id);
    });

    const nodeById = new Map(workflowNodes.map((node) => [node.id, node]));
    return orderedIds.map((id) => nodeById.get(id)).filter(Boolean);
};

const getWorkflowToolsFromNode = (node) => {
    if (node?.type === 'agent_tool') {
        return [{
            toolName: node.config?.toolName || 'review_flashcards',
            defaultParams: parseToolParams(node.config?.paramsJson || '{}')
        }];
    }
    if (node?.type === 'tool_bundle') return getToolBundleToolsFromConfig(node.config);
    return [];
};

const getWorkflowNodeStepCount = (node) => (
    node?.type === 'tool_bundle' ? getToolBundleToolsFromConfig(node.config).length : (node?.type === 'agent_tool' ? 1 : 0)
);

const buildAgentToolFlowFromCanvas = ({ nodes = [], edges = [], name = '', description = '' }) => {
    const orderedNodes = getWorkflowNodes(nodes, edges);
    const tools = orderedNodes.flatMap(getWorkflowToolsFromNode).filter((item) => item.toolName);
    const now = Date.now();
    return {
        id: `flow_canvas_${now}`,
        name: String(name || '学习流工具工作流').trim(),
        description: String(description || '从学习流画布保存的 Agent tool 工作流。').trim(),
        source: 'saved',
        tools,
        createdAt: now,
        updatedAt: now
    };
};

const summarizeToolResult = (toolName, result) => {
    if (result?.error) return `工具 ${toolName} 执行失败：${result.error}`;
    if (result?.message) return String(result.message);
    if (typeof result?.count === 'number') return `工具 ${toolName} 已完成，结果数量 ${result.count}。`;
    if (typeof result?.total === 'number') return `工具 ${toolName} 已完成，总数 ${result.total}。`;
    if (Array.isArray(result?.cards)) return `工具 ${toolName} 已准备 ${result.cards.length} 张卡片。`;
    if (Array.isArray(result?.items)) return `工具 ${toolName} 已返回 ${result.items.length} 条结果。`;
    return `工具 ${toolName} 已执行完成。`;
};

const nodeDefaults = {
    flashcards: {
        title: '优先复习关键闪卡', estimatedMinutes: 10, completionRule: '完成一组复习并评分', goal: '巩固今天到期或未复习词汇',
        config: { scope: '到期优先', count: 12, priority: '优先未复习' }
    },
    review: {
        title: '记忆曲线巩固', estimatedMinutes: 8, completionRule: '完成今日曲线复习', goal: '把容易遗忘的内容重新拉回记忆区间',
        config: { mode: '今日到期', count: 15 }
    },
    exam: {
        title: '精读一篇短文', estimatedMinutes: 12, completionRule: '完成阅读题并查看证据句', goal: '训练定位、推理和证据意识',
        config: { questionType: '阅读理解', source: '最近文章', evidenceDebate: true }
    },
    translation: {
        title: '全句情境翻译挑战', estimatedMinutes: 12, completionRule: '完成二稿评分', goal: '训练语义准确和自然表达',
        config: { difficulty: '中等', scenario: '自动轮换', mode: '全句模式' }
    },
    writer: {
        title: '升级一段作文表达', estimatedMinutes: 15, completionRule: '完成一段改写或诊断', goal: '提升结构、逻辑和词汇丰富度',
        config: { stage: '写作', targetScore: '12', useMaterials: true }
    },
    notes: {
        title: '整理今日学习复盘笔记', estimatedMinutes: 6, completionRule: '完成一条复盘记录', goal: '沉淀词汇、句型和遗留问题',
        config: { range: '今日学习', generateReview: true }
    },
    note_composer: {
        title: '整理学习笔记',
        estimatedMinutes: 4,
        completionRule: '生成一篇带标签的学习笔记',
        goal: '把上游节点输入整理成可沉淀、可检索、可复习的笔记。',
        config: {
            titleTemplate: '学习流笔记 {date}',
            includeDeepNoteTag: true,
            includeTodayTag: true,
            customTags: '',
            manualInput: '',
            includeSourceDetails: true,
            useAI: false,
            aiPersona: '严谨助教',
            aiPrompt: '请把输入内容整理成结构清晰的中文学习笔记，保留关键英文表达、中文解释、例句和下一步复习建议。'
        }
    },
    practice_pack: {
        title: '笔记转练习包',
        estimatedMinutes: 6,
        completionRule: '先生成预览，再确认创建学习资产',
        goal: '把上游笔记沉淀为可复习、可输出、可安排的练习包。',
        config: {
            outputs: {
                flashcards: true,
                translationExamples: true,
                writingMaterials: true,
                tasks: true
            },
            includePracticeTag: true,
            includeTodayTag: true,
            customTags: '',
            manualInput: '',
            noteId: '',
            limits: {
                flashcards: 8,
                translationExamples: 5,
                writingMaterials: 5,
                tasks: 3
            },
            useAI: false,
            aiPersona: '严谨助教',
            aiPrompt: '请从输入笔记中提取可训练内容，生成闪卡、翻译例句、写作素材和学习任务。'
        }
    },
    ai_brain: {
        title: 'AI 路由决策', estimatedMinutes: 3, completionRule: '生成下一步推荐', goal: '根据学习结果判断下一步最值得做什么',
        config: {
            objective: '补弱点',
            analysisScope: '上游节点 + 近 7 天历史',
            outputMode: '推荐下一步',
            autoApplySuggestedConfig: false,
            outputs: ['flashcards', 'exam', 'translation', 'writer', 'notes'],
            evidence: '近 7 天 + 当前流程'
        }
    },
    agent_tool: {
        title: '执行 Agent 工具',
        estimatedMinutes: 3,
        completionRule: '工具返回成功结果',
        goal: '把一个真实 agent tool 作为学习流节点执行。',
        config: {
            toolName: 'review_flashcards',
            paramsJson: formatToolParams(toolPresetByName.get('review_flashcards')?.params || { count: 5, filter: 'due' }),
            targetView: 'flashcards'
        }
    },
    tool_bundle: {
        title: '自定义工具组合',
        estimatedMinutes: 8,
        completionRule: '按固定顺序执行组合里的全部工具',
        goal: '把多个 Agent tool 固定成一个学习流节点，后续可以直接执行或保存到 AI 聊天工作流。',
        config: {
            tools: [],
            toolsJson: '[]',
            targetView: 'plan'
        }
    }
};

const initialNodes = [
    { id: 'node_flashcards', type: 'flashcards', x: 120, y: 130, status: 'pending' },
    { id: 'node_exam', type: 'exam', x: 430, y: 130, status: 'pending' },
    { id: 'node_translation', type: 'translation', x: 740, y: 130, status: 'pending' },
    { id: 'node_writer', type: 'writer', x: 1050, y: 130, status: 'pending' },
    { id: 'node_notes', type: 'notes', x: 1360, y: 130, status: 'pending' }
];

const getNodeMeta = (type) => nodeTypes.find((item) => item.type === type) || nodeTypes[0];
const getNodeDefaults = (type) => nodeDefaults[type] || nodeDefaults.flashcards;

const normalizeNode = (node) => {
    const defaults = getNodeDefaults(node?.type);
    const config = { ...defaults.config, ...(node?.config || {}) };
    if (node?.type === 'agent_tool') {
        const option = agentToolOptionByName.get(config.toolName) || agentToolOptions[0] || learningFlowToolPresets[0];
        config.toolName = config.toolName || option.toolName;
        config.targetView = config.targetView || option.targetView || 'plan';
        config.paramsJson = config.paramsJson || formatToolParams(config.params || option.params || {});
        delete config.params;
    }
    if (node?.type === 'tool_bundle') {
        const tools = getToolBundleToolsFromConfig(config);
        config.tools = tools;
        config.toolsJson = config.toolsJson || formatToolBundleTools(tools);
        config.targetView = config.targetView || 'plan';
    }
    if (node?.type === 'practice_pack') {
        config.outputs = { ...defaults.config.outputs, ...(node?.config?.outputs || {}) };
        config.limits = { ...defaults.config.limits, ...(node?.config?.limits || {}) };
    }
    return {
        ...node,
        title: node?.title || defaults.title,
        description: node?.description || getNodeMeta(node?.type).description,
        estimatedMinutes: node?.estimatedMinutes || defaults.estimatedMinutes,
        completionRule: node?.completionRule || defaults.completionRule,
        goal: node?.goal || defaults.goal,
        config,
        output: node?.output || null
    };
};

const buildNoteComposerTags = (config = {}) => uniqueStrings([
    ...(config.includeDeepNoteTag ? ['深度笔记'] : []),
    ...(config.includeTodayTag ? [getTodayNotesFolderName(getLocalDateLabel())] : []),
    ...parseTagsText(config.customTags)
]);

const stringifyNodeOutputForNote = (node = {}) => {
    const pieces = [];
    if (node.output?.summary) pieces.push(node.output.summary);
    if (node.output?.brainResult?.reviewNoteDraft) pieces.push(node.output.brainResult.reviewNoteDraft);
    if (Array.isArray(node.output?.toolResult?.cards) && node.output.toolResult.cards.length) {
        pieces.push(node.output.toolResult.cards.map((card, index) => {
            const front = String(card.front || card.word || '').trim();
            const back = String(card.back || '').trim();
            return `${index + 1}. ${front}${back ? `\n   ${back}` : ''}`;
        }).join('\n'));
    }
    if (Array.isArray(node.output?.toolResult?.items) && node.output.toolResult.items.length) {
        pieces.push(node.output.toolResult.items.slice(0, 12).map((item, index) => {
            const title = item.title || item.word || item.text || item.id || `Item ${index + 1}`;
            const content = item.content || item.back || item.summary || '';
            return `${index + 1}. ${title}${content ? `\n   ${shortenText(content, 360)}` : ''}`;
        }).join('\n'));
    }
    if (Array.isArray(node.output?.toolResults) && node.output.toolResults.length) {
        pieces.push(node.output.toolResults.map((item) => (
            `${item.index || ''}. ${item.toolName}: ${item.summary || item.status || 'done'}`
        )).join('\n'));
    }
    if (node.output?.toolResult && !pieces.length) {
        pieces.push(shortenText(JSON.stringify(node.output.toolResult, null, 2), 1400));
    }
    return pieces.filter(Boolean).join('\n\n');
};

const buildNoteComposerSourceText = (noteNode, upstreamNodes = []) => {
    const manualInput = String(noteNode?.config?.manualInput || '').trim();
    const upstreamBlocks = upstreamNodes.map((node, index) => {
        const body = stringifyNodeOutputForNote(node) || node.goal || node.description || '';
        if (!body) return '';
        return `## 输入 ${index + 1}：${node.title || getNodeMeta(node.type).label}\n${shortenText(body, 2200)}`;
    }).filter(Boolean);
    const manualBlock = manualInput ? `## 手动输入\n${manualInput}` : '';
    return [...upstreamBlocks, manualBlock].filter(Boolean).join('\n\n');
};

const buildDirectLearningNoteMarkdown = ({ title, sourceText, tags = [], upstreamNodes = [], includeSourceDetails = true }) => {
    const sourceList = upstreamNodes.length
        ? upstreamNodes.map((node) => `- ${node.title || getNodeMeta(node.type).label}（${node.status === 'done' ? '已完成' : node.status || '未完成'}）`).join('\n')
        : '- 手动输入';
    return [
        `# ${title}`,
        '',
        `> 由学习流节点生成于 ${new Date().toLocaleString('zh-CN')}。`,
        tags.length ? `> 标签：${tags.map((tag) => `#${tag}`).join(' ')}` : '',
        '',
        ...(includeSourceDetails ? ['## 输入来源', sourceList, ''] : []),
        '## 学习笔记',
        sourceText || '暂无输入内容。'
    ].filter(Boolean).join('\n');
};

const polishLearningNoteWithAI = async ({ node, title, sourceText, tags }, settings) => {
    if (!settings?.apiKey) throw new Error('请先在设置中配置 AI API Key，或关闭 AI 整理。');
    const persona = String(node.config?.aiPersona || '严谨助教');
    const prompt = String(node.config?.aiPrompt || '').trim();
    return await sendChat([
        {
            role: 'system',
            content: `你是 VerbaPath 学习流里的“整理学习笔记”节点。你的人设是：${persona}。请只输出 Markdown 笔记正文，不要输出 JSON，不要编造输入中没有的信息。`
        },
        {
            role: 'user',
            content: [
                `笔记标题：${title}`,
                `预设标签：${tags.join(', ') || '无'}`,
                `整理要求：${prompt || '整理为清晰的中文学习笔记。'}`,
                '',
                '输入内容：',
                sourceText
            ].join('\n')
        }
    ], settings, false);
};

const emptyPracticePreview = () => ({
    flashcards: [],
    translationExamples: [],
    writingMaterials: [],
    tasks: []
});

const clampPracticeLimit = (value, fallback) => Math.max(1, Math.min(30, Number(value) || fallback));

const getPracticePackLimits = (config = {}) => ({
    flashcards: clampPracticeLimit(config.limits?.flashcards, 8),
    translationExamples: clampPracticeLimit(config.limits?.translationExamples, 5),
    writingMaterials: clampPracticeLimit(config.limits?.writingMaterials, 5),
    tasks: clampPracticeLimit(config.limits?.tasks, 3)
});

const buildPracticePackTags = (config = {}) => uniqueStrings([
    ...(config.includePracticeTag !== false ? ['练习包'] : []),
    ...(config.includeTodayTag !== false ? [`今日笔记 ${getLocalDateLabel()}`] : []),
    ...parseTagsText(config.customTags)
]);

const countPracticePreviewItems = (preview = {}) =>
    (preview.flashcards?.length || 0)
    + (preview.translationExamples?.length || 0)
    + (preview.writingMaterials?.length || 0)
    + (preview.tasks?.length || 0);

const parseJsonObjectFromText = (text) => {
    if (!text) return null;
    const raw = String(text || '').trim()
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```$/i, '')
        .trim();
    try {
        return JSON.parse(raw);
    } catch {
        const match = raw.match(/\{[\s\S]*\}/);
        if (!match) return null;
        try {
            return JSON.parse(match[0]);
        } catch {
            return null;
        }
    }
};

const normalizePracticePackPreview = (raw = {}, config = {}) => {
    const limits = getPracticePackLimits(config);
    const outputs = config.outputs || {};
    const enabled = {
        flashcards: outputs.flashcards !== false,
        translationExamples: outputs.translationExamples !== false,
        writingMaterials: outputs.writingMaterials !== false,
        tasks: outputs.tasks !== false
    };
    const asArray = (value) => Array.isArray(value) ? value : [];
    const clean = (value, limit = 900) => shortenText(String(value || '').trim(), limit);
    const preview = emptyPracticePreview();

    if (enabled.flashcards) {
        preview.flashcards = asArray(raw.flashcards).map((item) => {
            const front = clean(item?.front || item?.word || item?.question || item?.title, 180);
            const back = clean(item?.back || item?.answer || item?.chinese_meaning || item?.meaning || item?.explanation, 600);
            const example = clean(item?.example || item?.sentence, 300);
            return {
                front,
                back: [back, example ? `例句：${example}` : '', item?.example_translation ? `译文：${clean(item.example_translation, 240)}` : ''].filter(Boolean).join('\n'),
                word: clean(item?.word || front, 120),
                phonetic: clean(item?.phonetic, 80)
            };
        }).filter((item) => item.front && item.back).slice(0, limits.flashcards);
    }

    if (enabled.translationExamples) {
        preview.translationExamples = asArray(raw.translationExamples || raw.translation_examples).map((item) => ({
            chinese: clean(item?.chinese || item?.source || item?.prompt || item?.content, 260),
            targetWord: clean(item?.targetWord || item?.target_word || item?.keyword || item?.word, 120),
            hint: clean(item?.hint || item?.note || item?.explanation, 220),
            answer: clean(item?.answer || item?.english || item?.translation || item?.example, 300)
        })).filter((item) => item.chinese || item.answer).slice(0, limits.translationExamples);
    }

    if (enabled.writingMaterials) {
        preview.writingMaterials = asArray(raw.writingMaterials || raw.writing_materials || raw.materials).map((item) => ({
            title: clean(item?.title || item?.name || item?.topic || '学习流写作素材', 160),
            content: clean(item?.content || item?.text || item?.example || item?.body, 900),
            category: clean(item?.category || item?.type || 'expression', 80),
            topic: clean(item?.topic || item?.title || 'learning-flow', 120),
            tags: uniqueStrings(asArray(item?.tags).map(String))
        })).filter((item) => item.title && item.content).slice(0, limits.writingMaterials);
    }

    if (enabled.tasks) {
        preview.tasks = asArray(raw.tasks).map((item) => ({
            title: clean(item?.title || item?.text || item?.task || item?.content, 180),
            type: clean(item?.type || 'learning_flow', 80)
        })).filter((item) => item.title).slice(0, limits.tasks);
    }

    return preview;
};

const parsePracticePackByRules = (sourceText = '', config = {}) => {
    const lines = String(sourceText || '').split('\n').map((line) => line.trim()).filter(Boolean);
    const raw = emptyPracticePreview();
    const headings = [];
    const importantLines = [];

    lines.forEach((line) => {
        const headingMatch = line.match(/^#{1,4}\s+(.+)$/);
        if (headingMatch) headings.push(headingMatch[1].trim());

        const normalized = line.replace(/^[-*+]\s+/, '').trim();
        if (!normalized) return;

        if (/@material/i.test(normalized)) {
            raw.writingMaterials.push({
                title: normalized.replace(/@material/ig, '').trim().slice(0, 80) || '写作素材',
                content: normalized,
                category: 'material'
            });
            return;
        }

        if (/@translation_example/i.test(normalized)) {
            const body = normalized.replace(/@translation_example/ig, '').trim();
            raw.translationExamples.push({ chinese: body, hint: '来自 @translation_example 标记' });
            return;
        }

        if (/@vocab_replace/i.test(normalized)) {
            raw.writingMaterials.push({
                title: '词汇替换',
                content: normalized.replace(/@vocab_replace/ig, '').trim() || normalized,
                category: 'vocab_replace'
            });
            return;
        }

        const vocabMatch = normalized.match(/^([A-Za-z][A-Za-z\s'-]{1,48})(?:\s*[：:=-]\s*|\s+)([\u4e00-\u9fa5][\s\S]{1,160})$/);
        if (vocabMatch) {
            raw.flashcards.push({
                front: vocabMatch[1].trim(),
                back: vocabMatch[2].trim(),
                word: vocabMatch[1].trim()
            });
        }

        const arrowMatch = normalized.match(/^(.{2,120}?)(?:=>|->|→)(.{2,180})$/);
        const bilingual = /[\u4e00-\u9fa5]/.test(normalized) && /[A-Za-z]{3,}/.test(normalized);
        if (arrowMatch) {
            raw.translationExamples.push({
                chinese: arrowMatch[1].trim(),
                answer: arrowMatch[2].trim()
            });
        } else if (bilingual && normalized.length <= 240) {
            raw.translationExamples.push({ chinese: normalized, hint: '双语例句，建议重译一次' });
        }

        if (normalized.length >= 18 && normalized.length <= 260) {
            importantLines.push(normalized);
        }
    });

    headings.slice(0, 5).forEach((heading) => {
        raw.tasks.push({ title: `复盘并输出：${heading}`, type: 'learning_flow' });
    });

    importantLines.slice(0, 6).forEach((line) => {
        if (raw.writingMaterials.length < 8 && /[A-Za-z]{4,}/.test(line)) {
            raw.writingMaterials.push({ title: line.slice(0, 48), content: line, category: 'expression' });
        }
    });

    if (!raw.tasks.length && lines.length) {
        raw.tasks.push({ title: '用本笔记生成的闪卡完成一次主动回忆', type: 'review' });
        raw.tasks.push({ title: '选 2 个表达写出自己的英文例句', type: 'writing' });
    }

    return normalizePracticePackPreview(raw, config);
};

const buildPracticePackSourceText = async (packNode, upstreamNodes = []) => {
    const manualInput = String(packNode?.config?.manualInput || '').trim();
    const pieces = [];
    const noteId = String(packNode?.config?.noteId || '').trim();

    if (noteId) {
        const notes = await getNotes().catch(() => []);
        const note = (notes || []).find((item) => String(item.id) === noteId);
        if (note) {
            pieces.push(`## 指定笔记：${note.title || noteId}\n${shortenText(note.content || note.summary || '', 2600)}`);
        }
    }

    upstreamNodes.forEach((node, index) => {
        const output = node.output || {};
        const noteContent = output.note?.content || output.note?.summary || '';
        const summary = output.summary || '';
        const toolResult = output.toolResult ? shortenText(JSON.stringify(output.toolResult, null, 2), 1600) : '';
        const body = [noteContent, summary, toolResult, stringifyNodeOutputForNote(node), node.goal].filter(Boolean).join('\n\n');
        if (body.trim()) {
            pieces.push(`## 上游输入 ${index + 1}：${node.title || getNodeMeta(node.type).label}\n${shortenText(body, 2600)}`);
        }
    });

    if (manualInput) pieces.push(`## 手动输入\n${manualInput}`);
    return pieces.filter(Boolean).join('\n\n');
};

const generatePracticePackPreviewWithAI = async ({ node, sourceText, rulePreview, tags }, settings) => {
    if (!settings?.apiKey) throw new Error('请先在设置中配置 AI API Key，或关闭 AI 增强。');
    const persona = String(node.config?.aiPersona || '严谨助教');
    const prompt = String(node.config?.aiPrompt || '').trim();
    const content = await sendChat([
        {
            role: 'system',
            content: `你是 VerbaPath 学习流里的“笔记转练习包”节点。你的人设是：${persona}。请只返回 JSON 对象，不要 Markdown，不要编造输入中不存在的事实。`
        },
        {
            role: 'user',
            content: [
                '请把输入笔记提取成下面 JSON 结构：',
                '{"flashcards":[{"front":"","back":"","word":"","phonetic":"","example":"","example_translation":""}],"translationExamples":[{"chinese":"","targetWord":"","hint":"","answer":""}],"writingMaterials":[{"title":"","content":"","category":"","topic":"","tags":[]}],"tasks":[{"title":"","type":""}]}',
                '',
                `预设标签：${tags.join(', ') || '无'}`,
                `提取要求：${prompt || '提取最值得训练的表达、例句、任务。'}`,
                `规则解析保底结果：${JSON.stringify(rulePreview).slice(0, 3000)}`,
                '',
                '输入笔记：',
                sourceText
            ].join('\n')
        }
    ], settings, true);
    const parsed = parseJsonObjectFromText(content);
    if (!parsed) throw new Error('AI 没有返回可解析的 JSON 预览。');
    return normalizePracticePackPreview(parsed, node.config);
};

const createDefaultEdges = (nodes = initialNodes) => {
    const ordered = [...nodes].sort((a, b) => a.x - b.x);
    return ordered.slice(0, -1).map((node, index) => {
        const next = ordered[index + 1];
        return { id: `edge_${node.id}_${next.id}`, source: node.id, target: next.id, sourceHandle: 'out', targetHandle: 'in' };
    });
};

const loadCanvasData = () => {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
        if (Array.isArray(saved) && saved.length) {
            const nodes = saved.map(normalizeNode);
            return { nodes, edges: createDefaultEdges(nodes) };
        }
        if (saved && Array.isArray(saved.nodes)) {
            const nodes = (saved.nodes.length ? saved.nodes : initialNodes).map(normalizeNode);
            return { nodes, edges: Array.isArray(saved.edges) ? saved.edges : createDefaultEdges(nodes) };
        }
    } catch {
        // ignore invalid local drafts
    }
    const nodes = initialNodes.map(normalizeNode);
    return { nodes, edges: createDefaultEdges(nodes) };
};

const buildNodeOutput = (node, nextStatus) => {
    if (node.type === 'ai_brain') return node.output || null;
    if (nextStatus !== 'done') {
        return {
            updatedAt: Date.now(),
            summary: `${node.title || getNodeMeta(node.type).label} 标记为未完成。`,
            metrics: { status: 'pending' }
        };
    }
    const configText = Object.entries(node.config || {})
        .filter(([, value]) => typeof value !== 'object')
        .map(([key, value]) => `${key}: ${value}`)
        .slice(0, 4)
        .join('；');
    return {
        updatedAt: Date.now(),
        summary: `${node.title || getNodeMeta(node.type).label} 已完成。目标：${node.goal || '未填写'}。`,
        metrics: {
            status: 'done',
            nodeType: node.type,
            estimatedMinutes: node.estimatedMinutes || 0,
            completionRule: node.completionRule || '',
            configSummary: configText || '默认配置'
        }
    };
};

const summarizeRecentStudyContext = async () => {
    const since = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const [flashcards, histories, notes, writings, translationLogs, studyLogs] = await Promise.all([
        getFlashcards().catch(() => []),
        getHistory().catch(() => []),
        getNotes().catch(() => []),
        getWritings().catch(() => []),
        getTranslationLogs(20).catch(() => []),
        getStudyLogs().catch(() => [])
    ]);
    const recentCards = (flashcards || []).filter((card) => Number(card.createdAt || 0) >= since);
    const dueCards = (flashcards || []).filter((card) => !card.nextReview || Number(card.nextReview) <= Date.now());
    const weakCards = (flashcards || [])
        .filter((card) => Number(card.weaknessScore || 0) > 0 || card.isFlagged)
        .slice(0, 12)
        .map((card) => String(card.front || '').split('\n')[0].slice(0, 40));
    const recentHistories = (histories || []).filter((item) => Number(item.timestamp || item.createdAt || 0) >= since).slice(0, 8);
    const recentNotes = (notes || []).filter((item) => Number(item.updatedAt || 0) >= since).slice(0, 8);
    const recentWritings = (writings || []).filter((item) => Number(item.updatedAt || item.createdAt || 0) >= since).slice(0, 8);
    const recentTranslations = (translationLogs || []).filter((item) => Number(item.createdAt || 0) >= since).slice(0, 8);
    const recentStudyLogs = (studyLogs || []).filter((item) => Number(item.timestamp || 0) >= since).slice(0, 20);

    return {
        range: '近 7 天',
        generatedAt: Date.now(),
        flashcards: {
            total: flashcards?.length || 0,
            newIn7Days: recentCards.length,
            due: dueCards.length,
            weakSamples: weakCards
        },
        reading: {
            count: recentHistories.length,
            titles: recentHistories.map((item) => item.title || item.name || '未命名阅读').slice(0, 5)
        },
        writing: {
            count: recentWritings.length,
            titles: recentWritings.map((item) => item.title || '未命名写作').slice(0, 5)
        },
        translation: {
            count: recentTranslations.length,
            recentScores: recentTranslations.map((item) => item.score100 || item.score15 || item.score || 0).slice(0, 5)
        },
        notes: {
            count: recentNotes.length,
            titles: recentNotes.map((item) => item.title || '未命名笔记').slice(0, 5)
        },
        studyLogs: recentStudyLogs.map((item) => ({ type: item.type, count: item.count, date: item.date }))
    };
};

const normalizeBrainResult = (raw, fallbackType = 'notes') => {
    const allowed = new Set(['flashcards', 'exam', 'translation', 'writer', 'notes']);
    const recommendedNodeType = allowed.has(raw?.recommendedNodeType) ? raw.recommendedNodeType : fallbackType;
    return {
        summary: String(raw?.summary || '已完成学习流分析。'),
        evidence: Array.isArray(raw?.evidence) ? raw.evidence.map(String).slice(0, 6) : [],
        weaknesses: Array.isArray(raw?.weaknesses) ? raw.weaknesses.map(String).slice(0, 6) : [],
        recommendedNodeType,
        reason: String(raw?.reason || '根据当前学习流状态，建议继续推进这个节点。'),
        suggestedConfig: raw?.suggestedConfig && typeof raw.suggestedConfig === 'object' ? raw.suggestedConfig : {},
        reviewNoteDraft: String(raw?.reviewNoteDraft || ''),
        source: raw?.source || 'local'
    };
};

const buildLocalBrainResult = (brainNode, nodes, upstreamOutputs, recentStudyContext, reason = '') => {
    const unfinished = nodes.filter((item) => item.id !== brainNode.id && item.status !== 'done');
    const dueCards = Number(recentStudyContext?.flashcards?.due || 0);
    const translationScores = recentStudyContext?.translation?.recentScores || [];
    const lowTranslation = translationScores.some((score) => Number(score) > 0 && Number(score) < 75);
    let recommendedNodeType = 'notes';
    if (dueCards > 0) recommendedNodeType = 'flashcards';
    else if (lowTranslation) recommendedNodeType = 'translation';
    else if (unfinished.some((node) => node.type === 'exam')) recommendedNodeType = 'exam';
    else if (unfinished.some((node) => node.type === 'writer')) recommendedNodeType = 'writer';
    else if (unfinished[0]?.type) recommendedNodeType = unfinished[0].type;

    return normalizeBrainResult({
        summary: reason ? 'AI 调用失败，已使用本地规则生成保守建议。' : '已根据当前流程生成保守建议。',
        evidence: [
            `上游输入 ${upstreamOutputs.length} 条`,
            `近 7 天新增闪卡 ${recentStudyContext?.flashcards?.newIn7Days || 0} 张，到期 ${dueCards} 张`,
            `近 7 天翻译训练 ${recentStudyContext?.translation?.count || 0} 次`
        ],
        weaknesses: dueCards > 0 ? ['有到期或待巩固闪卡'] : ['当前数据不足，需要先完成更多节点'],
        recommendedNodeType,
        reason: reason || `当前策略是“${brainNode.config?.objective || '补弱点'}”，优先处理最明确的待完成任务。`,
        suggestedConfig: recommendedNodeType === 'flashcards'
            ? { scope: '到期优先', priority: '优先薄弱', count: Math.min(20, Math.max(8, dueCards || 10)) }
            : {},
        source: 'local'
    }, recommendedNodeType);
};

const renderConfigFields = (node, onConfigChange) => {
    const cfg = node.config || {};
    const inputClass = 'w-full rounded-xl border border-phy-border bg-phy-bg px-3 py-2 text-sm text-phy-text outline-none focus:border-phy-accent/60';
    const select = (key, options) => (
        <select value={cfg[key] || ''} onChange={(e) => onConfigChange(key, e.target.value)} className={inputClass}>
            {options.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
    );
    const number = (key) => (
        <input type="number" min="1" value={cfg[key] || 1} onChange={(e) => onConfigChange(key, Number(e.target.value) || 1)} className={inputClass} />
    );
    const checkbox = (key, label) => (
        <label className="flex items-center gap-2 text-sm font-bold text-phy-text">
            <input type="checkbox" checked={!!cfg[key]} onChange={(e) => onConfigChange(key, e.target.checked)} className="accent-phy-accent" />
            {label}
        </label>
    );

    if (node.type === 'flashcards') return <>
        <Field label="复习范围">{select('scope', ['到期优先', '全部卡片', '指定文件夹', '重点标记'])}</Field>
        <Field label="复习数量">{number('count')}</Field>
        <Field label="优先策略">{select('priority', ['优先未复习', '优先薄弱', '完全随机'])}</Field>
    </>;
    if (node.type === 'exam') return <>
        <Field label="题型">{select('questionType', ['阅读理解', '段落匹配', '混合训练'])}</Field>
        <Field label="文章来源">{select('source', ['最近文章', '手动导入', '历史错题'])}</Field>
        <Field label="证据反驳">{checkbox('evidenceDebate', '启用证据反驳')}</Field>
    </>;
    if (node.type === 'translation') return <>
        <Field label="难度">{select('difficulty', ['简单', '中等', '困难'])}</Field>
        <Field label="场景">{select('scenario', ['自动轮换', '邮件', '课堂', '职场', '旅行', '社交媒体'])}</Field>
        <Field label="模式">{select('mode', ['全句模式', '阶梯模式'])}</Field>
    </>;
    if (node.type === 'writer') return <>
        <Field label="写作阶段">{select('stage', ['审题', '提纲', '写作', '诊断'])}</Field>
        <Field label="目标分">{select('targetScore', ['10', '12', '14', '15'])}</Field>
        <Field label="素材包">{checkbox('useMaterials', '使用素材包辅助')}</Field>
    </>;
    if (node.type === 'notes') return <>
        <Field label="整理范围">{select('range', ['今日学习', '近 7 天', '当前流程'])}</Field>
        <Field label="复盘方式">{checkbox('generateReview', '生成复盘总结')}</Field>
    </>;
    if (node.type === 'note_composer') return <>
        <Field label="笔记标题模板">
            <input value={cfg.titleTemplate || ''} onChange={(e) => onConfigChange('titleTemplate', e.target.value)} className={inputClass} placeholder="学习流笔记 {date}" />
        </Field>
        <div className="grid grid-cols-1 gap-2">
            <Field label="标签预设">{checkbox('includeDeepNoteTag', '加入“深度笔记”标签')}</Field>
            <Field label="日期标签">{checkbox('includeTodayTag', `加入“${getTodayNotesFolderName(getLocalDateLabel())}”标签`)}</Field>
        </div>
        <Field label="自定义标签">
            <input value={cfg.customTags || ''} onChange={(e) => onConfigChange('customTags', e.target.value)} className={inputClass} placeholder="逗号分隔，例如：阅读复盘, 重点表达" />
        </Field>
        <Field label="手动输入">
            <textarea value={cfg.manualInput || ''} onChange={(e) => onConfigChange('manualInput', e.target.value)} rows={5} className={inputClass} placeholder="没有上游节点时，可以直接把要整理的内容放在这里。" />
        </Field>
        <Field label="来源">{checkbox('includeSourceDetails', '在笔记中保留输入来源')}</Field>
        <div className="rounded-2xl border border-sky-300/20 bg-sky-400/10 p-3 space-y-3">
            <Field label="AI 整理">{checkbox('useAI', '启用 AI 进行简单整理')}</Field>
            {cfg.useAI && <>
                <Field label="AI 人设">{select('aiPersona', ['严谨助教', '考试教练', '苏格拉底导师', '双语编辑', '记忆规划师'])}</Field>
                <Field label="AI 提示词">
                    <textarea value={cfg.aiPrompt || ''} onChange={(e) => onConfigChange('aiPrompt', e.target.value)} rows={5} className={inputClass} />
                </Field>
            </>}
        </div>
    </>;
    if (node.type === 'practice_pack') {
        const outputs = cfg.outputs || {};
        const limits = cfg.limits || {};
        const outputCheckbox = (key, label) => (
            <label className="flex items-center gap-2 rounded-xl border border-indigo-300/15 bg-indigo-400/5 px-3 py-2 text-xs font-bold text-phy-text">
                <input
                    type="checkbox"
                    checked={outputs[key] !== false}
                    onChange={(e) => onConfigChange('outputs', { ...outputs, [key]: e.target.checked })}
                    className="accent-phy-accent"
                />
                {label}
            </label>
        );
        const limitInput = (key) => (
            <input
                type="number"
                min="1"
                max="30"
                value={limits[key] || getPracticePackLimits(cfg)[key]}
                onChange={(e) => onConfigChange('limits', { ...limits, [key]: Number(e.target.value) || 1 })}
                className={inputClass}
            />
        );
        return <>
            <Field label="输出产物">
                <div className="grid grid-cols-2 gap-2">
                    {outputCheckbox('flashcards', '闪卡')}
                    {outputCheckbox('translationExamples', '翻译句')}
                    {outputCheckbox('writingMaterials', '写作素材')}
                    {outputCheckbox('tasks', '学习任务')}
                </div>
            </Field>
            <div className="grid grid-cols-1 gap-2">
                <Field label="练习包标签">{checkbox('includePracticeTag', '加入“练习包”标签')}</Field>
                <Field label="日期标签">{checkbox('includeTodayTag', `加入“今日笔记 ${getLocalDateLabel()}”标签`)}</Field>
            </div>
            <Field label="自定义标签">
                <input value={cfg.customTags || ''} onChange={(e) => onConfigChange('customTags', e.target.value)} className={inputClass} placeholder="逗号分隔，例如：听写, 考前冲刺" />
            </Field>
            <Field label="指定已有笔记 ID">
                <input value={cfg.noteId || ''} onChange={(e) => onConfigChange('noteId', e.target.value)} className={inputClass} placeholder="可选：粘贴已有笔记 noteId" />
            </Field>
            <Field label="手动输入">
                <textarea value={cfg.manualInput || ''} onChange={(e) => onConfigChange('manualInput', e.target.value)} rows={5} className={inputClass} placeholder="可直接粘贴笔记、课堂摘录、阅读生词或写作素材。" />
            </Field>
            <Field label="每类最多生成">
                <div className="grid grid-cols-2 gap-2">
                    <div><span className="mb-1 block text-[11px] font-bold text-phy-muted">闪卡</span>{limitInput('flashcards')}</div>
                    <div><span className="mb-1 block text-[11px] font-bold text-phy-muted">翻译句</span>{limitInput('translationExamples')}</div>
                    <div><span className="mb-1 block text-[11px] font-bold text-phy-muted">写作素材</span>{limitInput('writingMaterials')}</div>
                    <div><span className="mb-1 block text-[11px] font-bold text-phy-muted">任务</span>{limitInput('tasks')}</div>
                </div>
            </Field>
            <div className="rounded-2xl border border-indigo-300/20 bg-indigo-400/10 p-3 space-y-3">
                <Field label="AI 增强">{checkbox('useAI', '启用 AI 提升提取质量')}</Field>
                {cfg.useAI && <>
                    <Field label="AI 人设">{select('aiPersona', ['严谨助教', '考试教练', '双语编辑', '记忆规划师'])}</Field>
                    <Field label="AI 提示词">
                        <textarea value={cfg.aiPrompt || ''} onChange={(e) => onConfigChange('aiPrompt', e.target.value)} rows={5} className={inputClass} />
                    </Field>
                </>}
            </div>
        </>;
    }
    if (node.type === 'agent_tool') {
        const currentTool = cfg.toolName || agentToolOptions[0]?.toolName || learningFlowToolPresets[0].toolName;
        const handleToolChange = (toolName) => {
            const option = agentToolOptionByName.get(toolName) || agentToolOptions[0] || learningFlowToolPresets[0];
            onConfigChange('toolName', option.toolName);
            onConfigChange('targetView', option.targetView || 'plan');
            onConfigChange('paramsJson', formatToolParams(option.params || {}));
        };
        return <>
            <Field label="Agent tool">
                <select value={currentTool} onChange={(e) => handleToolChange(e.target.value)} className={inputClass}>
                    {agentToolOptions.map((item) => <option key={item.key} value={item.toolName}>{item.title} · {item.toolName}</option>)}
                </select>
            </Field>
            <Field label="参数 JSON">
                <textarea
                    value={cfg.paramsJson || '{}'}
                    onChange={(e) => onConfigChange('paramsJson', e.target.value)}
                    rows={8}
                    spellCheck={false}
                    className={`${inputClass} font-mono text-xs leading-5`}
                />
            </Field>
            <Field label="运行后打开">
                <select value={cfg.targetView || toolPresetByName.get(currentTool)?.targetView || 'plan'} onChange={(e) => onConfigChange('targetView', e.target.value)} className={inputClass}>
                    {['plan', 'flashcards', 'review', 'notes', 'writer', 'translation', 'exam', 'coach', 'knowledge'].map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
            </Field>
        </>;
    }
    if (node.type === 'tool_bundle') {
        const tools = getToolBundleToolsFromConfig(cfg);
        return <>
            <Field label="组合步骤">
                <div className="rounded-2xl border border-teal-300/20 bg-teal-400/10 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="text-xs font-black text-teal-100">{tools.length} 个 tool</span>
                        <span className="text-[10px] font-bold text-phy-muted">顺序执行，不自动重排</span>
                    </div>
                    <div className="space-y-1.5">
                        {tools.length ? tools.map((item, index) => (
                            <div key={`${item.toolName}-${index}`} className="rounded-xl border border-teal-300/15 bg-phy-bg/60 px-2 py-1.5 text-[11px] text-phy-text">
                                <span className="font-black text-teal-100">{index + 1}. </span>
                                {agentToolOptionByName.get(item.toolName)?.title || item.toolName}
                                <span className="ml-1 font-mono text-phy-muted">{item.toolName}</span>
                            </div>
                        )) : (
                            <div className="rounded-xl border border-dashed border-teal-300/20 p-3 text-xs text-phy-muted">暂无工具步骤。可以先在画布添加多个 Agent tool，再点击上方“合成组合节点”。</div>
                        )}
                    </div>
                </div>
            </Field>
            <Field label="工具步骤 JSON">
                <textarea
                    value={cfg.toolsJson || '[]'}
                    onChange={(e) => onConfigChange('toolsJson', e.target.value)}
                    rows={10}
                    spellCheck={false}
                    className={`${inputClass} font-mono text-xs leading-5`}
                    placeholder='[{"toolName":"create_flashcards","defaultParams":{}}]'
                />
            </Field>
            <Field label="运行后打开">
                <select value={cfg.targetView || 'plan'} onChange={(e) => onConfigChange('targetView', e.target.value)} className={inputClass}>
                    {['plan', 'flashcards', 'review', 'notes', 'writer', 'translation', 'exam', 'coach', 'knowledge'].map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
            </Field>
        </>;
    }
    if (node.type === 'ai_brain') return <>
        <Field label="决策目标">{select('objective', ['补弱点', '冲考试', '今日复盘', '自由策略'])}</Field>
        <Field label="分析范围">{select('analysisScope', ['上游节点 + 近 7 天历史', '仅上游节点', '近 7 天历史'])}</Field>
        <Field label="输出方式">{select('outputMode', ['推荐下一步', '生成复盘', '生成学习路线'])}</Field>
        <Field label="配置联动">{checkbox('autoApplySuggestedConfig', '运行后自动应用推荐配置')}</Field>
    </>;
    return <Field label="数量">{number('count')}</Field>;
};

const Field = ({ label, children }) => (
    <label className="block space-y-1.5">
        <span className="text-xs font-black text-phy-muted">{label}</span>
        {children}
    </label>
);

const PracticePreviewSection = ({ title, items = [], renderItem }) => {
    if (!items.length) return null;
    return (
        <div className="rounded-2xl border border-indigo-300/15 bg-phy-bg/60 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-black text-indigo-100">{title}</span>
                <span className="rounded-full bg-indigo-400/15 px-2 py-0.5 text-[10px] font-black text-indigo-100">{items.length}</span>
            </div>
            <div className="space-y-2">
                {items.slice(0, 4).map((item, index) => (
                    <div key={`${title}-${index}`} className="rounded-xl border border-indigo-300/10 bg-indigo-400/5 p-2 text-xs text-phy-text">
                        {renderItem(item, index)}
                    </div>
                ))}
                {items.length > 4 && <div className="text-[11px] font-bold text-phy-muted">还有 {items.length - 4} 条会在确认后一起创建。</div>}
            </div>
        </div>
    );
};

const LearningFlowCanvasView = ({ onNavigate }) => {
    const { settings } = useApp();
    const initialCanvasRef = useRef(loadCanvasData());
    const [nodes, setNodes] = useState(initialCanvasRef.current.nodes);
    const [edges, setEdges] = useState(initialCanvasRef.current.edges);
    const [selectedId, setSelectedId] = useState(null);
    const [selectedEdgeId, setSelectedEdgeId] = useState(null);
    const [dragState, setDragState] = useState(null);
    const [panState, setPanState] = useState(null);
    const [connectingEdge, setConnectingEdge] = useState(null);
    const [brainLoadingId, setBrainLoadingId] = useState(null);
    const [brainError, setBrainError] = useState('');
    const [toolRunningId, setToolRunningId] = useState(null);
    const [toolError, setToolError] = useState('');
    const [noteRunningId, setNoteRunningId] = useState(null);
    const [noteError, setNoteError] = useState('');
    const [practiceRunningId, setPracticeRunningId] = useState(null);
    const [practiceCreatingId, setPracticeCreatingId] = useState(null);
    const [practiceError, setPracticeError] = useState('');
    const [zoom, setZoom] = useState(() => clampZoom(localStorage.getItem(ZOOM_KEY) || 1));
    const [showGuidePanel, setShowGuidePanel] = useState(() => localStorage.getItem(GUIDE_KEY) === 'open');
    const [panelState, setPanelState] = useState(loadPanelState);
    const [aiFlowPrompt, setAiFlowPrompt] = useState('今天我阅读了两篇文章，从文章中提取生词和语法，写入笔记和闪卡，生成深度笔记，复习闪卡，再通过深度笔记生成翻译和写作练习。');
    const [aiFlowLoading, setAiFlowLoading] = useState(false);
    const [aiFlowStatus, setAiFlowStatus] = useState('');
    const [workflowName, setWorkflowName] = useState('学习流工具工作流');
    const [workflowDescription, setWorkflowDescription] = useState('从学习流画布保存的 Agent tool 工作流。');
    const [workflowSaveStatus, setWorkflowSaveStatus] = useState('');
    const canvasRef = useRef(null);
    const frameRef = useRef(null);
    const pendingDragPointRef = useRef(null);
    const dragMovedRef = useRef(false);
    const panMovedRef = useRef(false);

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ nodes, edges }));
    }, [nodes, edges]);

    useEffect(() => {
        localStorage.setItem(GUIDE_KEY, showGuidePanel ? 'open' : 'closed');
    }, [showGuidePanel]);

    useEffect(() => {
        localStorage.setItem(ZOOM_KEY, String(zoom));
    }, [zoom]);

    useEffect(() => {
        localStorage.setItem(FLOW_PANELS_KEY, JSON.stringify(panelState));
    }, [panelState]);

    useEffect(() => {
        setToolError('');
        setNoteError('');
        setPracticeError('');
    }, [selectedId]);

    useEffect(() => {
        if (!dragState) return;
        const handleMove = (event) => {
            const rect = canvasRef.current?.getBoundingClientRect();
            if (!rect || !canvasRef.current) return;
            if (Math.abs(event.clientX - dragState.startClientX) > 5 || Math.abs(event.clientY - dragState.startClientY) > 5) {
                dragMovedRef.current = true;
            }
            const nextX = Math.max(24, (event.clientX - rect.left + canvasRef.current.scrollLeft) / zoom - dragState.offsetX);
            const nextY = Math.max(24, (event.clientY - rect.top + canvasRef.current.scrollTop) / zoom - dragState.offsetY);
            pendingDragPointRef.current = { x: nextX, y: nextY };
            if (frameRef.current) return;
            frameRef.current = requestAnimationFrame(() => {
                const point = pendingDragPointRef.current;
                frameRef.current = null;
                if (!point) return;
                setNodes((current) => current.map((node) => node.id === dragState.id ? { ...node, x: point.x, y: point.y } : node));
            });
        };
        const handleUp = () => {
            if (!dragMovedRef.current) {
                setSelectedId(dragState.id);
                setSelectedEdgeId(null);
            }
            setDragState(null);
            dragMovedRef.current = false;
            pendingDragPointRef.current = null;
            if (frameRef.current) cancelAnimationFrame(frameRef.current);
            frameRef.current = null;
        };
        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleUp);
        return () => {
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', handleUp);
            if (frameRef.current) cancelAnimationFrame(frameRef.current);
        };
    }, [dragState, zoom]);

    useEffect(() => {
        if (!panState) return;
        const handleMove = (event) => {
            if (!canvasRef.current) return;
            const dx = event.clientX - panState.startClientX;
            const dy = event.clientY - panState.startClientY;
            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
                panMovedRef.current = true;
            }
            canvasRef.current.scrollLeft = panState.startScrollLeft - dx;
            canvasRef.current.scrollTop = panState.startScrollTop - dy;
        };
        const handleUp = () => {
            if (!panMovedRef.current) {
                setSelectedId(null);
                setSelectedEdgeId(null);
            }
            setPanState(null);
            panMovedRef.current = false;
        };
        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleUp);
        return () => {
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', handleUp);
        };
    }, [panState]);

    const nodeMap = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
    const selectedNode = selectedId ? nodeMap.get(selectedId) : null;
    const togglePanel = (key) => setPanelState((current) => ({ ...current, [key]: !current[key] }));
    const showConfigPanel = Boolean(panelState.showConfigPanel && selectedNode);
    const canvasGridClass = panelState.showNodeLibrary && showConfigPanel
        ? 'xl:grid-cols-[230px_1fr_360px]'
        : panelState.showNodeLibrary
            ? 'xl:grid-cols-[230px_1fr]'
            : showConfigPanel
                ? 'xl:grid-cols-[1fr_360px]'
                : 'xl:grid-cols-[1fr]';
    const selectedBrainInputs = useMemo(() => {
        if (!selectedNode || selectedNode.type !== 'ai_brain') return [];
        return edges
            .filter((edge) => edge.target === selectedNode.id)
            .map((edge) => nodeMap.get(edge.source))
            .filter(Boolean)
            .map((node) => ({
                nodeId: node.id,
                nodeType: node.type,
                title: node.title || getNodeMeta(node.type).label,
                status: node.status || 'pending',
                summary: node.output?.summary || '暂无执行结果',
                metrics: node.output?.metrics || {},
                updatedAt: node.output?.updatedAt || null
            }));
    }, [edges, nodeMap, selectedNode]);
    const selectedNoteInputs = useMemo(() => {
        if (!selectedNode || selectedNode.type !== 'note_composer') return [];
        return edges
            .filter((edge) => edge.target === selectedNode.id)
            .map((edge) => nodeMap.get(edge.source))
            .filter(Boolean)
            .map((node) => ({
                nodeId: node.id,
                title: node.title || getNodeMeta(node.type).label,
                status: node.status || 'pending',
                summary: stringifyNodeOutputForNote(node) || node.output?.summary || node.goal || '暂无输出内容'
            }));
    }, [edges, nodeMap, selectedNode]);
    const selectedPracticeInputs = useMemo(() => {
        if (!selectedNode || selectedNode.type !== 'practice_pack') return [];
        return edges
            .filter((edge) => edge.target === selectedNode.id)
            .map((edge) => nodeMap.get(edge.source))
            .filter(Boolean)
            .map((node) => ({
                nodeId: node.id,
                title: node.title || getNodeMeta(node.type).label,
                status: node.status || 'pending',
                summary: stringifyNodeOutputForNote(node) || node.output?.summary || node.goal || '暂无输出内容'
            }));
    }, [edges, nodeMap, selectedNode]);

    useEffect(() => {
        const handleKeyDown = (event) => {
            if (!selectedEdgeId) return;
            if (event.key !== 'Delete' && event.key !== 'Backspace') return;
            event.preventDefault();
            setEdges((current) => current.filter((edge) => edge.id !== selectedEdgeId));
            setSelectedEdgeId(null);
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedEdgeId]);

    const updateSelectedNode = (patch) => {
        if (!selectedId) return;
        setNodes((current) => current.map((node) => node.id === selectedId ? { ...node, ...patch } : node));
    };

    const updateSelectedConfig = (key, value) => {
        if (!selectedId) return;
        setNodes((current) => current.map((node) => node.id === selectedId ? { ...node, config: { ...(node.config || {}), [key]: value } } : node));
    };

    const applySuggestedConfig = (nodeType, config = {}) => {
        if (!nodeType || !config || typeof config !== 'object') return;
        setNodes((current) => current.map((node) => (
            node.type === nodeType
                ? { ...node, config: { ...(node.config || {}), ...config } }
                : node
        )));
    };

    const runAiBrain = async (brainNode) => {
        if (!brainNode || brainNode.type !== 'ai_brain') return;
        setBrainLoadingId(brainNode.id);
        setBrainError('');
        const upstreamOutputs = edges
            .filter((edge) => edge.target === brainNode.id)
            .map((edge) => nodeMap.get(edge.source))
            .filter(Boolean)
            .map((node) => ({
                nodeId: node.id,
                nodeType: node.type,
                title: node.title || getNodeMeta(node.type).label,
                status: node.status || 'pending',
                goal: node.goal || '',
                config: node.config || {},
                output: node.output || null
            }));

        let recentStudyContext = {};
        let result = null;
        try {
            recentStudyContext = await summarizeRecentStudyContext();
            result = await analyzeLearningFlowBrain({
                node: brainNode,
                upstreamOutputs,
                recentStudyContext,
                canvas: { nodes, edges }
            }, settings);
            result = normalizeBrainResult(result);
        } catch (error) {
            const reason = error?.message || 'AI 分析失败';
            setBrainError(reason);
            recentStudyContext = recentStudyContext?.range ? recentStudyContext : await summarizeRecentStudyContext().catch(() => ({}));
            result = buildLocalBrainResult(brainNode, nodes, upstreamOutputs, recentStudyContext, reason);
        }

        const nextOutput = {
            updatedAt: Date.now(),
            summary: result.summary,
            metrics: {
                status: 'done',
                nodeType: 'ai_brain',
                upstreamCount: upstreamOutputs.length,
                source: result.source
            },
            brainResult: result,
            upstreamSnapshot: upstreamOutputs,
            recentStudyContext
        };

        setNodes((current) => current.map((node) => (
            node.id === brainNode.id
                ? { ...node, status: 'done', output: nextOutput }
                : node
        )));
        setBrainLoadingId(null);

        if (brainNode.config?.autoApplySuggestedConfig && result.recommendedNodeType && result.suggestedConfig) {
            applySuggestedConfig(result.recommendedNodeType, result.suggestedConfig);
        }
    };

    const runAgentToolNode = async (toolNode) => {
        if (!toolNode || toolNode.type !== 'agent_tool') return;
        const toolName = toolNode.config?.toolName || 'review_flashcards';
        setToolRunningId(toolNode.id);
        setToolError('');

        try {
            const params = parseToolParams(toolNode.config?.paramsJson);
            const result = await executeAgentTool(toolName, params, { settings });
            const hasError = Boolean(result?.error);
            const nextOutput = {
                updatedAt: Date.now(),
                summary: summarizeToolResult(toolName, result),
                metrics: {
                    status: hasError ? 'error' : 'done',
                    nodeType: 'agent_tool',
                    toolName,
                    action: result?._action || null,
                    navigateTo: result?._navigateTo || toolNode.config?.targetView || null
                },
                toolResult: result
            };

            setNodes((current) => current.map((node) => (
                node.id === toolNode.id
                    ? { ...node, status: hasError ? 'error' : 'done', output: nextOutput }
                    : node
            )));
            if (hasError) setToolError(String(result.error));
        } catch (error) {
            const message = error instanceof SyntaxError
                ? '参数 JSON 格式不正确，请检查逗号、引号和括号。'
                : (error?.message || '工具执行失败');
            setToolError(message);
            setNodes((current) => current.map((node) => (
                node.id === toolNode.id
                    ? {
                        ...node,
                        status: 'error',
                        output: {
                            updatedAt: Date.now(),
                            summary: `工具 ${toolName} 执行失败：${message}`,
                            metrics: { status: 'error', nodeType: 'agent_tool', toolName },
                            toolResult: { error: message }
                        }
                    }
                    : node
            )));
        } finally {
            setToolRunningId(null);
        }
    };

    const runToolBundleNode = async (bundleNode) => {
        if (!bundleNode || bundleNode.type !== 'tool_bundle') return;
        const tools = getToolBundleToolsFromConfig(bundleNode.config);
        setToolRunningId(bundleNode.id);
        setToolError('');

        if (!tools.length) {
            const message = '组合节点里还没有可执行的 tool。';
            setToolError(message);
            setNodes((current) => current.map((node) => (
                node.id === bundleNode.id
                    ? {
                        ...node,
                        status: 'error',
                        output: {
                            updatedAt: Date.now(),
                            summary: message,
                            metrics: { status: 'error', nodeType: 'tool_bundle', stepCount: 0 },
                            toolResults: []
                        }
                    }
                    : node
            )));
            setToolRunningId(null);
            return;
        }

        const results = [];
        try {
            for (let index = 0; index < tools.length; index += 1) {
                const step = tools[index];
                const result = await executeAgentTool(step.toolName, step.defaultParams || {}, { settings });
                const hasError = Boolean(result?.error);
                results.push({
                    index: index + 1,
                    toolName: step.toolName,
                    defaultParams: step.defaultParams || {},
                    status: hasError ? 'error' : 'done',
                    summary: summarizeToolResult(step.toolName, result),
                    result
                });
                if (hasError) throw new Error(String(result.error));
            }

            const nextOutput = {
                updatedAt: Date.now(),
                summary: `组合工具已按顺序执行 ${results.length}/${tools.length} 步。`,
                metrics: {
                    status: 'done',
                    nodeType: 'tool_bundle',
                    stepCount: tools.length,
                    completedCount: results.length,
                    navigateTo: bundleNode.config?.targetView || 'plan'
                },
                toolResults: results
            };

            setNodes((current) => current.map((node) => (
                node.id === bundleNode.id
                    ? { ...node, status: 'done', output: nextOutput }
                    : node
            )));
        } catch (error) {
            const message = error?.message || '组合工具执行失败';
            setToolError(message);
            setNodes((current) => current.map((node) => (
                node.id === bundleNode.id
                    ? {
                        ...node,
                        status: 'error',
                        output: {
                            updatedAt: Date.now(),
                            summary: `组合工具执行到第 ${results.length} 步时停止：${message}`,
                            metrics: {
                                status: 'error',
                                nodeType: 'tool_bundle',
                                stepCount: tools.length,
                                completedCount: Math.max(0, results.filter((item) => item.status === 'done').length)
                            },
                            toolResults: results
                        }
                    }
                    : node
            )));
        } finally {
            setToolRunningId(null);
        }
    };

    const runNoteComposerNode = async (noteNode) => {
        if (!noteNode || noteNode.type !== 'note_composer') return;
        setNoteRunningId(noteNode.id);
        setNoteError('');

        try {
            const upstreamNodes = edges
                .filter((edge) => edge.target === noteNode.id)
                .map((edge) => nodeMap.get(edge.source))
                .filter(Boolean);
            const sourceText = buildNoteComposerSourceText(noteNode, upstreamNodes);
            if (!sourceText.trim()) {
                throw new Error('没有可整理的输入。请连接上游节点，或在“手动输入”里填写内容。');
            }

            const title = replaceNoteTemplateTokens(noteNode.config?.titleTemplate);
            const tags = buildNoteComposerTags(noteNode.config);
            const content = noteNode.config?.useAI
                ? await polishLearningNoteWithAI({ node: noteNode, title, sourceText, tags }, settings)
                : buildDirectLearningNoteMarkdown({
                    title,
                    sourceText,
                    tags,
                    upstreamNodes,
                    includeSourceDetails: noteNode.config?.includeSourceDetails !== false
                });
            const now = Date.now();
            const note = {
                id: `flow_note_${now}_${Math.random().toString(36).slice(2, 8)}`,
                title,
                content: String(content || '').trim(),
                tags,
                folder: tags[0] || getTodayNotesFolderName(getLocalDateLabel()),
                date: new Date(now).toISOString(),
                createdAt: now,
                updatedAt: now,
                source: 'learning_flow',
                sourceNodeId: noteNode.id
            };
            if (!note.content) throw new Error('生成的笔记内容为空。');
            await saveNote(note);
            const savedNotes = await getNotes().catch(() => []);
            const verified = savedNotes.find((item) => String(item.id) === String(note.id));
            if (!verified) throw new Error('笔记保存后未能完成校验。');

            const nextOutput = {
                updatedAt: Date.now(),
                summary: `已生成笔记《${note.title}》，包含 ${note.tags.length} 个标签。`,
                metrics: {
                    status: 'done',
                    nodeType: 'note_composer',
                    noteId: note.id,
                    title: note.title,
                    tags: note.tags,
                    usedAI: !!noteNode.config?.useAI,
                    inputCount: upstreamNodes.length + (noteNode.config?.manualInput?.trim() ? 1 : 0)
                },
                note
            };
            setNodes((current) => current.map((node) => (
                node.id === noteNode.id
                    ? { ...node, status: 'done', output: nextOutput }
                    : node
            )));
        } catch (error) {
            const message = error?.message || '生成笔记失败';
            setNoteError(message);
            setNodes((current) => current.map((node) => (
                node.id === noteNode.id
                    ? {
                        ...node,
                        status: 'error',
                        output: {
                            updatedAt: Date.now(),
                            summary: `整理学习笔记失败：${message}`,
                            metrics: { status: 'error', nodeType: 'note_composer' }
                        }
                    }
                    : node
            )));
        } finally {
            setNoteRunningId(null);
        }
    };

    const runPracticePackPreview = async (packNode) => {
        if (!packNode || packNode.type !== 'practice_pack') return;
        setPracticeRunningId(packNode.id);
        setPracticeError('');

        try {
            const upstreamNodes = edges
                .filter((edge) => edge.target === packNode.id)
                .map((edge) => nodeMap.get(edge.source))
                .filter(Boolean);
            const sourceText = await buildPracticePackSourceText(packNode, upstreamNodes);
            if (!sourceText.trim()) {
                throw new Error('没有可生成练习包的输入。请连接上游节点、填写手动输入，或指定已有笔记 ID。');
            }

            const tags = buildPracticePackTags(packNode.config);
            const rulePreview = parsePracticePackByRules(sourceText, packNode.config);
            let preview = rulePreview;
            let aiWarning = '';
            if (packNode.config?.useAI) {
                try {
                    preview = await generatePracticePackPreviewWithAI({ node: packNode, sourceText, rulePreview, tags }, settings);
                } catch (error) {
                    aiWarning = error?.message || 'AI 增强失败，已保留规则解析结果。';
                    setPracticeError(`AI 增强失败，已保留规则解析结果：${aiWarning}`);
                }
            }

            const itemCount = countPracticePreviewItems(preview);
            const nextOutput = {
                updatedAt: Date.now(),
                summary: itemCount
                    ? `已生成练习包预览：闪卡 ${preview.flashcards.length}、翻译句 ${preview.translationExamples.length}、写作素材 ${preview.writingMaterials.length}、任务 ${preview.tasks.length}。`
                    : '已完成解析，但暂未提取到可创建的练习资产。',
                metrics: {
                    status: 'preview',
                    nodeType: 'practice_pack',
                    itemCount,
                    usedAI: !!packNode.config?.useAI && !aiWarning,
                    aiWarning,
                    inputCount: upstreamNodes.length + (packNode.config?.manualInput?.trim() ? 1 : 0) + (packNode.config?.noteId?.trim() ? 1 : 0)
                },
                preview,
                tags,
                sourceSnapshot: {
                    length: sourceText.length,
                    upstreamNodeIds: upstreamNodes.map((node) => node.id),
                    noteId: packNode.config?.noteId || '',
                    manualInputLength: String(packNode.config?.manualInput || '').trim().length
                }
            };
            setNodes((current) => current.map((node) => (
                node.id === packNode.id
                    ? { ...node, status: itemCount ? 'pending' : 'error', output: nextOutput }
                    : node
            )));
            if (!itemCount) setPracticeError('预览为空：请补充更具体的词条、例句、标题列表，或打开 AI 增强。');
        } catch (error) {
            const message = error?.message || '生成练习包预览失败';
            setPracticeError(message);
            setNodes((current) => current.map((node) => (
                node.id === packNode.id
                    ? {
                        ...node,
                        status: 'error',
                        output: {
                            updatedAt: Date.now(),
                            summary: `笔记转练习包失败：${message}`,
                            metrics: { status: 'error', nodeType: 'practice_pack' }
                        }
                    }
                    : node
            )));
        } finally {
            setPracticeRunningId(null);
        }
    };

    const confirmPracticePackCreate = async (packNode) => {
        if (!packNode || packNode.type !== 'practice_pack') return;
        const preview = packNode.output?.preview;
        const itemCount = countPracticePreviewItems(preview);
        if (!itemCount) {
            setPracticeError('当前没有可创建的预览内容，请先生成练习包预览。');
            return;
        }
        if (packNode.output?.created?.confirmed) {
            setPracticeError('这一批预览已经创建过了，避免重复落库。需要新内容时请重新生成预览。');
            return;
        }

        setPracticeCreatingId(packNode.id);
        setPracticeError('');
        try {
            const now = Date.now();
            const makeId = (prefix, index) => {
                if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
                return `${prefix}_${now}_${index}_${Math.random().toString(36).slice(2, 8)}`;
            };
            const tags = uniqueStrings([...(packNode.output?.tags || buildPracticePackTags(packNode.config)), 'learning-flow']);
            const created = { cardIds: [], materialIds: [], taskIds: [] };

            for (const [index, card] of (preview.flashcards || []).entries()) {
                const id = makeId('flow_card', index);
                await saveFlashcard({
                    id,
                    front: card.front,
                    back: card.back,
                    folderId: '',
                    tags,
                    source: 'learning_flow',
                    sourceNodeId: packNode.id,
                    createdAt: now + index,
                    nextReview: now,
                    interval: 1,
                    repetitions: 0,
                    reviews: 0,
                    easeFactor: 2.5,
                    weaknessScore: 0
                });
                created.cardIds.push(id);
            }

            for (const [index, item] of (preview.writingMaterials || []).entries()) {
                const id = makeId('flow_material', index);
                await saveWritingMaterial({
                    id,
                    title: item.title || '学习流写作素材',
                    content: item.content,
                    rewrite: '',
                    usage: '来自学习流练习包',
                    caution: '',
                    category: item.category || 'expression',
                    topic: item.topic || packNode.title || 'learning-flow',
                    examType: settings?.writingLevel || 'CET-6',
                    tags: uniqueStrings([...tags, ...(item.tags || [])]),
                    source: 'learning_flow',
                    sourceNodeId: packNode.id,
                    createdAt: now + index
                });
                created.materialIds.push(id);
            }

            for (const [index, item] of (preview.translationExamples || []).entries()) {
                const id = makeId('flow_translation_material', index);
                await saveWritingMaterial({
                    id,
                    title: item.targetWord ? `翻译例句：${item.targetWord}` : `翻译例句 ${index + 1}`,
                    content: [item.chinese, item.answer ? `参考表达：${item.answer}` : '', item.hint ? `提示：${item.hint}` : ''].filter(Boolean).join('\n'),
                    rewrite: item.answer || '',
                    usage: item.hint || '来自学习流练习包',
                    caution: '',
                    category: 'translation',
                    topic: item.targetWord || packNode.title || 'learning-flow',
                    examType: settings?.writingLevel || 'CET-6',
                    tags: uniqueStrings([...tags, '翻译例句']),
                    source: 'learning_flow',
                    sourceNodeId: packNode.id,
                    createdAt: now + index + 100
                });
                created.materialIds.push(id);
            }

            for (const [index, task] of (preview.tasks || []).entries()) {
                const id = makeId('flow_task', index);
                await saveTask({
                    id,
                    text: task.title,
                    title: task.title,
                    type: task.type || 'learning_flow',
                    completed: false,
                    tags,
                    source: 'learning_flow',
                    sourceNodeId: packNode.id,
                    createdAt: now + index
                });
                created.taskIds.push(id);
            }

            setNodes((current) => current.map((node) => (
                node.id === packNode.id
                    ? {
                        ...node,
                        status: 'done',
                        output: {
                            ...node.output,
                            updatedAt: Date.now(),
                            summary: `已创建练习包：闪卡 ${created.cardIds.length}、素材 ${created.materialIds.length}、任务 ${created.taskIds.length}。`,
                            metrics: {
                                ...(node.output?.metrics || {}),
                                status: 'done',
                                nodeType: 'practice_pack',
                                itemCount,
                                createdAt: Date.now()
                            },
                            created: { ...created, confirmed: true }
                        }
                    }
                    : node
            )));
        } catch (error) {
            const message = error?.message || '确认创建练习包失败';
            setPracticeError(message);
        } finally {
            setPracticeCreatingId(null);
        }
    };

    const getCanvasPoint = (event) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect || !canvasRef.current) return { x: 0, y: 0 };
        return {
            x: (event.clientX - rect.left + canvasRef.current.scrollLeft) / zoom,
            y: (event.clientY - rect.top + canvasRef.current.scrollTop) / zoom
        };
    };

    const buildCurvePath = (sourceNode, targetNode) => {
        const startX = sourceNode.x + 260;
        const startY = sourceNode.y + 68;
        const endX = targetNode.x;
        const endY = targetNode.y + 68;
        const gap = Math.max(110, Math.abs(endX - startX) * 0.42);
        return `M ${startX} ${startY} C ${startX + gap} ${startY}, ${endX - gap} ${endY}, ${endX} ${endY}`;
    };

    const buildPreviewPath = () => {
        if (!connectingEdge) return '';
        const gap = Math.max(110, Math.abs(connectingEdge.x - connectingEdge.startX) * 0.42);
        return `M ${connectingEdge.startX} ${connectingEdge.startY} C ${connectingEdge.startX + gap} ${connectingEdge.startY}, ${connectingEdge.x - gap} ${connectingEdge.y}, ${connectingEdge.x} ${connectingEdge.y}`;
    };

    const startCanvasPan = (event) => {
        if (event.button !== 0 || connectingEdge || dragState) return;
        const target = event.target;
        if (target?.closest?.('[data-flow-node="true"], [data-flow-port="true"], [data-flow-edge="true"], [data-flow-control="true"], button, input, textarea, select')) {
            return;
        }
        if (!canvasRef.current) return;
        event.preventDefault();
        panMovedRef.current = false;
        setSelectedId(null);
        setSelectedEdgeId(null);
        setPanState({
            startClientX: event.clientX,
            startClientY: event.clientY,
            startScrollLeft: canvasRef.current.scrollLeft,
            startScrollTop: canvasRef.current.scrollTop
        });
    };

    const updateZoom = (nextZoom) => {
        const next = clampZoom(nextZoom);
        const canvas = canvasRef.current;
        if (!canvas) {
            setZoom(next);
            return;
        }
        const centerX = (canvas.scrollLeft + canvas.clientWidth / 2) / zoom;
        const centerY = (canvas.scrollTop + canvas.clientHeight / 2) / zoom;
        setZoom(next);
        requestAnimationFrame(() => {
            if (!canvasRef.current) return;
            canvasRef.current.scrollLeft = Math.max(0, centerX * next - canvasRef.current.clientWidth / 2);
            canvasRef.current.scrollTop = Math.max(0, centerY * next - canvasRef.current.clientHeight / 2);
        });
    };

    const handleCanvasWheel = (event) => {
        if (!event.ctrlKey && !event.metaKey) return;
        event.preventDefault();
        updateZoom(zoom + (event.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP));
    };

    const addNode = (type) => {
        const index = nodes.length;
        const defaults = getNodeDefaults(type);
        const node = normalizeNode({ id: `node_${type}_${Date.now()}`, type, x: 120 + (index % 4) * 310, y: 130 + Math.floor(index / 4) * 200, status: 'pending', ...defaults });
        setNodes((current) => [...current, node]);
        setSelectedId(node.id);
        setSelectedEdgeId(null);
    };

    const addToolNode = (preset) => {
        const index = nodes.length;
        const node = normalizeNode({
            id: `node_tool_${preset.key}_${Date.now()}`,
            type: 'agent_tool',
            x: 120 + (index % 4) * 310,
            y: 130 + Math.floor(index / 4) * 200,
            status: 'pending',
            title: preset.title,
            goal: preset.goal,
            estimatedMinutes: 3,
            completionRule: '工具返回成功结果',
            config: {
                toolName: preset.toolName,
                paramsJson: formatToolParams(preset.params || {}),
                targetView: preset.targetView || 'plan'
            }
        });
        setNodes((current) => [...current, node]);
        setSelectedId(node.id);
        setSelectedEdgeId(null);
    };

    const addAgentToolNode = (toolOption) => {
        const option = toolOption || agentToolOptions[0];
        if (!option) return;
        addToolNode({
            key: option.key || option.toolName,
            title: option.title || option.toolName,
            goal: option.goal || 'Agent tool',
            toolName: option.toolName,
            targetView: option.targetView || 'plan',
            params: option.params || {}
        });
    };

    const applyFlowPlanToCanvas = (plan) => {
        const normalized = normalizeFlowPlan(plan, aiFlowPrompt);
        const createdNodes = normalized.steps.map((step, index) => normalizeNode({
            id: `node_ai_flow_${step.toolName}_${Date.now()}_${index}`,
            type: 'agent_tool',
            x: 100 + index * 300,
            y: 170 + (index % 2) * 120,
            status: 'pending',
            title: step.title,
            goal: step.goal || agentToolOptionByName.get(step.toolName)?.goal || '',
            estimatedMinutes: 3,
            completionRule: '工具返回成功结果',
            config: {
                toolName: step.toolName,
                paramsJson: formatToolParams(step.defaultParams || {}),
                targetView: step.targetView || inferTargetViewForTool(step.toolName)
            }
        }));
        const createdEdges = createdNodes.slice(1).map((node, index) => ({
            id: `edge_ai_flow_${createdNodes[index].id}_${node.id}`,
            source: createdNodes[index].id,
            target: node.id,
            sourceHandle: 'out',
            targetHandle: 'in'
        }));
        setNodes(createdNodes);
        setEdges(createdEdges);
        setSelectedId(createdNodes[0]?.id || null);
        setSelectedEdgeId(null);
        setWorkflowName(normalized.name);
        setWorkflowDescription(normalized.description);
        setAiFlowStatus(`已生成学习流：${normalized.name}（${createdNodes.length} 个工具节点）。`);
        requestAnimationFrame(() => {
            if (!canvasRef.current) return;
            canvasRef.current.scrollLeft = 0;
            canvasRef.current.scrollTop = 0;
        });
    };

    const generateFlowWithAI = async () => {
        const requirement = aiFlowPrompt.trim();
        if (!requirement) {
            setAiFlowStatus('请先写出你希望学习流完成什么。');
            return;
        }
        setAiFlowLoading(true);
        setAiFlowStatus('');
        const toolCatalog = agentToolOptions.map((tool) => ({
            toolName: tool.toolName,
            title: tool.title,
            description: tool.goal,
            targetView: tool.targetView
        }));
        try {
            let plan = null;
            if (settings?.apiKey) {
                const prompt = `你是 VerbaPath 的学习流设计师。请根据用户需求，从可用 agent tools 中选择工具并按顺序构建一线式学习流。

规则：
1. 只能使用工具清单里的 toolName，不要虚构工具。
2. 顺序必须体现真实学习动作：读取/提取 -> 创建/同步 -> 复习/练习 -> 复盘。
3. 每一步给出 title、goal、toolName、defaultParams、targetView。
4. defaultParams 只填安全默认值，不要做删除类动作。
5. 避免选择 delete、batch_delete 等高风险工具。
6. 返回严格 JSON，不要 Markdown。

JSON schema:
{
  "name": "学习流名称",
  "description": "一句话说明",
  "steps": [
    { "toolName": "", "title": "", "goal": "", "targetView": "plan", "defaultParams": {} }
  ]
}

用户需求：
${requirement}

可用工具：
${JSON.stringify(toolCatalog, null, 2)}`;
                const result = await sendChat([
                    { role: 'system', content: 'Return valid JSON only. You design safe, practical learning workflows.' },
                    { role: 'user', content: prompt }
                ], settings, true);
                plan = parseJsonObjectFromText(result);
                if (!plan) throw new Error('AI 没有返回有效 JSON');
            } else {
                plan = buildFallbackFlowPlan(requirement);
                setAiFlowStatus('未配置 AI API Key，已使用本地规则生成基础学习流。');
            }
            applyFlowPlanToCanvas(plan || buildFallbackFlowPlan(requirement));
        } catch (error) {
            applyFlowPlanToCanvas(buildFallbackFlowPlan(requirement));
            setAiFlowStatus(`AI 生成失败，已使用本地模板兜底：${error?.message || error}`);
        } finally {
            setAiFlowLoading(false);
        }
    };

    const updateNodeStatus = (id) => {
        setNodes((current) => current.map((node) => {
            if (node.id !== id) return node;
            const nextStatus = node.status === 'done' ? 'pending' : 'done';
            return { ...node, status: nextStatus, output: buildNodeOutput(node, nextStatus) };
        }));
    };

    const deleteNode = (id) => {
        setNodes((current) => current.filter((node) => node.id !== id));
        setEdges((current) => current.filter((edge) => edge.source !== id && edge.target !== id));
        if (selectedId === id) setSelectedId(null);
    };

    const resetCanvas = () => {
        if (!confirm('确定恢复默认学习流画布吗？')) return;
        const freshNodes = initialNodes.map(normalizeNode);
        setNodes(freshNodes);
        setEdges(createDefaultEdges(freshNodes));
        setSelectedId(null);
        setSelectedEdgeId(null);
    };

    const openNode = (nodeOrType) => {
        const type = typeof nodeOrType === 'string' ? nodeOrType : nodeOrType?.type;
        const target = typeof nodeOrType === 'object' && (nodeOrType?.type === 'agent_tool' || nodeOrType?.type === 'tool_bundle')
            ? (nodeOrType.output?.toolResult?._navigateTo || nodeOrType.config?.targetView || 'plan')
            : (getNodeMeta(type).targetView || type);
        onNavigate?.(target);
    };

    const orderedWorkflowToolNodes = getWorkflowNodes(nodes, edges);
    const saveCanvasAsAgentWorkflow = () => {
        setWorkflowSaveStatus('');
        if (!orderedWorkflowToolNodes.length) {
            setWorkflowSaveStatus('请先在画布中添加至少一个 Agent 工具节点。');
            return;
        }
        try {
            const flow = buildAgentToolFlowFromCanvas({
                nodes,
                edges,
                name: workflowName,
                description: workflowDescription
            });
            if (!flow.tools.length) {
                setWorkflowSaveStatus('没有可保存的工具步骤，请检查 Agent 工具节点配置。');
                return;
            }
            const existing = loadSavedAgentToolFlows();
            saveAgentToolFlows([flow, ...existing]);
            setWorkflowSaveStatus(`已保存到 AI 聊天栏 / 工作流：${flow.name}（${flow.tools.length} 步）。`);
        } catch (error) {
            setWorkflowSaveStatus(`保存失败：${error?.message || error}`);
        }
    };

    const createToolBundleFromCanvas = () => {
        setWorkflowSaveStatus('');
        const orderedSingleToolNodes = getOrderedAgentToolNodes(nodes, edges);
        if (!orderedSingleToolNodes.length) {
            setWorkflowSaveStatus('请先添加并连接至少一个单独的 Agent 工具节点，再合成组合节点。');
            return;
        }
        try {
            const tools = orderedSingleToolNodes.map((node) => ({
                toolName: node.config?.toolName || 'review_flashcards',
                defaultParams: parseToolParams(node.config?.paramsJson || '{}')
            })).filter((item) => item.toolName);
            const index = nodes.length;
            const node = normalizeNode({
                id: `node_tool_bundle_${Date.now()}`,
                type: 'tool_bundle',
                x: 120 + (index % 4) * 310,
                y: 130 + Math.floor(index / 4) * 200,
                status: 'pending',
                title: workflowName || '自定义工具组合',
                goal: workflowDescription || '把画布上的多个 Agent tool 合成一个节点执行。',
                estimatedMinutes: Math.max(3, tools.length * 3),
                completionRule: '按固定顺序执行组合里的全部工具',
                config: {
                    tools,
                    toolsJson: formatToolBundleTools(tools),
                    targetView: 'plan'
                }
            });
            setNodes((current) => [...current, node]);
            setSelectedId(node.id);
            setSelectedEdgeId(null);
            setWorkflowSaveStatus(`已生成组合节点：${node.title}（${tools.length} 步）。原来的 tool 节点已保留。`);
        } catch (error) {
            setWorkflowSaveStatus(`合成失败：${error?.message || error}`);
        }
    };

    const completed = nodes.filter((node) => node.status === 'done').length;

    const startConnection = (event, node) => {
        event.stopPropagation();
        event.preventDefault();
        setSelectedId(node.id);
        setSelectedEdgeId(null);
        setConnectingEdge({ source: node.id, startX: node.x + 260, startY: node.y + 68, x: node.x + 320, y: node.y + 68 });
    };

    const finishConnection = (event, targetId) => {
        event.stopPropagation();
        if (!connectingEdge) return;
        if (connectingEdge.source === targetId) {
            setConnectingEdge(null);
            return;
        }
        const edgeId = `edge_${connectingEdge.source}_${targetId}_${Date.now()}`;
        let selectedIdAfterSave = edgeId;
        setEdges((current) => {
            const existing = current.find((edge) => edge.source === connectingEdge.source && edge.target === targetId);
            if (existing) {
                selectedIdAfterSave = existing.id;
                return current;
            }
            return [...current, { id: edgeId, source: connectingEdge.source, target: targetId, sourceHandle: 'out', targetHandle: 'in' }];
        });
        setConnectingEdge(null);
        setSelectedEdgeId(selectedIdAfterSave);
    };

    return (
        <div className="h-full min-h-[calc(100vh-7rem)] flex flex-col gap-3 p-3 md:p-4 animate-fade-in">
            <div className="rounded-2xl border border-phy-border bg-phy-glass/80 px-4 py-3 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <Route size={17} className="text-phy-accent" />
                            <h2 className="text-lg md:text-xl font-black text-phy-text">一线学习流画布</h2>
                            <span className="hidden md:inline-flex rounded-full border border-phy-border bg-phy-bg px-2 py-0.5 text-[11px] font-bold text-phy-muted">n8n 风格节点编排</span>
                        </div>
                        <p className="text-xs text-phy-muted mt-1">拖动节点规划路线，从输出端口连到输入端口；点击节点在右侧编辑设置。</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="px-3 py-2 rounded-xl border border-phy-border bg-phy-bg text-xs md:text-sm font-bold text-phy-text">进度 {completed}/{nodes.length}</div>
                        <button onClick={() => setShowGuidePanel((value) => !value)} className="px-3 py-2 rounded-xl border border-phy-border text-xs md:text-sm font-bold text-phy-muted hover:text-phy-text hover:bg-phy-glassHover transition-colors">
                            {showGuidePanel ? '收起说明' : '显示说明'}
                        </button>
                        <button onClick={() => togglePanel('showAiBuilder')} className={`px-3 py-2 rounded-xl border text-xs md:text-sm font-bold transition-colors ${panelState.showAiBuilder ? 'border-cyan-300/40 bg-cyan-400/10 text-cyan-100' : 'border-phy-border text-phy-muted hover:text-phy-text hover:bg-phy-glassHover'}`}>
                            AI 搭建
                        </button>
                        <button onClick={() => togglePanel('showNodeLibrary')} className={`px-3 py-2 rounded-xl border text-xs md:text-sm font-bold transition-colors ${panelState.showNodeLibrary ? 'border-phy-accent/40 bg-phy-accent/10 text-phy-text' : 'border-phy-border text-phy-muted hover:text-phy-text hover:bg-phy-glassHover'}`}>
                            节点库
                        </button>
                        <button onClick={() => togglePanel('showConfigPanel')} className={`px-3 py-2 rounded-xl border text-xs md:text-sm font-bold transition-colors ${panelState.showConfigPanel ? 'border-phy-accent/40 bg-phy-accent/10 text-phy-text' : 'border-phy-border text-phy-muted hover:text-phy-text hover:bg-phy-glassHover'}`}>
                            设置栏
                        </button>
                        <button onClick={() => togglePanel('showWorkflowPanel')} className={`px-3 py-2 rounded-xl border text-xs md:text-sm font-bold transition-colors ${panelState.showWorkflowPanel ? 'border-lime-300/40 bg-lime-400/10 text-lime-100' : 'border-phy-border text-phy-muted hover:text-phy-text hover:bg-phy-glassHover'}`}>
                            工作流
                        </button>
                        <button onClick={resetCanvas} className="px-3 py-2 rounded-xl border border-phy-border text-xs md:text-sm font-bold text-phy-muted hover:text-phy-text hover:bg-phy-glassHover transition-colors flex items-center gap-2">
                            <RotateCcw size={15} /> 重置
                        </button>
                    </div>
                </div>
                {showGuidePanel && (
                    <div className="mt-3 rounded-2xl border border-phy-border bg-phy-bg/60 p-3 text-xs text-phy-muted leading-relaxed">
                        V1 支持添加节点、拖动节点、端口连线、节点设置、AI 大脑路由建议和模块跳转。后续可以继续加入条件分支、JSON 导入导出和 AI 自动生成流程。
                    </div>
                )}
                {panelState.showAiBuilder && (
                    <div className="mt-3 rounded-2xl border border-cyan-300/25 bg-cyan-500/10 p-3">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
                            <div className="min-w-0 flex-1">
                                <div className="mb-2 flex items-center gap-2">
                                    <Bot size={16} className="text-cyan-200" />
                                    <div>
                                        <div className="text-sm font-black text-phy-text">AI 自主搭建学习流</div>
                                        <div className="text-xs text-phy-muted">写下目标，AI 会选择真实 agent tools 并生成可编辑的节点链。</div>
                                    </div>
                                </div>
                                <textarea
                                    value={aiFlowPrompt}
                                    onChange={(event) => setAiFlowPrompt(event.target.value)}
                                    rows={3}
                                    className="w-full rounded-xl border border-cyan-300/20 bg-phy-bg px-3 py-2 text-sm text-phy-text outline-none focus:border-cyan-300/70"
                                    placeholder="例如：今天我阅读了两篇文章，提取生词和语法，生成笔记/闪卡/深度笔记，再做翻译和写作练习"
                                />
                            </div>
                            <button
                                onClick={generateFlowWithAI}
                                disabled={aiFlowLoading}
                                className="rounded-xl bg-cyan-400 px-4 py-2 text-sm font-black text-cyan-950 shadow-lg shadow-cyan-500/10 hover:brightness-105 disabled:opacity-60"
                            >
                                {aiFlowLoading ? '正在搭建...' : '生成学习流'}
                            </button>
                        </div>
                        {aiFlowStatus && (
                            <div className="mt-2 rounded-xl border border-cyan-300/20 bg-phy-bg/60 px-3 py-2 text-xs font-bold text-cyan-100">
                                {aiFlowStatus}
                            </div>
                        )}
                    </div>
                )}
                {panelState.showWorkflowPanel && <div className="mt-3 rounded-2xl border border-lime-300/25 bg-lime-500/10 p-3">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
                        <div className="min-w-0 flex-1">
                            <div className="mb-2 flex items-center justify-between gap-2">
                                <div>
                                    <div className="text-sm font-black text-phy-text">保存为 AI 聊天工作流</div>
                                    <div className="text-xs text-phy-muted">连接多个 Agent 工具节点后保存，AI 聊天栏输入 / 就能调用这条固定工具顺序。</div>
                                </div>
                                <span className="rounded-full bg-lime-400/15 px-2 py-1 text-xs font-black text-lime-100">{orderedWorkflowToolNodes.reduce((sum, node) => sum + getWorkflowNodeStepCount(node), 0)} 步</span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                {orderedWorkflowToolNodes.length ? orderedWorkflowToolNodes.map((node, index) => (
                                    <span key={node.id} className="rounded-full border border-lime-300/20 bg-phy-bg/70 px-2 py-1 text-[11px] font-bold text-phy-text">
                                        {index + 1}. {node.title || node.config?.toolName}{node.type === 'tool_bundle' ? `（${getToolBundleToolsFromConfig(node.config).length} 步）` : ''}
                                    </span>
                                )) : (
                                    <span className="text-xs text-phy-muted">暂无 Agent 工具节点。先从左侧添加 tool 节点并连线。</span>
                                )}
                            </div>
                        </div>
                        <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 md:grid-cols-2">
                            <input
                                value={workflowName}
                                onChange={(event) => setWorkflowName(event.target.value)}
                                className="rounded-xl border border-phy-border bg-phy-bg px-3 py-2 text-sm text-phy-text outline-none focus:border-lime-300/70"
                                placeholder="工作流名称"
                            />
                            <input
                                value={workflowDescription}
                                onChange={(event) => setWorkflowDescription(event.target.value)}
                                className="rounded-xl border border-phy-border bg-phy-bg px-3 py-2 text-sm text-phy-text outline-none focus:border-lime-300/70"
                                placeholder="工作流说明"
                            />
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
                            <button
                                onClick={createToolBundleFromCanvas}
                                className="rounded-xl border border-teal-300/35 bg-teal-400/10 px-4 py-2 text-sm font-black text-teal-100 hover:bg-teal-400/20"
                            >
                                合成组合节点
                            </button>
                            <button
                                onClick={saveCanvasAsAgentWorkflow}
                                className="rounded-xl bg-lime-400 px-4 py-2 text-sm font-black text-lime-950 shadow-lg shadow-lime-500/10 hover:brightness-105"
                            >
                                保存工作流
                            </button>
                        </div>
                    </div>
                    {workflowSaveStatus && (
                        <div className="mt-2 rounded-xl border border-lime-300/20 bg-phy-bg/60 px-3 py-2 text-xs font-bold text-lime-100">
                            {workflowSaveStatus}
                        </div>
                    )}
                </div>}
            </div>

            <div className={`flex-1 min-h-0 grid grid-cols-1 gap-4 ${canvasGridClass}`}>
                {panelState.showNodeLibrary && <aside className="rounded-2xl border border-phy-border bg-phy-glass p-4 shadow-sm overflow-y-auto">
                    <div className="text-sm font-black text-phy-text mb-3">节点库</div>
                    <div className="space-y-2">
                        {nodeTypes.map((item) => {
                            const Icon = item.icon;
                            return (
                                <button key={item.type} onClick={() => addNode(item.type)} className="w-full rounded-2xl border border-phy-border bg-phy-bg/50 p-3 text-left hover:border-phy-accent/50 hover:bg-phy-glassHover transition-all group">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${item.color} text-white flex items-center justify-center shadow-sm`}><Icon size={18} /></div>
                                        <div className="min-w-0">
                                            <div className="text-sm font-bold text-phy-text">{item.label}</div>
                                            <div className="text-[11px] text-phy-muted truncate">{item.description}</div>
                                        </div>
                                        <Plus size={15} className="ml-auto text-phy-muted group-hover:text-phy-accent" />
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                    <div className="mt-5">
                        <div className="mb-2 text-xs font-black uppercase tracking-wide text-phy-muted">Agent tool presets</div>
                        <div className="space-y-2">
                            {learningFlowToolPresets.map((preset) => (
                                <button key={preset.key} onClick={() => addToolNode(preset)} className="w-full rounded-2xl border border-lime-400/20 bg-lime-400/5 p-3 text-left hover:border-lime-300/45 hover:bg-lime-400/10 transition-all group">
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-lime-500 to-emerald-400 text-white shadow-sm"><Wrench size={18} /></div>
                                        <div className="min-w-0">
                                            <div className="truncate text-sm font-bold text-phy-text">{preset.title}</div>
                                            <div className="truncate text-[11px] text-phy-muted">{preset.toolName}</div>
                                        </div>
                                        <Plus size={15} className="ml-auto text-phy-muted group-hover:text-lime-300" />
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="mt-5">
                        <div className="mb-2 flex items-center justify-between gap-2">
                            <div className="text-xs font-black uppercase tracking-wide text-phy-muted">All Agent tools</div>
                            <span className="rounded-full bg-phy-bg px-2 py-0.5 text-[10px] font-black text-phy-muted">{agentToolOptions.length}</span>
                        </div>
                        <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1 custom-scrollbar">
                            {agentToolOptions.map((tool) => (
                                <button key={tool.key} onClick={() => addAgentToolNode(tool)} className="w-full rounded-xl border border-phy-border bg-phy-bg/45 px-3 py-2 text-left hover:border-lime-300/40 hover:bg-lime-400/10 transition-all group">
                                    <div className="flex items-center gap-2">
                                        <Wrench size={14} className="text-lime-300 shrink-0" />
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate text-xs font-black text-phy-text">{tool.title}</div>
                                            <div className="truncate text-[10px] font-mono text-phy-muted">{tool.toolName}</div>
                                        </div>
                                        <Plus size={13} className="text-phy-muted group-hover:text-lime-300" />
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="mt-4 rounded-2xl border border-dashed border-phy-border p-3 text-xs text-phy-muted leading-relaxed">节点库先保持轻量。点击添加后，可以在右侧设置栏调整节点任务。</div>
                </aside>}

                <section
                    ref={canvasRef}
                    className={`relative rounded-2xl border border-cyan-400/25 bg-[#08111f] overflow-auto shadow-xl min-h-[620px] ${panState ? 'cursor-grabbing' : 'cursor-grab'}`}
                    onMouseDown={startCanvasPan}
                    onWheel={handleCanvasWheel}
                    onMouseMove={(event) => {
                        if (!connectingEdge) return;
                        const point = getCanvasPoint(event);
                        setConnectingEdge((current) => current ? { ...current, x: point.x, y: point.y } : current);
                    }}
                    onMouseUp={() => connectingEdge && setConnectingEdge(null)}
                    style={{
                        backgroundImage: 'linear-gradient(rgba(125,211,252,0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(125,211,252,0.18) 1px, transparent 1px), linear-gradient(rgba(125,211,252,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(125,211,252,0.07) 1px, transparent 1px), radial-gradient(circle at 20% 10%, rgba(59,130,246,0.18), transparent 28%), radial-gradient(circle at 80% 20%, rgba(16,185,129,0.14), transparent 24%)',
                        backgroundSize: '96px 96px, 96px 96px, 24px 24px, 24px 24px, 100% 100%, 100% 100%'
                    }}
                >
                    <div data-flow-control="true" className="absolute right-3 top-3 z-40 flex items-center gap-1 rounded-2xl border border-cyan-300/20 bg-slate-950/80 p-1.5 text-cyan-50 shadow-xl backdrop-blur">
                        <button type="button" onClick={() => updateZoom(zoom - ZOOM_STEP)} className="rounded-xl p-2 text-cyan-100 hover:bg-cyan-400/15 disabled:opacity-40" disabled={zoom <= MIN_ZOOM + 0.01} title="缩小画布">
                            <ZoomOut size={16} />
                        </button>
                        <button type="button" onClick={() => updateZoom(1)} className="min-w-14 rounded-xl px-2 py-1.5 text-xs font-black text-cyan-50 hover:bg-cyan-400/15" title="重置缩放">
                            {Math.round(zoom * 100)}%
                        </button>
                        <button type="button" onClick={() => updateZoom(zoom + ZOOM_STEP)} className="rounded-xl p-2 text-cyan-100 hover:bg-cyan-400/15 disabled:opacity-40" disabled={zoom >= MAX_ZOOM - 0.01} title="放大画布">
                            <ZoomIn size={16} />
                        </button>
                    </div>
                    <div className="relative" style={{ width: CANVAS_WIDTH * zoom, height: CANVAS_HEIGHT * zoom }}>
                        <div className="absolute left-0 top-0" style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT, transform: `scale(${zoom})`, transformOrigin: '0 0' }}>
                        <svg className="absolute inset-0 w-full h-full pointer-events-none">
                            <defs>
                                <linearGradient id="flowLineGradient" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="rgba(45, 212, 191, 0.75)" /><stop offset="100%" stopColor="rgba(125, 211, 252, 0.75)" /></linearGradient>
                                <marker id="flowArrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" markerUnits="strokeWidth"><path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(125, 211, 252, 0.78)" /></marker>
                            </defs>
                            {edges.map((edge) => {
                                const source = nodeMap.get(edge.source);
                                const target = nodeMap.get(edge.target);
                                if (!source || !target) return null;
                                const isSelectedEdge = selectedEdgeId === edge.id;
                                return <path key={edge.id} data-flow-edge="true" d={buildCurvePath(source, target)} fill="none" stroke={isSelectedEdge ? 'rgba(250, 204, 21, 0.95)' : 'url(#flowLineGradient)'} strokeWidth={isSelectedEdge ? '4' : '2.5'} strokeLinecap="round" strokeDasharray={isSelectedEdge ? '0' : '7 9'} markerEnd="url(#flowArrow)" className="pointer-events-auto cursor-pointer transition-all" onClick={(event) => { event.stopPropagation(); setSelectedEdgeId(edge.id); setSelectedId(null); }} />;
                            })}
                            {connectingEdge && <path d={buildPreviewPath()} fill="none" stroke="rgba(250, 204, 21, 0.85)" strokeWidth="3" strokeLinecap="round" strokeDasharray="4 6" markerEnd="url(#flowArrow)" />}
                        </svg>

                        {nodes.map((node) => {
                            const meta = getNodeMeta(node.type);
                            const Icon = meta.icon;
                            const isSelected = selectedId === node.id;
                            const isDone = node.status === 'done';
                            const isError = node.status === 'error';
                            const isDragging = dragState?.id === node.id;
                            const isBrain = node.type === 'ai_brain';
                            const isTool = node.type === 'agent_tool';
                            const isToolBundle = node.type === 'tool_bundle';
                            const isNoteComposer = node.type === 'note_composer';
                            const isPracticePack = node.type === 'practice_pack';
                            const brainResult = node.output?.brainResult;
                            const practicePreview = node.output?.preview;
                            const practiceCount = countPracticePreviewItems(practicePreview);
                            return (
                                <div key={node.id} data-flow-node="true" className={`absolute w-[260px] rounded-3xl border shadow-2xl select-none ${isBrain ? 'bg-slate-950/95 ring-1 ring-fuchsia-400/20' : 'bg-slate-950/92'} ${isDragging ? 'cursor-grabbing scale-[1.01] z-30' : 'cursor-grab transition-[border-color,box-shadow,transform] duration-150'} ${isSelected ? 'border-cyan-300 shadow-cyan-500/20' : 'border-cyan-100/15 hover:border-cyan-200/35'}`} style={{ left: node.x, top: node.y }} onMouseDown={(event) => { if (event.button !== 0) return; dragMovedRef.current = false; const rect = event.currentTarget.getBoundingClientRect(); setDragState({ id: node.id, offsetX: (event.clientX - rect.left) / zoom, offsetY: (event.clientY - rect.top) / zoom, startClientX: event.clientX, startClientY: event.clientY }); }} onDoubleClick={() => setSelectedId(node.id)}>
                                    <div data-flow-port="true" onMouseDown={(event) => event.stopPropagation()} onMouseUp={(event) => finishConnection(event, node.id)} title="输入端口" className={`absolute left-[-8px] top-[60px] w-4 h-4 rounded-full border-2 bg-slate-950 cursor-crosshair transition-all ${connectingEdge && connectingEdge.source !== node.id ? 'border-yellow-300 scale-125 shadow-[0_0_18px_rgba(250,204,21,0.75)]' : 'border-cyan-300/70 shadow-[0_0_14px_rgba(34,211,238,0.55)]'}`} />
                                    <div data-flow-port="true" onMouseDown={(event) => startConnection(event, node)} title="输出端口：拖拽连接到其他节点" className="absolute right-[-8px] top-[60px] w-4 h-4 rounded-full border-2 border-cyan-300/80 bg-slate-950 cursor-crosshair transition-all hover:scale-125 hover:border-yellow-300 hover:shadow-[0_0_18px_rgba(250,204,21,0.75)]" />
                                    <div className={`h-2 rounded-t-3xl bg-gradient-to-r ${meta.color}`} />
                                    <div className="p-4">
                                        <div className="flex items-start gap-3">
                                            <div className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${meta.color} text-white flex items-center justify-center shadow-lg`}><Icon size={20} /></div>
                                            <div className="min-w-0 flex-1">
                                                <div className="text-base font-black text-white truncate">{node.title || meta.label}</div>
                                                <div className="text-xs text-slate-400 mt-1 leading-relaxed line-clamp-2">{node.goal || meta.description}</div>
                                            </div>
                                            <Move size={15} className="text-slate-500 shrink-0" />
                                        </div>
                                        <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400"><span>{meta.label}</span><span>{node.estimatedMinutes || 5} 分钟</span></div>
                                        {isBrain && (
                                            <div className="mt-3 rounded-2xl border border-fuchsia-300/20 bg-fuchsia-400/10 px-3 py-2">
                                                <div className="flex items-center justify-between gap-2 text-[11px] font-bold">
                                                    <span className="text-fuchsia-100">Agent Brain</span>
                                                    <span className={brainLoadingId === node.id ? 'text-yellow-200' : brainResult ? 'text-emerald-200' : 'text-slate-400'}>
                                                        {brainLoadingId === node.id ? '分析中' : brainResult ? '已生成建议' : '未运行'}
                                                    </span>
                                                </div>
                                                {brainResult && <div className="mt-1 text-[11px] text-slate-300 line-clamp-2">{brainResult.summary}</div>}
                                            </div>
                                        )}
                                        {isTool && (
                                            <div className="mt-3 rounded-2xl border border-lime-300/20 bg-lime-400/10 px-3 py-2">
                                                <div className="flex items-center justify-between gap-2 text-[11px] font-bold">
                                                    <span className="text-lime-100">{node.config?.toolName || 'agent tool'}</span>
                                                    <span className={toolRunningId === node.id ? 'text-yellow-200' : isError ? 'text-red-200' : isDone ? 'text-emerald-200' : 'text-slate-400'}>
                                                        {toolRunningId === node.id ? '运行中' : isError ? '失败' : isDone ? '已执行' : '未运行'}
                                                    </span>
                                                </div>
                                                {node.output?.summary && <div className="mt-1 text-[11px] text-slate-300 line-clamp-2">{node.output.summary}</div>}
                                            </div>
                                        )}
                                        {isToolBundle && (
                                            <div className="mt-3 rounded-2xl border border-teal-300/20 bg-teal-400/10 px-3 py-2">
                                                <div className="flex items-center justify-between gap-2 text-[11px] font-bold">
                                                    <span className="text-teal-100">组合 {getToolBundleToolsFromConfig(node.config).length} 步</span>
                                                    <span className={toolRunningId === node.id ? 'text-yellow-200' : isError ? 'text-red-200' : isDone ? 'text-emerald-200' : 'text-slate-400'}>
                                                        {toolRunningId === node.id ? '运行中' : isError ? '失败' : isDone ? '已执行' : '未运行'}
                                                    </span>
                                                </div>
                                                {node.output?.summary && <div className="mt-1 text-[11px] text-slate-300 line-clamp-2">{node.output.summary}</div>}
                                            </div>
                                        )}
                                        {isNoteComposer && (
                                            <div className="mt-3 rounded-2xl border border-sky-300/20 bg-sky-400/10 px-3 py-2">
                                                <div className="flex items-center justify-between gap-2 text-[11px] font-bold">
                                                    <span className="text-sky-100">Note Composer</span>
                                                    <span className={noteRunningId === node.id ? 'text-yellow-200' : isError ? 'text-red-200' : isDone ? 'text-emerald-200' : 'text-slate-400'}>
                                                        {noteRunningId === node.id ? '生成中' : isError ? '失败' : isDone ? '已生成' : node.config?.useAI ? 'AI 整理' : '直接整理'}
                                                    </span>
                                                </div>
                                                <div className="mt-2 flex flex-wrap gap-1">
                                                    {buildNoteComposerTags(node.config).slice(0, 3).map((tag) => (
                                                        <span key={tag} className="rounded-full bg-sky-300/10 px-2 py-0.5 text-[10px] font-bold text-sky-100">{tag}</span>
                                                    ))}
                                                </div>
                                                {node.output?.summary && <div className="mt-1 text-[11px] text-slate-300 line-clamp-2">{node.output.summary}</div>}
                                            </div>
                                        )}
                                        {isPracticePack && (
                                            <div className="mt-3 rounded-2xl border border-indigo-300/20 bg-indigo-400/10 px-3 py-2">
                                                <div className="flex items-center justify-between gap-2 text-[11px] font-bold">
                                                    <span className="text-indigo-100">Practice Pack</span>
                                                    <span className={practiceRunningId === node.id || practiceCreatingId === node.id ? 'text-yellow-200' : isError ? 'text-red-200' : isDone ? 'text-emerald-200' : practiceCount ? 'text-indigo-100' : 'text-slate-400'}>
                                                        {practiceRunningId === node.id ? '预览中' : practiceCreatingId === node.id ? '创建中' : isError ? '失败' : isDone ? '已创建' : practiceCount ? '预览就绪' : '待预览'}
                                                    </span>
                                                </div>
                                                <div className="mt-2 flex flex-wrap gap-1">
                                                    {buildPracticePackTags(node.config).slice(0, 3).map((tag) => (
                                                        <span key={tag} className="rounded-full bg-indigo-300/10 px-2 py-0.5 text-[10px] font-bold text-indigo-100">{tag}</span>
                                                    ))}
                                                </div>
                                                {practiceCount > 0 && (
                                                    <div className="mt-2 grid grid-cols-4 gap-1 text-center text-[10px] font-black text-indigo-50">
                                                        <span className="rounded-lg bg-white/10 py-1">{practicePreview.flashcards?.length || 0} 卡</span>
                                                        <span className="rounded-lg bg-white/10 py-1">{practicePreview.translationExamples?.length || 0} 译</span>
                                                        <span className="rounded-lg bg-white/10 py-1">{practicePreview.writingMaterials?.length || 0} 素</span>
                                                        <span className="rounded-lg bg-white/10 py-1">{practicePreview.tasks?.length || 0} 事</span>
                                                    </div>
                                                )}
                                                {node.output?.summary && <div className="mt-1 text-[11px] text-slate-300 line-clamp-2">{node.output.summary}</div>}
                                            </div>
                                        )}
                                        <div className="flex items-center gap-2 mt-4">
                                            <button onMouseDown={(event) => event.stopPropagation()} onClick={() => updateNodeStatus(node.id)} disabled={isPracticePack} className={`flex-1 px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-70 ${isDone ? 'bg-emerald-400 text-emerald-950' : isError ? 'bg-red-400 text-red-950' : 'bg-white/10 text-slate-200 hover:bg-white/15'}`}>{isDone ? <Check size={14} /> : <Circle size={14} />}{isPracticePack ? (isDone ? '已创建' : '需确认') : isDone ? '已完成' : isError ? '失败' : '待完成'}</button>
                                            {isTool && (
                                                <button
                                                    onMouseDown={(event) => event.stopPropagation()}
                                                    onClick={() => runAgentToolNode(node)}
                                                    disabled={toolRunningId === node.id}
                                                    className="px-3 py-2 rounded-xl bg-lime-400/15 text-lime-100 text-xs font-bold hover:bg-lime-400/25 disabled:opacity-60"
                                                    title="运行 Agent 工具"
                                                >
                                                    <Play size={14} />
                                                </button>
                                            )}
                                            {isToolBundle && (
                                                <button
                                                    onMouseDown={(event) => event.stopPropagation()}
                                                    onClick={() => runToolBundleNode(node)}
                                                    disabled={toolRunningId === node.id}
                                                    className="px-3 py-2 rounded-xl bg-teal-400/15 text-teal-100 text-xs font-bold hover:bg-teal-400/25 disabled:opacity-60"
                                                    title="运行组合工具节点"
                                                >
                                                    <Play size={14} />
                                                </button>
                                            )}
                                            {isNoteComposer && (
                                                <button
                                                    onMouseDown={(event) => event.stopPropagation()}
                                                    onClick={() => runNoteComposerNode(node)}
                                                    disabled={noteRunningId === node.id}
                                                    className="px-3 py-2 rounded-xl bg-sky-400/15 text-sky-100 text-xs font-bold hover:bg-sky-400/25 disabled:opacity-60"
                                                    title="生成学习笔记"
                                                >
                                                    <Play size={14} />
                                                </button>
                                            )}
                                            {isPracticePack && (
                                                <button
                                                    onMouseDown={(event) => event.stopPropagation()}
                                                    onClick={() => runPracticePackPreview(node)}
                                                    disabled={practiceRunningId === node.id || practiceCreatingId === node.id}
                                                    className="px-3 py-2 rounded-xl bg-indigo-400/15 text-indigo-100 text-xs font-bold hover:bg-indigo-400/25 disabled:opacity-60"
                                                    title="生成练习包预览"
                                                >
                                                    <Play size={14} />
                                                </button>
                                            )}
                                            <button onMouseDown={(event) => event.stopPropagation()} onClick={() => setSelectedId(node.id)} className="px-3 py-2 rounded-xl bg-cyan-400/15 text-cyan-200 text-xs font-bold hover:bg-cyan-400/25"><Settings2 size={14} /></button>
                                            <button onMouseDown={(event) => event.stopPropagation()} onClick={() => deleteNode(node.id)} className="p-2 rounded-xl bg-red-500/10 text-red-300 hover:bg-red-500/20"><Trash2 size={14} /></button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                        </div>
                    </div>
                </section>

                {showConfigPanel && (
                    <aside className="fixed inset-x-3 bottom-3 top-24 z-40 overflow-y-auto rounded-3xl border border-phy-border bg-phy-glassHeavy p-4 shadow-2xl xl:static xl:inset-auto xl:z-auto xl:max-h-none">
                        <div className="flex items-start justify-between gap-3 mb-4">
                            <div>
                                <div className="text-xs font-black text-phy-muted">节点设置</div>
                                <h3 className="text-lg font-black text-phy-text">{getNodeMeta(selectedNode.type).label}</h3>
                            </div>
                            <button onClick={() => setSelectedId(null)} className="p-2 rounded-xl border border-phy-border text-phy-muted hover:text-phy-text"><X size={16} /></button>
                        </div>
                        <div className="space-y-4">
                            <Field label="节点标题"><input value={selectedNode.title || ''} onChange={(e) => updateSelectedNode({ title: e.target.value })} className="w-full rounded-xl border border-phy-border bg-phy-bg px-3 py-2 text-sm text-phy-text outline-none focus:border-phy-accent/60" /></Field>
                            <Field label="执行目标"><textarea value={selectedNode.goal || ''} onChange={(e) => updateSelectedNode({ goal: e.target.value })} rows={3} className="w-full rounded-xl border border-phy-border bg-phy-bg px-3 py-2 text-sm text-phy-text outline-none focus:border-phy-accent/60" /></Field>
                            <Field label="预计耗时（分钟）"><input type="number" min="1" value={selectedNode.estimatedMinutes || 5} onChange={(e) => updateSelectedNode({ estimatedMinutes: Number(e.target.value) || 1 })} className="w-full rounded-xl border border-phy-border bg-phy-bg px-3 py-2 text-sm text-phy-text outline-none focus:border-phy-accent/60" /></Field>
                            <Field label="完成条件"><input value={selectedNode.completionRule || ''} onChange={(e) => updateSelectedNode({ completionRule: e.target.value })} className="w-full rounded-xl border border-phy-border bg-phy-bg px-3 py-2 text-sm text-phy-text outline-none focus:border-phy-accent/60" /></Field>
                            {renderConfigFields(selectedNode, updateSelectedConfig)}
                            {selectedNode.type === 'note_composer' && (
                                <div className="space-y-3">
                                    <div className="rounded-2xl border border-sky-300/25 bg-sky-500/10 p-3 text-sm text-phy-text space-y-3">
                                        <div className="flex items-center justify-between gap-2">
                                            <div>
                                                <div className="font-black text-sky-100">输入与输出</div>
                                                <div className="text-xs text-phy-muted">读取连入此节点的上游输出，也可以混合手动输入。</div>
                                            </div>
                                            <span className="rounded-full bg-sky-400/15 px-2 py-1 text-xs font-black text-sky-100">{selectedNoteInputs.length} 个输入</span>
                                        </div>
                                        <div className="flex flex-wrap gap-1.5">
                                            {buildNoteComposerTags(selectedNode.config).map((tag) => (
                                                <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-sky-300/10 px-2 py-1 text-[11px] font-bold text-sky-100">
                                                    <Tag size={11} /> {tag}
                                                </span>
                                            ))}
                                            {!buildNoteComposerTags(selectedNode.config).length && <span className="text-xs text-phy-muted">暂未设置标签</span>}
                                        </div>
                                        <div className="max-h-36 space-y-2 overflow-y-auto pr-1">
                                            {selectedNoteInputs.length ? selectedNoteInputs.map((item) => (
                                                <div key={item.nodeId} className="rounded-xl border border-sky-300/15 bg-phy-bg/60 p-2">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <span className="text-xs font-black text-phy-text">{item.title}</span>
                                                        <span className="text-[10px] text-phy-muted">{item.status === 'done' ? '已完成' : item.status}</span>
                                                    </div>
                                                    <p className="mt-1 text-[11px] text-phy-muted line-clamp-2">{item.summary}</p>
                                                </div>
                                            )) : (
                                                <div className="rounded-xl border border-dashed border-sky-300/20 p-3 text-xs text-phy-muted">暂无上游输入。可以连接其它节点，或直接填写“手动输入”。</div>
                                            )}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => runNoteComposerNode(selectedNode)}
                                        disabled={noteRunningId === selectedNode.id}
                                        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-sky-500 to-emerald-400 px-4 py-3 text-sm font-black text-white shadow-lg shadow-sky-500/15 disabled:opacity-60"
                                    >
                                        {selectedNode.config?.useAI ? <Bot size={16} /> : <NotebookPen size={16} />}
                                        {noteRunningId === selectedNode.id ? '正在生成笔记...' : selectedNode.config?.useAI ? '用 AI 整理并生成笔记' : '直接生成笔记'}
                                    </button>
                                    {noteError && (
                                        <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-xs text-red-100 flex gap-2">
                                            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                                            <span>{noteError}</span>
                                        </div>
                                    )}
                                </div>
                            )}
                            {selectedNode.type === 'practice_pack' && (() => {
                                const preview = selectedNode.output?.preview || emptyPracticePreview();
                                const previewCount = countPracticePreviewItems(preview);
                                const created = selectedNode.output?.created;
                                const tags = buildPracticePackTags(selectedNode.config);
                                return (
                                    <div className="space-y-3">
                                        <div className="rounded-2xl border border-indigo-300/25 bg-indigo-500/10 p-3 text-sm text-phy-text space-y-3">
                                            <div className="flex items-center justify-between gap-2">
                                                <div>
                                                    <div className="font-black text-indigo-100">输入、预览与创建</div>
                                                    <div className="text-xs text-phy-muted">先读取上游笔记/工具结果和手动输入，生成预览后再确认落库。</div>
                                                </div>
                                                <span className="rounded-full bg-indigo-400/15 px-2 py-1 text-xs font-black text-indigo-100">{selectedPracticeInputs.length} 个输入</span>
                                            </div>
                                            <div className="flex flex-wrap gap-1.5">
                                                {tags.map((tag) => (
                                                    <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-indigo-300/10 px-2 py-1 text-[11px] font-bold text-indigo-100">
                                                        <Tag size={11} /> {tag}
                                                    </span>
                                                ))}
                                                {!tags.length && <span className="text-xs text-phy-muted">暂未设置标签</span>}
                                            </div>
                                            <div className="max-h-36 space-y-2 overflow-y-auto pr-1">
                                                {selectedPracticeInputs.length ? selectedPracticeInputs.map((item) => (
                                                    <div key={item.nodeId} className="rounded-xl border border-indigo-300/15 bg-phy-bg/60 p-2">
                                                        <div className="flex items-center justify-between gap-2">
                                                            <span className="text-xs font-black text-phy-text">{item.title}</span>
                                                            <span className="text-[10px] text-phy-muted">{item.status === 'done' ? '已完成' : item.status}</span>
                                                        </div>
                                                        <p className="mt-1 text-[11px] text-phy-muted line-clamp-2">{item.summary}</p>
                                                    </div>
                                                )) : (
                                                    <div className="rounded-xl border border-dashed border-indigo-300/20 p-3 text-xs text-phy-muted">暂无上游输入。可以连接“整理学习笔记”节点，或在手动输入里直接粘贴笔记。</div>
                                                )}
                                            </div>
                                        </div>

                                        <button
                                            onClick={() => runPracticePackPreview(selectedNode)}
                                            disabled={practiceRunningId === selectedNode.id || practiceCreatingId === selectedNode.id}
                                            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-500 to-emerald-400 px-4 py-3 text-sm font-black text-white shadow-lg shadow-indigo-500/15 disabled:opacity-60"
                                        >
                                            {selectedNode.config?.useAI ? <Bot size={16} /> : <FileQuestion size={16} />}
                                            {practiceRunningId === selectedNode.id ? '正在生成预览...' : selectedNode.config?.useAI ? '用 AI 生成练习包预览' : '用规则生成练习包预览'}
                                        </button>

                                        {previewCount > 0 && (
                                            <div className="space-y-3 rounded-2xl border border-indigo-300/25 bg-indigo-500/10 p-3">
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="font-black text-indigo-100">预览结果</div>
                                                    <span className="rounded-full bg-indigo-400/15 px-2 py-1 text-xs font-black text-indigo-100">{previewCount} 条</span>
                                                </div>
                                                {selectedNode.output?.metrics?.aiWarning && (
                                                    <div className="rounded-xl border border-yellow-400/30 bg-yellow-500/10 p-2 text-xs text-yellow-100">
                                                        AI 增强失败，当前显示规则解析结果：{selectedNode.output.metrics.aiWarning}
                                                    </div>
                                                )}
                                                <PracticePreviewSection
                                                    title="闪卡"
                                                    items={preview.flashcards}
                                                    renderItem={(item) => (
                                                        <>
                                                            <div className="font-black text-phy-text">{item.front}</div>
                                                            <div className="mt-1 line-clamp-2 text-phy-muted whitespace-pre-line">{item.back}</div>
                                                        </>
                                                    )}
                                                />
                                                <PracticePreviewSection
                                                    title="翻译句"
                                                    items={preview.translationExamples}
                                                    renderItem={(item) => (
                                                        <>
                                                            <div className="font-black text-phy-text line-clamp-2">{item.chinese || item.answer}</div>
                                                            <div className="mt-1 text-phy-muted">{[item.targetWord, item.hint, item.answer].filter(Boolean).join(' / ')}</div>
                                                        </>
                                                    )}
                                                />
                                                <PracticePreviewSection
                                                    title="写作素材"
                                                    items={preview.writingMaterials}
                                                    renderItem={(item) => (
                                                        <>
                                                            <div className="font-black text-phy-text">{item.title}</div>
                                                            <div className="mt-1 line-clamp-2 text-phy-muted">{item.content}</div>
                                                        </>
                                                    )}
                                                />
                                                <PracticePreviewSection
                                                    title="学习任务"
                                                    items={preview.tasks}
                                                    renderItem={(item) => <div className="font-black text-phy-text">{item.title}</div>}
                                                />
                                            </div>
                                        )}

                                        {previewCount > 0 && !created?.confirmed && (
                                            <button
                                                onClick={() => confirmPracticePackCreate(selectedNode)}
                                                disabled={practiceCreatingId === selectedNode.id || practiceRunningId === selectedNode.id}
                                                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-black text-emerald-950 shadow-lg shadow-emerald-500/15 disabled:opacity-60"
                                            >
                                                <Check size={16} />
                                                {practiceCreatingId === selectedNode.id ? '正在创建产物...' : '确认创建这些练习产物'}
                                            </button>
                                        )}

                                        {created?.confirmed && (
                                            <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-3 text-xs text-emerald-100">
                                                已创建：闪卡 {created.cardIds?.length || 0}、素材 {created.materialIds?.length || 0}、任务 {created.taskIds?.length || 0}。这一批预览不会重复创建。
                                            </div>
                                        )}

                                        {practiceError && (
                                            <div className="rounded-2xl border border-yellow-400/30 bg-yellow-500/10 p-3 text-xs text-yellow-100 flex gap-2">
                                                <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                                                <span>{practiceError}</span>
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}
                            {selectedNode.type === 'agent_tool' && (
                                <div className="space-y-3">
                                    <button
                                        onClick={() => runAgentToolNode(selectedNode)}
                                        disabled={toolRunningId === selectedNode.id}
                                        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-lime-500 to-emerald-400 px-4 py-3 text-sm font-black text-white shadow-lg shadow-emerald-500/15 disabled:opacity-60"
                                    >
                                        <Play size={16} />
                                        {toolRunningId === selectedNode.id ? '正在运行工具...' : '运行 Agent 工具节点'}
                                    </button>
                                    {toolError && (
                                        <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-xs text-red-100 flex gap-2">
                                            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                                            <span>{toolError}</span>
                                        </div>
                                    )}
                                </div>
                            )}
                            {selectedNode.type === 'tool_bundle' && (
                                <div className="space-y-3">
                                    <div className="rounded-2xl border border-teal-300/25 bg-teal-500/10 p-3 text-sm text-phy-text">
                                        <div className="mb-2 flex items-center justify-between gap-2">
                                            <div className="font-black text-teal-100">组合执行顺序</div>
                                            <span className="rounded-full bg-teal-400/15 px-2 py-1 text-xs font-black text-teal-100">{getToolBundleToolsFromConfig(selectedNode.config).length} 步</span>
                                        </div>
                                        <div className="max-h-44 space-y-1.5 overflow-y-auto pr-1">
                                            {getToolBundleToolsFromConfig(selectedNode.config).map((item, index) => (
                                                <div key={`${item.toolName}-${index}`} className="rounded-xl border border-teal-300/15 bg-phy-bg/60 p-2 text-xs">
                                                    <span className="font-black text-teal-100">{index + 1}. </span>
                                                    <span className="font-bold text-phy-text">{agentToolOptionByName.get(item.toolName)?.title || item.toolName}</span>
                                                    <span className="ml-1 font-mono text-phy-muted">{item.toolName}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => runToolBundleNode(selectedNode)}
                                        disabled={toolRunningId === selectedNode.id}
                                        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-teal-500 to-lime-400 px-4 py-3 text-sm font-black text-white shadow-lg shadow-emerald-500/15 disabled:opacity-60"
                                    >
                                        <Play size={16} />
                                        {toolRunningId === selectedNode.id ? '正在运行组合工具...' : '运行自定义工具组合'}
                                    </button>
                                    {toolError && (
                                        <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-xs text-red-100 flex gap-2">
                                            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                                            <span>{toolError}</span>
                                        </div>
                                    )}
                                </div>
                            )}
                            {selectedNode.type === 'ai_brain' && (
                                <div className="space-y-3">
                                    <div className="rounded-2xl border border-cyan-300/25 bg-cyan-500/10 p-3 text-sm text-phy-text space-y-3">
                                        <div className="flex items-center justify-between gap-2">
                                            <div>
                                                <div className="font-black text-cyan-200">输入预览</div>
                                                <div className="text-xs text-phy-muted">只读取连到 AI 大脑的上游节点。</div>
                                            </div>
                                            <span className="rounded-full bg-cyan-400/15 px-2 py-1 text-xs font-black text-cyan-100">{selectedBrainInputs.length} 条</span>
                                        </div>
                                        <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
                                            {selectedBrainInputs.length ? selectedBrainInputs.map((item) => (
                                                <div key={item.nodeId} className="rounded-xl border border-cyan-300/15 bg-phy-bg/60 p-2">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <span className="text-xs font-black text-phy-text">{item.title}</span>
                                                        <span className="text-[10px] text-phy-muted">{item.status === 'done' ? '已完成' : '未完成'}</span>
                                                    </div>
                                                    <p className="mt-1 text-[11px] text-phy-muted line-clamp-2">{item.summary}</p>
                                                </div>
                                            )) : (
                                                <div className="rounded-xl border border-dashed border-cyan-300/20 p-3 text-xs text-phy-muted">暂无上游输入。请把其它节点的输出端口连到 AI 大脑。</div>
                                            )}
                                        </div>
                                    </div>

                                    <button
                                        onClick={() => runAiBrain(selectedNode)}
                                        disabled={brainLoadingId === selectedNode.id}
                                        className="w-full rounded-2xl bg-gradient-to-r from-fuchsia-500 to-cyan-400 px-4 py-3 text-sm font-black text-white shadow-lg shadow-cyan-500/15 disabled:opacity-60"
                                    >
                                        {brainLoadingId === selectedNode.id ? '正在分析学习流...' : '运行 AI 大脑'}
                                    </button>

                                    {brainError && (
                                        <div className="rounded-2xl border border-yellow-400/30 bg-yellow-500/10 p-3 text-xs text-yellow-100 flex gap-2">
                                            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                                            <span>AI 调用未成功，已使用本地兜底推荐：{brainError}</span>
                                        </div>
                                    )}

                                    {selectedNode.output?.brainResult ? (() => {
                                        const result = selectedNode.output.brainResult;
                                        const targetMeta = getNodeMeta(result.recommendedNodeType);
                                        const ResultIcon = targetMeta.icon;
                                        return (
                                            <div className="rounded-2xl border border-fuchsia-300/25 bg-gradient-to-br from-fuchsia-500/10 to-cyan-500/10 p-3 text-sm text-phy-text space-y-3">
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="font-black text-fuchsia-100">AI 大脑结果</div>
                                                    <span className="rounded-full border border-phy-border px-2 py-1 text-[10px] font-bold text-phy-muted">{result.source === 'ai' ? 'AI 分析' : '本地兜底'}</span>
                                                </div>
                                                <p className="text-sm font-bold leading-relaxed">{result.summary}</p>
                                                <div className="rounded-xl border border-phy-border bg-phy-bg/60 p-3">
                                                    <div className="flex items-center gap-2">
                                                        <ResultIcon size={17} className="text-cyan-200" />
                                                        <div>
                                                            <div className="text-xs text-phy-muted">推荐下一步</div>
                                                            <div className="font-black text-phy-text">{targetMeta.label}</div>
                                                        </div>
                                                    </div>
                                                    <p className="mt-2 text-xs text-phy-muted leading-relaxed">{result.reason}</p>
                                                </div>
                                                {!!result.evidence?.length && (
                                                    <div>
                                                        <div className="text-xs font-black text-phy-muted mb-1">主要证据</div>
                                                        <ul className="space-y-1 text-xs text-phy-muted">
                                                            {result.evidence.map((item, index) => <li key={index}>- {item}</li>)}
                                                        </ul>
                                                    </div>
                                                )}
                                                {!!result.weaknesses?.length && (
                                                    <div>
                                                        <div className="text-xs font-black text-phy-muted mb-1">发现的弱点</div>
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {result.weaknesses.map((item, index) => <span key={index} className="rounded-full bg-red-500/10 px-2 py-1 text-[11px] font-bold text-red-200">{item}</span>)}
                                                        </div>
                                                    </div>
                                                )}
                                                <div className="grid grid-cols-2 gap-2">
                                                    <button onClick={() => applySuggestedConfig(result.recommendedNodeType, result.suggestedConfig)} className="rounded-xl border border-cyan-300/30 bg-cyan-400/10 px-3 py-2 text-xs font-black text-cyan-100 hover:bg-cyan-400/20">应用推荐配置</button>
                                                    <button onClick={() => openNode(result.recommendedNodeType)} className="rounded-xl bg-cyan-400/20 px-3 py-2 text-xs font-black text-cyan-100 hover:bg-cyan-400/30">进入推荐模块</button>
                                                </div>
                                            </div>
                                        );
                                    })() : (
                                        <div className="rounded-2xl border border-dashed border-phy-border p-3 text-xs text-phy-muted leading-relaxed">
                                            运行后会生成结构化诊断、证据、弱点和推荐节点。V1 只建议路线，不自动执行。
                                        </div>
                                    )}
                                </div>
                            )}
                            {selectedNode.output?.summary && (
                                <div className="rounded-2xl border border-phy-border bg-phy-bg/60 p-3 text-sm text-phy-text">
                                    <div className="mb-1 text-xs font-black text-phy-muted">节点输出</div>
                                    <p className="leading-relaxed">{selectedNode.output.summary}</p>
                                    {selectedNode.output.metrics?.toolName && (
                                        <div className="mt-2 rounded-xl bg-phy-glass px-2 py-1 font-mono text-[11px] text-phy-muted">
                                            {selectedNode.output.metrics.toolName}
                                            {selectedNode.output.metrics.action ? ` · ${selectedNode.output.metrics.action}` : ''}
                                        </div>
                                    )}
                                </div>
                            )}
                            <div className="grid grid-cols-2 gap-2 pt-2">
                                <button onClick={() => openNode(selectedNode)} className="rounded-xl bg-phy-accent px-3 py-2 text-sm font-black text-white hover:bg-phy-accentHover">打开模块</button>
                                <button onClick={() => updateNodeStatus(selectedNode.id)} disabled={selectedNode.type === 'practice_pack'} className="rounded-xl border border-phy-border px-3 py-2 text-sm font-black text-phy-text hover:bg-phy-glassHover disabled:cursor-not-allowed disabled:opacity-60">{selectedNode.type === 'practice_pack' ? '需确认创建' : '切换完成'}</button>
                                <button onClick={() => deleteNode(selectedNode.id)} className="col-span-2 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm font-black text-red-300 hover:bg-red-500/20">删除节点</button>
                            </div>
                        </div>
                    </aside>
                )}
            </div>
        </div>
    );
};

export default LearningFlowCanvasView;
