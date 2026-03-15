import React from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        this.setState({
            error: error,
            errorInfo: errorInfo
        });
        console.error("Uncaught error:", error, errorInfo);
    }

    handleReload = () => {
        window.location.reload();
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen w-full flex items-center justify-center bg-slate-950 text-phy-text p-6">
                    <div className="max-w-md w-full bg-slate-900/50 border border-phy-borderHover rounded-2xl p-8 backdrop-blur-xl shadow-2xl text-center">
                        <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                            <AlertTriangle className="text-red-500" size={32} />
                        </div>

                        <h1 className="text-2xl font-bold text-white mb-2">Something went wrong</h1>
                        <p className="text-phy-muted mb-6">
                            The application encountered an unexpected error.
                        </p>

                        {this.state.error && (
                            <div className="bg-black/30 rounded-lg p-4 text-left mb-6 overflow-auto max-h-40">
                                <code className="text-xs text-red-300 font-mono">
                                    {this.state.error.toString()}
                                </code>
                            </div>
                        )}

                        <button
                            onClick={this.handleReload}
                            className="flex items-center justify-center gap-2 w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 rounded-xl transition-all shadow-lg shadow-indigo-500/20"
                        >
                            <RotateCw size={18} />
                            Reload Application
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
