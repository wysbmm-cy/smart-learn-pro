---
name: zhiying-product-naming
description: Generate and evaluate product names for this AI English learning software. Use when user asks naming, branding, product naming, or launch copy naming.
---

# Zhiying Product Naming Skill

Use this skill when naming or renaming the English learning product.
Primary target: Chinese market users, with future web/app brand scalability.

## Scope
- Product naming (Chinese / English / mixed)
- Short launch naming copy
- Name shortlist scoring and final recommendation

## Required workflow
1. Confirm or infer naming brief:
   - product function (AI English learning platform)
   - audience (Chinese learners: school, exam, self-study)
   - tone (trustworthy, intelligent, growth-oriented)
   - constraints (easy to speak, easy to type, avoid ambiguity)
2. Generate three pools:
   - 30 Chinese names
   - 30 English names
   - 20 mixed CN+EN names
3. Score all candidates with the rubric in `references/rubric.md`.
4. Return Top 10 with a compact table and final recommendation.

## Product-specific positioning defaults
If user does not override, use:
- Core promise: "AI-driven English mastery with flashcards, reading, writing, translation, and review planning."
- Character: smart, practical, reliable, exam-capable.
- Naming style:
  - Chinese: 2-4 characters preferred
  - English: 1-2 words preferred, avoid long compounds
  - Mixed: concise and readable for app icon and nav

## Naming generation rules
- Metaphor-driven first, thesaurus-driven second.
- Avoid generic AI slop:
  - "smart + learn + ai + pro" style clones should be heavily penalized.
- Avoid difficult pronunciation or confusing homophones.
- Avoid names that imply a too-narrow feature (only flashcards, only writing, etc.).
- Favor expandable umbrella names that can cover future modules.

## Output contract
Always output in this order:
1. 30 Chinese names (numbered list)
2. 30 English names (numbered list)
3. 20 mixed names (numbered list)
4. Top 10 scoring table:
   - columns: Rank, Name, Type, Total, Memorability, Clarity, Distinctiveness, Brand Fit, Expandability, Notes
5. Final pick recommendation:
   - best 1
   - safe 1
   - bold 1

## Optional availability check
If user asks for launch readiness, run checks for:
- domain (at least .com/.cn candidates)
- app store/search conflict quick scan
- github/org and social handle rough availability

