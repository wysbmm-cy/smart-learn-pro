import React, { useMemo } from 'react';
import { Tv, AlertCircle } from 'lucide-react';

const BilibiliPlayer = ({ url }) => {
    // Extract BV ID from URL (Standard: BV1xx411c7X7)
    const bvid = useMemo(() => {
        if (!url) return null;
        const match = url.match(/(BV[a-zA-Z0-9]+)/);
        return match ? match[1] : null;
    }, [url]);

    if (!url) {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 bg-slate-900/50 rounded-2xl border-2 border-dashed border-slate-700/50 p-8">
                <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mb-4 shadow-inner">
                    <Tv size={40} className="text-slate-600" />
                </div>
                <h3 className="text-xl font-bold text-slate-300 mb-2">Ready to Watch</h3>
                <p className="text-sm text-slate-500 max-w-md text-center">
                    Paste a Bilibili video link (e.g., https://www.bilibili.com/video/BV...) in the sidebar to start learning.
                </p>
            </div>
        );
    }

    if (!bvid) {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center text-red-400 bg-red-900/10 rounded-2xl border border-red-900/20 p-8">
                <AlertCircle size={48} className="mb-4 opacity-50" />
                <h3 className="text-lg font-bold">Invalid Bilibili Link</h3>
                <p className="text-sm opacity-70 mt-1">Please ensure the URL contains a valid 'BV' ID.</p>
            </div>
        );
    }

    return (
        <div className="w-full h-full bg-black rounded-2xl overflow-hidden shadow-2xl border border-white/10 relative group">
            <iframe
                src={`//player.bilibili.com/player.html?bvid=${bvid}&page=1&high_quality=1&danmaku=0&autoplay=0`}
                className="w-full h-full border-0 absolute inset-0"
                allowFullScreen="true"
                sandbox="allow-top-navigation allow-same-origin allow-forms allow-scripts allow-popups"
            ></iframe>
        </div>
    );
};

export default BilibiliPlayer;
