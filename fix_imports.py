import os

file_path = r'e:\AIEnglish\SmartLearnPro\src\components\ChatSidebar.jsx'

imports = """import React, { useState, useRef, useEffect } from 'react';
import SharedMarkdown from './SharedMarkdown';
import { 
    X, Send, Bot, User, Loader2, FileText, NotebookPen, Brain, 
    History, Plus, Trash2, MessageSquare, Zap, MessageCircle, 
    Database, CheckCircle2, ChevronRight, Layers, PenTool, Mic, 
    BookOpen, ImagePlus, Calendar, BarChart3 
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useChat } from '../context/ChatContext';
import { analyzeImagesForChat, streamChatMessage, streamAgentChat } from '../services/ai';
import ChatQuizWidget from './ChatQuizWidget';
import ChatFlashcardWidget from './ChatFlashcardWidget';
import ChatWritingWidget from './ChatWritingWidget';
"""

with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# The first line is the one we want to replace
if lines and 'import ChatWritingWidget' in lines[0]:
    lines[0] = imports

with open(file_path, 'w', encoding='utf-8') as f:
    f.writelines(lines)

print("Successfully restored imports.")
