# AGENTS.md

## Project Overview

SmartLearnPro / VerbaPath is an AI English learning app built with React, Vite, Tailwind CSS, Electron, Capacitor Android, and a small Node HTTP server. The product includes reading analysis, flashcards with FSRS spaced repetition, notes, writing practice, translation drills, listening, video learning, knowledge graph, AI chat/agent tools, voice coach, daily summaries, and local-first persistence.

The primary app is a Vite React single page application. It can run in the browser, inside Electron, or be built into `dist` for Capacitor/Android and packaged desktop builds.

## Important Commands

- Install dependencies: `npm install`
- Browser dev server: `npm run dev`
- Local API proxy/auth server: `npm run server:dev`
- Frontend + server together: `npm run full:dev`
- Electron dev mode: `npm run electron:dev`
- Production build: `npm run build`
- Preview production build: `npm run preview`
- Lint: `npm run lint`
- Electron build: `npm run electron:build`

Vite runs on `http://localhost:5173` by default. The local server uses port `3001`, and Vite proxies `/api` to `http://localhost:3001`.

## Repository Map

- `src/App.jsx`: top-level providers, lazy-loaded view registry, route/view switching, split-view handling.
- `src/main.jsx`: React entry point.
- `src/context/AppContext.jsx`: app-wide settings, stats, navigation ref, IndexedDB wrappers, FSRS card scheduling, audio player state, background generation tasks, knowledge-link synchronization.
- `src/context/ChatContext.jsx`: chat/agent conversation state.
- `src/context/AuthContext.jsx`: auth state. Login code exists, but `AUTH_GATE_ENABLED` is currently `false` in `src/App.jsx`.
- `src/services/db.js`: IndexedDB schema and CRUD helpers. Current DB name is `SmartLearnDB`, version `16`.
- `src/services/ai.js`: AI, image, audio, TTS, and analysis API helpers.
- `src/services/agentTools.js`: tool layer for in-app AI agent actions.
- `src/views/`: main feature screens such as dashboard, import, flashcards, notes, writer, video, coach, exam, listening, learning flow, knowledge graph.
- `src/components/`: shared UI components and feature widgets.
- `src/utils/`: reusable logic for flashcards, review queue, notes, audio, knowledge linking, learning flow, and diffs.
- `src/styles/themes.css`: theme variables used by Tailwind `phy.*` colors.
- `electron/main.cjs`: Electron main process.
- `server/index.js`: local Node HTTP server for auth and AI/audio/TTS/image proxy endpoints.
- `server/db.js`: server-side SQLite auth/session persistence.
- `android/`: Capacitor Android project.
- `landing/`: standalone landing page.
- `docs/`: user documentation and manual images.
- `dist/`, `release/`, `node_modules/`, `backup/`, `temp/`, `scratch/`, `extract_asar_tmp/`: generated, dependency, or working-output folders. Avoid editing unless the task explicitly targets them.

## Architecture Notes

- The app is local-first. Most user data lives in browser IndexedDB through `src/services/db.js`.
- Settings and lightweight stats live in `localStorage` under keys such as `smartlearn_settings`, `smartlearn_theme`, and `smartlearn_stats`.
- Flashcard scheduling uses `ts-fsrs` from `src/context/AppContext.jsx`; keep FSRS compatibility fields when changing flashcard records.
- API defaults point to server-managed proxy endpoints:
  - main AI: `/api/ai`
  - audio/STT: `/api/audio`
  - TTS: `/api/tts`
  - image generation: `/api/image`
- The Node server expects provider keys through environment variables such as `AI_PROXY_API_KEY`, `DEEPSEEK_API_KEY`, `MOONSHOT_API_KEY`, `AUDIO_PROXY_API_KEY`, `SILICONFLOW_API_KEY`, `TTS_PROXY_API_KEY`, and `IMAGE_PROXY_API_KEY`.
- Vite config uses `base: './'` for Electron compatibility. Preserve this unless there is a specific deployment reason to change it.
- Some older Chinese strings in the repository show mojibake. Be careful when editing nearby text; prefer UTF-8 and avoid broad reformatting that could make encoding damage worse.

## Project Coding Principles

Follow these principles when changing this project:

- Do not rewrite large areas. Prefer patches, local edits, and targeted changes. Large files such as `WriterView.jsx`, `FlashcardView.jsx`, and `ExamView.jsx` should only be changed around the target behavior unless the user explicitly asks for a broader refactor.
- Use UTF-8 and protect Chinese text. New files and user-facing Chinese copy should be UTF-8. Avoid bulk rewrite methods that can corrupt Chinese characters. When Chinese text must be changed, prefer `apply_patch` or an explicit UTF-8 no-BOM write path.
- Read before editing. Inspect the current file, functions, state, and data structures before deciding where code belongs. This app has many connected features; do not guess from memory.
- Work in small increments. For complex features, split work into data shape, UI, interaction, and verification. Avoid dumping hundreds of lines at once when smaller patches can keep errors easy to locate.
- Do not break existing data. Keep old data compatible. New fields should usually be optional. Do not casually bump IndexedDB versions or introduce destructive migrations. For example, if learning-flow nodes gain `config` or `output`, old nodes must still open normally.
- Guard high-risk operations. Delete, bulk move, and bulk edit agent tools must have a clear scope, explainable result, and a reversible path where possible. Tool-layer protections should prevent broad accidental deletion such as removing all flashcards based only on a vague phrase like "generated today".
- Mobile must be genuinely usable. Check whether screens can scroll, whether bottom buttons cover content, whether drawers and main content fight over scrolling, whether core actions are reachable within two steps, and whether UI density is reasonable.
- Agent abilities must be real tool actions. The agent should not only say "done"; it must call the relevant tool, show a plan, and show execution results. If data was not retrieved or written, do not pretend it was.
- User-facing copy must be understandable. Agent plans, settings, learning-flow nodes, translation scoring, and similar surfaces should show Chinese purpose, impact scope, and next action instead of raw English tool names or technical fields.
- Build verification is expected for code changes. Run `npm run build` after code edits whenever feasible. For documentation-only or standalone HTML changes, a lighter check is acceptable: confirm the file exists, encoding is normal, and paths are correct.

Short version: change less, change precisely, read first; preserve Chinese text and existing behavior; make risky operations controllable and mobile flows truly usable.

## Coding Guidelines

- Follow existing React functional component patterns and keep feature logic close to the relevant view/component unless a shared helper already exists.
- Prefer existing context methods and DB helpers over direct IndexedDB access from UI components.
- When adding persistent data, prefer optional fields and backwards-compatible reads first. Only update `DB_VERSION` and `onupgradeneeded` in `src/services/db.js` when a new object store or index is truly required.
- Keep UI consistent with the current glass/dark theme system and Tailwind `phy.*` semantic colors where possible.
- Use `lucide-react` for icons if an icon is needed.
- Avoid touching generated folders and packaged artifacts unless the requested task is a build/package task.
- Do not overwrite user data, local settings, SQLite files, IndexedDB assumptions, or existing worktree changes without explicit approval.
- The worktree may already contain user edits. Read `git status --short` before larger edits and preserve unrelated changes.

## Testing And Verification

- For normal frontend changes, run `npm run build` at minimum.
- Run `npm run lint` when changing enough JS/JSX that style or hook rules might be affected.
- For API/auth/proxy work, run `npm run server:dev` and check `/api/health`.
- For Electron-specific changes, verify with `npm run electron:dev` when feasible.
- For Android/Capacitor changes, build the web app first, then use the Capacitor/Android workflow already present in the repo.

## Current Product Context

Implemented areas include:

- Reading/import workflow with PDF/text support and AI analysis.
- Flashcards, FSRS review, review center, forgetting-curve style learning support.
- Notes, folders, deep-note parsing, and knowledge-link synchronization into writing/translation materials.
- AI chat/agent sidebar and tool services.
- Voice coach with STT/TTS integration and persisted chat sessions.
- Writing workbench, translation challenge, listening lab, video view, knowledge graph, and learning-flow canvas.
- Daily summary image/story comic background generation tasks.
- User guide documentation in `docs/`.

Potential follow-up areas from existing handover notes include polishing the global audio player, continuing video learning, improving writing workbench depth, and expanding knowledge graph behavior.
