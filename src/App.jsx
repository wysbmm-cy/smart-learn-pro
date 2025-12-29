import React, { useState, Suspense, lazy } from 'react';
import { Toaster } from 'react-hot-toast';
import { AppProvider } from './context/AppContext';
import Layout from './layouts/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import SkeletonLoader from './components/SkeletonLoader';

// Lazy Load Views
const Dashboard = lazy(() => import('./views/Dashboard'));
const ImportView = lazy(() => import('./views/ImportView'));
const StudyView = lazy(() => import('./views/StudyView'));
const HistoryView = lazy(() => import('./views/HistoryView'));
const LibraryView = lazy(() => import('./views/LibraryView'));
const NotesView = lazy(() => import('./views/NotesView'));
const FlashcardView = lazy(() => import('./views/FlashcardView'));
const SettingsView = lazy(() => import('./views/SettingsView'));
const PlanView = lazy(() => import('./views/PlanView'));
const CoachView = lazy(() => import('./views/CoachView'));
const VideoView = lazy(() => import('./views/VideoView'));
const WriterView = lazy(() => import('./views/WriterView'));

const LoadingFallback = () => <SkeletonLoader />;

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
        </AppProvider>
    );
}
