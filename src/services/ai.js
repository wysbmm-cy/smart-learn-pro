
/**
 * AI Service for SmartLearn Pro
 * Handles API communication using Parallel Requests for performance.
 */

// Helper for delay
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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
  const analysisSystemPrompt = `
  Role: Expert English Teacher.
  Task: Analyze the provided text comprehensively in one go.
  Requirements:
  1. Summary: Chinese summary + Difficulty Level.
  2. Vocabulary: Extract ${vocabCount} key words/phrases (prioritize academic). For each: Chinese meaning, mnemonic, usage tips.
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

  // Use fetchFromAI with jsonRequired=false for free-form chat
  const content = await fetchFromAI([
    { role: "system", content: settings.systemPrompt || "You are a helpful English tutor." },
    ...messages
  ], settings, false);

  return content;
};

export const streamChatMessage = async (messages, settings, onDelta) => {
  if (!settings.apiKey) throw new Error("Missing API Key");
  const { apiKey, apiBaseUrl, modelName } = settings;
  const cleanUrl = apiBaseUrl.replace(/\/+$/, '');

  try {
    const response = await fetch(`${cleanUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: modelName || "gpt-3.5-turbo",
        messages: [
          { role: "system", content: settings.systemPrompt || "You are a helpful English tutor." },
          ...messages
        ],
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
  formData.append("file", file);
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
