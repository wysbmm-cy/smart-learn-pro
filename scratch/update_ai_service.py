import re
import os

file_path = r'e:\AIEnglish\SmartLearnPro\src\services\ai.js'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update normalizeTaskItem
normalize_pattern = r'(targetWords: Array\.isArray\(task\?\.targetWords\) && task\.targetWords\.length\s+\? task\.targetWords\.map\(\(x\) => String\(x \|\| \'\'\)\.trim\(\)\)\.filter\(Boolean\)\s+: \[\.\.\.fallbackTargets\])(\s+)\}\);'
normalize_replacement = r'\1,\2  scaffold: task?.scaffold || null\2});'
content = re.sub(normalize_pattern, normalize_replacement, content)

# 2. Update generateTranslationChallenge Prompt
schema_pattern = r'("targetWords": \["string"\])(\s+)\}\s+],\s+"mainTask": \{\s+"id": "main-task",\s+"type": "main",\s+"chinese": "string",\s+"hint": "string",\s+"scenario": "string",\s+"targetWords": \["string"\]\s+\}'
schema_replacement = r'\1,\n      "scaffold": {\n        "phrases": [{ "cn": "string", "en": "string" }],\n        "cloze": "string with _____"\n      }\n    }\n  ],\n  "mainTask": {\n    "id": "main-task",\n    "type": "main",\n    "chinese": "string",\n    "hint": "string",\n    "scenario": "string",\n    "targetWords": ["string"],\n    "scaffold": {\n      "phrases": [{ "cn": "string", "en": "string" }],\n      "cloze": "string with _____"\n    }\n  }'
# Note: I'll use a simplified regex for the prompt to be safe
content = content.replace('"targetWords": ["string"]\n    }\n  ],\n  "mainTask": {', '"targetWords": ["string"],\n      "scaffold": {\n        "phrases": [{ "cn": "string", "en": "string" }],\n        "cloze": "string with _____"\n      }\n    }\n  ],\n  "mainTask": {')
content = content.replace('"targetWords": ["string"]\n  },\n  "requiredMinHit":', '"targetWords": ["string"],\n    "scaffold": {\n      "phrases": [{ "cn": "string", "en": "string" }],\n      "cloze": "string with _____"\n    }\n  },\n  "requiredMinHit":')

# 3. Add checkTranslationComponents
new_func = """
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
    { role: 'user', content: `Original Target Component: ${originalText}\\nUser Input: ${userInput}` }
  ], settings, true);

  const parsed = parseJsonObjectLoose(jsonStr);
  return parsed || { isCorrect: false, feedback: "解析失败", suggestion: "", score: 0 };
};

"""

# Insert after the return statement of generateTranslationChallenge
content = content.replace('    };\n  } catch (e) {\n    console.error(\'generateTranslationChallenge error:\', e);\n    return buildFallbackChallenge({ difficulty, mode, targetWords, requiredMinHit });\n  }\n};', '    };\n  } catch (e) {\n    console.error(\'generateTranslationChallenge error:\', e);\n    return buildFallbackChallenge({ difficulty, mode, targetWords, requiredMinHit });\n  }\n};\n' + new_func)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Successfully updated ai.js")
