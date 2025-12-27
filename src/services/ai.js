
/**
 * AI Service for SmartLearn Pro
 * Handles API communication using Parallel Requests for performance.
 */

const fetchFromAI = async (messages, settings, jsonRequired = true) => {
  const { apiKey, apiBaseUrl, modelName } = settings;
  const cleanUrl = apiBaseUrl.replace(/\/+$/, '');

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
    if (response.status === 404) throw new Error("404 Not Found: Check API Base URL/Model.");
    if (response.status === 401) throw new Error("401 Unauthorized: Invalid API Key.");
    throw new Error(`API Error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
};

export const analyzeText = async (text, settings) => {
  if (!settings.apiKey) throw new Error("Missing API Key");

  // Hardcoded strictly for analysis validation, ensuring user chat settings don't break JSON parsing
  const analysisSystemPrompt = "You are an expert English Language Teaching assistant provided by SmartLearn Pro. Your task is to analyze text deeply. You MUST response in strict JSON format as requested.";

  // Task 1: Summary & Difficulty (Fast)
  const taskSummary = fetchFromAI([
    { role: "system", content: analysisSystemPrompt + " Output JSON only: { \"summary\": \"Chinese summary\", \"level\": \"CET-4/6/IELTS\" }" },
    { role: "user", content: `Summarize this text in Chinese and assess difficulty level:\n${text.substring(0, 2000)}` }
  ], settings);

  // Task 2: Vocabulary (Parallel)
  const taskVocab = fetchFromAI([
    { role: "system", content: analysisSystemPrompt + " Output JSON only: { \"vocabulary\": [{ word, phonetic, pos, meaning, example, writing, mnemonic, collocations }] }" },
    { role: "user", content: `Extract 5 key words from this text. For each, provide writing tips and mnemonics:\n${text}` }
  ], settings);

  // Task 3: Grammar (Parallel)
  // Only analyze if text is long enough, otherwise skip or do simple analysis
  const taskGrammar = fetchFromAI([
    { role: "system", content: analysisSystemPrompt + " Output JSON only: { \"structures\": [{ pattern, type, explanation }] }" },
    { role: "user", content: `Analyze the grammar of this text. Find 1-2 complex sentence structures:\n${text}` }
  ], settings);

  try {
    const [summaryRes, vocabRes, grammarRes] = await Promise.all([taskSummary, taskVocab, taskGrammar]);

    // Merge Results
    const parse = (str) => {
      try { return JSON.parse(str); }
      catch (e) {
        // Fallback for messy models
        const match = str.match(/\{[\s\S]*\}/);
        return match ? JSON.parse(match[0]) : {};
      }
    };

    const summaryData = parse(summaryRes);
    const vocabData = parse(vocabRes);
    const grammarData = parse(grammarRes);

    return {
      ...summaryData,
      ...vocabData,
      ...grammarData
    };

  } catch (error) {
    console.error("Parallel Analysis Error:", error);
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
