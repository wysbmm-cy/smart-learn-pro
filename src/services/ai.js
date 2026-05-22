
/**
 * AI Service for VerbaPath
 * Handles API communication using Parallel Requests for performance.
 */

import { stripOutlineParagraphLabel } from '../utils/writerText';

// Helper for delay
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export const sendChat = async (messages, settings, jsonRequired = false) => {
  return await fetchFromAI(messages, settings, jsonRequired);
};

const parseLooseJsonObject = (text) => {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const match = String(text).match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
};

const fetchFromAI = async (messages, settings, jsonRequired = true, retries = 3, options = {}) => {
  const { apiKey, apiBaseUrl, modelName } = settings;
  const cleanUrl = apiBaseUrl.replace(/\/+$/, '');
  const signal = options?.signal;
  let lastError = null;

  for (let i = 0; i < retries; i++) {
    try {
      if (signal?.aborted) {
        throw new DOMException('Request aborted', 'AbortError');
      }
      const response = await fetch(`${cleanUrl}/chat/completions`, {
        method: 'POST',
        signal,
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: modelName || "gpt-3.5-turbo",
          messages,
          response_format: jsonRequired ? { type: "json_object" } : undefined,
          temperature: 0.7
        })
      });

      if (!response.ok) {
        if (response.status === 429) {
          console.warn(`API Rate Limit (429). Retrying in ${(i + 1) * 2}s...`);
          lastError = new Error("429 Too Many Requests: API rate limit reached.");
          await delay((i + 1) * 2000); // Backoff: 2s, 4s, 6s...
          continue;
        }
        if (response.status === 404) throw new Error("404 Not Found: Check API Base URL/Model.");
        if (response.status === 401) throw new Error("401 Unauthorized: Invalid API Key.");

        const errorText = await response.text();
        console.error("API Error Body:", errorText);
        throw new Error(`API Error: ${response.status} - ${errorText.substring(0, 200)}`);
      }

      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;
      if (content === undefined || content === null) {
        throw new Error("AI response missing message content.");
      }
      return content;
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw error;
      }
      lastError = error;
      if (i === retries - 1) throw error;
      console.warn(`API Request failed. Retrying... (${i + 1}/${retries})`);
    }
  }

  throw lastError || new Error("AI request failed after retries.");
};

export const analyzeLearningFlowBrain = async ({ node, upstreamOutputs = [], recentStudyContext = {}, canvas = {} }, settings) => {
  if (!settings?.apiKey) throw new Error("Missing API Key");

  const systemPrompt = `
You are the AI Brain node inside VerbaPath's learning-flow canvas.
Your job is to analyze upstream node outputs plus recent study context, then recommend the next learning route.
You do not execute actions. You only produce a safe recommendation.

Return ONLY valid JSON:
{
  "summary": "one concise Chinese judgement",
  "evidence": ["evidence point 1", "evidence point 2"],
  "weaknesses": ["weakness 1", "weakness 2"],
  "recommendedNodeType": "flashcards|exam|translation|writer|notes",
  "reason": "Chinese explanation",
  "suggestedConfig": {},
  "reviewNoteDraft": "optional Chinese markdown review draft"
}

Rules:
- recommendedNodeType must be one of: flashcards, exam, translation, writer, notes.
- suggestedConfig should only contain simple front-end config fields for that node.
- Prefer concrete, actionable advice over generic encouragement.
- If data is sparse, say so in evidence and still give a conservative next step.
`.trim();

  const payload = {
    brainNode: {
      title: node?.title,
      objective: node?.config?.objective,
      analysisScope: node?.config?.analysisScope || node?.config?.evidence,
      outputMode: node?.config?.outputMode
    },
    upstreamOutputs,
    recentStudyContext,
    canvas: {
      nodes: (canvas?.nodes || []).map((item) => ({
        id: item.id,
        type: item.type,
        title: item.title,
        status: item.status,
        goal: item.goal,
        config: item.config
      })),
      edges: canvas?.edges || []
    }
  };

  const content = await fetchFromAI([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: JSON.stringify(payload, null, 2) }
  ], settings, true);

  const parsed = parseLooseJsonObject(content);
  if (!parsed) throw new Error("AI returned invalid learning-flow brain JSON");

  const allowedTypes = new Set(['flashcards', 'exam', 'translation', 'writer', 'notes']);
  const recommendedNodeType = allowedTypes.has(parsed.recommendedNodeType) ? parsed.recommendedNodeType : 'notes';
  return {
    summary: String(parsed.summary || '已完成学习流分析。'),
    evidence: Array.isArray(parsed.evidence) ? parsed.evidence.map(String).slice(0, 6) : [],
    weaknesses: Array.isArray(parsed.weaknesses) ? parsed.weaknesses.map(String).slice(0, 6) : [],
    recommendedNodeType,
    reason: String(parsed.reason || '根据当前学习流和近期记录，建议继续推进这个节点。'),
    suggestedConfig: parsed.suggestedConfig && typeof parsed.suggestedConfig === 'object' ? parsed.suggestedConfig : {},
    reviewNoteDraft: String(parsed.reviewNoteDraft || ''),
    source: 'ai'
  };
};

export const digitalizeExam = async (text, settings, drillType = null) => {
  if (!settings.apiKey) throw new Error("Missing API Key");

  // 🚄 Optimization: Auto-Splitting for Long Exams (Parallel Processing)
  // Only apply if text is long enough AND logic is 'full' (drill modes are usually targeted/short)
  // Fix: sanitize text to remove non-printable control chars that can break requests.
  text = Array.from(text).filter((ch) => {
    const code = ch.charCodeAt(0);
    if (code === 9 || code === 10 || code === 13) return true; // keep tab/newline
    return !(code <= 31 || code === 127);
  }).join('');
  const shouldChunk = (!drillType || drillType === 'full') && text.length > 3000;

  if (shouldChunk) {
    // Attempt to split by common Exam Headers (Part I, Section A, Module 1...)
    // Regex looks for "Part X" or "Section X" alone on a line or start of line
    const chunkRegex = /(?:^|\n)(Part\s+(?:I+V?|V?I+|One|Two|Three|Four|Five)|Section\s+(?:[A-Z]|[0-9]+)|Module\s+[0-9]+)/i;
    const parts = text.split(chunkRegex).filter(t => t.trim().length > 100); // Filter out small noise

    // If we successfully split into 2+ substantial parts, process in parallel
    if (parts.length >= 2) {
      console.log(`🚀 Accelerated Mode: Split exam into ${parts.length} chunks.`);

      const chunkPromises = parts.map((chunk, idx) => {
        // Add a small delay to stagger requests slightly (avoid instant 429 spike)
        return delay(idx * 500).then(() => digitalizeExam(chunk, settings, drillType));
      });

      try {
        const results = await Promise.all(chunkPromises);
        // Merge Results
        const merged = {
          title: results[0]?.title || "Exam Paper",
          sections: results.flatMap(r => r.sections || [])
        };
        if (merged.sections.length > 0) {
          return merged;
        }
        console.warn("Chunking returned 0 sections, falling back to full text.");
        // Fallthrough if sections are empty
      } catch (e) {
        console.warn("Chunking failed, falling back to full text:", e);
        // Fallback to flow below
      }
    }
  }

  // --- Standard or Drill Processing Logic ---
  let systemPrompt = '';

  if (drillType && drillType !== 'full') {
    // 🚀 Drill Mode logic...
    const drillPrompts = {
      'fast': `Task: Create a "Mini-Test" from the provided exam text.
      
      CRITICAL INSTRUCTIONS:
      1. Extract REAL content from the user text. DO NOT use generic placeholders like "Passage..." or "Question content...".
      2. If you cannot find a Reading Passage, fallback to extracting 5 vocabulary/grammar MCQs from the text.
      3. If the text is empty or illegible, return an empty "sections" array.
      
      Requirements:
      1. Extract ONLY ONE Reading Passage with its questions.
      2. If no Reading Passage found, extract 5 Vocabulary/Grammar MCQs.
      3. Extract ONE Writing Prompt if available.
      4. Ignore the rest.

      Output JSON Schema:
      {
        "title": "Mini-Test",
        "sections": [
          {
            "type": "reading",
            "content": "(Insert actual passage text here)",
            "questions": [
              {
                "id": 1,
                "text": "(Insert actual question text)",
                "options": ["A. (Option A text)", "B. (Option B text)"],
                "answer": "A"
              }
            ]
          }
        ]
      }`,
      'reading': `Task: Extract Reading Comprehension only.\nCRITICAL: Use REAL content from input. DO NOT generate placeholders.\nSchema: { "title": "Reading Drill", "sections": [{ "type": "reading", "content": "(Insert actual passage)", "questions": [{ "id": 1, "text": "(Insert actual question)", "options": ["A. ..."], "answer": "A" }] }] }`,
      'matching': `Task: Extract Paragraph Matching only.\nCRITICAL: Use REAL content.\nSchema: { "title": "Matching Drill", "sections": [{ "type": "matching", "content": "(Insert actual paragraphs)", "questions": [{ "id": 1, "text": "(Insert statement)", "answer": "A" }] }] }`,
      'cloze': `Task: Extract Cloze Test only.\nCRITICAL: Use REAL content.\nSchema: { "title": "Cloze Drill", "sections": [{ "type": "cloze", "content": "Text with [1]...", "questions": [{ "id": 1, "options": ["A...", "B..."] }] }] }`,
      'writing': `Task: Extract Writing Prompt only.\nCRITICAL: Use REAL content.\nSchema: { "title": "Writing Drill", "sections": [{ "type": "writing", "instructions": "(Insert instructions)", "content": "(Insert prompt topic)" }] }`
    };
    systemPrompt = (drillPrompts[drillType] || drillPrompts['reading']) + `\nRequirements: Fast processing. Return valid JSON only. NEVER output placeholders like "Passage..." or "Question content...".`;
  } else {
    // 🐢 Full Parsing
    systemPrompt = `
    Role: Professional Exam Digitizer.
    Task: Convert the provided raw exam text (often OCR'd from PDF) into a structured JSON Exam Paper.
    
    Requirements:
    1. Identify sections: Reading, Listening, Writing, MCQ.
    2. MCQs: Cleanly separate question text from options.
    3. Reading: Isolate passage from questions.
    
    Output JSON Schema:
    {
      "title": "Exam Paper",
      "sections": [
        {
          "type": "reading" | "listening" | "writing" | "mcq",
          "instructions": "String",
          "content": "String (Passage text. If NULL, it's pure MCQ)",
          "questions": [
             {
                "id": Number,
                "text": "String",
                "options": ["A. ...", "B. ..."],
                "answer": "String (A/B/C/D or null)"
             }
          ]
        }
      ]
    }
    IMPORTANT: Return ONLY valid JSON.
    `;
  }

  // Use the existing fetch wrapper
  const jsonStr = await fetchFromAI([
    { role: "system", content: systemPrompt },
    { role: "user", content: text }
  ], settings, true);

  try {
    const parsed = JSON.parse(jsonStr);
    // Ensure structure is array
    if (!parsed.sections) parsed.sections = [];
    return parsed;
  } catch (e) {
    console.warn("JSON Parse Error in Exam:", e);
    const match = jsonStr.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error("AI returned invalid exam format");
  }
};

// 🚀 Optimized Analysis: Parallel Execution
export const analyzeText = async (text, settings) => {
  if (!settings.apiKey) throw new Error("Missing API Key");

  const vocabCount = settings.vocabCount || "10-15";
  const safeText = text.length > 8000 ? text.substring(0, 8000) + "..." : text;

  // 1. Core Summary & Level (Fast)
  const corePrompt = `
  Role: Expert English Teacher.
  Task: Analyze the text to provide a structured summary and assess difficulty.
  Requirements:
  - Summary: Write a cohesive Chinese summary (approx 100-150 words) capturing the main idea and key arguments.
  - Level: Assess CEFR level (e.g., B2, C1, C2) or exam equivalent (CET-4/6, IELTS, TOEFL).
  Output JSON:
  {
    "summary": "String",
    "level": "String"
  }
  `;

  // 2. Vocabulary Extraction (Intensive)
  // Optimization: Added 'usage' and explicit 'mnemonic' request
  const vocabPrompt = `
  Role: Senior Lexicographer.
  Task: Extract ${vocabCount} high-value words/phrases from the text.
  Selection Criteria:
  1. Prioritize **Academic/Formal** vocabulary (Tier 2/3 words).
  2. Include impactful **phrasal verbs** or **idioms**.
  3. **Ignore** common words (top 2000 frequent words).
  
  For each word, provide:
  - Chinese definition contextually matching the text.
  - A clever **Mnemonic** (associative memory aid or etymology).
  - **Usage Tip**: Determining collocation or nuance (e.g., "Formal use only").
  
  Output JSON:
  {
    "vocabulary": [
      { 
        "word": "String", 
        "phonetic": "String (IPA)", 
        "meaning": "String (CN)", 
        "mnemonic": "String (Memory Aid)", 
        "level": "String (e.g., C1)",
        "usage": "String (Tip/Collocation)"
      }
    ]
  }
  `;

  // 3. Grammar Analysis (Structural)
  // Optimization: Focus on rhetorical function
  const grammarPrompt = `
  Role: Syntax Stylist.
  Task: Identify 2-3 **syntactically complex** or **rhetorically effective** sentence structures.
  Target:
  - Inverted Sentences (Inversion)
  - Subjunctive Mood
  - Participle Phrases / Absolute Constructions
  - Parallelism / Antithesis
  - Complex Subordinate Clauses
  
  Analysis Goal: Explain **WHY** the author chose this structure (Rhetorical Function), not just what it is.
  
  Output JSON:
  {
    "structures": [
      { 
        "pattern": "String (Abstract structure, e.g., 'Not only... but also...')", 
        "type": "String (Grammar Term)", 
        "explanation": "String (Functional analysis in Chinese)" 
      }
    ]
  }
  `;

  try {
    const [coreRes, vocabRes, grammarRes] = await Promise.all([
      fetchFromAI([{ role: "system", content: corePrompt }, { role: "user", content: safeText }], settings, true),
      fetchFromAI([{ role: "system", content: vocabPrompt }, { role: "user", content: safeText }], settings, true),
      fetchFromAI([{ role: "system", content: grammarPrompt }, { role: "user", content: safeText }], settings, true)
    ]);

    const core = JSON.parse(coreRes);
    const vocab = JSON.parse(vocabRes);
    const grammar = JSON.parse(grammarRes);

    return {
      summary: core.summary,
      level: core.level,
      vocabulary: vocab.vocabulary || [],
      structures: grammar.structures || []
    };

  } catch (error) {
    console.warn("Parallel Analysis Partial Failure, retrying safely...", error);
    throw error;
  }
};

export const generateReadingComprehensionQuiz = async (text, settings, questionCount = 5) => {
  if (!settings.apiKey) throw new Error("Missing API Key");

  const safeText = text.length > 9000 ? text.substring(0, 9000) + "..." : text;
  const count = Math.min(10, Math.max(3, Number(questionCount) || 5));

  const systemPrompt = `
  Role: Experienced English reading comprehension examiner.
  Task: Create a comprehension quiz based ONLY on the provided article.

  Requirements:
  1. Generate ${count} multiple-choice questions.
  2. Each question must test understanding (main idea, detail, inference, tone, logic).
  3. Each question must have exactly 4 options (A/B/C/D).
  4. Mark one correct answer and provide a brief Chinese explanation.
  5. Do not ask vocabulary-only questions unless context-based meaning is required.

  Output JSON only:
  {
    "title": "Reading Comprehension Quiz",
    "questions": [
      {
        "id": 1,
        "question": "String",
        "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
        "answer": "A",
        "explanation": "String (Chinese)"
      }
    ]
  }
  `;

  const jsonStr = await fetchFromAI([
    { role: "system", content: systemPrompt },
    { role: "user", content: safeText }
  ], settings, true);

  try {
    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed.questions)) parsed.questions = [];
    return parsed;
  } catch (e) {
    const extracted = extractJSON(jsonStr);
    if (!extracted) throw new Error("AI returned invalid quiz format");
    if (!Array.isArray(extracted.questions)) extracted.questions = [];
    return extracted;
  }
};

export const generateListeningQuizFromTranscript = async (transcript, settings, questionCount = 6) => {
  if (!settings.apiKey) throw new Error("Missing API Key");
  const safeText = String(transcript || '').trim();
  if (!safeText) throw new Error("Transcript is empty");
  const count = Math.min(10, Math.max(3, Number(questionCount) || 6));

  const prompt = `
Role: Senior English listening test designer (CET/IELTS style).
Task: Generate listening comprehension questions from transcript only.
Requirements:
1. Create ${count} multiple-choice questions (A/B/C/D).
2. Mix detail, inference, speaker attitude, intent, and logic.
3. Provide one correct answer and concise Chinese explanation.
4. Add an evidence quote from transcript for each question.
5. Return JSON only.

Schema:
{
  "title": "Listening Quiz",
  "questions": [
    {
      "id": 1,
      "question": "string",
      "options": ["A. ...","B. ...","C. ...","D. ..."],
      "answer": "A",
      "explanation": "string",
      "evidence_sentence": "string"
    }
  ]
}
`;

  const jsonStr = await fetchFromAI([
    { role: "system", content: prompt },
    { role: "user", content: safeText.slice(0, 12000) }
  ], settings, true);

  const parsed = extractJSON(jsonStr);
  if (!parsed) throw new Error("AI returned invalid listening quiz format");
  if (!Array.isArray(parsed.questions)) parsed.questions = [];
  return parsed;
};

const extractJSON = (str) => {
  try {
    const match = str.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : null;
  } catch (e) {
    return null;
  }
};

const toOptionText = (opt = "") => String(opt).replace(/^[A-D][.):\-\s]+/i, "").trim();
const MATCHING_LABELS = "ABCDEFGHIJKL".split("");
const isStrictCETMatchingMode = (mode = "") => String(mode || "").toLowerCase() === "cet_strict_matching";
const toAnswerKey = (value = "A") => {
  const key = String(value || "").trim().toUpperCase().charAt(0);
  return MATCHING_LABELS.includes(key) ? key : "A";
};

const splitParagraphs = (text = "") => {
  return String(text)
    .split(/\n{1,}/)
    .map((x) => x.trim())
    .filter(Boolean);
};

const toParagraphLabel = (index) => String.fromCharCode(65 + index);

const chunkTextIntoParagraphs = (text = "", targetCount = 12) => {
  const raw = String(text || "").trim();
  if (!raw) return [];

  // ✅ Fix: If the text already has natural paragraph breaks, use them first.
  // Only fall back to character-length chunking when there are too few paragraphs.
  const existingParagraphs = raw.split(/\n{1,}/).map((x) => x.trim()).filter(Boolean);
  if (existingParagraphs.length >= Math.max(2, Math.floor(targetCount * 0.6))) {
    // Sufficient natural paragraphs — merge short ones if way too many, then return.
    if (existingParagraphs.length <= targetCount + 4) return existingParagraphs.slice(0, targetCount + 4);
    // Too many tiny paragraphs — merge into targetCount buckets but keep newline logic.
    const buckets = [];
    const bSize = Math.ceil(existingParagraphs.length / targetCount);
    for (let i = 0; i < existingParagraphs.length; i += bSize) {
      buckets.push(existingParagraphs.slice(i, i + bSize).join(' '));
    }
    return buckets.filter(Boolean);
  }

  // Fallback: character-length splitting (for single-block text with no newlines)
  const clean = raw.replace(/\n+/g, " ").replace(/\s+/g, " ");
  if (targetCount <= 1) return [clean];

  const segments = [];
  const total = clean.length;
  let cursor = 0;
  const avg = Math.ceil(total / targetCount);

  for (let i = 0; i < targetCount && cursor < total; i += 1) {
    let end = Math.min(total, cursor + avg);
    if (end < total) {
      const probe = clean.slice(end, Math.min(total, end + 120));
      // eslint-disable-next-line no-useless-escape
      const punctAt = probe.search(/[\.!?;。！？；]/);
      if (punctAt >= 0) end += punctAt + 1;
    }
    const slice = clean.slice(cursor, end).trim();
    if (slice) segments.push(slice);
    cursor = end;
  }

  if (cursor < total) {
    const rest = clean.slice(cursor).trim();
    if (rest) segments.push(rest);
  }

  return segments.filter(Boolean);
};

const STRUCTURE_TYPES = [
  "background",
  "claim",
  "argument",
  "evidence",
  "example",
  "counterargument",
  "transition",
  "conclusion",
  "other"
];

const normalizeStructureType = (value = "") => {
  const key = String(value || "").trim().toLowerCase().replace(/\s+/g, "_");
  if (STRUCTURE_TYPES.includes(key)) return key;

  if (/background|intro|context|背景|引入|开头/.test(key)) return "background";
  if (/claim|thesis|main_point|core|观点|主张|立场/.test(key)) return "claim";
  if (/argument|reason|point|论证|理由|分论点/.test(key)) return "argument";
  if (/evidence|data|proof|证据|数据|事实/.test(key)) return "evidence";
  if (/example|case|实例|例子/.test(key)) return "example";
  if (/counter|rebuttal|concession|refute|反驳|让步/.test(key)) return "counterargument";
  if (/transition|bridge|过渡|衔接/.test(key)) return "transition";
  if (/conclusion|ending|summary|结论|总结|收束/.test(key)) return "conclusion";
  return "other";
};

const buildHeuristicStructure = (passage = "") => {
  const paragraphs = splitParagraphs(passage);
  const total = paragraphs.length;
  if (!total) {
    return {
      overview: "",
      segments: []
    };
  }

  if (total === 1) {
    return {
      overview: "文章较短，建议按“核心观点 + 证据句”方式阅读。",
      segments: [
        {
          id: "seg-1",
          type: "claim",
          label: "核心观点",
          startParagraph: 1,
          endParagraph: 1,
          summary: "单段文本，观点与论证集中在同一段。"
        }
      ]
    };
  }

  const segments = [];
  const introEnd = Math.max(1, Math.min(total - 1, Math.round(total * 0.2)));
  const outroStart = Math.max(introEnd + 1, total);
  const bodyStart = introEnd + 1;
  const bodyEnd = total - 1;

  segments.push({
    id: `seg-${segments.length + 1}`,
    type: "background",
    label: "背景引入",
    startParagraph: 1,
    endParagraph: introEnd,
    summary: "介绍问题背景、主题或讨论范围。"
  });

  if (bodyStart <= bodyEnd) {
    const bodyCount = bodyEnd - bodyStart + 1;
    if (bodyCount >= 4) {
      const split = bodyStart + Math.floor(bodyCount / 2) - 1;
      segments.push({
        id: `seg-${segments.length + 1}`,
        type: "argument",
        label: "观点论证（一）",
        startParagraph: bodyStart,
        endParagraph: split,
        summary: "展开第一组论证逻辑。"
      });
      segments.push({
        id: `seg-${segments.length + 1}`,
        type: "argument",
        label: "观点论证（二）",
        startParagraph: split + 1,
        endParagraph: bodyEnd,
        summary: "展开第二组论证或补充说明。"
      });
    } else {
      segments.push({
        id: `seg-${segments.length + 1}`,
        type: "argument",
        label: "核心论证",
        startParagraph: bodyStart,
        endParagraph: bodyEnd,
        summary: "围绕核心观点给出主要论据。"
      });
    }
  }

  segments.push({
    id: `seg-${segments.length + 1}`,
    type: "conclusion",
    label: "结论收束",
    startParagraph: outroStart,
    endParagraph: total,
    summary: "总结立场并给出结论或行动建议。"
  });

  return {
    overview: "已按段落结构自动分块（启发式），可点击卡片快速定位到对应段落区间。",
    segments
  };
};

const normalizePassageStructure = (raw = {}, passage = "") => {
  const paragraphs = splitParagraphs(passage);
  const paragraphCount = paragraphs.length;
  if (!paragraphCount) {
    return {
      overview: "",
      segments: []
    };
  }

  const sourceSegments = Array.isArray(raw?.segments)
    ? raw.segments
    : Array.isArray(raw?.structure_segments)
      ? raw.structure_segments
      : [];

  const normalized = sourceSegments.map((item, idx) => {
    const start = Math.max(1, Math.min(paragraphCount, Number(item?.start_paragraph ?? item?.startParagraph ?? item?.start ?? 1) || 1));
    const endRaw = Number(item?.end_paragraph ?? item?.endParagraph ?? item?.end ?? start) || start;
    const end = Math.max(start, Math.min(paragraphCount, endRaw));
    return {
      id: String(item?.id || `seg-${idx + 1}`),
      type: normalizeStructureType(item?.type || item?.category || item?.tag || item?.label),
      label: String(item?.label || item?.title || "").trim(),
      startParagraph: start,
      endParagraph: end,
      summary: String(item?.summary || item?.description || item?.reason || "").trim()
    };
  }).filter((seg) => seg.endParagraph >= seg.startParagraph);

  if (!normalized.length) {
    return buildHeuristicStructure(passage);
  }

  normalized.sort((a, b) => a.startParagraph - b.startParagraph || a.endParagraph - b.endParagraph);
  const overview = String(raw?.overview || raw?.summary || raw?.comment || "").trim()
    || "已按文章语义自动分块，可点击任意分区快速定位。";

  return { overview, segments: normalized };
};

const normalizeReadingDrill = (raw = {}, fallbackPassage = "", fallbackMode = "mixed") => {
  const sourcePassage = String(fallbackPassage || "").trim();
  const aiPassage = String(raw.passage || raw.content || "").trim();
  // Prefer AI passage only when it is meaningful; otherwise fallback to user-provided full article.
  const passage = (!aiPassage || (sourcePassage && aiPassage.length < Math.min(200, Math.floor(sourcePassage.length * 0.2))))
    ? sourcePassage
    : aiPassage;
  const mode = String(raw.mode || fallbackMode || "mixed").toLowerCase();
  const strictCET = isStrictCETMatchingMode(mode);

  const questions = (Array.isArray(raw.questions) ? raw.questions : []).map((q, idx) => {
    const opts = Array.isArray(q.options) ? q.options : Array.isArray(q.choices) ? q.choices : [];
    const normalizedOptions = opts.map(toOptionText).filter(Boolean).slice(0, 4);
    while (normalizedOptions.length < 4) {
      normalizedOptions.push(`选项 ${String.fromCharCode(65 + normalizedOptions.length)}`);
    }
    return {
      id: Number(q.id ?? idx + 1) || idx + 1,
      question: String(q.question || q.text || "").trim(),
      options: normalizedOptions,
      answer: toAnswerKey(q.answer || q.correct || "A"),
      explanation: String(q.explanation || q.reason || "").trim(),
      evidence_sentence: String(q.evidence_sentence || q.evidence || "").trim(),
      rebuttal_hint: String(q.rebuttal_hint || "").trim()
    };
  }).filter((q) => q.question);

  const rawMatching = raw.matching || {};
  let paragraphs = Array.isArray(rawMatching.paragraphs) ? rawMatching.paragraphs : [];
  if (!paragraphs.length && passage) {
    const split = splitParagraphs(passage);
    if (strictCET) {
      const strictParagraphs = split.length >= 10 ? split.slice(0, 12) : chunkTextIntoParagraphs(passage, 12);
      paragraphs = strictParagraphs.slice(0, 12).map((text, idx) => ({ label: MATCHING_LABELS[idx], text }));
    } else {
      paragraphs = split.slice(0, 8).map((text, idx) => ({ label: toParagraphLabel(idx), text }));
    }
  }
  paragraphs = paragraphs.map((p, idx) => ({
    label: strictCET ? MATCHING_LABELS[idx] : toAnswerKey(p.label || toParagraphLabel(idx)),
    text: String(p.text || p.content || "").trim()
  })).filter((p) => p.text);
  if (strictCET) {
    paragraphs = paragraphs.slice(0, 12).map((p, idx) => ({
      ...p,
      label: MATCHING_LABELS[idx]
    }));
  }

  let statements = (Array.isArray(rawMatching.statements) ? rawMatching.statements : []).map((s, idx) => ({
    id: Number(s.id ?? (strictCET ? 36 + idx : idx + 1)) || (strictCET ? 36 + idx : idx + 1),
    text: String(s.text || s.statement || "").trim(),
    answer: toAnswerKey(s.answer || s.correct || "A"),
    explanation: String(s.explanation || "").trim(),
    evidence_sentence: String(s.evidence_sentence || s.evidence || "").trim()
  })).filter((s) => s.text);
  if (strictCET) {
    statements = statements
      .sort((a, b) => a.id - b.id)
      .slice(0, 10)
      .map((s, idx) => ({
        ...s,
        id: Number(s.id) || (36 + idx)
      }));
  }

  return {
    title: String(raw.title || "阅读理解对抗训练").trim(),
    mode,
    passage,
    questions,
    matching: {
      paragraphs,
      statements
    },
    structureAnalysis: null // analyzed on-demand by user, not auto-generated
  };
};

export const generateAdversarialReadingDrill = async (payload, settings, options = {}) => {
  if (!settings.apiKey) throw new Error("Missing API Key");

  const mode = String(payload?.mode || "mixed").toLowerCase();
  const strictCET = isStrictCETMatchingMode(mode);
  const sourceType = payload?.sourceType || "article";
  const passage = String(payload?.passage || "").trim().slice(0, 14000);
  const questionText = String(payload?.questionText || "").trim().slice(0, 12000);
  const questionCount = strictCET ? 10 : Math.max(3, Math.min(10, Number(payload?.questionCount) || 6));

  if (!passage) throw new Error("Missing passage text");
  if (sourceType === "import" && !questionText) throw new Error("Missing imported questions");

  const systemPrompt = `
Role: Senior CET/IELTS reading examiner and debate coach.
Task: Build a high-quality adversarial reading drill.

Hard constraints:
1. Use ONLY user-provided content. Never invent unrelated facts.
2. For each MCQ, provide one correct answer + concise Chinese explanation + evidence sentence (quote from passage).
3. For paragraph matching, provide paragraph labels and statement-to-paragraph mapping with evidence sentence.
4. Questions must test inference, logic, author attitude, detail, and structure (not pure vocabulary).
5. Return strict JSON only.
6. CRITICAL: In the "passage" field, you MUST preserve ALL original paragraph breaks using \\n\\n between paragraphs. Do NOT merge paragraphs into a single block of text.
${strictCET ? `7. STRICT CET-6 Section B mode:
- mode must be "cet_strict_matching".
- questions must be [] (no MCQ in this mode).
- matching.paragraphs should be 10-12 paragraphs labeled sequentially A-L.
- matching.statements should be exactly 10 items with ids 36-45.
- answers must be one of A-L and can repeat.
- preserve user text semantics; do not invent outside facts.` : ""}

Output schema:
{
  "title": "string",
  "mode": "reading|matching|mixed|cet_strict_matching",
  "passage": "string (MUST use \\n\\n between paragraphs, never merge them)",
  "questions": [
    {
      "id": 1,
      "question": "string",
      "options": ["string","string","string","string"],
      "answer": "A|B|C|D",
      "explanation": "string",
      "evidence_sentence": "string",
      "rebuttal_hint": "string"
    }
  ],
  "matching": {
    "paragraphs": [{ "label": "A", "text": "string" }],
    "statements": [
      {
        "id": 1,
        "text": "string",
        "answer": "A|B|C|D|E|F|G|H|I|J|K|L",
        "explanation": "string",
        "evidence_sentence": "string"
      }
    ]
  }
}
`;

  const userPrompt = sourceType === "import"
    ? `
Mode: ${mode}
Requested MCQ count: ${questionCount}
Passage:
${passage}

Imported Question Material (must preserve semantics):
${questionText}
`
    : `
Mode: ${mode}
Requested MCQ count: ${questionCount}
Passage:
${passage}

Please generate exam-grade reading drill with evidence anchors.
`;

  const jsonStr = await fetchFromAI([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ], settings, true, 3, options);

  const parsed = extractJSON(jsonStr);
  if (!parsed) throw new Error("AI returned invalid adversarial drill format");
  return normalizeReadingDrill(parsed, passage, mode);
};

export const importReadingExamBatch = async (payload, settings, options = {}) => {
  if (!settings.apiKey) throw new Error("Missing API Key");

  const rawText = String(payload?.text || "").trim().slice(0, 60000);
  const mode = String(payload?.mode || "mixed").toLowerCase();
  const maxItems = Math.max(1, Math.min(12, Number(payload?.maxItems) || 8));
  if (rawText.length < 80) throw new Error("Batch import text is too short");

  const systemPrompt = `
Role: Senior reading exam digitizer for VerbaPath.
Task: Split a large pasted document into multiple independent reading exam papers.

The user may paste many articles and their questions together. Identify boundaries, pair each article with its own questions, and convert them into normalized JSON.

Rules:
1. Use ONLY the user's pasted content. Do not invent new articles or unrelated questions.
2. Preserve article paragraph breaks with \\n\\n inside each "passage".
3. If a set contains MCQs, fill "questions" with options, answer, explanation, and evidence_sentence when available.
4. If a set contains paragraph matching, fill "matching.paragraphs" and "matching.statements".
5. If answers are not explicitly provided, infer conservatively from the passage only. If uncertain, still choose the best answer and mention uncertainty in explanation.
6. Return up to ${maxItems} complete papers. Drop fragments that do not contain both a passage and at least one valid question.
7. Return strict JSON only.

Output schema:
{
  "items": [
    {
      "title": "string",
      "mode": "reading|matching|mixed|cet_strict_matching",
      "passage": "string",
      "questionText": "optional original question block",
      "questions": [
        {
          "id": 1,
          "question": "string",
          "options": ["string","string","string","string"],
          "answer": "A|B|C|D",
          "explanation": "string",
          "evidence_sentence": "string",
          "rebuttal_hint": "string"
        }
      ],
      "matching": {
        "paragraphs": [{ "label": "A", "text": "string" }],
        "statements": [
          {
            "id": 1,
            "text": "string",
            "answer": "A|B|C|D|E|F|G|H|I|J|K|L",
            "explanation": "string",
            "evidence_sentence": "string"
          }
        ]
      }
    }
  ]
}
`.trim();

  const jsonStr = await fetchFromAI([
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `Preferred mode: ${mode}\n\nBulk pasted reading exam material:\n${rawText}`
    }
  ], settings, true, 3, options);

  const parsed = extractJSON(jsonStr);
  const rawItems = Array.isArray(parsed?.items)
    ? parsed.items
    : Array.isArray(parsed?.papers)
      ? parsed.papers
      : [];

  const items = rawItems
    .slice(0, maxItems)
    .map((item) => {
      const fallbackPassage = String(item?.passage || item?.article || item?.content || "").trim();
      const normalized = normalizeReadingDrill(item, fallbackPassage, item?.mode || mode);
      return {
        ...normalized,
        questionText: String(item?.questionText || item?.questionsText || item?.question_block || "").trim()
      };
    })
    .filter((item) => {
      const totalQuestions = (item.questions?.length || 0) + (item.matching?.statements?.length || 0);
      return item.passage?.trim() && totalQuestions > 0;
    });

  if (!items.length) throw new Error("AI did not find complete article-question sets");
  return { items };
};

export const analyzePassageStructure = async (passage, settings, options = {}) => {
  const safePassage = String(passage || "").trim().slice(0, 14000);
  if (!safePassage) {
    return { overview: "", segments: [] };
  }

  // Fallback for internal testing/no-key mode.
  if (!settings?.apiKey) {
    return buildHeuristicStructure(safePassage);
  }

  const systemPrompt = `
Role: Reading structure analyst for CET/IELTS/TOEFL preparation.
Task: Segment the passage into rhetorical zones and paragraph ranges.

Rules:
1. Work strictly from passage content; do not invent information.
2. Segment by paragraph index (1-based).
3. Segments should be concise and practical for exam reading.
4. Keep 3-8 segments max.
5. Return JSON only.

Schema:
{
  "overview": "string",
  "segments": [
    {
      "type": "background|claim|argument|evidence|example|counterargument|transition|conclusion|other",
      "label": "string",
      "start_paragraph": 1,
      "end_paragraph": 2,
      "summary": "string"
    }
  ]
}
`;

  try {
    const jsonStr = await fetchFromAI([
      { role: "system", content: systemPrompt },
      { role: "user", content: safePassage }
    ], settings, true, 2, options);
    const parsed = extractJSON(jsonStr);
    if (!parsed) return buildHeuristicStructure(safePassage);
    return normalizePassageStructure(parsed, safePassage);
  } catch (e) {
    console.warn("analyzePassageStructure fallback to heuristic:", e);
    return buildHeuristicStructure(safePassage);
  }
};

export const debateReadingEvidence = async (payload, settings, options = {}) => {
  if (!settings.apiKey) throw new Error("Missing API Key");

  const history = Array.isArray(payload?.history) ? payload.history.slice(-8) : [];
  const question = payload?.question || {};
  const questionType = question.type || "mcq";
  const userMessage = String(payload?.userMessage || "").trim();
  const userAnswer = String(payload?.userAnswer || "").trim().toUpperCase();

  if (!userMessage) throw new Error("Missing user debate message");

  const systemPrompt = `
Role: Strict reading examiner in evidence-duel mode.
Language: Chinese.
Behavior rules:
1. Challenge weak reasoning. Require direct evidence sentence from passage.
2. Do NOT provide full chain-of-thought. Give concise examiner feedback.
3. If student reasoning is strong, acknowledge it and ask one deeper follow-up.
4. Keep reply practical: verdict + why + next evidence challenge.
5. Return JSON only.

Output schema:
{
  "assistant_reply": "string",
  "verdict": "supported|partial|unsupported",
  "required_evidence": "string",
  "hint": "string"
}
`;

  const contextPrompt = `
Passage:
${String(payload?.passage || "").slice(0, 12000)}

Question type: ${questionType}
Question:
${question.question || question.text || ""}

Options:
${Array.isArray(question.options) ? question.options.map((x, idx) => `${String.fromCharCode(65 + idx)}. ${x}`).join("\n") : "N/A"}

Official answer: ${question.answer || payload?.officialAnswer || ""}
Official evidence: ${question.evidence_sentence || payload?.officialEvidence || ""}
Student selected answer: ${userAnswer || "未作答"}
`;

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "system", content: contextPrompt },
    ...history
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && m.content)
      .map((m) => ({ role: m.role, content: String(m.content).slice(0, 1200) })),
    { role: "user", content: userMessage.slice(0, 1800) }
  ];

  const jsonStr = await fetchFromAI(messages, settings, true, 2, options);
  const parsed = extractJSON(jsonStr);
  if (!parsed) throw new Error("AI returned invalid debate format");

  return {
    assistant_reply: String(parsed.assistant_reply || "").trim() || "请给出你引用的原句，我再继续反驳。",
    verdict: ["supported", "partial", "unsupported"].includes(parsed.verdict) ? parsed.verdict : "partial",
    required_evidence: String(parsed.required_evidence || "").trim(),
    hint: String(parsed.hint || "").trim()
  };
};

/**
 * AI Writing Engine V2 (Exam-focused)
 */
const normalizeRubricScores = (rubric = {}, fallbackScore = 0) => {
  const rawTask = Number(rubric.task_response ?? rubric.task ?? rubric.content);
  const rawCoherence = Number(rubric.coherence ?? rubric.organization);
  const rawLexical = Number(rubric.lexical_resource ?? rubric.lexical ?? rubric.vocab);
  const rawGrammar = Number(rubric.grammar_range_accuracy ?? rubric.grammar);
  const defaultPart = Math.max(0, Math.min(5, Math.round((fallbackScore || 0) / 3)));
  return {
    task_response: Number.isFinite(rawTask) ? rawTask : defaultPart,
    coherence: Number.isFinite(rawCoherence) ? rawCoherence : defaultPart,
    lexical_resource: Number.isFinite(rawLexical) ? rawLexical : defaultPart,
    grammar_range_accuracy: Number.isFinite(rawGrammar) ? rawGrammar : defaultPart
  };
};

const normalizeIssues = (issues = []) => {
  return (Array.isArray(issues) ? issues : []).map((issue) => {
    const sentenceIndex = Number(issue.sentence_index ?? issue.sentenceIndex ?? issue.paragraph_index ?? issue.paragraphIndex ?? 0);
    return {
      type: issue.type || 'Language',
      severity: (issue.severity || 'improvement').toLowerCase(),
      original: issue.original || '',
      fixed: issue.fixed || issue.suggestion || '',
      reason: issue.reason || issue.explanation || '',
      sentence_index: Number.isFinite(sentenceIndex) ? Math.max(0, sentenceIndex) : 0,
      paragraph_index: Number(issue.paragraph_index ?? issue.paragraphIndex ?? 0) || 0
    };
  }).filter((issue) => issue.original || issue.fixed || issue.reason);
};

const normalizeParagraphFeedback = (rows = []) => {
  return (Array.isArray(rows) ? rows : []).map((row, idx) => ({
    paragraph_index: Number(row.paragraph_index ?? row.paragraphIndex ?? idx) || idx,
    purpose: row.purpose || '',
    issue: row.issue || '',
    suggestion: row.suggestion || '',
    rewritten_paragraph: row.rewritten_paragraph || row.rewrite || ''
  }));
};

const normalizeImprovementPlan = (plan, tips = []) => {
  if (Array.isArray(plan) && plan.length > 0) {
    return plan.map((item, idx) => {
      if (typeof item === 'string') {
        return { id: idx + 1, title: `Action ${idx + 1}`, action: item };
      }
      return {
        id: Number(item.id) || idx + 1,
        title: item.title || `Action ${idx + 1}`,
        action: item.action || item.tip || '',
        example: item.example || ''
      };
    }).filter((item) => item.action);
  }
  return (Array.isArray(tips) ? tips : []).map((tip, idx) => ({
    id: idx + 1,
    title: `Action ${idx + 1}`,
    action: tip,
    example: ''
  }));
};

const scoreToLevel = (score) => {
  if (score >= 14) return 'Excellent';
  if (score >= 11) return 'Good';
  if (score >= 8) return 'Fair';
  if (score >= 5) return 'Poor';
  return 'Very Poor';
};

const normalizeWritingAnalysis = (raw = {}) => {
  const scoreTotal = Number(raw.score_total ?? raw.score ?? 0);
  const safeScore = Number.isFinite(scoreTotal) ? Math.max(0, Math.min(15, scoreTotal)) : 0;
  const rubricScores = normalizeRubricScores(raw.rubric_scores || raw.rubric || {}, safeScore);
  const level = raw.level || scoreToLevel(safeScore);
  const overallComment = raw.overall_comment || raw.comment || '';
  const rewrittenText = raw.rewritten_text || raw.corrected_text || '';
  const issues = normalizeIssues(raw.issues || []);
  const paragraphFeedback = normalizeParagraphFeedback(raw.paragraph_feedback || []);
  const improvementPlan = normalizeImprovementPlan(raw.improvement_plan, raw.improvement_tips);
  const tips = improvementPlan.map((x) => x.action).filter(Boolean);
  const vocabAnalysis = Array.isArray(raw.vocabulary_analysis) ? raw.vocabulary_analysis : [];
  const vocabularyInjection = Array.isArray(raw.vocabulary_injection) ? raw.vocabulary_injection : [];

  return {
    score_total: safeScore,
    rubric_scores: rubricScores,
    level,
    overall_comment: overallComment,
    rewritten_text: rewrittenText,
    paragraph_feedback: paragraphFeedback,
    issues,
    improvement_plan: improvementPlan,
    knowledge_summary: raw.knowledge_summary || '',
    vocabulary_analysis: vocabAnalysis,
    vocabulary_injection: vocabularyInjection,

    // Legacy compatibility fields (V1 UI or old records)
    score: safeScore,
    comment: overallComment,
    corrected_text: rewrittenText,
    improvement_tips: tips
  };
};

export const generateWritingOutline = async (payload, settings, options = {}) => {
  if (!settings.apiKey) throw new Error("Missing API Key");
  const signal = options?.signal;
  const examType = payload?.examType || 'CET-6';
  const genre = payload?.genre || 'Argumentative';
  const targetScore = payload?.targetScore || 12;
  const wordTarget = payload?.wordTarget || 200;
  const topic = (payload?.prompt || payload?.topic || '').trim();
  const sourceText = (typeof payload === 'string' ? payload : topic).substring(0, 1200);

  if (!sourceText) throw new Error('Missing writing prompt');

  const systemPrompt = `
Role: Senior exam-writing coach.
Task: Generate a practical writing outline for exam prep.
Context:
- Exam: ${examType}
- Genre: ${genre}
- Target score: ${targetScore}/15
- Target words: ${wordTarget}

Return STRICT JSON:
{
  "thesis": "string",
  "stance": "for|against|balanced",
  "paragraphs": [
    {
      "paragraph_index": 0,
      "purpose": "string",
      "topic_sentence": "string",
      "keywords": ["string"],
      "evidence_hint": "string",
      "concession": false
    }
  ],
  "conclusion": "string",
  "checklist": ["string", "string", "string"]
}
Rules:
- Keep it specific and exam-ready.
- At least 4 paragraphs (intro/body/body/conclusion).
- Include one concession paragraph when appropriate.
- topic_sentence must be the sentence only; do not prefix it with "Paragraph 1:", "P1:", numbering, or section labels.
- No markdown, no extra text.
`;

  const jsonStr = await fetchFromAI([
    { role: "system", content: systemPrompt },
    { role: "user", content: sourceText }
  ], settings, true, 3, { signal });

  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    parsed = extractJSON(jsonStr);
  }
  if (!parsed) throw new Error("Outline parsing failed");

  const paragraphs = Array.isArray(parsed.paragraphs) ? parsed.paragraphs : [];
  return {
    thesis: parsed.thesis || '',
    stance: parsed.stance || 'balanced',
    conclusion: parsed.conclusion || '',
    paragraphs: paragraphs.map((p, idx) => ({
      paragraph_index: Number(p.paragraph_index ?? idx) || idx,
      purpose: p.purpose || '',
      topic_sentence: stripOutlineParagraphLabel(p.topic_sentence || ''),
      keywords: Array.isArray(p.keywords) ? p.keywords : [],
      evidence_hint: p.evidence_hint || '',
      concession: Boolean(p.concession)
    })),
    checklist: Array.isArray(parsed.checklist) ? parsed.checklist : []
  };
};

export const assembleWritingMaterials = async (payload, settings, options = {}) => {
  if (!settings.apiKey) throw new Error("Missing API Key");
  const signal = options?.signal;
  const materials = Array.isArray(payload?.materials) ? payload.materials : [];
  const compactMaterials = materials.slice(0, 30).map((item, idx) => ({
    id: item.id || `material_${idx + 1}`,
    title: String(item.title || '').slice(0, 120),
    category: item.category || 'argument',
    topic: String(item.topic || '').slice(0, 120),
    content: String(item.content || '').slice(0, 700),
    rewrite: String(item.rewrite || '').slice(0, 700),
    usage: String(item.usage || '').slice(0, 360),
    caution: String(item.caution || '').slice(0, 360),
    sourceTerm: String(item.sourceTerm || '').slice(0, 120),
    targetTerm: String(item.targetTerm || '').slice(0, 120),
    replaceReason: String(item.replaceReason || '').slice(0, 240)
  }));

  const systemPrompt = `
Role: Exam writing coach and material editor.
Task: Choose and adapt the user's writing materials for the current draft.

Return STRICT JSON:
{
  "title": "short Chinese title",
  "assembled_text": "ready-to-use English paragraph or sentence block",
  "usage_plan": ["Chinese note about where/how to use it"],
  "selected_material_ids": ["material id"],
  "warnings": ["Chinese caution if any"]
}

Rules:
- Do not simply concatenate materials.
- Select only materials that fit the prompt, outline, and current draft.
- Rewrite them into coherent exam English that can be inserted as one block.
- Preserve the user's stance and avoid off-topic claims.
- Keep assembled_text concise: 80-180 English words unless the draft clearly needs less.
- If vocabulary replacements are included, weave them naturally into sentences.
- No markdown, no extra text.
`.trim();

  const userPayload = {
    examContext: payload?.examContext || {},
    outline: payload?.outline || null,
    currentDraft: String(payload?.content || '').slice(0, 3000),
    insertTargetHint: payload?.insertTargetHint || '',
    materials: compactMaterials
  };

  const jsonStr = await fetchFromAI([
    { role: "system", content: systemPrompt },
    { role: "user", content: JSON.stringify(userPayload, null, 2) }
  ], settings, true, 3, { signal });

  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    parsed = extractJSON(jsonStr);
  }
  if (!parsed) throw new Error("Material assembly parsing failed");

  const assembledText = String(parsed.assembled_text || parsed.text || '').trim();
  if (!assembledText) throw new Error("AI returned empty assembled material");

  return {
    title: String(parsed.title || 'AI 组装素材').trim(),
    assembledText,
    usagePlan: Array.isArray(parsed.usage_plan) ? parsed.usage_plan.map(String).filter(Boolean).slice(0, 5) : [],
    selectedMaterialIds: Array.isArray(parsed.selected_material_ids) ? parsed.selected_material_ids.map(String).filter(Boolean).slice(0, 12) : [],
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map(String).filter(Boolean).slice(0, 5) : []
  };
};

export const analyzeWriting = async (text, settings, analysisMode = 'polish', options = {}) => {
  if (!settings.apiKey) throw new Error("Missing API Key");
  const safeText = (text || '').substring(0, 5000);
  if (!safeText.trim()) throw new Error("Empty writing content");

  const level = settings.writingLevel || "CET-6";
  const mode = analysisMode || settings.analysisMode || "polish";
  const examContext = options?.examContext || {};
  const outline = options?.outline || null;
  const signal = options?.signal;

  const modePrompts = {
    grammar: "STRICT GRAMMAR: fix only grammar/spelling/punctuation with minimal style change.",
    polish: "BALANCED POLISH: improve clarity, flow, and vocabulary while keeping original intent.",
    academic: "ACADEMIC UPGRADE: formal tone, stronger cohesion, advanced syntax and lexical precision."
  };
  const currentModeInstruction = modePrompts[mode] || modePrompts.polish;
  const customInstruction = settings.writingPrompt || "Strict but constructive examiner mode.";

  const systemPrompt = `
Role: Professional English writing examiner and coach.
Task: Analyze and improve the student's essay for exam prep.
Target level: ${level}
Mode: ${currentModeInstruction}
Custom instruction: ${customInstruction}

Exam context:
- exam_type: ${examContext.examType || 'CET-6'}
- genre: ${examContext.genre || 'Argumentative'}
- target_score: ${examContext.targetScore || 12}/15
- word_target: ${examContext.wordTarget || 200}
- prompt: ${examContext.prompt || ''}

Outline (optional):
${outline ? JSON.stringify(outline).substring(0, 1200) : 'null'}

Return STRICT JSON with this schema:
{
  "score_total": 0-15 number,
  "level": "Excellent|Good|Fair|Poor|Very Poor",
  "rubric_scores": {
    "task_response": 0-5 number,
    "coherence": 0-5 number,
    "lexical_resource": 0-5 number,
    "grammar_range_accuracy": 0-5 number
  },
  "overall_comment": "string",
  "rewritten_text": "full improved essay string",
  "paragraph_feedback": [
    {
      "paragraph_index": 0,
      "purpose": "string",
      "issue": "string",
      "suggestion": "string",
      "rewritten_paragraph": "string"
    }
  ],
  "issues": [
    {
      "type": "Grammar|Coherence|Lexical|Style|Task",
      "severity": "critical|improvement|style",
      "sentence_index": 0,
      "paragraph_index": 0,
      "original": "exact quote from original",
      "fixed": "suggested fix",
      "reason": "Chinese explanation"
    }
  ],
  "improvement_plan": [
    { "id": 1, "title": "string", "action": "string", "example": "string" }
  ],
  "vocabulary_injection": [
    { "word": "string", "why": "string", "where": "string" }
  ],
  "knowledge_summary": "markdown string"
}

Rules:
- sentence_index is required for every issue.
- Keep feedback balanced across the whole essay.
- Write reasons, overall_comment, paragraph suggestions, and improvement_plan actions in clear Chinese.
- Make every improvement_plan action directly executable by the student, not a generic principle.
- When rewriting, preserve the student's stance and do not invent unsupported facts.
- Do not return markdown wrappers or extra text.
`;

  const jsonStr = await fetchFromAI([
    { role: "system", content: systemPrompt },
    { role: "user", content: `Here is my essay:\n\n${safeText}` }
  ], settings, true, 3, { signal });

  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    parsed = extractJSON(jsonStr);
  }
  if (!parsed) throw new Error("AI Parsing Failed: " + jsonStr.substring(0, 120));
  return normalizeWritingAnalysis(parsed);
};

export const checkConnection = async (settings) => {
  const { apiKey, apiBaseUrl } = settings;
  const cleanUrl = apiBaseUrl.replace(/\/+$/, '');

  const response = await fetch(`${cleanUrl}/models`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) throw new Error("Connection failed");
  return true;
};

export const checkAudioConnection = async (settings) => {
  const apiKey = settings.audioApiKey || settings.apiKey;
  const apiBaseUrl = settings.audioApiBaseUrl || settings.apiBaseUrl;
  const cleanUrl = apiBaseUrl.replace(/\/+$/, '');

  const response = await fetch(`${cleanUrl}/models`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) throw new Error("Audio API Connection failed");
  return true;
};

export const sendChatMessage = async (messages, settings) => {
  if (!settings.apiKey) throw new Error("Missing API Key");

  // Check if messages already have a system prompt (e.g. from CoachView)
  const hasSystem = messages.some(m => m.role === 'system');
  const finalMessages = hasSystem ? messages : [
    { role: "system", content: settings.systemPrompt || "You are a helpful English tutor." },
    ...messages
  ];

  // Use fetchFromAI with jsonRequired=false for free-form chat
  const content = await fetchFromAI(finalMessages, settings, false);

  return content;
};

export const analyzeImagesForChat = async (images, settings, instruction = '') => {
  if (!settings.apiKey) throw new Error("Missing API Key");
  const imageUrls = (Array.isArray(images) ? images : [images]).filter(Boolean).slice(0, 4);
  if (!imageUrls.length) return "";

  const { apiKey, apiBaseUrl, modelName } = settings;
  const cleanUrl = apiBaseUrl.replace(/\/+$/, '');
  const visionPrompt = instruction || `
You are a vision assistant for English learning.
Task:
1. Extract all readable text from the image(s) as accurately as possible.
2. Summarize key information.
3. If this is exam content, keep question numbers and options structure.
Output in Chinese with sections:
- OCR文本
- 内容摘要
`;

  const content = [
    { type: "text", text: visionPrompt.trim() },
    ...imageUrls.map((url) => ({ type: "image_url", image_url: { url } }))
  ];

  const response = await fetch(`${cleanUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: modelName || "gpt-4o-mini",
      messages: [{ role: "user", content }],
      stream: false,
      temperature: 0.2
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Image analysis failed: ${response.status} - ${err.substring(0, 200)}`);
  }

  const data = await response.json();
  const raw = data?.choices?.[0]?.message?.content;
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) return raw.map((x) => (typeof x === 'string' ? x : x?.text || '')).join('\n').trim();
  return '';
};

export const streamChatMessage = async (messages, settings, onDelta) => {
  if (!settings.apiKey) throw new Error("Missing API Key");
  const { apiKey, apiBaseUrl, modelName } = settings;
  const cleanUrl = apiBaseUrl.replace(/\/+$/, '');

  // Check if messages already have a system prompt
  const hasSystem = messages.some(m => m.role === 'system');
  const finalMessages = hasSystem ? messages : [
    { role: "system", content: settings.systemPrompt || "You are a helpful English tutor." },
    ...messages
  ];

  try {
    const response = await fetch(`${cleanUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: modelName || "gpt-3.5-turbo",
        messages: finalMessages,
        stream: true,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`API Error: ${response.status} - ${err}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let done = false;

    while (!done) {
      const { value, done: readerDone } = await reader.read();
      done = readerDone;
      if (value) {
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ') && line !== 'data: [DONE]') {
            try {
              const data = JSON.parse(line.slice(6));
              const content = data.choices[0]?.delta?.content || '';
              if (content) onDelta(content);
            } catch (e) {
              console.warn("Stream parse error", e);
            }
          }
        }
      }
    }
  } catch (error) {
    console.error("Stream Error:", error);
    throw error;
  }
};

const getContentTypeParam = (contentType, names) => {
  const parts = contentType.split(';').slice(1);
  for (const part of parts) {
    const [rawKey, rawValue] = part.split('=');
    const key = rawKey?.trim().toLowerCase();
    const value = rawValue?.trim().replace(/^"|"$/g, '');
    if (key && value && names.includes(key)) {
      return value;
    }
  }
  return '';
};

const toPositiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const wrapPcmAsWav = async (pcmBlob, contentType, settings = {}) => {
  const sampleRate = toPositiveInteger(
    settings.ttsPcmSampleRate
      || getContentTypeParam(contentType, ['rate', 'sample-rate', 'sample_rate', 'samplerate']),
    24000
  );
  const channels = toPositiveInteger(
    settings.ttsPcmChannels || getContentTypeParam(contentType, ['channels', 'channel']),
    1
  );
  const bitsPerSample = toPositiveInteger(
    settings.ttsPcmBitDepth || getContentTypeParam(contentType, ['bits', 'bit-depth', 'bit_depth']),
    16
  );

  if (![8, 16, 24, 32].includes(bitsPerSample)) {
    throw new Error(`TTS returned PCM audio with unsupported bit depth: ${bitsPerSample}`);
  }

  const pcmBuffer = await pcmBlob.arrayBuffer();
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const writeAscii = (offset, value) => {
    for (let i = 0; i < value.length; i += 1) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };

  const blockAlign = channels * bitsPerSample / 8;
  const byteRate = sampleRate * blockAlign;

  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + pcmBuffer.byteLength, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeAscii(36, 'data');
  view.setUint32(40, pcmBuffer.byteLength, true);

  return new Blob([header, pcmBuffer], { type: 'audio/wav' });
};

export const transcribeAudio = async (file, settings) => {
  // Use specific audio settings if available, otherwise fallback to main settings
  const apiKey = settings.audioApiKey || settings.apiKey;
  const apiBaseUrl = settings.audioApiBaseUrl || settings.apiBaseUrl;
  const modelName = settings.audioModelName || (apiBaseUrl.includes("siliconflow") ? "FunAudioLLM/SenseVoiceSmall" : "whisper-1");

  if (!apiKey) throw new Error("Missing Audio API Key (or Main Key)");

  const cleanUrl = apiBaseUrl.replace(/\/+$/, '');

  const formData = new FormData();
  // IMPORTANT: Filename with extension is often required by Whisper APIs (OpenAI/SiliconFlow) to detect format
  formData.append("file", file, "recording.webm");
  formData.append("model", modelName);

  try {
    const response = await fetch(`${cleanUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        // Do NOT set Content-Type here, let browser set it with boundary
      },
      body: formData
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Whisper Error: ${response.status} - ${err}`);
    }

    const data = await response.json();
    return data.text;
  } catch (error) {
    console.error("Transcription Error:", error);
    throw error;
  }
};

export const synthesizeSpeech = async (text, settings) => {
  const apiKey = settings.ttsApiKey || settings.audioApiKey || settings.apiKey;
  const apiUrl = settings.ttsApiBaseUrl || settings.audioApiBaseUrl || settings.apiBaseUrl;
  const cleanUrl = apiUrl.replace(/\/+$/, '');
  const speechEndpoint = /\/audio\/speech$/i.test(cleanUrl) ? cleanUrl : `${cleanUrl}/audio/speech`;

  const modelName = settings.ttsModelName || "tts-1";
  const voice = settings.ttsVoice || "alloy";
  const responseFormat = settings.ttsResponseFormat;

  if (!apiKey) throw new Error("Missing AI/TTS API Key");

  try {
    const speechRequest = {
      model: modelName,
      input: text,
      voice: voice
    };

    if (responseFormat) {
      speechRequest.response_format = responseFormat;
    }

    const response = await fetch(speechEndpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(speechRequest)
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`TTS Error: ${response.status} - ${err}`);
    }

    // Return Blob for playback
    const audioBlob = await response.blob();
    const contentType = response.headers.get('content-type') || audioBlob.type || '';
    const normalizedType = contentType.toLowerCase();
    const isAudioResponse = normalizedType.startsWith('audio/');
    const isGenericBinary = normalizedType.includes('application/octet-stream');

    if (!audioBlob.size) {
      throw new Error("TTS returned an empty audio file");
    }

    if (normalizedType.startsWith('audio/pcm')) {
      return wrapPcmAsWav(audioBlob, contentType, settings);
    }

    const headerBytes = new Uint8Array(await audioBlob.slice(0, 16).arrayBuffer());
    const headerHex = Array.from(headerBytes).map((byte) => byte.toString(16).padStart(2, '0')).join(' ');
    const headerText = Array.from(headerBytes).map((byte) => (byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : '.')).join('');
    const detectedMime =
      // MP3: ID3 tag or MPEG frame sync
      (headerBytes[0] === 0x49 && headerBytes[1] === 0x44 && headerBytes[2] === 0x33)
      || (headerBytes[0] === 0xff && (headerBytes[1] & 0xe0) === 0xe0)
        ? 'audio/mpeg'
      // WAV
        : (headerBytes[0] === 0x52 && headerBytes[1] === 0x49 && headerBytes[2] === 0x46 && headerBytes[3] === 0x46)
          ? 'audio/wav'
      // OGG
          : (headerBytes[0] === 0x4f && headerBytes[1] === 0x67 && headerBytes[2] === 0x67 && headerBytes[3] === 0x53)
            ? 'audio/ogg'
      // WebM / Matroska
            : (headerBytes[0] === 0x1a && headerBytes[1] === 0x45 && headerBytes[2] === 0xdf && headerBytes[3] === 0xa3)
              ? 'audio/webm'
      // MP4 / M4A
              : (headerBytes[4] === 0x66 && headerBytes[5] === 0x74 && headerBytes[6] === 0x79 && headerBytes[7] === 0x70)
                ? 'audio/mp4'
                : '';

    if ((!isAudioResponse && !isGenericBinary) || !detectedMime) {
      const preview = await audioBlob.text().catch(() => '');
      const detail = preview.trim()
        ? preview.slice(0, 200)
        : `bytes=${headerHex} text=${headerText}`;
      throw new Error(`TTS returned unsupported audio content (${contentType || 'unknown'}): ${detail}`);
    }

    if (!audioBlob.type || audioBlob.type === "application/octet-stream") {
      return new Blob([audioBlob], { type: detectedMime });
    }

    return audioBlob;

  } catch (error) {
    console.error("TTS Error:", error);
    throw error;
  }
};

export const checkTTSConnection = async (settings) => {
  const apiKey = settings.ttsApiKey || settings.audioApiKey || settings.apiKey;
  const apiBaseUrl = settings.ttsApiBaseUrl || settings.audioApiBaseUrl || settings.apiBaseUrl;

  // Simple "Hello" test
  try {
    await synthesizeSpeech("Hello", settings);
    return true;
  } catch (e) {
    throw new Error("TTS Test Failed: " + e.message);
  }
};
// ... existing exports

export const generateDeepWordAnalysis = async (word, context, settings) => {
  if (!settings.apiKey) throw new Error("Missing API Key");

  const prompt = `
  Role: Expert English Teacher.
  Task: Create a "Deep Dive Vocabulary Note" for the word: "${word}".
  Context: The word appears in this sentence: "${context || 'No specific context'}".

  Output Format: Markdown (Strictly follow this structure):

  ## ${word}
  ### 1. 词性与词源
  *   **词性：** [e.g. Noun/Verb]
  *   **词源：** [Brief etymology]

  ### 2. 核心释义
  1.  **[Meaning 1]：** [Definition]
  2.  **[Meaning 2]：** [Definition]

  ### 3. 常见搭配与用法
  *   **[Collocation 1]**：[CN Meaning]
  *   **[Collocation 2]**：[CN Meaning]
      > [Example sentence]

  ### 4. 同/近义词辨析
  | 单词 | 侧重点 | 例句 |
  | :--- | :--- | :--- |
  | **${word}** | ... | ... |
  | **[Synonym]** | ... | ... |

  ### 5. 例句展示
  1.  [Sentence 1] ([CN Translation])
  2.  [Sentence 2] ([CN Translation])

  **记忆要点：** [Mnemonic or key takeaway]

  ### 6. 考试应用与备考策略
  - **考察频率：** [High/Medium]
  - **写作/翻译提分点：** [Tips]
  `;

  try {
    const content = await fetchFromAI([
      { role: "system", content: "You are a helpful English tutor. Output Markdown." },
      { role: "user", content: prompt }
    ], settings, false); // false = not strict JSON, we want Markdown

    return content;
  } catch (error) {
    console.error("Deep Word Analysis Error:", error);
    return null;
  }
};

export const normalizeNoteForKnowledgeLinking = async (noteInput, instruction = '', settings) => {
  if (!settings?.apiKey) throw new Error("Missing API Key");
  const title = String(noteInput?.title || '').trim() || 'Untitled Note';
  const content = String(noteInput?.content || '');
  if (!content.trim()) throw new Error("Empty note content");

  const prompt = `
你是语脉 VerbaPath 的知识结构化助手。请把下面这篇笔记整理为“人类可读 + 可同步”的 Markdown。

要求：
1) 保留原有主要内容，不要删掉核心信息。
2) 在文末新增一个“知识关联区（可同步）”，仅使用这三种指令：
   - @素材[category]{title=...}
   - @翻译例句{scene=...}
   - @替换词
3) 每个 @素材 需要包含：
   content:
   #usage
   #caution
4) 每个 @翻译例句 需要包含：
   EN:
   CN:
5) 每个 @替换词 需要包含：
   source:
   target:
   reason:
6) 不要输出代码块包裹（不要 \`\`\`markdown）。
7) 如果内容不适合翻译例句，可少给或不给 @翻译例句；不要为了凑数硬造。

用户额外要求：
${String(instruction || '').trim() || '无'}

笔记标题：
${title}

笔记正文：
${content}
`;

  const result = await fetchFromAI([
    { role: "system", content: "You are a precise educational content normalizer. Output Markdown only." },
    { role: "user", content: prompt }
  ], settings, false);

  return String(result || '').trim();
};

export const chatNoteKnowledgeLinking = async (
  noteInput,
  conversation = [],
  userMessage = '',
  settings
) => {
  if (!settings?.apiKey) throw new Error("Missing API Key");

  const title = String(noteInput?.title || '').trim() || 'Untitled Note';
  const content = String(noteInput?.content || '').trim();
  if (!content) throw new Error("Empty note content");

  const history = Array.isArray(conversation)
    ? conversation
      .slice(-8)
      .map((item) => ({
        role: item?.role === 'assistant' ? 'assistant' : 'user',
        content: String(item?.content || '').trim()
      }))
      .filter((item) => item.content)
    : [];

  const systemPrompt = `
你是语脉 VerbaPath 的“笔记接入教练”。
目标：和用户多轮对话，帮用户从当前笔记中挑选“适合接入”的片段，而不是整篇全量接入。

规则：
1) 回答要先给简短建议（assistantReply）。
2) 按用户意图返回候选接入项 candidates（可以为 0~6 条）。
3) 每条候选项必须包含可直接落库的 directive 文本，只允许以下三种格式之一：
   - @素材[category]{title=...}
     content: ...
     #usage ...
     #caution ...
   - @翻译例句{scene=...}
     EN: ...
     CN: ...
     #keyword ...
   - @替换词
     source: ...
     target: ...
     reason: ...
     example: ...
4) 不要输出代码块，不要输出解释性前缀。
5) 如果用户只想要一部分内容，就只返回那一部分候选。

仅返回 JSON：
{
  "assistantReply": "string",
  "candidates": [
    {
      "id": "string",
      "type": "material|translation|vocab",
      "title": "string",
      "reason": "string",
      "directive": "string"
    }
  ]
}
`;

  const userPayload = `
当前笔记标题：
${title}

当前笔记内容：
${content}

用户本轮要求：
${String(userMessage || '').trim() || '请先给我可接入候选项'}
`;

  const messageList = [
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: userPayload }
  ];

  const jsonStr = await fetchFromAI(messageList, settings, true);
  const parsed = extractJSON(jsonStr);
  if (!parsed) {
    throw new Error("AI returned invalid linking chat JSON");
  }

  const assistantReply = String(parsed?.assistantReply || '').trim();
  const candidates = Array.isArray(parsed?.candidates)
    ? parsed.candidates
      .map((item, idx) => ({
        id: String(item?.id || `cand-${Date.now()}-${idx}`),
        type: String(item?.type || '').trim().toLowerCase(),
        title: String(item?.title || '').trim(),
        reason: String(item?.reason || '').trim(),
        directive: String(item?.directive || '').trim()
      }))
      .filter((item) => /^@(素材|翻译例句|替换词)/.test(item.directive))
    : [];

  return {
    assistantReply: assistantReply || '我先给你整理了几条可接入候选，你可以按需勾选。',
    candidates
  };
};

// 🚀 Smart Coach 2.0: Advanced Planner
export const generatePlanInsight = async (history, userGoal = null, recentLogs = [], settings) => {
  if (!settings.apiKey) return null;

  // Summarize recent activity for AI
  const activitySummary = recentLogs.length > 0
    ? recentLogs.map(l => `${l.date}: ${l.type} (${l.count})`).join(', ')
    : "No recent activity recorded.";

  const goalContext = userGoal
    ? `User Goal: ${userGoal.examName} on ${userGoal.examDate}. Current Level: ${userGoal.currentLevel || 'Unknown'}.`
    : "User has not set a specific exam goal yet.";

  const prompt = `
  Role: Elite AI Study Coach.
  Context: Analyze the user's study history and goals to generate a daily tactical plan.
  ${goalContext}
  Recent Activity: ${activitySummary}
  
  Task:
  1. Analyze Weaknesses based on history scores (Writing/Reading/Vocab).
  2. Generate 5-dimension radar data (0-100) for: Reading, Listening, Writing, Vocabulary, Persistence.
  3. Create 3 specific "Daily Quests" for today.
  
  Output Schema (JSON):
  {
     "insight": "String (1-2 sentences motivating advice in Chinese)",
     "radar": [
         { "subject": "Reading", "A": 65, "fullMark": 100 },
         { "subject": "Writing", "A": 40, "fullMark": 100 },
         { "subject": "Listening", "A": 70, "fullMark": 100 },
         { "subject": "Vocabulary", "A": 85, "fullMark": 100 },
         { "subject": "Persistence", "A": 90, "fullMark": 100 }
     ],
     "daily_quests": [
        { "id": 1, "title": "Review 20 Flashcards", "type": "vocab", "link": "flashcards", "xp": 50 },
        { "id": 2, "title": "Complete 1 Reading Drill", "type": "reading", "link": "exam", "xp": 100 },
        { "id": 3, "title": "Translate 1 Sentence", "type": "writing", "link": "writer", "xp": 80 }
     ],
     "schedule_status": "String (e.g., '45 Days to Exam - Phase: Foundation Building' or 'Self-paced Mode')"
  }
  
  Important: Return valid JSON only. Language: Chinese (Simplified).
  `;

  try {
    const jsonStr = await fetchFromAI([
      { role: "system", content: prompt },
      { role: "user", content: `History: ${JSON.stringify(history.slice(0, 5))}` }
    ], settings, true);

    if (typeof jsonStr !== 'string' || !jsonStr.trim()) {
      throw new Error("Empty AI response.");
    }

    const trimmed = jsonStr.trim();
    const jsonBody = trimmed.match(/\{[\s\S]*\}/)?.[0] || trimmed;
    const parsed = JSON.parse(jsonBody);

    // Normalize Data Structure just in case AI mocks up
    if (!parsed.radar) parsed.radar = [];
    if (!parsed.daily_quests) parsed.daily_quests = [];

    return parsed;

  } catch (error) {
    console.error("Plan AI Error:", error);
    // Fallback Data
    return {
      insight: "AI 暂时无法连接，但请坚持复习！保持每天进步一点点。",
      radar: [
        { subject: '阅读', A: 50, fullMark: 100 },
        { subject: '写作', A: 50, fullMark: 100 },
        { subject: '听力', A: 50, fullMark: 100 },
        { subject: '词汇', A: 50, fullMark: 100 },
        { subject: '毅力', A: 50, fullMark: 100 }
      ],
      daily_quests: [
        { id: 1, title: "复习单词卡片", type: "vocab", link: "flashcards", xp: 50 }
      ],
      schedule_status: "离线模式"
    };
  }
};

export const generateLearningFlowInsight = async (profile, draftPlan, settings) => {
  if (!settings?.apiKey) return null;

  const prompt = `
Role: VerbaPath AI learning-flow coach.
Task: Polish a one-line English learning route for today.

Rules:
1. Do not add or remove nodes.
2. Keep each node practical and action-oriented.
3. Language: Simplified Chinese.
4. Return valid JSON only.

Output Schema:
{
  "title": "string",
  "summary": "string, one sentence",
  "nodes": [
    { "id": "same id from input", "type": "same type", "title": "string", "description": "string" }
  ]
}
`;

  try {
    const jsonStr = await fetchFromAI([
      { role: 'system', content: prompt },
      {
        role: 'user',
        content: JSON.stringify({
          profile: {
            sourceDate: profile?.yesterdayKey,
            dueFlashcards: profile?.dueCards?.length || 0,
            newFlashcardsYesterday: profile?.newCardsYesterday?.length || 0,
            readingYesterday: profile?.readingYesterday?.length || 0,
            translationYesterday: profile?.translationYesterday?.length || 0,
            writingYesterday: profile?.writingYesterday?.length || 0,
            notesYesterday: profile?.notesYesterday?.length || 0
          },
          draftPlan
        })
      }
    ], settings, true);

    const trimmed = String(jsonStr || '').trim();
    const jsonBody = trimmed.match(/\{[\s\S]*\}/)?.[0] || trimmed;
    const parsed = JSON.parse(jsonBody);
    if (!parsed || !Array.isArray(parsed.nodes)) return null;
    return parsed;
  } catch (error) {
    console.error('Learning Flow AI Error:', error);
    return null;
  }
};

export const extractVocabulary = async (text, settings) => {
  if (!settings.apiKey) throw new Error("Missing API Key");

  // Split input into words/phrases (comma or newline separated)
  const rawItems = text.split(/[,，\n\r]+/).map((s) => s.trim()).filter((s) => s.length > 0);

  // If it looks like a word list (more than 5 comma/newline separated items)
  const isWordList = rawItems.length > 5;

  if (isWordList) {
    console.log(`Detected word list with ${rawItems.length} items, processing in batches...`);
    return await extractVocabularyBatched(rawItems, settings);
  }

  // For articles/short texts, use single request
  return await extractVocabularySingle(text, settings);
};

// Process word list in batches
const extractVocabularyBatched = async (words, settings) => {
  const BATCH_SIZE = 40; // 40 words per batch to avoid API limits
  const batches = [];

  for (let i = 0; i < words.length; i += BATCH_SIZE) {
    batches.push(words.slice(i, i + BATCH_SIZE));
  }

  console.log(`Processing ${batches.length} batches of ${BATCH_SIZE} words each...`);

  const allResults = [];

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    console.log(`Processing batch ${i + 1}/${batches.length}: ${batch.length} words`);

    const prompt = `
    Role: Expert language teacher.
    Task: For EACH word in the list below, return one vocabulary item.

    WORDS TO PROCESS (${batch.length} words):
    ${batch.join(', ')}

    Output: JSON array with exactly ${batch.length} items.
    [
      { "word": "abandon", "phonetic": "əˈbændən", "meaning": "放弃；遗弃" },
      ...
    ]

    Rules:
    - One item per word, no skipping.
    - "phonetic" should be IPA-like string without slash; empty string is allowed if unavailable.
    - "meaning" must be concise Chinese definition only.
    - Keep word in original form where possible.
    - Output ONLY the JSON array.
    `;

    try {
      const jsonStr = await fetchFromAI([
        { role: "system", content: prompt },
        { role: "user", content: "Generate vocabulary now." }
      ], settings, true);

      const parsed = parseVocabResponse(jsonStr);
      allResults.push(...parsed);
      console.log(`Batch ${i + 1} returned ${parsed.length} items`);
    } catch (e) {
      console.error(`Batch ${i + 1} failed:`, e.message);
      // Continue with other batches even if one fails
    }

    // Small delay between batches to avoid rate limiting
    if (i < batches.length - 1) {
      await delay(500);
    }
  }

  console.log(`Total extracted: ${allResults.length} vocabulary items`);
  return allResults;
};

// Single request for articles or short texts
const extractVocabularySingle = async (text, settings) => {
  const countTarget = settings.vocabLimit
    ? `up to ${settings.vocabLimit} words`
    : "all vocabulary words";

  const prompt = `
  Role: Expert language teacher.
  Task: Extract vocabulary from the text.

  Output format: JSON array
  [
    { "word": "English Word", "phonetic": "IPA", "meaning": "中文释义" }
  ]

  Requirements:
  - Extract ${countTarget}.
  - "meaning": concise Chinese definition only.
  - "phonetic": IPA-like pronunciation if available, otherwise empty string.
  - Output ONLY the JSON array.
  `;

  const safeText = text.substring(0, 8000);
  const jsonStr = await fetchFromAI([
    { role: "system", content: prompt },
    { role: "user", content: safeText }
  ], settings, true);

  return parseVocabResponse(jsonStr);
};

const normalizeVocabItem = (item = {}) => {
  const normalizeText = (value) => (value === null || value === undefined ? '' : String(value).trim());
  const stripSurroundingSlash = (value) => normalizeText(value).replace(/^\/+|\/+$/g, '');

  const extractWordFromFront = (frontText) => {
    const line = normalizeText(frontText).split('\n')[0] || '';
    return line.replace(/\/[^/]+\/.*/, '').trim();
  };

  const extractPhoneticFromFront = (frontText) => {
    const match = normalizeText(frontText).match(/\/([^/]+)\//);
    return match ? stripSurroundingSlash(match[1]) : '';
  };

  const rawFront = normalizeText(item.front);
  const rawBack = normalizeText(item.back);
  const word = normalizeText(item.word || item.term || item.vocab || extractWordFromFront(rawFront));
  const phonetic = stripSurroundingSlash(item.phonetic || item.pronunciation || item.ipa || extractPhoneticFromFront(rawFront));
  const meaning = normalizeText(item.meaning || item.definition || item.chinese_meaning || item.cn || rawBack);

  return {
    ...item,
    word,
    phonetic,
    meaning,
    // Keep backward compatibility for callers that still read front/back.
    front: rawFront || word,
    back: rawBack || meaning
  };
};

const normalizeVocabArray = (items) => {
  if (!Array.isArray(items)) return [];
  return items
    .map(normalizeVocabItem)
    .filter((item) => item.word || item.meaning || item.front || item.back);
};

// Helper: Parse AI response into normalized vocabulary array
const parseVocabResponse = (jsonStr) => {
  console.log("AI Raw Response (first 300 chars):", jsonStr.substring(0, 300));

  // Clean up common JSON issues
  const cleaned = jsonStr
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/gi, '')
    .trim();

  try {
    const parsed = JSON.parse(cleaned);

    if (Array.isArray(parsed)) return normalizeVocabArray(parsed);
    if (parsed.flashcards && Array.isArray(parsed.flashcards)) return normalizeVocabArray(parsed.flashcards);
    if (parsed.vocabulary && Array.isArray(parsed.vocabulary)) return normalizeVocabArray(parsed.vocabulary);
    if (parsed.cards && Array.isArray(parsed.cards)) return normalizeVocabArray(parsed.cards);
    if (parsed.words && Array.isArray(parsed.words)) return normalizeVocabArray(parsed.words);
    if (parsed.data && Array.isArray(parsed.data)) return normalizeVocabArray(parsed.data);

    const values = Object.values(parsed);
    const arr = values.find((value) => Array.isArray(value));
    if (arr) return normalizeVocabArray(arr);

    if (parsed.front || parsed.back || parsed.word || parsed.meaning) {
      return normalizeVocabArray([parsed]);
    }

    throw new Error("Invalid array format");
  } catch (e) {
    // Regex fallback
    const match = jsonStr.match(/\[\s*\{[\s\S]*?\}\s*(?:,\s*\{[\s\S]*?\}\s*)*\]/);
    if (match) {
      try {
        return normalizeVocabArray(JSON.parse(match[0]));
      } catch (parseErr) {
        console.error("Regex fallback failed:", parseErr);
      }
    }
    throw new Error(`Vocabulary JSON parse failed: ${e.message}`);
  }
};

const TRANSLATION_SCENARIO_PROFILES = [
  { key: 'email', label: '邮件沟通', scene: '你需要写一封英文邮件，语气要礼貌且信息完整。' },
  { key: 'dialogue', label: '日常对话', scene: '你在真实对话中表达观点，需要自然口语和清晰逻辑。' },
  { key: 'classroom', label: '课堂讨论', scene: '你在课堂中回答问题，表达要学术但不僵硬。' },
  { key: 'workplace', label: '职场协作', scene: '你在团队协作场景里汇报进展并协调分工。' },
  { key: 'travel', label: '旅行沟通', scene: '你在旅行场景中处理行程变动和沟通需求。' },
  { key: 'social', label: '社交媒体', scene: '你在社交平台发帖或回复评论，语气要准确得体。' }
];

const normalizeTranslationDifficulty = (value = 'medium') => {
  const raw = String(value || '').toLowerCase();
  if (raw === 'easy' || raw === 'hard') return raw;
  return 'medium';
};

const normalizeScenarioMode = (value = 'auto') => {
  const raw = String(value || '').toLowerCase();
  return raw === 'lock' ? 'lock' : 'auto';
};

const normalizeScenarioLock = (value = '') => String(value || '').trim().toLowerCase();

const resolveScenarioProfile = (mode = 'auto', lock = '', seed = Date.now()) => {
  const normalizedMode = normalizeScenarioMode(mode);
  const normalizedLock = normalizeScenarioLock(lock);
  if (normalizedMode === 'lock' && normalizedLock) {
    const locked = TRANSLATION_SCENARIO_PROFILES.find((x) => x.key === normalizedLock || x.label === lock);
    if (locked) return locked;
  }
  if (!TRANSLATION_SCENARIO_PROFILES.length) {
    return { key: 'generic', label: '综合场景', scene: '请根据上下文完成自然、准确的表达。' };
  }
  const step = Math.floor(Number(seed || Date.now()) / (1000 * 60 * 60 * 24));
  const idx = Math.abs(step) % TRANSLATION_SCENARIO_PROFILES.length;
  return TRANSLATION_SCENARIO_PROFILES[idx];
};

const getDifficultyProfile = (difficulty = 'medium') => {
  if (difficulty === 'easy') {
    return {
      languageComplexity: 'basic',
      expressiveFreedom: 'guided',
      registerControl: 'light',
      compressionDemand: 'low'
    };
  }
  if (difficulty === 'hard') {
    return {
      languageComplexity: 'advanced',
      expressiveFreedom: 'open',
      registerControl: 'strict',
      compressionDemand: 'high'
    };
  }
  return {
    languageComplexity: 'intermediate',
    expressiveFreedom: 'semi_open',
    registerControl: 'moderate',
    compressionDemand: 'medium'
  };
};

const normalizeHintTierLines = (value, fallback = []) => {
  const lines = Array.isArray(value)
    ? value
    : String(value || '')
      .split('\n')
      .map((x) => x.trim())
      .filter(Boolean);
  return lines.length ? lines : fallback;
};

const buildFallbackHintTiers = (targetWords = []) => ({
  l1: [
    '先确认信息点是否齐全：人物、动作、因果和结果。',
    '先译出主干，再补充修饰，避免逐词直译。'
  ],
  l2: [
    '至少使用一个明确的逻辑连接词（however/therefore/meanwhile 等）。',
    '检查时态和主谓一致，先保真再润色。'
  ],
  l3: [
    targetWords.length
      ? `尝试自然嵌入目标词中的 1-2 个：${targetWords.slice(0, 2).join(', ')}。`
      : '将句子压缩为更地道的表达，避免重复结构。',
    '最后通读一遍，确认语气与场景一致。'
  ]
});

const normalizeHintTiers = (hintTiers, targetWords = []) => {
  const fallback = buildFallbackHintTiers(targetWords);
  return {
    l1: normalizeHintTierLines(hintTiers?.l1, fallback.l1),
    l2: normalizeHintTierLines(hintTiers?.l2, fallback.l2),
    l3: normalizeHintTierLines(hintTiers?.l3, fallback.l3)
  };
};
const pickRandomItems = (items = [], count = 1) => {
  const pool = Array.isArray(items) ? [...items] : [];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.max(0, count));
};

const normalizeTargetWord = (item) => {
  const raw = String(item?.word || item?.front || item?.term || '').trim();
  if (!raw) return '';
  return raw
    .split('\n')[0]
    .replace(/^\/+|\/+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

const parseJsonObjectLoose = (raw = '') => {
  const source = String(raw || '').trim();
  if (!source) return null;
  try {
    return JSON.parse(source);
  } catch (_) {
    // continue
  }
  const cleaned = source
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/gi, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch (_) {
    // continue
  }
  return extractJSON(cleaned);
};

const normalizeTaskItem = (task, fallbackType, fallbackId, fallbackScenario, fallbackTargets) => ({
  id: String(task?.id || fallbackId),
  type: task?.type === 'main' ? 'main' : fallbackType,
  chinese: String(task?.chinese || task?.source || '').trim(),
  hint: String(task?.hint || '').trim(),
  scenario: String(task?.scenario || fallbackScenario || '').trim(),
  targetWords: Array.isArray(task?.targetWords) && task.targetWords.length
    ? task.targetWords.map((x) => String(x || '').trim()).filter(Boolean)
    : [...fallbackTargets],
  scaffold: task?.scaffold || null
});

const buildFallbackChallenge = ({ difficulty, mode, targetWords, requiredMinHit, scenarioProfile }) => {
  const safeScenario = scenarioProfile || resolveScenarioProfile('auto', '', Date.now());
  const scenario = safeScenario.label || '综合场景';
  const warmupCount = difficulty === 'easy' ? 1 : 2;
  const warmups = Array.from({ length: warmupCount }).map((_, idx) => ({
    id: `warmup-${idx + 1}`,
    type: 'warmup',
    chinese: idx === 0
      ? '请翻译：虽然计划有变，但我们仍按时完成了关键任务。'
      : '请翻译：如果资源有限，我们先处理最关键的问题并持续复盘。',
    hint: '保持句法清晰，避免逐词直译。',
    scenario,
    targetWords: targetWords.slice(0, Math.max(2, requiredMinHit))
  }));
  return {
    challengeId: `challenge-${Date.now()}`,
    difficulty,
    mode,
    warmups,
    mainTask: {
      id: 'main-task',
      type: 'main',
      chinese: '你需要做一次英文进度汇报：我们曾担心延期会影响交付，但重新分工后关键节点提前完成。接下来将持续跟踪风险并优化协作流程。',
      hint: '主任务建议使用 2-3 个复合句，体现因果与转折。',
      scenario,
      targetWords
    },
    requiredMinHit,
    targetWords,
    progression: {
      warmupGoal: '热身题训练核心表达动作与语气控制。',
      bridge: '将热身中的连接逻辑迁移到主任务。',
      mainGoal: '在完整情境中输出自然、准确且结构清晰的译文。'
    },
    hintTiers: buildFallbackHintTiers(targetWords),
    difficultyProfile: getDifficultyProfile(difficulty),
    scenarioProfile: {
      key: safeScenario.key,
      label: safeScenario.label,
      scene: safeScenario.scene
    }
  };
};

export const generateTranslationChallenge = async (vocabList, settings, options = {}) => {
  if (!settings.apiKey) throw new Error('Missing API Key');

  const difficulty = normalizeTranslationDifficulty(options?.difficulty);
  const mode = options?.mode === 'mixed' ? 'mixed' : 'mixed';
  const scenarioMode = normalizeScenarioMode(options?.scenarioMode);
  const scenarioLock = normalizeScenarioLock(options?.scenarioLock);
  const scenarioProfile = resolveScenarioProfile(scenarioMode, scenarioLock, Date.now());
  const difficultyProfile = getDifficultyProfile(difficulty);
  const weaknessFocus = Array.isArray(options?.weaknessFocus) ? options.weaknessFocus.filter(Boolean) : [];
  const linkedExamples = Array.from(
    new Set(
      (Array.isArray(options?.linkedExamples) ? options.linkedExamples : [])
        .map((x) => String(x || '').trim())
        .filter(Boolean)
    )
  ).slice(0, 8);

  const vocabWords = Array.from(
    new Set((Array.isArray(vocabList) ? vocabList : []).map(normalizeTargetWord).filter(Boolean))
  );
  const targetWords = pickRandomItems(vocabWords, 6);
  const warmupCount = difficulty === 'easy' ? 1 : 2;
  const requiredMinHit = Math.min(
    targetWords.length,
    difficulty === 'easy' ? 1 : difficulty === 'hard' ? 3 : 2
  );
  const mainScenario = scenarioProfile.label || '综合场景';

  const systemPrompt = `
Role: Advanced EN-CN translation trainer designer.
Task: Build a mixed translation challenge package for writing improvement.

Difficulty: ${difficulty}
Mode: ${mode}
Scenario mode: ${scenarioMode}
Scenario lock: ${scenarioLock || '(none)'}
Scenario profile: ${scenarioProfile.scene}
Warmup count: ${warmupCount}
Main scenario: ${mainScenario}
Target words: ${targetWords.length ? targetWords.join(', ') : 'none'}
Required minimum target word hits: ${requiredMinHit}
Weakness focus tags: ${weaknessFocus.length ? weaknessFocus.join(', ') : '(none)'}
Linked examples from deep notes: ${linkedExamples.length ? linkedExamples.join(' || ') : '(none)'}
Difficulty profile: ${JSON.stringify(difficultyProfile)}

Requirements:
1. Return a JSON object only, no markdown fences.
2. Create warmup items and one main task, all in Chinese source text.
3. Warmups should be short (15-32 Chinese characters), main task should be 60-130 Chinese characters.
4. Warmups must scaffold the same storyline as main task (same role, information chain, or tone control).
5. Ensure tasks are realistic and situational (email/dialogue/classroom/workplace/travel/social).
6. Keep hints concise and actionable. Provide 3 hint tiers (L1/L2/L3), from broad to specific.
7. targetWords in each item should be a subset of global targetWords and naturally embeddable.
8. Avoid stuffing target words unnaturally. If unnatural, rewrite task content first.
9. Return progression notes that explain warmup-main linkage.
10. If linked examples are provided, keep tone/register consistent with them, but do not copy them verbatim.

JSON Schema:
{
  "challengeId": "string",
  "difficulty": "${difficulty}",
  "mode": "mixed",
  "difficultyProfile": {
    "languageComplexity": "basic|intermediate|advanced",
    "expressiveFreedom": "guided|semi_open|open",
    "registerControl": "light|moderate|strict",
    "compressionDemand": "low|medium|high"
  },
  "scenarioProfile": {
    "key": "email|dialogue|classroom|workplace|travel|social",
    "label": "string",
    "scene": "string"
  },
  "progression": {
    "warmupGoal": "string",
    "bridge": "string",
    "mainGoal": "string"
  },
  "hintTiers": {
    "l1": ["string"],
    "l2": ["string"],
    "l3": ["string"]
  },
  "warmups": [
    {
      "id": "warmup-1",
      "type": "warmup",
      "chinese": "string",
      "hint": "string",
      "scenario": "string",
      "targetWords": ["string"],
      "scaffold": {
        "phrases": [{ "cn": "string", "en": "string" }],
        "cloze": "string with _____"
      }
    }
  ],
  "mainTask": {
    "id": "main-task",
    "type": "main",
    "chinese": "string",
    "hint": "string",
    "scenario": "string",
    "targetWords": ["string"],
    "scaffold": {
      "phrases": [{ "cn": "string", "en": "string" }],
      "cloze": "string with _____"
    }
  },
  "requiredMinHit": ${requiredMinHit},
  "targetWords": ["string"]
}
  `.trim();

  try {
    const userPrompt = linkedExamples.length
      ? `Generate challenge package now.\nReference examples:\n${linkedExamples.map((x, idx) => `${idx + 1}. ${x}`).join('\n')}`
      : 'Generate challenge package now.';
    const jsonStr = await fetchFromAI([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], settings, true);

    const parsed = parseJsonObjectLoose(jsonStr) || {};
    const normalizedTargets = Array.isArray(parsed?.targetWords) && parsed.targetWords.length
      ? parsed.targetWords.map((x) => String(x || '').trim()).filter(Boolean)
      : targetWords;
    const normalizedRequiredMinHit = Math.max(
      0,
      Math.min(
        normalizedTargets.length,
        Number(parsed?.requiredMinHit ?? requiredMinHit) || 0
      )
    );
    const warmupsRaw = Array.isArray(parsed?.warmups) ? parsed.warmups : [];
    let warmups = warmupsRaw.slice(0, warmupCount).map((task, idx) => normalizeTaskItem(
      task,
      'warmup',
      `warmup-${idx + 1}`,
      mainScenario,
      normalizedTargets
    )).filter((task) => Boolean(task.chinese));
    if (warmups.length < warmupCount) {
      const fallbackWarmups = buildFallbackChallenge({
        difficulty,
        mode,
        targetWords: normalizedTargets,
        requiredMinHit: normalizedRequiredMinHit,
        scenarioProfile
      }).warmups;
      warmups = [...warmups, ...fallbackWarmups.slice(0, warmupCount - warmups.length)];
    }
    const mainTask = normalizeTaskItem(
      parsed?.mainTask || {},
      'main',
      'main-task',
      mainScenario,
      normalizedTargets
    );

    if (!mainTask.chinese) {
      return buildFallbackChallenge({
        difficulty,
        mode,
        targetWords: normalizedTargets,
        requiredMinHit: normalizedRequiredMinHit,
        scenarioProfile
      });
    }

    const progression = {
      warmupGoal: String(parsed?.progression?.warmupGoal || '热身题用于建立表达动作与语气。').trim(),
      bridge: String(parsed?.progression?.bridge || '将热身中的表达动作迁移到主任务。').trim(),
      mainGoal: String(parsed?.progression?.mainGoal || '在真实情境中完成完整翻译输出。').trim()
    };
    const hintTiers = normalizeHintTiers(parsed?.hintTiers, normalizedTargets);
    const normalizedDifficultyProfile = {
      ...difficultyProfile,
      ...(parsed?.difficultyProfile || {})
    };
    const normalizedScenarioProfile = {
      key: String(parsed?.scenarioProfile?.key || scenarioProfile.key || '').trim(),
      label: String(parsed?.scenarioProfile?.label || scenarioProfile.label || mainScenario).trim(),
      scene: String(parsed?.scenarioProfile?.scene || scenarioProfile.scene || '').trim()
    };

    return {
      challengeId: String(parsed?.challengeId || `challenge-${Date.now()}`),
      difficulty,
      mode,
      warmups,
      mainTask,
      requiredMinHit: normalizedRequiredMinHit,
      targetWords: normalizedTargets,
      progression,
      hintTiers,
      difficultyProfile: normalizedDifficultyProfile,
      scenarioProfile: normalizedScenarioProfile
    };
  } catch (e) {
    console.error('generateTranslationChallenge error:', e);
    return buildFallbackChallenge({ difficulty, mode, targetWords, requiredMinHit, scenarioProfile });
  }
};
/**
 * Validates sub-components (phrases or cloze) in the scaffolded translation flow.
 */
export const checkTranslationComponents = async (type, context, userInput, settings) => {
  if (!settings.apiKey) throw new Error('Missing API Key');

  const { chinese, originalText } = context;

  const systemPrompt = `
Role: Specialized EN-CN translation validator.
Task: Validate if the user's input correctly translates the specific sub-component of a translation task.

Mode: ${type === 'phrases' ? 'Phrase Validation' : 'Cloze Completion Validation'}
Context Chinese: ${chinese}
Reference Target (of the specific component): ${originalText}

${type === 'phrases' 
  ? 'User is translating a specific phrase/chunk. Check for semantic correctness and collocation.' 
  : 'User is completing a cloze sentence. Check if the inserted part fits grammatically and semantically.'
}

Output JSON only:
{
  "isCorrect": boolean,
  "feedback": "string (Short, encouraging feedback in Chinese)",
  "suggestion": "string (Correct or better version)",
  "score": number (0-100)
}
  `.trim();

  const jsonStr = await fetchFromAI([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `Original Target Component: ${originalText}\nUser Input: ${userInput}` }
  ], settings, true);

  const parsed = parseJsonObjectLoose(jsonStr);
  return parsed || { isCorrect: false, feedback: "解析失败", suggestion: "", score: 0 };
};



export const gradeTranslation = async (challengeItem, userEnglish, settings, options = {}) => {
  if (!settings.apiKey) throw new Error('Missing API Key');

  const sourceChinese = String(challengeItem?.chinese || '').trim();
  const targetWords = Array.isArray(challengeItem?.targetWords)
    ? challengeItem.targetWords.map((x) => String(x || '').trim()).filter(Boolean)
    : [];
  const requiredMinHit = Math.max(0, Number(options?.requiredMinHit ?? challengeItem?.requiredMinHit ?? 0) || 0);
  const difficulty = normalizeTranslationDifficulty(options?.difficulty || challengeItem?.difficulty);
  const mode = options?.mode === 'mixed' ? 'mixed' : 'mixed';
  const round = String(options?.round || 'final').toLowerCase();

  const systemPrompt = `
Role: Professional EN translation grader for exam preparation.
Task: Grade one English translation answer against Chinese source.

Difficulty: ${difficulty}
Mode: ${mode}
Chinese source: ${sourceChinese || '(empty)'}
Target words: ${targetWords.join(', ') || '(none)'}
Required minimum target word hits: ${requiredMinHit}
Current round: ${round}

Output JSON only:
{
  "score100": 0,
  "score15": 0,
  "subscores": {
    "fidelity": 0,
    "naturalness": 0,
    "grammar": 0,
    "targetUsage": 0,
    "register": 0
  },
  "acceptance": true,
  "vocab_hit": [
    { "word": "string", "used": true, "correctly": true, "evidence": "string" }
  ],
  "issues": [
    {
      "type": "fidelity|naturalness|grammar|targetUsage|register|logic|omission",
      "severity": "critical|major|minor",
      "sentence_index": 0,
      "original": "string",
      "fixed": "string",
      "reason": "string"
    }
  ],
  "action_plan": ["string"],
  "overall_comment": "string",
  "improved_version": "string",
  "pass": true
}

Rubric:
- Weighted scoring: fidelity 35%, naturalness 25%, grammar 20%, targetUsage 10%, register 10%.
- Score should be strict but tolerant to multiple valid answers with semantic equivalence.
- Prefer semantic equivalence and register appropriateness over surface wording match.
- score15 is mapped from score100 but can be adjusted for severe errors.
- If target words miss requirement, apply score penalty but do not force pass=false automatically.
- Mark critical when meaning is wrong, key logic is broken, or important info omitted.
  `.trim();

  try {
    const jsonStr = await fetchFromAI([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: String(userEnglish || '').trim() }
    ], settings, true, 3, { signal: options?.signal });

    const parsed = parseJsonObjectLoose(jsonStr) || {};
    const subscores = parsed?.subscores || {};
    const normalizedSubscores = {
      fidelity: Number(subscores?.fidelity ?? subscores?.accuracy ?? 0),
      naturalness: Number(subscores?.naturalness ?? subscores?.fluency ?? 0),
      grammar: Number(subscores?.grammar ?? 0),
      targetUsage: Number(subscores?.targetUsage ?? subscores?.vocabulary ?? 0),
      register: Number(subscores?.register ?? subscores?.style ?? 0)
    };
    const weightedScore100 = (
      normalizedSubscores.fidelity * 0.35
      + normalizedSubscores.naturalness * 0.25
      + normalizedSubscores.grammar * 0.2
      + normalizedSubscores.targetUsage * 0.1
      + normalizedSubscores.register * 0.1
    );
    const score100 = Math.max(
      0,
      Math.min(100, Math.round(Number(parsed?.score100 ?? parsed?.score ?? weightedScore100) || 0))
    );
    const autoScore15 = Math.round((score100 / 100) * 15);
    const score15 = Math.max(0, Math.min(15, Math.round(Number(parsed?.score15 ?? autoScore15) || 0)));

    const fallbackHit = targetWords.map((word) => {
      const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`\\b${escaped}\\b`, 'i');
      const used = re.test(String(userEnglish || ''));
      return { word, used, correctly: used, evidence: used ? word : '' };
    });
    const vocab_hit = (Array.isArray(parsed?.vocab_hit) && parsed.vocab_hit.length
      ? parsed.vocab_hit
      : (Array.isArray(parsed?.vocab_check) ? parsed.vocab_check : fallbackHit)
    ).map((item) => ({
      word: String(item?.word || '').trim(),
      used: Boolean(item?.used),
      correctly: item?.correctly !== false,
      evidence: String(item?.evidence || '').trim()
    })).filter((item) => item.word);

    const hitCount = vocab_hit.filter((x) => x.used && x.correctly).length;
    const issues = (Array.isArray(parsed?.issues) ? parsed.issues : []).map((issue) => ({
      type: String(issue?.type || 'fidelity').trim(),
      severity: (() => {
        const raw = String(issue?.severity || 'major').trim().toLowerCase();
        if (raw === 'critical' || raw === 'major' || raw === 'minor') return raw;
        return 'major';
      })(),
      sentence_index: Math.max(0, Number(issue?.sentence_index || 0) || 0),
      original: String(issue?.original || '').trim(),
      fixed: String(issue?.fixed || '').trim(),
      reason: String(issue?.reason || '').trim()
    }));
    const vocabPenalty = requiredMinHit > hitCount ? Math.min(3, requiredMinHit - hitCount) : 0;
    const normalizedScore15 = Math.max(0, Math.min(15, score15 - vocabPenalty));
    const acceptance = parsed?.acceptance !== false;
    const hasCriticalSemanticIssue = issues.some((issue) => {
      const signal = `${issue.type} ${issue.reason}`.toLowerCase();
      return issue.severity === 'critical' && /(fidelity|logic|omission|accuracy|meaning|语义|漏译|逻辑)/.test(signal);
    });
    const pass = typeof parsed?.pass === 'boolean'
      ? parsed.pass
      : (normalizedScore15 >= 9 && acceptance && !hasCriticalSemanticIssue);
    const action_plan = Array.isArray(parsed?.action_plan)
      ? parsed.action_plan.map((line) => String(line || '').trim()).filter(Boolean)
      : String(parsed?.action_plan || '')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

    return {
      score100,
      score15: normalizedScore15,
      subscores: normalizedSubscores,
      vocab_hit,
      level: normalizedScore15 >= 13 ? 'excellent' : normalizedScore15 >= 10 ? 'good' : normalizedScore15 >= 7 ? 'fair' : 'needs_work',
      issues,
      improved_version: String(parsed?.improved_version || parsed?.rewritten_text || '').trim(),
      overall_comment: String(parsed?.overall_comment || parsed?.comment || '').trim(),
      pass,
      requiredMinHit,
      acceptance,
      action_plan
    };
  } catch (e) {
    if (e?.name === 'AbortError') throw e;
    console.error('gradeTranslation error:', e);
    return {
      score100: 0,
      score15: 0,
      subscores: { fidelity: 0, naturalness: 0, grammar: 0, targetUsage: 0, register: 0 },
      vocab_hit: targetWords.map((word) => ({ word, used: false, correctly: false, evidence: '' })),
      level: 'needs_work',
      issues: [{
        type: 'system',
        severity: 'critical',
        sentence_index: 0,
        original: '',
        fixed: '',
        reason: `评分失败：${e.message || '未知错误'}`
      }],
      improved_version: '',
      overall_comment: '评分接口暂时不可用，请稍后重试。',
      pass: false,
      requiredMinHit,
      acceptance: false,
      action_plan: ['稍后重试评分', '先自查信息完整度与语法准确性']
    };
  }
};
export const generateQuickDefinition = async (word, context, settings) => {
  // If no API key, return a mock definition
  if (!settings.apiKey) return "AI Definition Unavailable (No Key)";

  const prompt = `
You are a concise English dictionary.
Provide a quick definition for the word/phrase: "${word}".
Context: "${context || 'General Context'}"

Output format (Plain Text, Max 3 lines):
[Part of Speech] /Phonetic/
Definition: <Chinese Meaning>
Example: <Short English Example> (<Chinese Translation>)
`;

  const messages = [{ role: "user", content: prompt }];

  // Using jsonRequired=false for plain text
  try {
    const result = await fetchFromAI(messages, settings, false);
    return result ? result.trim() : "Definition not found.";
  } catch (e) {
    console.error("Quick Def Error:", e);
    return "Definition extraction failed.";
  }
};

/**
 * Generate Smart Drill Cards for flagged vocabulary
 * Returns an array of 8 different drill types for comprehensive practice
 */
export const generateDrillCards = async (word, definition, settings) => {
  if (!settings.apiKey) {
    console.warn("No API key for drill generation");
    return [];
  }

  const systemPrompt = `You are an expert Applied Linguist creating high-stakes vocabulary assessment items.

# Target Word: "${word}"
# Definition: "${definition}"

Generate EXACTLY 4 high-quality Multiple Choice Questions (one of each type). Your output MUST match the quality of the following examples.

---
# FEW-SHOT EXAMPLES (For word "adopt")
---

## EXAMPLE 1: context_cloze
{
  "type": "context_cloze",
  "question": "The software company decided to _____ a new strategy to improve user retention.",
  "options": [
    {"text": "adopt", "is_correct": true, "feedback": "正确！'adopt a strategy' 意为采纳/开始使用某个策略。"},
    {"text": "adapt", "is_correct": false, "feedback": "陷阱！'adapt' 意为修改/适应。这里是采纳新策略，不是修改。"},
    {"text": "adept", "is_correct": false, "feedback": "拼写陷阱！'adept' 是形容词，意为'熟练的'，词性不符。"},
    {"text": "abandon", "is_correct": false, "feedback": "语境矛盾！目标是'improve'，放弃(abandon)不合逻辑。"}
  ],
  "explanation": "'adopt' 核心含义是'采纳/接受使用'，常见搭配：adopt a strategy/policy/approach。"
}

## EXAMPLE 2: collocation_match
{
  "type": "collocation_match",
  "question": "Choose the noun that naturally follows 'adopt': The government voted to adopt a strict _____.",
  "options": [
    {"text": "measure", "is_correct": true, "feedback": "地道搭配！'adopt a measure/policy' 是正式英语中的标准用法。"},
    {"text": "behavior", "is_correct": false, "feedback": "搭配不自然。我们通常说 'change behavior'，不说 'adopt behavior'。"},
    {"text": "weather", "is_correct": false, "feedback": "逻辑错误！天气不能被'adopt'。"},
    {"text": "chance", "is_correct": false, "feedback": "搭配错误！我们说 'take a chance'，不说 'adopt a chance'。"}
  ],
  "explanation": "'adopt' 的常见宾语：measure, policy, approach, strategy, resolution, stance, position。"
}

## EXAMPLE 3: pragmatic_scenario
{
  "type": "pragmatic_scenario",
  "question": "You are writing a formal report about a new safety protocol. Which sentence sounds most professional?",
  "scenario_description": "📄 Formal Business Report",
  "options": [
    {"text": "We have effectively adopted the new safety regulations.", "is_correct": true, "feedback": "正确！正式、专业的表达方式。"},
    {"text": "We have picked up the new safety regulations.", "is_correct": false, "feedback": "太口语化！'pick up' 像是在地上捡东西。"},
    {"text": "We have taken in the new safety regulations.", "is_correct": false, "feedback": "歧义！'take in' 通常指'理解'或'欺骗/收留'，不适合这个语境。"},
    {"text": "We have adapted the new safety regulations.", "is_correct": false, "feedback": "含义改变！'adapt' 意为修改规则，而不是实施规则。"}
  ],
  "explanation": "'adopt' 在正式文体中常用于表示'正式采纳/实施'政策、规定等。"
}

## EXAMPLE 4: word_family
{
  "type": "word_family",
  "question": "The _____ of the new policy caused some controversy among the employees.",
  "options": [
    {"text": "adoption", "is_correct": true, "feedback": "正确！句首需要名词作主语。'adoption' = 采纳的行为。"},
    {"text": "adopt", "is_correct": false, "feedback": "词性错误！这是动词，不能作主语。"},
    {"text": "adoptive", "is_correct": false, "feedback": "含义错误！'adoptive' 通常指'收养关系的'，如 adoptive parents。"},
    {"text": "adopted", "is_correct": false, "feedback": "词性错误！过去分词/形容词，不能独立作主语。"}
  ],
  "explanation": "词形家族：adopt (v.) → adoption (n.) → adoptive (adj., 收养的) → adopted (adj., 被收养的)"
}

---
# NOW GENERATE FOR: "${word}" (${definition})
---

Return ONLY valid JSON in this exact format:
{
  "drills": [
    { "type": "context_cloze", "question": "...", "options": [...], "explanation": "..." },
    { "type": "collocation_match", "question": "...", "options": [...], "explanation": "..." },
    { "type": "pragmatic_scenario", "question": "...", "scenario_description": "...", "options": [...], "explanation": "..." },
    { "type": "word_family", "question": "...", "options": [...], "explanation": "..." }
  ]
}

# CRITICAL REQUIREMENTS:
1. Each distractor MUST have a clear error type (spelling trap, collocation error, logic error, register mismatch).
2. NEVER generate nonsensical options like "adopt a sky".
3. Feedback MUST explain WHY wrong, especially for confusables (adapt vs adopt).
4. Randomize the position of the correct answer (not always A).
5. All feedback/explanation in Chinese, questions/options in English.`;

  try {
    const jsonStr = await fetchFromAI([
      { role: "system", content: systemPrompt },
      { role: "user", content: `Generate drill cards for: ${word} (${definition})` }
    ], settings, true);

    const parsed = JSON.parse(jsonStr);
    return parsed.drills || [];
  } catch (e) {
    console.error("Drill generation error:", e);
    return [];
  }
};

// =====================================================
// A.I.R. SYSTEM: Adaptive Intelligence & Remediation
// =====================================================

/**
 * Generate daily diagnosis based on drill logs
 * This is called when user opens the Remediation Hub
 */
export const generateDiagnosis = async (drillLogs, settings) => {
  if (!settings.apiKey || !drillLogs || drillLogs.length === 0) {
    return null;
  }

  // Summarize logs for AI
  const errorLogs = drillLogs.filter(log => !log.is_correct);
  const dimensionCounts = {};
  const errorTypeCounts = {};
  const confusedPairs = [];

  errorLogs.forEach(log => {
    dimensionCounts[log.dimension] = (dimensionCounts[log.dimension] || 0) + 1;
    errorTypeCounts[log.error_type] = (errorTypeCounts[log.error_type] || 0) + 1;
    if (log.error_type === 'orthographic_confusion' && log.user_choice && log.correct_answer) {
      confusedPairs.push({ wrong: log.user_choice, correct: log.correct_answer, word: log.word });
    }
  });

  const systemPrompt = `你是一个学习诊断专家。基于用户昨日的练习错误数据，生成一份诊断报告。

# 输入数据摘要
- 总错误数: ${errorLogs.length}
- 维度错误分布: ${JSON.stringify(dimensionCounts)}
- 错误类型分布: ${JSON.stringify(errorTypeCounts)}
- 形近词混淆对: ${JSON.stringify(confusedPairs.slice(0, 5))}

# 维度说明
- form: 拼写/形态 (形近词混淆、词形变化)
- meaning: 语义 (核心词义映射错误)
- use: 用法 (搭配错误、语用不当)

# 输出格式 (JSON)
{
  "primary_weakness": "orthographic_confusion | collocation_error | semantic_confusion | register_mismatch | morphological_error",
  "weakness_dimension": "form | meaning | use",
  "analysis_summary": "中文诊断摘要，1-2句话说明用户的核心问题",
  "prescription": "中文建议，说明今日特训的重点",
  "training_mode": "eagle_eye | collocation_drill | meaning_deep | usage_scene",
  "focus_words": ["需要重点复习的单词列表"],
  "confused_pairs": [{"wrong": "adapt", "correct": "adopt"}]
}`;

  try {
    const jsonStr = await fetchFromAI([
      { role: "system", content: systemPrompt },
      { role: "user", content: "请根据以上数据生成诊断报告" }
    ], settings, true);

    return JSON.parse(jsonStr);
  } catch (e) {
    console.error("Diagnosis generation error:", e);
    return null;
  }
};

/**
 * Generate remediation drills based on diagnosis
 * Implements "Mastery Lock" logic - generates targeted drills
 */
export const generateRemediationDrills = async (diagnosis, settings, count = 5) => {
  if (!settings.apiKey || !diagnosis) {
    return [];
  }

  const systemPrompt = `你是一个英语教学专家，为学习者生成针对性强化练习题。

# 诊断结果
- 核心弱点: ${diagnosis.primary_weakness}
- 弱点维度: ${diagnosis.weakness_dimension}
- 需复习单词: ${JSON.stringify(diagnosis.focus_words || [])}
- 混淆词对: ${JSON.stringify(diagnosis.confused_pairs || [])}
- 特训模式: ${diagnosis.training_mode}

# 出题规则
1. 生成 ${count} 道题目
2. 80% 题目直接针对用户昨天错的词
3. 20% 题目考察**同类型但不同的词**（迁移测试）
4. 所有干扰项必须与诊断出的弱点相关
   - 如果是 orthographic_confusion，干扰项必须是拼写相似的词
   - 如果是 collocation_error，干扰项必须是错误搭配
5. 每个选项必须有详细的 feedback（中文）

# 输出格式 (JSON)
{
  "drills": [
    {
      "type": "context_cloze | collocation_match | pragmatic_scenario | word_family",
      "question": "题目内容（英文）",
      "target_word": "目标单词",
      "is_transfer_item": false,
      "options": [
        {"text": "选项A", "is_correct": true, "feedback": "正确原因（中文）"},
        {"text": "选项B", "is_correct": false, "feedback": "错误原因（中文）"},
        {"text": "选项C", "is_correct": false, "feedback": "错误原因（中文）"},
        {"text": "选项D", "is_correct": false, "feedback": "错误原因（中文）"}
      ],
      "explanation": "总体解析（中文）"
    }
  ]
}`;

  try {
    const jsonStr = await fetchFromAI([
      { role: "system", content: systemPrompt },
      { role: "user", content: "请生成针对性强化练习题" }
    ], settings, true);

    const parsed = JSON.parse(jsonStr);
    return parsed.drills || [];
  } catch (e) {
    console.error("Remediation drill generation error:", e);
    return [];
  }
};

// =====================================================
// IMAGE GENERATION API
// =====================================================

/**
 * Test Image Generation API Connection
 */
export const checkImageGenConnection = async (settings) => {
  const apiUrl = settings.imageGenApiUrl || settings.apiBaseUrl;
  const apiKey = settings.imageGenApiKey || settings.apiKey;
  const model = settings.imageGenModel || 'dall-e-3';

  if (!apiUrl || !apiKey) {
    throw new Error("Missing Image API URL or Key");
  }

  const cleanUrl = apiUrl.replace(/\/+$/, '');
  const isOpenRouter = cleanUrl.includes('openrouter');
  const isSiliconFlow = cleanUrl.includes('siliconflow');

  let response;
  if (isOpenRouter) {
    response = await fetch(`${cleanUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model,
        messages: [{ role: "user", content: "Generate a simple blue circle" }],
        modalities: ["image", "text"]
      })
    });
  } else {
    const endpoint = isSiliconFlow ? '/image/generations' : '/images/generations';
    response = await fetch(`${cleanUrl}${endpoint}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: model, prompt: "A simple blue circle", n: 1, size: "1024x1024" })
    });
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API Error: ${response.status} - ${errorText.substring(0, 200)}`);
  }

  const data = await response.json();
  return data; // Returns the generated image data
};

/**
 * Generate Daily Summary Image with AI Analysis + Style Templates
 * @param {Array} highlights - Today's highlighted content
 * @param {Object} settings - API settings  
 * @param {string} style - 'cyberpunk' or 'popart'
 * @param {Object} todayStats - Today's learning stats
 */
export const generateDailySummaryImage = async (highlights, settings, style = 'auto', todayStats = {}) => {
  const apiUrl = settings.imageGenApiUrl || settings.apiBaseUrl;
  const apiKey = settings.imageGenApiKey || settings.apiKey;
  const model = settings.imageGenModel || 'dall-e-3';

  if (!apiUrl || !apiKey) {
    return null;
  }

  const cleanUrl = apiUrl.replace(/\/+$/, '');
  const isOpenRouter = cleanUrl.includes('openrouter');
  const isSiliconFlow = cleanUrl.includes('siliconflow');

  const stats = {
    date: todayStats?.date || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    wordsLearned: Number(todayStats?.wordsLearned || 0),
    flashcardsReviewed: Number(todayStats?.flashcardsReviewed || 0),
    newFlashcards: Number(todayStats?.newFlashcards || 0),
    articlesRead: Number(todayStats?.articlesRead || 0),
    notesCreated: Number(todayStats?.notesCreated || 0),
    writingSessions: Number(todayStats?.writingSessions || 0),
    writingCount: Number(todayStats?.writingCount || 0),
    translationCount: Number(todayStats?.translationCount || 0),
    questionsAsked: Number(todayStats?.questionsAsked || 0),
    keywords: Array.isArray(todayStats?.keywords) ? todayStats.keywords.slice(0, 12) : [],
    topicTheme: String(todayStats?.topicTheme || 'general'),
    topicHint: String(todayStats?.topicHint || 'balanced study atmosphere')
  };

  const highlightContent = Array.isArray(highlights) && highlights.length
    ? highlights.slice(0, 8).map((h) => `- [${h?.type || 'note'}] ${String(h?.content || '').slice(0, 220)}`).join('\n')
    : '- No explicit highlight records. Build scene from activity stats and topic keywords.';

  const statsText = [
    `Date: ${stats.date}`,
    `Flashcards reviewed: ${stats.flashcardsReviewed}`,
    `New flashcards: ${stats.newFlashcards}`,
    `Articles read: ${stats.articlesRead}`,
    `Notes created: ${stats.notesCreated}`,
    `Writing sessions: ${stats.writingSessions}`,
    `Words written: ${stats.writingCount}`,
    `Translation sessions: ${stats.translationCount}`,
    `Chat interactions: ${stats.questionsAsked}`
  ].join('\n');

  const keywordLine = stats.keywords.length ? stats.keywords.join(', ') : 'learning, focus, progress';

  let analysisResult = {
    mainSubject: 'knowledge lighthouse',
    motion: 'radiating upward progress',
    palette: 'deep navy + electric cyan accents',
    atmosphere: 'focused, confident, future-oriented'
  };

  try {
    const analysisJson = await fetchFromAI([
      {
        role: 'system',
        content: 'Return strict JSON only. No markdown. Keys: mainSubject, motion, palette, atmosphere.'
      },
      {
        role: 'user',
        content: `Create a visual brief for a daily study achievement image.\nStats:\n${statsText}\n\nTheme hint: ${stats.topicTheme}\nKeywords: ${keywordLine}\nHighlights:\n${highlightContent}`
      }
    ], settings, true);
    const parsed = JSON.parse(analysisJson);
    analysisResult = {
      mainSubject: String(parsed?.mainSubject || analysisResult.mainSubject),
      motion: String(parsed?.motion || analysisResult.motion),
      palette: String(parsed?.palette || analysisResult.palette),
      atmosphere: String(parsed?.atmosphere || analysisResult.atmosphere)
    };
  } catch (error) {
    console.error('Daily summary analysis fallback:', error);
  }

  const autoStyleByTheme = {
    technology: 'futuristic cinematic dashboard, deep navy base, holographic accents, precision UI typography',
    science: 'clean scientific poster, premium infographic composition, cool lighting, technical elegance',
    humanities: 'editorial illustration with museum-grade paper texture, warm tones, literary atmosphere',
    business: 'executive strategic visual board, minimalist luxury composition, strong data hierarchy',
    education: 'modern learning studio illustration, hopeful lighting, clear pedagogy-oriented information blocks',
    general: 'cinematic editorial learning poster, refined composition, premium contrast and depth'
  };

  const styleGuide = style === 'auto'
    ? (autoStyleByTheme[stats.topicTheme] || autoStyleByTheme.general)
    : style === 'popart'
      ? 'high-contrast pop-art poster, halftone texture, bold outlines'
      : style === 'cyberpunk'
        ? 'cyberpunk neon noir, holographic panels, glowing accents'
        : `${style} visual style with premium finish`;

  const prompt = `Create a premium "Yesterday Learning Achievement" visual poster (1:1 square, 1024x1024).

Quality bar:
- ultra polished, production-ready artwork
- crisp edges, balanced lighting, clean hierarchy
- premium color grading, subtle depth, no muddy shadows
- modern editorial + dashboard fusion style

Hard readability constraints:
- all visible text must be short, clean, and highly legible
- avoid dense paragraphs, avoid tiny text, avoid clutter
- no random symbols, no gibberish, no watermark, no logo spam

Data panel (must include):
- Date: ${stats.date}
- Flashcards reviewed: ${stats.flashcardsReviewed}
- New flashcards: ${stats.newFlashcards}
- Articles read: ${stats.articlesRead}
- Notes created: ${stats.notesCreated}
- Writing sessions: ${stats.writingSessions}
- Translation sessions: ${stats.translationCount}
- Chat interactions: ${stats.questionsAsked}

Narrative:
- Topic theme: ${stats.topicTheme}
- Topic art hint: ${stats.topicHint}
- Keywords: ${keywordLine}
- Highlights: ${highlightContent}

Visual core:
- Main subject: ${analysisResult.mainSubject}
- Motion: ${analysisResult.motion}
- Palette: ${analysisResult.palette}
- Atmosphere: ${analysisResult.atmosphere}
- Style direction: ${styleGuide}

Composition blueprint:
- Left 60%: key hero visual + one dominant achievement number.
- Right 40%: compact metric cards (reading / writing / flashcards / translation).
- Keep generous breathing space; align to a clean grid.
- Footer micro label: "Generated by VerbaPath AI".

Art direction detail:
- emphasize cinematic depth, tasteful highlights, and coherent storytelling
- blend the learning topic into background motifs (not noisy, not cartoonish)
- maintain elegant contrast for both dark and light regions`;

  let response;
  if (isOpenRouter) {
    response = await fetch(`${cleanUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model,
        messages: [{ role: 'user', content: prompt }],
        modalities: ['image', 'text']
      })
    });
  } else {
    const endpoint = isSiliconFlow ? '/image/generations' : '/images/generations';
    response = await fetch(`${cleanUrl}${endpoint}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: model, prompt, n: 1, size: '1024x1024' })
    });
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Image Gen Error: ${response.status} - ${errorText.substring(0, 200)}`);
  }

  const data = await response.json();
  if (isOpenRouter && data.choices?.[0]?.message?.images) {
    return data.choices[0].message.images[0]?.image_url?.url;
  }
  return data.data?.[0]?.url || data.data?.[0]?.b64_json;
};
export const generateKnowledgeGraphReferences = async (vocabList, settings) => {
  if (!settings.apiKey) throw new Error("API Key required");

  // optimize payload: only send front/back pairs
  const simplifiedList = vocabList.map(v => `${v.front} (${v.back})`).slice(0, 50); // Limit to 50 for now to avoid context limit

  const systemPrompt = `
  Role: Linguistic Knowledge Graph Architect.
  Task: Analyze the provided vocabulary list and identify strong semantic relationships.
  
  Relationships to find:
  1. Synonyms (Similar meaning)
  2. Antonyms (Opposite meaning)
  3. Collocations (Words that often appear together)
  4. Root/Affix (Shared etymological root)
  5. Thematic (Belong to same specific field, e.g., 'Physics')

  Input Vocabulary:
  ${JSON.stringify(simplifiedList)}

  Output Format (JSON):
  {
      "links": [
          { "source": "word_A_front", "target": "word_B_front", "type": "synonym", "reason": "Both mean..." },
          ...
      ]
  }
  
  Constraints:
  - Only link provided words.
  - Return empty list if no strong connections found.
  - Max 20 strongest links.
  `;

  try {
    const response = await fetchFromAI([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: "Generate graph connections." }
    ], settings, true); // JSON mode

    return JSON.parse(response).links || [];
  } catch (e) {
    console.error("AI Graph Gen Error", e);
    return [];
  }
};

// =====================================================
// AGENT MODE: Function Calling Chat
// =====================================================
import { AGENT_TOOLS, AGENT_SYSTEM_PROMPT, executeAgentTool } from './agentTools';

const AGENT_TOOL_PLAN_PURPOSE = {
  list_flashcard_folders: '查找目标闪卡文件夹。',
  list_flashcards: '读取闪卡列表和正反面内容。',
  organize_flashcards_to_note: '把闪卡文件夹整理成笔记。',
  create_note: '创建一篇新笔记。',
  update_note: '更新已有笔记内容。',
  get_note_detail: '读取笔记详情用于编辑核对。',
  note_append_today_folder: '追加内容到今日笔记。',
  note_partial_sync_to_materials: '同步笔记中的素材/例句指令。',
  create_flashcards: '创建新的闪卡。',
  update_flashcard: '编辑闪卡内容或状态。',
  delete_flashcards: '删除明确指定的闪卡。',
  flashcard_batch_delete: '按明确范围批量删除闪卡。',
  flashcard_batch_move_folder: '批量移动闪卡文件夹。',
  flashcard_batch_edit: '批量编辑闪卡内容、标签或状态。',
  flashcard_undo_last_batch: '撤销上一次闪卡批量操作。',
  get_flashcard_stats: '读取闪卡统计。',
  get_study_history: '读取最近学习/导入历史。',
  get_writing_history: '读取写作记录。',
  list_writing_materials: '读取写作素材包。'
};

const AGENT_TOOL_DISPLAY_NAMES = {
  list_flashcards: '读取闪卡列表',
  delete_flashcards: '删除指定闪卡',
  flashcard_batch_delete: '批量删除闪卡',
  flashcard_batch_move_folder: '批量移动闪卡',
  flashcard_batch_edit: '批量编辑闪卡',
  flashcard_undo_last_batch: '撤销闪卡操作',
  create_flashcards: '创建闪卡',
  update_flashcard: '编辑闪卡',
  create_note: '创建笔记',
  update_note: '更新笔记',
  get_note_detail: '读取笔记',
  organize_flashcards_to_note: '闪卡整理成笔记',
  navigate_to: '跳转页面'
};

const getToolRiskLevel = (name = '') => {
  if (/delete|batch_delete/.test(name)) return 'high';
  if (/batch_edit|batch_move|update/.test(name)) return 'medium';
  return 'low';
};

const parseToolArgsSafe = (raw) => {
  try {
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
};

const summarizeToolInputs = (args = {}) => {
  if (!args || typeof args !== 'object') return '-';
  const keys = Object.keys(args).slice(0, 3);
  if (!keys.length) return '-';
  return keys.map((k) => {
    const v = args[k];
    const asText = typeof v === 'string' ? v : JSON.stringify(v);
    return `${k}=${String(asText || '').replace(/\|/g, '/').slice(0, 32)}`;
  }).join('; ');
};

const getLatestUserGoal = (messages = []) => {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === 'user') {
      return String(messages[i]?.content || '').trim();
    }
  }
  return '';
};

const buildAgentPlan = (toolCalls = [], userGoal = '') => {
  return {
    goal: userGoal ? userGoal.slice(0, 180) : 'Execute the requested in-app action.',
    steps: toolCalls.map((call, idx) => {
      const name = call?.function?.name || 'unknown_tool';
      const args = parseToolArgsSafe(call?.function?.arguments);
      const purpose = AGENT_TOOL_PLAN_PURPOSE[name] || 'Execute requested in-app action.';
      const inputs = summarizeToolInputs(args);
      const riskLevel = getToolRiskLevel(name);
      return {
        id: call?.id || `tool_${idx + 1}`,
        step: idx + 1,
        tool: name,
        displayToolName: AGENT_TOOL_DISPLAY_NAMES[name] || name,
        purpose,
        inputs,
        scopeSummary: inputs,
        riskLevel,
        canUndo: /delete|batch_edit|batch_move/.test(name),
        status: 'pending'
      };
    })
  };
};

const getAgentToolDefinition = (toolName = '') =>
  AGENT_TOOLS.find((tool) => tool?.function?.name === toolName)?.function || null;

const normalizeForcedToolFlow = (flow = {}) => {
  const tools = Array.isArray(flow?.tools)
    ? flow.tools
      .map((item) => ({
        toolName: String(item?.toolName || item?.name || '').trim(),
        defaultParams: item?.defaultParams && typeof item.defaultParams === 'object' ? item.defaultParams : {}
      }))
      .filter((item) => item.toolName && getAgentToolDefinition(item.toolName))
    : [];
  if (!tools.length) return null;
  return {
    id: flow.id || `forced_flow_${Date.now()}`,
    name: String(flow.name || '固定工具流程').trim(),
    description: String(flow.description || '').trim(),
    tools
  };
};

const buildForcedToolPlan = (flow, userGoal = '') => ({
  goal: `按固定流程「${flow.name}」执行${userGoal ? `：${userGoal.slice(0, 160)}` : ''}`,
  steps: flow.tools.map((step, idx) => {
    const name = step.toolName;
    const inputs = summarizeToolInputs(step.defaultParams);
    return {
      id: `forced_${idx + 1}_${name}`,
      step: idx + 1,
      tool: name,
      displayToolName: AGENT_TOOL_DISPLAY_NAMES[name] || name,
      purpose: AGENT_TOOL_PLAN_PURPOSE[name] || '执行固定流程中的工具步骤。',
      inputs,
      scopeSummary: inputs,
      riskLevel: getToolRiskLevel(name),
      canUndo: /delete|batch_edit|batch_move/.test(name),
      status: 'pending'
    };
  })
});

const buildForcedToolArgs = async ({ cleanUrl, apiKey, modelName, messages, flow, step, stepIndex, previousResults }) => {
  const toolDef = getAgentToolDefinition(step.toolName);
  const userGoal = getLatestUserGoal(messages);
  const response = await fetch(`${cleanUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: modelName || "gpt-3.5-turbo",
      messages: [
        { role: "system", content: AGENT_SYSTEM_PROMPT },
        {
          role: "system",
          content: [
            'You are preparing arguments for one fixed Agent tool step.',
            'The user selected a fixed tool flow. Do not reorder tools.',
            'Return only JSON: {"skip":false,"reason":"","args":{...}}.',
            'Use previous step results when they contain ids, noteIds, card ids, folder names, or created content.',
            'Skip only when this exact step cannot be applied from the user request or previous results.'
          ].join('\n')
        },
        ...messages.slice(-8),
        {
          role: "user",
          content: [
            `Fixed flow: ${flow.name}`,
            flow.description ? `Flow description: ${flow.description}` : '',
            `Current step ${stepIndex + 1}/${flow.tools.length}: ${step.toolName}`,
            `Default params: ${JSON.stringify(step.defaultParams || {})}`,
            `Tool schema: ${JSON.stringify(toolDef?.parameters || {})}`,
            `Previous step results: ${JSON.stringify(previousResults).slice(0, 6000)}`,
            `User goal: ${userGoal}`,
            '',
            'Generate the exact args object for this tool step. Preserve the fixed order.'
          ].filter(Boolean).join('\n')
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.2
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`API Error: ${response.status} - ${err}`);
  }

  const data = await response.json();
  const parsed = parseLooseJsonObject(data?.choices?.[0]?.message?.content);
  return {
    skip: parsed?.skip === true,
    reason: String(parsed?.reason || '').trim(),
    args: parsed?.args && typeof parsed.args === 'object'
      ? { ...(step.defaultParams || {}), ...parsed.args }
      : { ...(step.defaultParams || {}) }
  };
};

/**
 * Stream an Agent chat with function calling support.
 * The AI can request tool calls; we execute them and feed results back.
 * 
 * @param {Array} messages - Chat history
 * @param {Object} settings - API settings
 * @param {Function} onDelta - Called with text content deltas
 * @param {Function} onToolCall - Called with { name, status } for UI visualization
 * @param {Object} options - Optional { forcedToolFlow }
 */
export const streamAgentChat = async (messages, settings, onDelta, onToolCall, options = {}) => {
  if (!settings.apiKey) throw new Error("Missing API Key");
  const { apiKey, apiBaseUrl, modelName } = settings;
  const cleanUrl = apiBaseUrl.replace(/\/+$/, '');

  const finalMessages = [
    { role: "system", content: AGENT_SYSTEM_PROMPT },
    ...messages
  ];

  // Helper: non-streaming request with tools
  const callWithTools = async (msgs) => {
    const response = await fetch(`${cleanUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: modelName || "gpt-3.5-turbo",
        messages: msgs,
        tools: AGENT_TOOLS,
        tool_choice: "auto",
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`API Error: ${response.status} - ${err}`);
    }

    const data = await response.json();
    return data.choices[0].message;
  };

  // Helper: streaming request without tools (for final response)
  const streamFinalResponse = async (msgs) => {
    const response = await fetch(`${cleanUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: modelName || "gpt-3.5-turbo",
        messages: msgs,
        stream: true,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`API Error: ${response.status} - ${err}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let done = false;

    while (!done) {
      const { value, done: readerDone } = await reader.read();
      done = readerDone;
      if (value) {
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ') && line !== 'data: [DONE]') {
            try {
              const data = JSON.parse(line.slice(6));
              const content = data.choices[0]?.delta?.content || '';
              if (content) onDelta(content);
            } catch (e) {
              // skip parse errors
            }
          }
        }
      }
    }
  };

  try {
    const forcedFlow = normalizeForcedToolFlow(options?.forcedToolFlow);
    if (forcedFlow) {
      const previousResults = [];
      const plan = buildForcedToolPlan(forcedFlow, getLatestUserGoal(messages));
      if (onToolCall) {
        onToolCall({
          status: 'plan',
          plan,
          toolCount: forcedFlow.tools.length,
          createdAt: Date.now(),
          forced: true
        });
      }

      for (let i = 0; i < forcedFlow.tools.length; i += 1) {
        const step = forcedFlow.tools[i];
        const stepId = `forced_${i + 1}_${step.toolName}`;
        const startedAt = Date.now();
        let prepared = null;

        try {
          prepared = await buildForcedToolArgs({
            cleanUrl,
            apiKey,
            modelName,
            messages,
            flow: forcedFlow,
            step,
            stepIndex: i,
            previousResults
          });
        } catch (argError) {
          prepared = { skip: false, reason: '', args: { ...(step.defaultParams || {}) } };
          previousResults.push({
            step: i + 1,
            toolName: step.toolName,
            warning: `AI 参数生成失败，已使用默认参数：${argError?.message || argError}`
          });
        }

        if (prepared.skip) {
          const skipped = { skipped: true, message: prepared.reason || `Skipped ${step.toolName}.` };
          previousResults.push({ step: i + 1, toolName: step.toolName, args: prepared.args, result: skipped });
          if (onToolCall) {
            onToolCall({
              id: stepId,
              name: step.toolName,
              args: prepared.args,
              status: 'done',
              result: skipped,
              startedAt,
              endedAt: Date.now()
            });
          }
          continue;
        }

        if (onToolCall) {
          onToolCall({
            id: stepId,
            name: step.toolName,
            args: prepared.args,
            status: 'calling',
            startedAt
          });
        }

        let result = null;
        try {
          result = await executeAgentTool(step.toolName, prepared.args, { settings });
          previousResults.push({ step: i + 1, toolName: step.toolName, args: prepared.args, result });

          if (result?.error) {
            if (onToolCall) {
              onToolCall({
                id: stepId,
                name: step.toolName,
                args: prepared.args,
                status: 'error',
                error: result.error,
                result,
                startedAt,
                endedAt: Date.now()
              });
            }
            break;
          }

          if (onToolCall) {
            onToolCall({
              id: stepId,
              name: step.toolName,
              args: prepared.args,
              status: 'done',
              result,
              startedAt,
              endedAt: Date.now()
            });
          }
        } catch (toolError) {
          const errorMessage = toolError instanceof Error ? toolError.message : String(toolError || 'Unknown tool error');
          result = { error: errorMessage };
          previousResults.push({ step: i + 1, toolName: step.toolName, args: prepared.args, result });
          if (onToolCall) {
            onToolCall({
              id: stepId,
              name: step.toolName,
              args: prepared.args,
              status: 'error',
              error: errorMessage,
              startedAt,
              endedAt: Date.now()
            });
          }
          break;
        }
      }

      await streamFinalResponse([
        ...finalMessages,
        {
          role: "user",
          content: [
            `固定工具流程「${forcedFlow.name}」已经按用户选择的顺序执行。`,
            '请用中文简洁总结：完成了哪些步骤、创建/更新了什么、失败或跳过了什么、用户下一步可以去哪里查看。',
            `执行结果 JSON：${JSON.stringify(previousResults).slice(0, 9000)}`
          ].join('\n')
        }
      ]);
      return;
    }

    // Step 1: Call AI with tools enabled (non-streaming to capture tool_calls)
    let assistantMsg = await callWithTools(finalMessages);
    let loopMessages = [...finalMessages, assistantMsg];
    let planPushed = false;

    // Step 2: Loop to handle tool calls (max 5 rounds)
    let rounds = 0;
    while (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0 && rounds < 5) {
      rounds++;

      if (!planPushed && onToolCall) {
        onToolCall({
          status: 'plan',
          plan: buildAgentPlan(assistantMsg.tool_calls, getLatestUserGoal(messages)),
          toolCount: assistantMsg.tool_calls.length,
          createdAt: Date.now()
        });
        planPushed = true;
      }

      for (const toolCall of assistantMsg.tool_calls) {
        const toolName = toolCall.function.name;
        const toolCallId = toolCall.id;
        const toolArgs = parseToolArgsSafe(toolCall.function.arguments);

        const startedAt = Date.now();

        // Notify UI (calling)
        if (onToolCall) {
          onToolCall({
            id: toolCallId,
            name: toolName,
            args: toolArgs,
            status: 'calling',
            startedAt
          });
        }

        let result = null;
        try {
          // Execute tool
          result = await executeAgentTool(toolName, toolArgs, { settings });

          // Notify UI done (pass result for action detection)
          if (onToolCall) {
            onToolCall({
              id: toolCallId,
              name: toolName,
              args: toolArgs,
              status: 'done',
              result,
              startedAt,
              endedAt: Date.now()
            });
          }
        } catch (toolError) {
          const errorMessage = toolError instanceof Error ? toolError.message : String(toolError || 'Unknown tool error');
          result = { error: errorMessage };

          if (onToolCall) {
            onToolCall({
              id: toolCallId,
              name: toolName,
              args: toolArgs,
              status: 'error',
              error: errorMessage,
              startedAt,
              endedAt: Date.now()
            });
          }
        }

        // Add tool result to conversation
        loopMessages.push({
          role: "tool",
          tool_call_id: toolCallId,
          content: JSON.stringify(result)
        });
      }

      // Call AI again with tool results
      assistantMsg = await callWithTools(loopMessages);
      loopMessages.push(assistantMsg);
    }

    // Step 3: If AI returned content directly (no more tool calls), stream it
    if (assistantMsg.content) {
      // AI already generated the text, emit it character by character for smooth display
      const content = assistantMsg.content;
      const chunkSize = 3;
      for (let i = 0; i < content.length; i += chunkSize) {
        onDelta(content.slice(i, i + chunkSize));
        await new Promise(r => setTimeout(r, 10)); // smooth animation
      }
    } else if (!assistantMsg.tool_calls) {
      // No content and no tool calls — stream the final response
      await streamFinalResponse(loopMessages);
    }

  } catch (error) {
    console.error("Agent Stream Error:", error);
    throw error;
  }
};

// =====================================================
// COMIC STYLES LIBRARY - 40+ Art Styles
// =====================================================
export const COMIC_STYLES = {
  // 日漫风格
  shonen: { name: '少年热血风', prompt: 'Shonen manga style, dynamic action poses, exaggerated muscles, intense battle expressions, bold linework like Dragon Ball or One Piece' },
  shojo: { name: '少女唯美风', prompt: 'Shojo manga style, huge sparkling eyes, flowery decorations, delicate lines, soft colors like Sailor Moon' },
  seinen: { name: '写实青年风', prompt: 'Seinen manga realistic style, precise human anatomy, detailed backgrounds, mature themes like Slam Dunk' },
  ghibli: { name: '吉卜力风', prompt: 'Studio Ghibli style, warm hand-painted feel, natural lighting, cozy atmosphere, like Spirited Away' },
  moe: { name: '萌系风格', prompt: 'Moe anime style, chibi proportions, big eyes small mouth, pastel colors, cute expressions' },
  gekiga: { name: '暗黑剧画风', prompt: 'Gekiga style, harsh shadows, cinematic composition, gritty realistic feel like Akira by Otomo' },
  cellshade: { name: '赛璐璐风', prompt: 'Classic 90s anime cell-shading, distinct color blocks, clean outlines, Evangelion aesthetic' },

  // 美漫风格
  superhero: { name: '超英写实风', prompt: 'American superhero comic style, precise anatomy, dynamic poses, dramatic shadows like Marvel/DC' },
  noir: { name: '黑色电影风', prompt: 'Film Noir comic style, extreme black and white contrast, silhouettes, heavy shadows like Sin City' },
  goldenage: { name: '复古黄金时代', prompt: 'Golden Age retro comic, Ben-Day dots, primary colors (red yellow blue), simple but bold lines like early Superman' },
  spiderverse: { name: '波普涂鸦风', prompt: 'Spider-Verse style, mixed media collage, pop art effects, halftone patterns, grafitti urban feel' },
  disney: { name: '迪士尼经典', prompt: 'Classic Disney animation style, round shapes, fluid squash and stretch, expressive characters' },

  // 国漫风格
  inkwash: { name: '水墨动画风', prompt: 'Chinese ink wash painting style, misty atmosphere, blend of void and solid, elegant brush strokes' },
  neochinese: { name: '新中式写实', prompt: 'Neo-Chinese style, traditional Chinese color palette with modern 3D rendering' },
  dunhuang: { name: '敦煌壁画风', prompt: 'Dunhuang mural style, ancient Chinese colors (vermillion, azurite), flowing lines, Buddhist art influence' },
  webtoon: { name: '现代条漫风', prompt: 'Modern webtoon style, clean lines, soft gradients, simplified backgrounds, perfect for vertical reading' },

  // 儿童卡通
  flat: { name: '极简扁平风', prompt: 'Flat minimalist style, simple geometric shapes, no shadows, bold colors like Peppa Pig' },
  chibi: { name: '粗线条Q版', prompt: 'Chibi style, very thick outlines, super-deformed proportions, cute expressions like Powerpuff Girls' },
  claymation: { name: '粘土定格风', prompt: 'Claymation style, handmade clay texture, stop-motion feel like Shaun the Sheep' },
  picturebook: { name: '绘本涂鸦风', prompt: 'Picture book illustration, crayon/watercolor texture, childlike charm like Winnie the Pooh' },

  // 特殊风格
  steampunk: { name: '蒸汽朋克风', prompt: 'Steampunk style, gears cogs brass pipes, Victorian industrial aesthetic, mechanical complexity' },
  pixel: { name: '像素艺术风', prompt: 'Pixel art style, retro 8-bit game aesthetic, blocky sprites, limited color palette' },
  cel3d: { name: '三渲二风格', prompt: '3D cel-shaded style, 3D models with 2D hand-drawn look like Guilty Gear' },

  // 经典神作
  aot: { name: '进击的巨人风', prompt: 'Attack on Titan style (Shingeki no Kyojin), rough and oppressive atmosphere, body distortion aesthetics, hard lines, thick shadow lines (hatching), intense expressions, desolate world, raw power, WIT Studio / MAPPA style blend' },
  steinsgate: { name: '命运石之门风', prompt: 'Steins;Gate style, huke art style, distinctive psychedelic eyes with concentric circles, granular texture, metallic feel, desaturated cold tones, visual novel aesthetic, white lab coat sci-fi vibe' }
};

/**
 * Generate Story Comic - Creates a story-based comic from highlights
 * @param {Array} highlights - Today's learning highlights
 * @param {Object} settings - User settings with API keys
 * @param {Array} customStyles - User's custom comic styles
 * @param {Object} options - { style: 'random'|styleKey, format: 'random'|'single'|'2panel'|'4panel' }
 */
export const generateStoryComic = async (highlights, settings, customStyles = [], options = {}) => {
  const apiUrl = settings.imageGenApiUrl || settings.apiBaseUrl;
  const apiKey = settings.imageGenApiKey || settings.apiKey;
  const model = settings.imageGenModel || 'dall-e-3';

  if (!apiUrl || !apiKey || !highlights?.length) {
    return null;
  }

  // === STEP 1: Pick Art Style ===
  let stylePool = { ...COMIC_STYLES };

  // Merge custom styles
  if (Array.isArray(customStyles) && customStyles.length > 0) {
    customStyles.forEach(s => {
      if (s.name && s.prompt) {
        const key = s.id || `custom_${Date.now()}_${Math.random()}`;
        stylePool[key] = s;
      }
    });
  }

  // Select style based on options
  let selectedStyle;
  if (options.style && options.style !== 'random' && stylePool[options.style]) {
    selectedStyle = stylePool[options.style];
  } else {
    const styleKeys = Object.keys(stylePool);
    const randomKey = styleKeys[Math.floor(Math.random() * styleKeys.length)];
    selectedStyle = stylePool[randomKey];
  }

  // === STEP 2: Determine Format ===
  const validFormats = ['single', '2panel', '4panel'];
  let format = options.format;
  if (!format || format === 'random') {
    format = validFormats[Math.floor(Math.random() * validFormats.length)];
  }

  // Format-specific prompt instructions
  const formatInstructions = {
    single: '创作一个完整的单张漫画场景，一个画面讲述完整故事。',
    '2panel': '创作一个两格漫画（左右两个场景），展示"之前/之后"或"问题/解决"的对比。',
    '4panel': '创作一个四格漫画（起承转合），用四个连续场景讲述一个小故事。'
  };
  const formatLayoutInstructions = {
    single: 'Single comic panel illustration.',
    '2panel': '2-panel comic strip layout (side by side), showing a before/after or cause/effect narrative.',
    '4panel': '4-panel comic strip layout (2x2 grid), classic 4-koma style: setup, development, twist, punchline.'
  };

  // === STEP 3: Use AI to Generate Story Scene ===
  const storyPrompt = `你是一个资深漫画编剧与分镜师。你的任务是将这些碎片化的学习内容“缝合”进一个完整、精巧且具有叙事感的漫画场景脚本中。

今日学习标记：
${highlights.map(h => `- [${h.type}] ${h.content}`).join('\n')}

格式要求：${formatInstructions[format]}

编剧指南：
1. **深度缝合（Suture）**：不要简单地罗列单词。请寻找它们之间的内在逻辑，将其转化为故事中的关键道具（如：信件内容）、环境背景（如：墙上的海报）、或是主角解决问题的“秘籍”。
2. **叙事瞬间**：主角是“我”（一名沉浸式学习者）。给主角一个具体的瞬间：也许是深夜书房的顿悟，或是雨后咖啡店里的一次脑内冒险。
3. **视觉隐喻**：将抽象的概念转化为强烈的视觉符号。如果标记了“焦虑”，让阴影变得浓稠；如果标记了“突破”，让窗外洒进一道丁达尔效应的光芒。
4. **镜头语言**：在描述场景（scene）时，请使用专业术语（如：Medium shot, Extreme close-up on hands, Atmospheric neon lighting）。
5. **叙事基调**：保持现代都市/魔幻现实主义的基调，既贴近生活又充满文学张力。

用JSON格式返回：
{
  "scene": "详细的英文分镜描述（包含构图、光影、人物动作及如何自然地缝合学习元素，150词以内）",
  "storyTitle": "富有文学感或电影感的中文标题"
}`;

  let storyResult;
  try {
    const storyJson = await fetchFromAI([
      { role: "system", content: "你是一个专业的漫画叙事大师，擅长将零散信息缝合成逻辑自洽且视觉惊艳的漫画脚本。只输出JSON格式。" },
      { role: "user", content: storyPrompt }
    ], settings, true);
    storyResult = JSON.parse(storyJson);
  } catch (e) {
    console.error("Story generation error:", e);
    storyResult = {
      scene: "A student sitting in a cozy cafe, surrounded by floating vocabulary words that have turned into cute little characters. The student is smiling while taking notes, and the word-characters are playfully interacting with each other on the notebook pages.",
      storyTitle: "单词咖啡馆"
    };
  }

  // === STEP 4: Build Final Image Prompt ===
  const finalPrompt = `${selectedStyle.prompt}. 
SCENE: ${storyResult.scene}
${formatLayoutInstructions[format]} Dynamic composition, expressive characters, rich details. The image should tell a story visually. 8k quality, --ar 9:16`;

  // === STEP 4: Generate Image ===
  const cleanUrl = apiUrl.replace(/\/+$/, '');
  const isOpenRouter = cleanUrl.includes('openrouter');
  const isSiliconFlow = cleanUrl.includes('siliconflow');

  let response;
  if (isOpenRouter) {
    response = await fetch(`${cleanUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model,
        messages: [{ role: "user", content: finalPrompt }],
        modalities: ["image", "text"]
      })
    });
  } else {
    const endpoint = isSiliconFlow ? '/image/generations' : '/images/generations';
    response = await fetch(`${cleanUrl}${endpoint}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: model, prompt: finalPrompt, n: 1, size: "1024x1024" })
    });
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Comic Gen Error: ${response.status} - ${errorText.substring(0, 200)}`);
  }

  const data = await response.json();
  let imageUrl;
  if (isOpenRouter && data.choices?.[0]?.message?.images) {
    imageUrl = data.choices[0].message.images[0]?.image_url?.url;
  } else {
    imageUrl = data.data?.[0]?.url || data.data?.[0]?.b64_json;
  }

  return {
    imageUrl,
    styleName: selectedStyle.name,
    storyTitle: storyResult.storyTitle
  };
};

// Helper to check API Key
function checkApiKey(settings) {
  return settings?.apiKey && settings.apiKey.length > 5;
}

/**
 * Generates Deep Learning Notes in Markdown format
 * @param {string} word - The vocabulary word
 * @param {string} context - Original context sentence (optional)
 * @param {object} settings - User settings for API key
 * @returns {Promise<string>} Markdown content
 */
export async function generateDeepNotes(word, context, settings) {
  if (!checkApiKey(settings)) {
    console.warn("API Key check failed in generateDeepNotes");
    return null;
  }

  const fallbackPrompt = `
  Role: Expert English Teacher.
  Task: Create a "Deep Dive Vocabulary Note" for the word: "${word}".
  Context: The word appears in this sentence: "${context || 'No specific context'}".

  Output Format: Markdown (Strictly follow this structure):

  ## ${word}
  ### 1. 词性与词源
  *   **词性：** [e.g. Noun/Verb]
  *   **词源：** [Brief etymology]

  ### 2. 核心释义
  1.  **[Meaning 1]：** [Definition]
  2.  **[Meaning 2]：** [Definition]

  ### 3. 常见搭配与用法
  *   **[Collocation 1]**：[CN Meaning]
  *   **[Collocation 2]**：[CN Meaning]
      > [Example sentence]

  ### 4. 同/近义词辨析
  | 单词 | 侧重点 | 例句 |
  | :--- | :--- | :--- |
  | **${word}** | ... | ... |
  | **[Synonym]** | ... | ... |

  ### 5. 例句展示
  1.  [Sentence 1] ([CN Translation])
  2.  [Sentence 2] ([CN Translation])

  **记忆要点：** [Mnemonic or key takeaway]

  ### 6. 考试应用与备考策略
  - **考察频率：** [High/Medium]
  - **写作/翻译提分点：** [Tips]
  `;

  let prompt = settings.deepNotePrompt;
  if (prompt && typeof prompt === 'string' && prompt.trim() !== '') {
    prompt = prompt
      .replace(/{{word}}/g, word || 'N/A')
      .replace(/{{context}}/g, context || 'No specific context');
  } else {
    prompt = fallbackPrompt;
  }

  try {
    const markdown = await fetchFromAI([
      { role: "system", content: "You are a helpful linguistic assistant. Output clean Markdown." },
      { role: "user", content: prompt }
    ], settings, false); // false = text/markdown mode, not JSON

    return markdown;
  } catch (error) {
    console.error("Deep Notes Generation Error:", error);
    return null;
  }
}

/**
 * Uses AI to rewrite a user's prompt template based on instructions.
 * @param {string} currentPrompt The current raw text in the template
 * @param {string} instruction What the user wants to add or change
 * @param {object} settings Application settings containing API keys
 * @returns {Promise<string>} The new optimized raw prompt
 */
export async function optimizePromptTemplate(currentPrompt, instruction, settings) {
  if (!checkApiKey(settings)) {
    console.warn("API Key check failed in optimizePromptTemplate");
    return null;
  }

  const systemMessage = `You are a world-class Prompt Engineer. 
The user is providing an existing prompt template and an instruction on how to modify it.

YOUR TASK:
1. Revise the provided prompt template exactly as instructed.
2. Maintain any existing placeholders like {{word}} or {{context}} unless explicitly asked to remove them.
3. OUTPUT ONLY the raw, revised prompt string. DO NOT include polite opening/closing remarks (like "Here is the revised prompt"). DO NOT wrap it in a root markdown code block (e.g. \`\`\`markdown) unless the original text explicitly had it in its raw format. The output should be ready to directly copy-paste into a text area.`;

  const userMessage = `EXISTING PROMPT TEMPLATE:
---
${currentPrompt || '(Empty)'}
---

INSTRUCTION:
${instruction}`;

  try {
    const newPrompt = await fetchFromAI([
      { role: "system", content: systemMessage },
      { role: "user", content: userMessage }
    ], settings, false);

    return newPrompt ? newPrompt.trim() : null;
  } catch (error) {
    console.error("Prompt Optimization Error:", error);
    return null;
  }
}

