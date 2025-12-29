# SmartLearn Pro - Project Handover Document

**Date**: 2025-12-29
**Project Root**: `e:\AIEnglish\SmartLearnPro`
**User OS**: Windows

---

## 1. Project Overview
**SmartLearn Pro** is a high-end, aesthetic AI English learning application.
- **Tech Stack**: React, Vite, Tailwind CSS, Lucide Icons.
- **State Management**: Context API (`AppContext`) + LocalStorage + IndexedDB (`idb`).
- **Design System**: "Zen Glass" (Glassmorphism), Dark Mode, Smooth Gradients.

---

## 2. GitHub Configuration
- **Repository URL**: `https://github.com/wysbmm-cy/smart-learn-pro.git`
- **Workflow**:
  The user has Git configured. You can auto-run git commands.
  ```powershell
  git add .
  git commit -m "your message"
  git push
  ```

---

## 3. Core Features Implemented

### A. Study View (Reading & Analysis)
- **PDF/Text Import**: Parses text/PDFs.
- **Interactive Reader**: Click words for definition.
- **Translation Bubble**: Non-blocking, draggable popup for sentence translation (Standard + Deep Dive).
- **Study Heatmap**: GitHub-style activity contribution graph.

### B. AI Voice Coach (`CoachView.jsx`)
- **Full-Duplex Voice Loop**: Record -> STT (SiliconFlow) -> Chat (Moonshot) -> TTS (SiliconFlow).
- **Audio Persistence**: Recording and TTS audio blobs are saved in IndexedDB (`chat_sessions`).
- **History System**: View past conversations, replay audio.
- **Pronunciation Analysis**: AI analyzes transcripts for phonetics/grammar ("AI 点评").
- **Clear Conversation**: Mechanism to wipe session and free memory.

### C. System Components
- **IndexDB Wrapper (`db.js`)**: Handles `history`, `notes`, `files`, `chat_sessions`.
- **Pomodoro Timer**: Floating focus timer with Work/Rest modes.
- **Global Settings**: Config for API Endpoints (Moonshot/SiliconFlow), TTS Models (`fnlp/MOSS-TTSD-v0.5`), and Voice IDs.

---

## 4. Current Task Status (Synced from `task.md`)

- [x] **Project Initialization** (Vite, Tailwind)
- [x] **Core Architecture** (Context, IndexedDB)
- [x] **UI/UX** (Zen Glass, Dashboard, Sidebar, Settings)
- [x] **Study Features** (Analysis, Heatmap, History, PDF)
- [x] **Knowledge Management** (Notes, Flashcards, SRS Algorithm)
- [x] **AI Engine** (Queueing, Turbo Mode, Deep Dive)
- [x] **Voice Coach (P1)**
    - [x] STT/TTS Integration
    - [x] Full Interaction Loop
    - [x] Audio Replay & History Persistence
    - [x] Pronunciation Feedback
- [x] **Pomodoro Timer** (Floating component)

**Remaining / Next Steps**:
- [ ] **User Manual**: In-app guide for new users.
- [ ] **Global Player Polish**: Minimized/Floating mode for the audio player.

---

## 5. Product Roadmap (Future)

### 🚀 P2: Killer Features (Next Phase)

#### 📺 Feature 2: Video Learning (Video Library)
- **Goal**: Import YouTube/Bilibili/Local MP4.
- **Tech**: Whisper for subtitle generation.
- **Features**: 
    - Sync subtitles with video.
    - Click subtitle to query word.
    - AI Summary of video content.

#### ✍️ Feature 3: Writing Workbench
- **Goal**: Dedicated writing practice area.
- **Features**:
    - Split view (Editor + AI Assistant).
    - 3-Level Correction: Grammar -> Style -> Logic.

#### 🕸️ Feature 4: Knowledge Graph
- **Goal**: 3D Visualization of learned words/articles.

---

## 6. Instructions for New Agent
1.  **Read this file** carefully to understand the context.
2.  **Read `src/services/ai.js`** to understand the API wrapper (fixes for 400 errors, system prompt logic).
3.  **Read `src/views/CoachView.jsx`** to see the latest complex component structure.
4.  **Confirm with User**: "Ready to start Video Learning or Writing Workbench?"
