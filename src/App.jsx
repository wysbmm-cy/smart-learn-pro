import React, { useState } from 'react';
import { AppProvider } from './context/AppContext';
import Layout from './layouts/Layout';
import Dashboard from './views/Dashboard';
import ImportView from './views/ImportView';
import StudyView from './views/StudyView';
import HistoryView from './views/HistoryView';
import LibraryView from './views/LibraryView';
import NotesView from './views/NotesView';
import FlashcardView from './views/FlashcardView';
import SettingsView from './views/SettingsView';
import PlanView from './views/PlanView';
import CoachView from './views/CoachView';
import VideoView from './views/VideoView';
import WriterView from './views/WriterView';

function AppContent() {
    const [currentView, setCurrentView] = useState('dashboard');
    const [secondaryView, setSecondaryView] = useState('notes');
    const [isSplit, setIsSplit] = useState(false);

    const getViewComponent = (viewId) => {
        switch (viewId) {
            case 'dashboard':
                return <Dashboard onNavigate={setCurrentView} />;
            case 'import':
                return <ImportView onAnalyzeSuccess={() => setCurrentView('study')} />;
            case 'study':
                return <StudyView onNavigate={setCurrentView} />;
            case 'history':
                return <HistoryView onNavigate={setCurrentView} />;
            case 'library':
                return <LibraryView />;
            case 'notes':
                return <NotesView />;
            case 'flashcards':
                return <FlashcardView />;
            case 'settings':
                return <SettingsView />;
            case 'plan':
                return <PlanView />;
            case 'coach':
                return <CoachView />;
            case 'video':
                return <VideoView />;
            case 'writer':
                return <WriterView />;
            default:
                return <Dashboard onNavigate={setCurrentView} />;
        }
    };

    const handleOpenSplit = (viewId) => {
        setSecondaryView(viewId);
        setIsSplit(true);
    };

    return (
        <Layout
            currentView={currentView}
            setCurrentView={setCurrentView}
            isSplit={isSplit}
            setIsSplit={setIsSplit}
            onOpenSplit={handleOpenSplit}
            secondaryContent={getViewComponent(secondaryView)}
        >
            {getViewComponent(currentView)}
        </Layout>
    );
}

export default function App() {
    return (
        <AppProvider>
            <AppContent />
        </AppProvider>
    );
}
