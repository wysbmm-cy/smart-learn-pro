
/**
 * AI Service for SmartLearn Pro
 * Handles API communication using Parallel Requests for performance.
 */

// Helper for delay
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export const sendChat = async (messages, settings, jsonRequired = false) => {
  return await fetchFromAI(messages, settings, jsonRequired);
};

const fetchFromAI = async (messages, settings, jsonRequired = true, retries = 3) => {
  const { apiKey, apiBaseUrl, modelName } = settings;
  const cleanUrl = apiBaseUrl.replace(/\/+$/, '');
  let lastError = null;

  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(`${cleanUrl}/chat/completions`, {
        method: 'POST',
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

const extractJSON = (str) => {
  try {
    const match = str.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : null;
  } catch (e) {
    return null;
  }
};

/**
 * AI Writing Polish Engine (CET-4/6 Standard)
 */
export const analyzeWriting = async (text, settings, analysisMode = 'polish') => {
  if (!settings.apiKey) throw new Error("Missing API Key");

  // Merge analysisMode into settings for internal use if needed, or just use it directly
  // Actually, I updated the prompt generation to read `settings.analysisMode` OR `mode` arg effectively.
  // Let's adhere to the convention: Pass mode as the NEW 3rd argument, but also allow settings override.
  const effectiveSettings = { ...settings, analysisMode: analysisMode };
  return analyzeWritingInternal(text, effectiveSettings);
};

const analyzeWritingInternal = async (text, settings) => {

  const level = settings.writingLevel || "CET-4/6";
  const mode = settings.analysisMode || "polish"; // 'grammar' | 'polish' | 'academic'

  const modePrompts = {
    'grammar': "STRICTLY GRAMMAR CHECK. Focus ONLY on fixing object errors (Grammar, Spelling, Punctuation). Do NOT change the user's style or vocabulary unless incorrect.",
    'polish': "STANDARD POLISHING. Fix errors and improve vocabulary/flow to make it natural and native-like.",
    'academic': "ACADEMIC REWRITING. Elevate the writing to a formal, academic standard. Use advanced sentence structures (inversion, subjunctive) and sophisticated vocabulary."
  };

  const currentModeInstruction = modePrompts[mode] || modePrompts['polish'];
  const customInstruction = settings.writingPrompt || "Standard strict grading.";

  const systemPrompt = `
  Role: Professional English Examiner (Target Level: ${level}).
  
  Task: Analyze the student's essay.
  CURRENT MODE: ${currentModeInstruction}

  User Custom Instruction: ${customInstruction}
  
  Grading Standards (15 Points Max):
  - 14-15 (Excellent): Relevant, articulate, diverse vocabulary, advanced grammar, effective cohesion.
  - 11-13 (Good): Relevant, generally clear, some variety in language, minor errors.
  - 8-10 (Fair): Mostly relevant, basic structure clear, frequent but not major errors.
  - 5-7 (Poor): Unclear structure, limited vocabulary, frequent grammar errors affecting understanding.
  - 2-4 (Very Poor): Off-topic or mostly unintelligible.
  
  Output Requirements (JSON Only):
  {
    "score": Number (0-15),
    "level": "String (Excellent/Good/Fair/Poor/Very Poor)",
    "comment": "String (Short overall comment, ~50 words, encouraging but strict)",
    "corrected_text": "String (The FULL essay rewritten based on the CURRENT MODE)",
    "issues": [
      {
        "type": "String (e.g., Grammar, Cohesion, Style, Vocab)",
        "severity": "String (critical | improvement | style)",
        "original": "String (Exact substring from original text)",
        "fixed": "String (Suggested fix)",
        "reason": "String (Brief explanation in Chinese)"
      }
    ],
    "improvement_tips": ["String", "String", "String"],
    "vocabulary_analysis": [
      { "word": "String", "level": "String", "suggestion": "String" }
    ],
    "knowledge_summary": "String (Markdown)"
  }
  
  Severity Guide:
  - critical: MAJOR Errors (Grammar, Spelling, Punctuation) -> shown as Red Wavy Lines.
  - improvement: Minor improvements (Word choice, redundancy) -> shown as Amber Blocks.
  - style: Advanced styling (Flow, Nativeness) -> shown as Purple Blocks.

  CRITICAL INSTRUCTION:
  - DENSITY: Aim for a balanced feedback density. For a standard essay, identify at least 1 issue every 2-3 sentences.
  - For LONG texts, ensure the feedback is distributed EVENLY throughout the entire text, not just the beginning.
  - Do NOT flag every single minor change unless it's a 'critical' error. Focus on impactful improvements.
  `;

  const safeText = text.substring(0, 5000); // Limit input

  const jsonStr = await fetchFromAI([
    { role: "system", content: systemPrompt },
    { role: "user", content: `Here is my essay:\n\n${safeText}` }
  ], settings, true);

  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    const extracted = extractJSON(jsonStr);
    if (!extracted) throw new Error("AI Parsing Failed: " + jsonStr.substring(0, 100));
    return extracted;
  }
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

export const generateTranslationChallenge = async (vocabList, settings) => {
  if (!settings.apiKey) throw new Error("Missing API Key");

  // Pick 3-5 random words if list is long
  const targets = Array.isArray(vocabList) && vocabList.length > 0
    ? vocabList.sort(() => 0.5 - Math.random()).slice(0, 5)
    : [];

  const targetStr = targets.map(v => `${v.front} (${v.back})`).join(', ');

  // 场景库：15+个生活化情景
  const SCENARIOS = [
    '超市购物结账时与收银员的对话',
    '餐厅点餐时与服务员的交流',
    '问路时与路人的对话',
    '去医院看病时与医生的沟通',
    '快递员送货上门时的对话',
    '面试时与HR的问答',
    '工作会议中的汇报发言',
    '给客户写商务邮件的内容',
    '课堂讨论时发表观点',
    '论文答辩时回答问题',
    '机场安检或值机的对话',
    '酒店入住登记的交流',
    '旅游景点咨询的对话',
    '朋友聚会闲聊的话题',
    '家庭聚餐时的温馨对话',
    '网购咨询客服的聊天',
    '健身房办卡时的沟通',
    '银行办理业务的对话',
    '新闻时事评论的表达'
  ];

  const randomScenario = SCENARIOS[Math.floor(Math.random() * SCENARIOS.length)];

  const systemPrompt = `
  Role: Creative Language Practice Generator.
  Task: Create a natural Chinese sentence/paragraph for translation practice.
  
  Target Vocabulary: [${targetStr || "Any common words"}]
  Scenario: ${randomScenario}

  Requirements:
  1. Write a natural Chinese paragraph (40-60 words) that fits the scenario.
  2. The context should implicitly require using the target vocabulary when translated.
  3. Make it conversational and realistic - like something you'd actually say in real life.
  4. DO NOT make it sound like a textbook exercise.
  5. Include emotional elements, reactions, or small details to make it vivid.
  
  Output Format: JSON
  {
    "chinese": "...",
    "targetWords": ["word1", "word2"],
    "hint": "提示：试着使用目标词汇！",
    "scenario": "${randomScenario}"
  }
  `;

  const jsonStr = await fetchFromAI([
    { role: "system", content: systemPrompt },
    { role: "user", content: "Generate a challenge now." }
  ], settings, true);

  try {
    const data = JSON.parse(jsonStr);
    // Ensure targetWords is array
    if (!data.targetWords) data.targetWords = targets.map(t => t.front);
    if (!data.scenario) data.scenario = randomScenario;
    return data;
  } catch (e) {
    console.error("Trans Gen Error", e);
    // Fallback
    return {
      chinese: "请尝试使用最近学过的单词造句。",
      targetWords: targets.map(t => t.front),
      hint: "AI Generation Failed, free mode.",
      scenario: randomScenario
    };
  }
};

export const gradeTranslation = async (challenge, userEnglish, settings) => {
  if (!settings.apiKey) throw new Error("Missing API Key");

  const systemPrompt = `
  Role: Strict Translation Grader.
  Task: Grade user's English translation of a Chinese sentence.
  Original Chinese: "${challenge.chinese}"
  Required Vocabulary: ${JSON.stringify(challenge.targetWords)}
  
  Grading Criteria:
  1. Accuracy (Did they convey the meaning?)
  2. Vocabulary (Did they use the required words correctly?)
  3. Grammar.
  
  Output JSON:
  {
    "score": Number(0-100),
    "comment": "String (Brief feedback)",
    "improved_version": "String (Better translation using required words)",
    "vocab_check": [
      { "word": "word1", "used": Boolean, "correctly": Boolean }
    ],
    "issues": [
      {
        "type": "String (Grammar/Vocabulary/Style)",
        "severity": "String (critical/improvement/style)",
        "original": "String (Exact segment from USER translation)",
        "fixed": "String (Correction)",
        "reason": "String (Brief explanation in Chinese)"
      }
    ]
  }
  `;

  const jsonStr = await fetchFromAI([
    { role: "system", content: systemPrompt },
    { role: "user", content: userEnglish }
  ], settings, true);

  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    return { score: 0, comment: "Error parsing grade.", improved_version: "", vocab_check: [] };
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
        const result = await executeAgentTool(toolName, toolArgs);

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
  const storyPrompt = `你是一个创意漫画编剧。请根据以下学习内容，创作一个有趣的漫画场景描述。

今日学习标记：
${highlights.map(h => `- [${h.type}] ${h.content}`).join('\n')}

格式要求：${formatInstructions[format]}

规则：
1. 围绕这些学习内容本身来创作故事，不要加入龙、怪物、魔法等奇幻元素
2. 主角是"我"——一个正在学习这些内容的普通人（学生/上班族）
3. 场景可以是：教室、图书馆、咖啡馆、书房、地铁上看书等现代生活场景
4. 把学习内容拟人化或具象化，让它们成为场景的一部分（比如单词变成可爱的小精灵、语法规则变成路标、知识点变成建筑物等）
5. 保持温馨、有趣、贴近生活的基调

用JSON格式返回：
{
  "scene": "场景描述（英文，100词以内，描述画面构图、人物动作、周围元素等）",
  "storyTitle": "故事标题（中文，简短有趣）"
}`;

  let storyResult;
  try {
    const storyJson = await fetchFromAI([
      { role: "system", content: "你是一个创意漫画编剧，擅长把学习内容变成温馨有趣的漫画故事。主角是学习者本人。只输出JSON。" },
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
