
/**
 * AI Service for SmartLearn Pro
 * Handles API communication using Parallel Requests for performance.
 */

// Helper for delay
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export const sendChat = async (messages, settings, jsonRequired = false) => {
  return await fetchFromAI(messages, settings, jsonRequired);
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

const toOptionText = (opt = "") => String(opt).replace(/^[A-D][\.\)\:\-\s]+/i, "").trim();
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
      topic_sentence: p.topic_sentence || '',
      keywords: Array.isArray(p.keywords) ? p.keywords : [],
      evidence_hint: p.evidence_hint || '',
      concession: Boolean(p.concession)
    })),
    checklist: Array.isArray(parsed.checklist) ? parsed.checklist : []
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
  const apiBaseUrl = settings.ttsApiBaseUrl || settings.audioApiBaseUrl || settings.apiBaseUrl;
  const cleanUrl = apiBaseUrl.replace(/\/+$/, '');

  const modelName = settings.ttsModelName || "tts-1";
  const voice = settings.ttsVoice || "alloy";

  if (!apiKey) throw new Error("Missing AI/TTS API Key");

  try {
    const response = await fetch(`${cleanUrl}/audio/speech`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: modelName,
        input: text,
        voice: voice
      })
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`TTS Error: ${response.status} - ${err}`);
    }

    // Return Blob for playback
    return await response.blob();

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

const TRANSLATION_SCENARIOS = [
  '校园社团招新时向同学说明活动安排',
  '项目汇报会里总结进度并回应质疑',
  '地铁延误后给同伴解释改约方案',
  '实习面试中介绍个人优势与目标岗位',
  '周末出游时和朋友讨论预算与路线',
  '跨部门协作时确认分工和截止时间',
  '线上客服沟通退款与补偿流程',
  '家庭聚会中讨论健康生活方式',
  '课堂讨论时表达支持与反对观点',
  '邮件回复中礼貌拒绝不合理请求'
];

const normalizeTranslationDifficulty = (value = 'medium') => {
  const raw = String(value || '').toLowerCase();
  if (raw === 'easy' || raw === 'hard') return raw;
  return 'medium';
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
    : [...fallbackTargets]
});

const buildFallbackChallenge = ({ difficulty, mode, targetWords, requiredMinHit }) => {
  const scenario = pickRandomItems(TRANSLATION_SCENARIOS, 1)[0] || '日常沟通';
  const warmupCount = difficulty === 'easy' ? 1 : 2;
  const warmups = Array.from({ length: warmupCount }).map((_, idx) => ({
    id: `warmup-${idx + 1}`,
    type: 'warmup',
    chinese: idx === 0
      ? '请将这句话译成英文：虽然计划有变，但我们仍按时完成了任务。'
      : '请将这句话译成英文：如果资源有限，我们就先解决最关键的问题。',
    hint: '保持句法清晰，避免逐字直译。',
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
      chinese: '你负责一次小组方案汇报。请将这段中文译成英文：我们原本担心进度拖延会影响整体交付，但在重新分配任务后，关键里程碑提前两天完成。接下来我们将持续跟踪风险并优化协作流程。',
      hint: '主任务建议使用 2-3 个复合句，体现逻辑衔接。',
      scenario,
      targetWords
    },
    requiredMinHit,
    targetWords
  };
};

export const generateTranslationChallenge = async (vocabList, settings, options = {}) => {
  if (!settings.apiKey) throw new Error('Missing API Key');

  const difficulty = normalizeTranslationDifficulty(options?.difficulty);
  const mode = options?.mode === 'mixed' ? 'mixed' : 'mixed';

  const vocabWords = Array.from(
    new Set((Array.isArray(vocabList) ? vocabList : []).map(normalizeTargetWord).filter(Boolean))
  );
  const targetWords = pickRandomItems(vocabWords, 6);
  const warmupCount = difficulty === 'easy' ? 1 : 2;
  const requiredMinHit = Math.min(
    targetWords.length,
    difficulty === 'easy' ? 1 : difficulty === 'hard' ? 3 : 2
  );
  const mainScenario = pickRandomItems(TRANSLATION_SCENARIOS, 1)[0] || '日常沟通';

  const systemPrompt = `
Role: Advanced EN-CN translation trainer designer.
Task: Build a mixed translation challenge package for writing improvement.

Difficulty: ${difficulty}
Mode: ${mode}
Warmup count: ${warmupCount}
Main scenario: ${mainScenario}
Target words: ${targetWords.length ? targetWords.join(', ') : 'none'}
Required minimum target word hits: ${requiredMinHit}

Requirements:
1. Return a JSON object only, no markdown fences.
2. Create warmup items and one main task, all in Chinese source text.
3. Warmups should be short (15-28 Chinese characters), main task should be 55-110 Chinese characters.
4. Ensure tasks are realistic and exam-oriented (CET/IELTS style).
5. Keep hints concise and actionable.
6. targetWords in each item should be a subset of global targetWords.

JSON Schema:
{
  "challengeId": "string",
  "difficulty": "${difficulty}",
  "mode": "mixed",
  "warmups": [
    {
      "id": "warmup-1",
      "type": "warmup",
      "chinese": "string",
      "hint": "string",
      "scenario": "string",
      "targetWords": ["string"]
    }
  ],
  "mainTask": {
    "id": "main-task",
    "type": "main",
    "chinese": "string",
    "hint": "string",
    "scenario": "string",
    "targetWords": ["string"]
  },
  "requiredMinHit": ${requiredMinHit},
  "targetWords": ["string"]
}
  `.trim();

  try {
    const jsonStr = await fetchFromAI([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: 'Generate challenge package now.' }
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
        requiredMinHit: normalizedRequiredMinHit
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
        requiredMinHit: normalizedRequiredMinHit
      });
    }

    return {
      challengeId: String(parsed?.challengeId || `challenge-${Date.now()}`),
      difficulty,
      mode,
      warmups,
      mainTask,
      requiredMinHit: normalizedRequiredMinHit,
      targetWords: normalizedTargets
    };
  } catch (e) {
    console.error('generateTranslationChallenge error:', e);
    return buildFallbackChallenge({ difficulty, mode, targetWords, requiredMinHit });
  }
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

  const systemPrompt = `
Role: Professional EN translation grader for exam preparation.
Task: Grade one English translation answer against Chinese source.

Difficulty: ${difficulty}
Mode: ${mode}
Chinese source: ${sourceChinese || '(empty)'}
Target words: ${targetWords.join(', ') || '(none)'}
Required minimum target word hits: ${requiredMinHit}

Output JSON only:
{
  "score100": 0,
  "score15": 0,
  "subscores": {
    "accuracy": 0,
    "fluency": 0,
    "vocabulary": 0,
    "grammar": 0
  },
  "vocab_hit": [
    { "word": "string", "used": true, "correctly": true, "evidence": "string" }
  ],
  "issues": [
    {
      "type": "accuracy|grammar|vocabulary|style",
      "severity": "critical|major|minor",
      "sentence_index": 0,
      "original": "string",
      "fixed": "string",
      "reason": "string"
    }
  ],
  "overall_comment": "string",
  "improved_version": "string",
  "pass": true
}

Rubric:
- score100 should reflect semantic fidelity first, then language quality.
- score15 is mapped from score100 but can be adjusted for severe errors.
- If target words miss requirement, apply score penalty but do not force pass=false automatically.
  `.trim();

  try {
    const jsonStr = await fetchFromAI([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: String(userEnglish || '').trim() }
    ], settings, true, 3, { signal: options?.signal });

    const parsed = parseJsonObjectLoose(jsonStr) || {};
    const score100 = Math.max(0, Math.min(100, Math.round(Number(parsed?.score100 ?? parsed?.score ?? 0) || 0)));
    const autoScore15 = Math.round((score100 / 100) * 15);
    const score15 = Math.max(0, Math.min(15, Math.round(Number(parsed?.score15 ?? autoScore15) || 0)));
    const subscores = parsed?.subscores || {};

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
      type: String(issue?.type || 'accuracy').trim(),
      severity: String(issue?.severity || 'major').trim(),
      sentence_index: Math.max(0, Number(issue?.sentence_index || 0) || 0),
      original: String(issue?.original || '').trim(),
      fixed: String(issue?.fixed || '').trim(),
      reason: String(issue?.reason || '').trim()
    }));
    const vocabPenalty = requiredMinHit > hitCount ? Math.min(3, requiredMinHit - hitCount) : 0;
    const normalizedScore15 = Math.max(0, Math.min(15, score15 - vocabPenalty));
    const pass = typeof parsed?.pass === 'boolean'
      ? parsed.pass
      : (normalizedScore15 >= 9);

    return {
      score100,
      score15: normalizedScore15,
      subscores: {
        accuracy: Number(subscores?.accuracy ?? 0),
        fluency: Number(subscores?.fluency ?? 0),
        vocabulary: Number(subscores?.vocabulary ?? 0),
        grammar: Number(subscores?.grammar ?? 0)
      },
      vocab_hit,
      level: normalizedScore15 >= 13 ? 'excellent' : normalizedScore15 >= 10 ? 'good' : normalizedScore15 >= 7 ? 'fair' : 'needs_work',
      issues,
      improved_version: String(parsed?.improved_version || parsed?.rewritten_text || '').trim(),
      overall_comment: String(parsed?.overall_comment || parsed?.comment || '').trim(),
      pass,
      requiredMinHit
    };
  } catch (e) {
    if (e?.name === 'AbortError') throw e;
    console.error('gradeTranslation error:', e);
    return {
      score100: 0,
      score15: 0,
      subscores: { accuracy: 0, fluency: 0, vocabulary: 0, grammar: 0 },
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
      overall_comment: '评分接口暂不可用，请稍后重试。',
      pass: false,
      requiredMinHit
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
export const generateDailySummaryImage = async (highlights, settings, style = 'cyberpunk', todayStats = {}) => {
  const apiUrl = settings.imageGenApiUrl || settings.apiBaseUrl;
  const apiKey = settings.imageGenApiKey || settings.apiKey;
  const model = settings.imageGenModel || 'dall-e-3';

  if (!apiUrl || !apiKey) {
    return null;
  }

  const cleanUrl = apiUrl.replace(/\/+$/, '');
  const isOpenRouter = cleanUrl.includes('openrouter');
  const isSiliconFlow = cleanUrl.includes('siliconflow');

  // Build stats display text
  const statsText = `Words: ${todayStats.wordsLearned || 0}, Articles: ${todayStats.articlesRead || 0}, Notes: ${todayStats.notesCreated || 0} (${todayStats.writingCount || 0} words), Chats: ${todayStats.questionsAsked || 0}`;

  // === STEP 1: Use Main AI to Analyze Highlights ===
  const highlightContent = highlights?.length
    ? highlights.map(h => `- [${h.type}] ${h.content}`).join('\n')
    : '今日未标记特定重点，但用户进行了大量基于数据的学习活动。请根据统计数据生成抽象总结。';

  const analysisPrompt = `你是一个学习助手，请分析以下今日学习内容，并提取用于生成图片的关键元素。

今日学习统计：
- 学习单词数: ${todayStats.wordsLearned || 0}
- 阅读文章数: ${todayStats.articlesRead || 0}
- 创建笔记数: ${todayStats.notesCreated || 0} (写作量: ${todayStats.writingCount || 0} 词)
- 对话互动数: ${todayStats.questionsAsked || 0} (次会话)

今日标记内容：
${highlightContent}

即使没有具体标记内容，也请根据统计数据（学习量的多少）来构建画面。
如果学习量很大，画面应体现“充实、爆发、能量”；如果量小，体现“积累、起步、精致”。

请以JSON格式返回以下信息：
{
  "mainObject": "代表今日学习的标志性物品(如: 一本发光的书、一座知识灯塔、一把打开思维的钥匙)",
  "objectName": "给这个物品的炫酷名称(如: 知识核心、智慧水晶)",
  "taskIcon1": "第一个学习任务的图标(如: 阅读卷轴、词汇宝石)",
  "taskIcon2": "第二个学习任务的图标(如: 写作羽毛笔、笔记本)",
  "actionVerb": "动态动作描述(如: 闪耀、爆发能量、释放光芒)"
}`;

  let analysisResult;
  try {
    const analysisJson = await fetchFromAI([
      { role: "system", content: "你是一个创意助手，只输出JSON格式。" },
      { role: "user", content: analysisPrompt }
    ], settings, true);
    analysisResult = JSON.parse(analysisJson);
  } catch (e) {
    console.error("Analysis error:", e);
    analysisResult = {
      mainObject: "a glowing crystal brain representing knowledge",
      objectName: "Knowledge Core",
      taskIcon1: "scrolls of wisdom",
      taskIcon2: "golden pen",
      actionVerb: "radiating energy"
    };
  }

  // === STEP 2: Build Prompt from Template with Stats ===
  // Battlefield 1 Stats Screen Layout: "Newspaper/Report" Header, Two-Column Grid, Data Lists
  const bf1Layout = `LAYOUT STRUCTURE: Strictly follows the 'Battlefield 1 End of Round' stats screen. 
  1. HEADER: Top section is a newspaper-style header bar with big text "DAILY REPORT" and the Date "${new Date().toISOString().split('T')[0]}".
  2. TWO COLUMNS: Below header, split into Left (40%) and Right (60%) columns with a vertical divider line.
  3. LEFT COLUMN (Main Stat): Large prominent display of "${analysisResult.mainObject}" as the 'Most Valuable Item'. Below it, a big Kill/Score-style stat: "${todayStats.wordsLearned} WORDS".
  4. RIGHT COLUMN (Detailed Stats): A vertical list of 'Weapon Stats' style rows. Each row has an Icon, a Title (e.g. Reading, Writing), and a progress bar or number.
  5. FOOTER: Small text at bottom "Generated by SmartLearn AI".`;

  let prompt;
  if (style === 'popart') {
    prompt = `Vertical UI design. ${bf1Layout}
    AESTHETIC STYLE: Vibrant POP ART COMIC BOOK style. 
    - The 'Paper' texture is replaced by a comic book halftone pattern background.
    - Colors: High-contrast bright yellow, red, electric blue, and deep black outlines.
    - The Main Object in left column is a bold cel-shaded illustration.
    - Fonts: Comic book block letters.
    - Atmosphere: Energetic, explosive, 'Kapow!' visual effects. 8k resolution. --ar 9:16`;
  } else {
    // Cyberpunk Default
    prompt = `Vertical UI design. ${bf1Layout}
    AESTHETIC STYLE: CYBERPUNK NEON NOIR.
    - The 'Paper' texture is replaced by a dark, gritty holographic screen with digital noise/glitch effects.
    - Colors: Dark blue/purple background, glowing neon cyan/magenta text and UI lines.
    - The Main Object in left column is a glowing wireframe or 3D hologram.
    - Fonts: Futuristic digital readout fonts, glowing numbers.
    - Atmosphere: High-tech, futuristic military interface, Blade Runner vibes. 8k resolution, ray tracing. --ar 9:16`;
  }


  let response;
  if (isOpenRouter) {
    response = await fetch(`${cleanUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model,
        messages: [{ role: "user", content: prompt }],
        modalities: ["image", "text"]
      })
    });
  } else {
    const endpoint = isSiliconFlow ? '/image/generations' : '/images/generations';
    response = await fetch(`${cleanUrl}${endpoint}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: model, prompt: prompt, n: 1, size: "1024x1024" })
    });
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Image Gen Error: ${response.status} - ${errorText.substring(0, 200)}`);
  }

  const data = await response.json();
  // OpenRouter returns in choices[0].message.images
  if (isOpenRouter && data.choices?.[0]?.message?.images) {
    return data.choices[0].message.images[0]?.image_url?.url;
  }
  return data.data?.[0]?.url || data.data?.[0]?.b64_json;
};

// Generate Semantic Knowledge Graph Connections
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

/**
 * Stream an Agent chat with function calling support.
 * The AI can request tool calls; we execute them and feed results back.
 * 
 * @param {Array} messages - Chat history
 * @param {Object} settings - API settings
 * @param {Function} onDelta - Called with text content deltas
 * @param {Function} onToolCall - Called with { name, status } for UI visualization
 */
export const streamAgentChat = async (messages, settings, onDelta, onToolCall) => {
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
    // Step 1: Call AI with tools enabled (non-streaming to capture tool_calls)
    let assistantMsg = await callWithTools(finalMessages);
    let loopMessages = [...finalMessages, assistantMsg];

    // Step 2: Loop to handle tool calls (max 5 rounds)
    let rounds = 0;
    while (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0 && rounds < 5) {
      rounds++;

      for (const toolCall of assistantMsg.tool_calls) {
        const toolName = toolCall.function.name;
        let toolArgs = {};
        try {
          toolArgs = JSON.parse(toolCall.function.arguments || '{}');
        } catch (e) { /* empty args */ }

        // Notify UI
        if (onToolCall) onToolCall({ name: toolName, status: 'calling' });

        // Execute tool
        const result = await executeAgentTool(toolName, toolArgs, { settings });

        // Notify UI done (pass result for action detection)
        if (onToolCall) onToolCall({ name: toolName, status: 'done', result });

        // Add tool result to conversation
        loopMessages.push({
          role: "tool",
          tool_call_id: toolCall.id,
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
