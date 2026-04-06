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


以下是以前的那个产品深度进化路线图

SmartLearn Pro 产品深度进化路线图 (Product Evolution Roadmap)
1. 现状极简复盘 (Current State Review)
当前状态: SmartLearn Pro 已经是一个界面精美 (Zen Mode)、核心闭环完整 (读 -> 学 -> 记) 的高级单机版学习工具。

✅ 核心优势: 极佳的视觉体验、流畅的 AI 分析流程、本地化数据安全、辅助工具（番茄钟/播放器）完善。
🚧 潜在短板:
互动性不足: 目前多为"阅读理解"，缺乏"输出"（口语/写作）的强训练。
数据孤岛: 单词和文章之间缺乏关联，没有形成知识网络。
激励机制: 只有简单的打卡，缺乏让用户"上瘾"的游戏化机制。
2. 现有功能深度优化 (Deep Polishing)
在开发新功能前，这些改进能让现有体验提升 200%。

🛠️ A. 阅读与分析 (Reading Experience)
即时划词助手 (Contextual Actions):
现状: 必须整篇分析。
改进: 鼠标选中文章中的任意单词/长难句 -> 弹窗显示 AI 解析 -> 一键添加到单词本。
双语对照阅读 (Bilingual Mode):
改进: 增加一个"翻译视图"开关，由 AI 生成段落级的中英对照，适合由浅入深的学习者。
智能显隐 (Cloze Test Mode):
改进: 在阅读模式下，一键把"生词"或"关键词"变成填空题（挖空），强迫用户回忆，点击才显示原词。
📊 B. 智能计划与数据 (Smart Plan)
热力图 (Heatmap):
改进: 这个必须有！模仿 GitHub/LeetCode 的"绿格子"贡献图。每天学得越多格子越绿。这是最直观的成就感来源。
遗忘曲线可视化:
改进: 在首页展示"今日待复习"的单词波峰图，告诉用户"今天不复习，这 50 个词就白背了"。
📝 C. 笔记系统 (Notes)
双向链接 (Bi-directional Linking):
改进: 像 Obsidian/Notion 一样，允许用 [[关键词]] 链接到另一篇笔记。AI 可以在分析文章时自动建议："这个概念你之前在《XX文章》里也记过哦"。
3. 杀手级新功能建议 (Killer Features) - 价值 $100 的点子 💡
这些功能将把 App 从"工具"升级为"私教"。

🔥 Feature 1: AI 沉浸式口语教练 (AI Voice Coach)
这是目前大模型应用最火的方向，技术上我们也完全具备条件。

功能描述:
角色扮演: 此时此刻，AI 是"雅思考官"、"星巴克店员"或"愤世嫉俗的哲学家"。
语音通话: 利用浏览器语音输入 -> Whisper 转文字 -> AI 回复 -> TTS 朗读。
实时复盘: 每聊 5 句，AI 暂停一下，指出你刚才发音不准或表达不地道的句子，并给出 Native Speaker 的说法。
价值: 解决"哑巴英语"痛点，私教一小时收费几百，我们免费。
📺 Feature 2: 视频流媒体学习 (Video Library)
痛点: 也是用户最容易疲劳的地方，纯文本太枯燥。
功能描述:
支持导入 YouTube/Bilibili 链接 (或者本地 MP4)。
自动生成字幕: 用 Whisper 提取视频字幕。
AI 总结: "这个视频讲了哪 3 个关键知识点？"
影音笔记: 点击笔记的时间戳，视频自动跳转到对应位置 (就像飞书妙记/Otter.ai)。
✍️ Feature 3: 写作批改工作台 (Writing Workbench)
功能描述:
左侧写作区，右侧 AI 助手区。
三阶批改:
L1 语法纠错: 标红基础错误。
L2 润色升格: "这个词太简单了，试试用 exacerbate 代替 make worse"。
L3 逻辑诊断: "这两段之间缺乏连接词，逻辑跳跃了"。
🕸️ Feature 4: 知识图谱 (Knowledge Graph)
功能描述:
将所有学过的 500 个单词、20 篇文章，生成一张动态的 3D 粒子网络图。
一眼看出你的知识盲区（孤立的点）和核心领域（密集的簇）。
极其炫酷，极适合截图分享社交媒体（裂变传播）。
4. 技术架构下一步 (Tech Roadmap)
PWA (Progressive Web App):
配置 manifest.json 和 Service Worker，让用户能把网站"安装"到手机桌面上，离线也能背单词。
Edge TTS:
目前只有文字，结合微软免费的高质量 Edge TTS，让每篇文章、每个单词都能"听"见。
多端同步 (Cloud Sync):
目前基于 IndexedDB (本地)。未来如果想做大，可以加一个简单的账号系统（Supabase/Firebase），实现电脑手机数据同步。