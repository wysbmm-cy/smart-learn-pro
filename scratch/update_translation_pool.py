import re
import os

file_path = r'e:\AIEnglish\SmartLearnPro\src\views\TranslationChallengeView.jsx'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update Imports
# Add getEffectiveWeaknessScore to the flashcardUtils import
if 'getEffectiveWeaknessScore' not in content:
    content = content.replace('sortByWeaknessDesc', 'getEffectiveWeaknessScore, sortByWeaknessDesc')

# 2. Update startChallenge Logic
# I'll replace the block that fetches cards and calls generateTranslationChallenge

old_logic = """            const cards = await getFlashcards();
            const generated = preset || await generateTranslationChallenge(cards, settings, {
                difficulty,
                mode: 'mixed'
            });"""

new_logic = """            const allCards = await getFlashcards();
            
            // Prioritize unfamiliar words (last two categories: Critical & Weak)
            const getScore = (c) => {
                try { return getEffectiveWeaknessScore(c); } catch(e) { return 0; }
            };

            const p1 = allCards.filter(c => getScore(c) >= 10); // 需强化 & 较弱
            const p2 = allCards.filter(c => getScore(c) >= 5 && getScore(c) < 10); // 一般
            const others = allCards.filter(c => getScore(c) < 5);

            // Create a pool of up to 40 cards, prioritizing p1 then p2
            const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);
            let pool = [];
            
            if (p1.length >= 20) {
                pool = shuffle(p1).slice(0, 40);
            } else if (p1.length + p2.length >= 10) {
                pool = [...p1, ...shuffle(p2)].slice(0, 40);
            } else {
                pool = [...p1, ...p2, ...shuffle(others)].slice(0, 40);
            }

            // Fallback to allCards if pool is empty for some reason
            const finalVocab = pool.length > 0 ? pool : allCards;

            const generated = preset || await generateTranslationChallenge(finalVocab, settings, {
                difficulty,
                mode: 'mixed'
            });"""

content = content.replace(old_logic, new_logic)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Successfully updated TranslationChallengeView.jsx with prioritized word selection logic.")
