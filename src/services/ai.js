
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
      return data.choices[0].message.content;
    } catch (error) {
      if (i === retries - 1) throw error;
      console.warn(`API Request failed. Retrying... (${i + 1}/${retries})`);
    }
  }
};

export const digitalizeExam = async (text, settings, drillType = null) => {
  if (!settings.apiKey) throw new Error("Missing API Key");

  // 🚄 Optimization: Auto-Splitting for Long Exams (Parallel Processing)
  // Only apply if text is long enough AND logic is 'full' (drill modes are usually targeted/short)
  // Fix: Sanitize text to remove potential binary or weird control chars that break API
  text = text.replace(/[\x00-\x09\x0B-\x0C\x0E-\x1F\x7F]/g, '');
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

export const analyzeText = async (text, settings) => {
  if (!settings.apiKey) throw new Error("Missing API Key");

  // "Turbo Mode": Aggregated Analysis (One-Shot) to balance Speed vs Rate Limits.
  // Sends text ONCE (Saving Input Tokens) and makes ONE request (Saving RPM).

  const vocabCount = settings.vocabCount || "10-15";

  // Use custom prompt from settings, or fallback to default
  let analysisSystemPrompt = settings.vocabAnalysisPrompt || `
  Role: Expert English Teacher.
  Task: Analyze the provided text comprehensively in one go.
  Requirements:
  1. Summary: Chinese summary + Difficulty Level.
  2. Vocabulary: Extract {{vocabCount}} key words/phrases (prioritize academic). For each: Chinese meaning, mnemonic, usage tips.
  3. Grammar: Identify 2-3 **truly advanced or noteworthy** syntactic structures (e.g., Inversion, Subjunctive, Participle Phrases, Complex Clauses). 
     *   **Ignore** simple Subject-Verb-Object sentences.
     *   Focus on sentence variety and rhetorical function.
     *   Pattern: The abstract structure (e.g., "Not only... but also...").
     *   Explanation: Why is this used? (e.g., "Emphasizes contrast...").
  
  Output MUST be valid JSON with this structure:
  {
    "summary": "...",
    "level": "CET-4/CET-6/IELTS/Advanced",
    "vocabulary": [
      { "word": "...", "phonetic": "...", "pos": "...", "meaning": "...", "entry": "...", "mnemonic": "...", "writing": "..." }
    ],
    "structures": [
      { "pattern": "...", "type": "...", "explanation": "..." }
    ]
  }
  `;

  // Replace placeholder
  analysisSystemPrompt = analysisSystemPrompt.replace('{{vocabCount}}', vocabCount);

  // Cap text to ~6000 chars to be safe for most 16k/32k context models while leaving room for output
  const safeText = text.length > 8000 ? text.substring(0, 8000) + "..." : text;

  try {
    const jsonStr = await fetchFromAI([
      { role: "system", content: analysisSystemPrompt },
      { role: "user", content: safeText }
    ], settings, true);

    // Parse logic
    try {
      return JSON.parse(jsonStr);
    } catch (e) {
      // Fallback regex if model adds markdown blocks
      const match = jsonStr.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
      throw new Error("Failed to parse AI response");
    }

  } catch (error) {
    console.error("Analysis Error:", error);
    throw error;
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
export const analyzeWriting = async (text, settings) => {
  if (!settings.apiKey) throw new Error("Missing API Key");

  const level = settings.writingLevel || "CET-4/6";
  const customInstruction = settings.writingPrompt || "Standard strict grading.";

  const systemPrompt = `
  Role: Professional English Examiner (Target Level: ${level}).
  
  Task: Grade and polish the student's essay based on ${level} standards.

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
    "corrected_text": "String (The FULL essay rewritten to be 14-15 points standard, keeping original meaning)",
    "issues": [
      {
        "type": "String (Grammar/Vocabulary/Cohesion/Spelling)",
        "original": "String (The specific error snippet)",
        "fixed": "String (The corrected snippet)",
        "reason": "String (Brief explanation in Chinese)"
      }
    ],
    "improvement_tips": ["String", "String", "String"],
    "vocabulary_analysis": [
      {
        "word": "String (The word in the text)",
        "level": "String (B2/C1/C2 or 'Basic' if it should be improved)",
        "suggestion": "String (Optional better synonym)"
      }
    ],
    "knowledge_summary": "String (A generic markdown note summarizing key grammar points, vocabulary usage, and better expressions from this essay. Format it as a study note.)"
  }
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

    const parsed = JSON.parse(jsonStr);

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

  const prompt = `
  Role: Expert Language Teacher.
  Task: Extract 10-20 most important/challenging vocabulary words from the text below.
  Output Format: JSON Array of "Flashcards".
  [
    { "front": "English Word", "back": "Chinese Meaning + Example Sentence (En/Cn)" }
  ]
  Requirements:
  - "front": The word or short phrase.
  - "back": Concise definition (CN) followed by a short example.
  - Filter: CEFR B2-C2 level words. Skip very simple words (like 'the', 'is', 'happy').
  - Count: Return at least 10, max 30.
  `;

  const safeText = text.substring(0, 4000);

  try {
    const jsonStr = await fetchFromAI([
      { role: "system", content: prompt },
      { role: "user", content: safeText }
    ], settings, true);

    try {
      const parsed = JSON.parse(jsonStr);
      // Handle if AI wraps in wrapper object key
      if (Array.isArray(parsed)) return parsed;
      if (parsed.flashcards && Array.isArray(parsed.flashcards)) return parsed.flashcards;
      if (parsed.vocabulary && Array.isArray(parsed.vocabulary)) return parsed.vocabulary;

      // Fallback: Check for array in keys
      const values = Object.values(parsed);
      const arr = values.find(v => Array.isArray(v));
      if (arr) return arr;

      throw new Error("Invalid Array Format");
    } catch (e) {
      // Fallback Regex
      const match = jsonStr.match(/\[[\s\S]*\]/);
      if (match) return JSON.parse(match[0]);
      throw e;
    }
  } catch (error) {
    console.error("Vocab Extraction Error:", error);
    throw error;
  }
};

export const generateTranslationChallenge = async (vocabList, settings) => {
  if (!settings.apiKey) throw new Error("Missing API Key");

  // Pick 3-5 random words if list is long
  const targets = Array.isArray(vocabList) && vocabList.length > 0
    ? vocabList.sort(() => 0.5 - Math.random()).slice(0, 5)
    : [];

  const targetStr = targets.map(v => `${v.front} (${v.back})`).join(', ');

  const systemPrompt = `
  Role: Creative Examination Question Generator.
  Task: Create a Chinese sentence that implicitly requires using specific English vocabulary to translate correctly.
  Target Vocabulary: [${targetStr || "Random Daily Topic"}]

  Requirements:
  1. Output a single natural Chinese sentence (or short paragraph 30-50 words).
  2. The Chinese should strongly hint at the usage of the target words without being a direct dictionary definition.
  3. Context: Daily life, Academic, or Workplace.
  4. Output Format: JSON
  {
    "chinese": "...",
    "targetWords": ["word1", "word2"],
    "hint": "Try to use the target vocabulary!"
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
    return data;
  } catch (e) {
    console.error("Trans Gen Error", e);
    // Fallback
    return {
      chinese: "请尝试使用最近学过的单词造句。",
      targetWords: targets.map(t => t.front),
      hint: "AI Generation Failed, free mode."
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

  const systemPrompt = `You are an expert English vocabulary trainer creating HIGH-QUALITY practice exercises.

Target Word: "${word}"
Definition: "${definition}"

Generate EXACTLY 8 different exercise types. Follow the EXACT specifications below:

=== TYPE 1: similar_words (形近词辨析) ===
- Question: 给出3-4个拼写相似的英文单词，让学生选出目标单词的正确释义
- The distractors must be VISUALLY SIMILAR in spelling (e.g., affect/effect, adapt/adopt, complement/compliment)
- NOT semantically similar, but SPELLING similar
- Example: For "complement" → distractors could be "compliment", "complete", "compel"

=== TYPE 2: context (语境释义) ===
- Question: 给出一个包含目标单词的完整英文句子（不要空格），让学生选择该单词在此语境中的中文意思
- Do NOT use blanks like "_____", show the complete sentence with the word
- Example: "He is a seasoned politician." → 选择 seasoned 在此句中的意思

=== TYPE 3: cloze (填空题) ===
- Question: 根据中文释义，填写对应的英文单词
- Provide helpful hints: first letter, word length, root meaning

=== TYPE 4: collocation (搭配选择) ===
- Question: 选择与目标单词搭配正确的英文短语
- Options must be ENGLISH PHRASES, not Chinese translations
- Use authentic English collocations vs incorrect collocations
- Example: "charcoal grill" (正确) vs "charcoal water" (错误) vs "charcoal sleep" (错误)
- All 4 options should be English phrases containing the target word

=== TYPE 5: word_forms (词性变换) ===
- Question: 根据句子选择正确的词形
- Include: noun, verb, adjective, adverb forms
- Context sentence showing which form is needed

=== TYPE 6: synonyms (同义词/反义词) ===
- Question: 选择目标单词的英文同义词或反义词
- Options must be ENGLISH words, not Chinese
- Example: For "seasoned" (经验丰富的) → synonyms: experienced, veteran, skilled

=== TYPE 7: sentence_order (句子排序) ===
- Provide scrambled words from a sentence using the target word
- The sentence should demonstrate proper usage

=== TYPE 8: dictation (听写模式) ===
- Provide phonetic transcription, syllable breakdown, and letter count

Return JSON format:
{
  "drills": [
    {
      "type": "similar_words",
      "question": "以下哪个是 '${word}' 的正确释义？注意区分形近词。",
      "options": ["${definition}", "形近词1的释义", "形近词2的释义", "形近词3的释义"],
      "answer": 0,
      "explanation": "形近词辨析：${word} vs 形近词1 vs 形近词2 的区别",
      "distractorWords": ["spelling_similar_word1", "spelling_similar_word2", "spelling_similar_word3"]
    },
    {
      "type": "context",
      "question": "He is a seasoned politician with decades of experience.",
      "targetWord": "${word}",
      "options": ["语境意思A", "语境意思B（不符合语境）", "语境意思C", "语境意思D"],
      "answer": 0,
      "explanation": "在这个语境中，seasoned 表示经验丰富的，形容政治家老练"
    },
    {
      "type": "cloze",
      "question": "根据释义填写单词: ${definition}",
      "answer": "${word}",
      "hints": ["首字母: ${word.charAt(0).toUpperCase()}", "${word.length} 个字母", "词根/词缀提示"]
    },
    {
      "type": "collocation",
      "question": "选择与 '${word}' 搭配正确的英文短语",
      "options": ["charcoal grill", "charcoal water", "charcoal sleep", "charcoal sing"],
      "answer": 0,
      "explanation": "charcoal grill (木炭烧烤架) 是正确搭配，其他选项不是常见搭配"
    },
    {
      "type": "word_forms",
      "question": "选择句子中应填入的正确词形：The _____ of his argument was convincing.",
      "baseWord": "${word}",
      "targetForm": "名词/动词/形容词/副词",
      "options": ["正确词形", "错误词形1", "错误词形2", "错误词形3"],
      "answer": 0,
      "forms": {"noun": "名词形式", "verb": "动词形式", "adj": "形容词形式", "adv": "副词形式"}
    },
    {
      "type": "synonyms",
      "question": "选择 '${word}' 的英文同义词",
      "mode": "synonym",
      "options": ["english_synonym1", "unrelated_word1", "unrelated_word2", "antonym"],
      "answer": 0,
      "explanation": "${word} 和 synonym1 都表示...；其他选项的含义是..."
    },
    {
      "type": "sentence_order",
      "question": "将下列单词排列成正确的句子",
      "scrambled": ["word1", "word2", "${word}", "word4", "word5"],
      "correctOrder": [0, 1, 2, 3, 4],
      "fullSentence": "完整的正确句子（包含目标单词）"
    },
    {
      "type": "dictation",
      "word": "${word}",
      "phonetic": "/IPA发音/",
      "syllables": ["音-", "节-", "划-", "分"],
      "letterCount": ${word.length},
      "hints": ["${word.charAt(0).toUpperCase()}开头", "共${word.length}个字母"]
    }
  ]
}

CRITICAL REQUIREMENTS (MUST FOLLOW EXACTLY):
1. similar_words: Distractors must be SPELLING-similar ENGLISH words, not meaning-similar
2. context: Sentence MUST be in ENGLISH only (e.g. "We plan to grill some vegetables for dinner."), NO Chinese sentences, NO blanks "_____"
3. synonyms: All 4 options must be ENGLISH WORDS (roast, barbecue, broil), NEVER Chinese words
4. collocation: All 4 options must be ENGLISH PHRASES (charcoal grill, gas grill), NEVER Chinese
5. word_forms: Context sentence must be in ENGLISH
6. sentence_order: Words must be ENGLISH
7. All explanations should be educational and in Chinese (解析用中文)
8. Questions (题目说明) can be in Chinese, but EXAMPLE SENTENCES and OPTIONS must be ENGLISH
9. RANDOMIZE ANSWER POSITION: The correct answer should NOT always be option A (index 0). Randomly place the correct answer at position 0, 1, 2, or 3 and set "answer" field accordingly`;

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

