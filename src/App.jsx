import React, { useState } from 'react';
import { AppProvider } from './context/AppContext';
import Layout from './layouts/Layout';
import Dashboard from './views/Dashboard';
import ImportView from './views/ImportView';
import StudyView from './views/StudyView';
import SettingsView from './views/SettingsView';

function AppContent() {
    const [currentView, setCurrentView] = useState('dashboard');

    const renderView = () => {
        switch (currentView) {
            case 'dashboard':
                return <Dashboard onNavigate={setCurrentView} />;
            case 'import':
                return <ImportView onAnalyzeSuccess={() => setCurrentView('study')} />;
            case 'study':
                return <StudyView onNavigate={setCurrentView} />;
            case 'settings':
                return <SettingsView />;
            case 'plan':
                return (
                    <div className="flex items-center justify-center h-full text-slate-400 bg-slate-100 rounded-2xl border-2 border-dashed border-slate-200">
                        Work in Progress: Learning Plan Module
                    </div>
                );
            default:
                return <Dashboard onNavigate={setCurrentView} />;
        }
    };

    return (
        <Layout currentView={currentView} setCurrentView={setCurrentView}>
            {renderView()}
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
