
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
        throw new Error(`API Error: ${response.status}`);
      }

      const data = await response.json();
      return data.choices[0].message.content;
    } catch (error) {
      if (i === retries - 1) throw error;
      console.warn(`API Request failed. Retrying... (${i + 1}/${retries})`);
    }
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

export const generatePlanInsight = async (settings, goal, stats) => {
  // stats: { totalWords, dueDay0, dueNext7Days, streak, lastStudyDate }
  const prompt = `
    Role: You are an expert adaptive learning coach (AI SmartCoach).
    User's Goal: "${goal || 'General English Improvement'}"
    Current Stats:
    - Total Vocab Learned: ${stats.totalWords}
    - Words Due Today: ${stats.dueDay0}
    - Streak: ${stats.streak} days
    - Future Load (Next 7 days): ${JSON.stringify(stats.dueNext7Days)}

    Task:
    1. Analyze the user's progress towards their goal.
    2. Provide a "Daily Insight" (2-3 sentences, encouraging but data-driven).
    3. Estimate an ETA or provide a "Pace Comment" based on their current stack.
    4. Suggest 3 specific "Action Items" for today.

    Output Format (JSON):
    {
        "insight": "Master, ...",
        "paceComment": "At this rate, you are on track to...",
        "actionItems": ["Review ...", "Read ...", "Learn ..."]
    }
    
    Language: Chinese (Simplified). Keep it professional yet motivating.
    `;

  try {
    const response = await fetch(`${settings.apiBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify({
        model: settings.modelName,
        messages: [
          { role: "system", content: "You are a helpful JSON-speaking study coach. Always return valid JSON." },
          { role: "user", content: prompt }
        ],
        temperature: 0.7
      })
    });

    const data = await response.json();
    const content = data.choices[0].message.content;

    // Extract JSON
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return {
      insight: "AI 连接成功，但无法解析建议。请继续保持学习！",
      paceComment: "数据分析中...",
      actionItems: ["复习今日单词", "阅读一篇短文", "输入新词"]
    };

  } catch (error) {
    console.error("Plan AI Error:", error);
    return null;
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
