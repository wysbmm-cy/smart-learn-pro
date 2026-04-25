import React, { useState, Suspense, lazy, useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import { AppProvider, useApp } from './context/AppContext';
import { ChatProvider } from './context/ChatContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './layouts/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import SkeletonLoader from './components/SkeletonLoader';

// Lazy Load Views Factories (Exposed for Preloading)
const viewFactories = {
    Dashboard: () => import('./views/Dashboard'),
    ReviewCenterView: () => import('./views/ReviewCenterView'),
    ImportView: () => import('./views/ImportView'),
    HistoryView: () => import('./views/HistoryView'),
    LibraryView: () => import('./views/LibraryView'),
    NotesView: () => import('./views/NotesView'),
    FlashcardView: () => import('./views/FlashcardView'),
    SettingsView: () => import('./views/SettingsView'),

    CoachView: () => import('./views/CoachView'),
    VideoView: () => import('./views/VideoView'),
    WriterView: () => import('./views/WriterView'),
    TranslationChallengeView: () => import('./views/TranslationChallengeView'),
    LoginView: () => import('./views/LoginView'),
    ExamView: () => import('./views/ExamView'),
    KnowledgeGraphView: () => import('./views/KnowledgeGraphView'),
    ListeningView: () => import('./views/ListeningView'),
};

export const preloadAllViews = () => {
    Object.values(viewFactories).forEach(factory => {
        try { factory(); } catch (e) { console.error('Preload failed', e); }
    });
};

const Dashboard = lazy(viewFactories.Dashboard);
const ReviewCenterView = lazy(viewFactories.ReviewCenterView);
const ImportView = lazy(viewFactories.ImportView);
const HistoryView = lazy(viewFactories.HistoryView);
const LibraryView = lazy(viewFactories.LibraryView);
const NotesView = lazy(viewFactories.NotesView);
const FlashcardView = lazy(viewFactories.FlashcardView);
const SettingsView = lazy(viewFactories.SettingsView);

const CoachView = lazy(viewFactories.CoachView);
const VideoView = lazy(viewFactories.VideoView);
const WriterView = lazy(viewFactories.WriterView);
const TranslationChallengeView = lazy(viewFactories.TranslationChallengeView);
const LoginView = lazy(viewFactories.LoginView);
const ExamView = lazy(viewFactories.ExamView);
const KnowledgeGraphView = lazy(viewFactories.KnowledgeGraphView);
const ListeningView = lazy(viewFactories.ListeningView);

const LoadingFallback = () => <SkeletonLoader />;

function AppContent() {
    const [currentView, setCurrentView] = useState('dashboard');
    const [viewParams, setViewParams] = useState({});
    const [secondaryView, setSecondaryView] = useState('notes');
    const [isSplit, setIsSplit] = useState(false);
    const { settings, navigateRef } = useApp();
    const { loading: authLoading, canEnterApp } = useAuth();

    const handleNavigate = (viewOrObj) => {
        if (typeof viewOrObj === 'string') {
            setCurrentView(viewOrObj);
            setViewParams({});
        } else {
            setCurrentView(viewOrObj.view);
            setViewParams(viewOrObj.params || {});
        }
    };

    // Register navigation for Agent Mode
    React.useEffect(() => {
        navigateRef.current = handleNavigate;
    }, [navigateRef]);

    useEffect(() => {
        if (settings.preloadAll) {
            preloadAllViews();
        }
    }, [settings.preloadAll]);

    const getViewComponent = (viewId) => {
        switch (viewId) {
            case 'dashboard':
                return <Dashboard onNavigate={setCurrentView} />;
            case 'review':
                return <ReviewCenterView onNavigate={setCurrentView} />;
            case 'import':
                return <ImportView onNavigate={handleNavigate} params={viewParams} />;
            case 'history':
                return <HistoryView onNavigate={setCurrentView} />;
            case 'library':
                return <LibraryView />;
            case 'notes':
                return <NotesView params={viewParams} />;
            case 'flashcards':
                return <FlashcardView params={viewParams} />;
            case 'settings':
                return <SettingsView />;

            case 'coach':
                return <CoachView />;
            case 'video':
                return <VideoView />;
            case 'writer':
                return <WriterView params={viewParams} />;
            case 'translation':
                return <TranslationChallengeView />;
            case 'login':
                return <LoginView onNavigate={setCurrentView} />;
            case 'exam':
                return <ExamView onNavigate={setCurrentView} params={viewParams} />;
            case 'knowledge':
                return <KnowledgeGraphView />;
            case 'listening':
                return <ListeningView />;
            default:
                return <Dashboard onNavigate={setCurrentView} />;
        }
    };

    const handleOpenSplit = (viewId) => {
        setSecondaryView(viewId);
        setIsSplit(true);
    };

    if (authLoading) {
        return <LoadingFallback />;
    }

    if (!canEnterApp) {
        return (
            <Suspense fallback={<LoadingFallback />}>
                <LoginView onNavigate={setCurrentView} />
            </Suspense>
        );
    }

    return (
        <Layout
            currentView={currentView}
            setCurrentView={setCurrentView}
            isSplit={isSplit}
            setIsSplit={setIsSplit}
            onOpenSplit={handleOpenSplit}
            secondaryContent={
                <Suspense fallback={<LoadingFallback />}>
                    {getViewComponent(secondaryView)}
                </Suspense>
            }
        >
            <Suspense fallback={<LoadingFallback />}>
                {getViewComponent(currentView)}
            </Suspense>
        </Layout>
    );
}

export default function App() {
    return (
        <AppProvider>
            <AuthProvider>
                <ChatProvider>
                    <Toaster
                        position="top-center"
                        toastOptions={{
                            style: {
                                background: '#1e293b',
                                color: '#fff',
                                border: '1px solid rgba(255,255,255,0.1)',
                            },
                        }}
                    />
                    <ErrorBoundary>
                        <AppContent />
                    </ErrorBoundary>
                </ChatProvider>
            </AuthProvider>
        </AppProvider>
    );
}
