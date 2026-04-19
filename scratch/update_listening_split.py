import re
import os

file_path = r'e:\AIEnglish\SmartLearnPro\src\views\ListeningView.jsx'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update Imports
if 'Scissor' not in content:
    content = content.replace('Music,', 'Music, Scissors,')

if 'audioUtils' not in content:
    import_line = "import { decodeAudioData, sliceAudioBuffer, audioBufferToWav } from '../utils/audioUtils';\n"
    content = import_line + content

# 2. Add State and Split Handler
if 'isSplitting' not in content:
    content = content.replace('const [isGeneratingQuiz, setIsGeneratingQuiz] = useState(false);', 
                              'const [isGeneratingQuiz, setIsGeneratingQuiz] = useState(false);\n    const [isSplitting, setIsSplitting] = useState(false);\n    const [splitRange, setSplitRange] = useState({ start: 0, end: 10 });')

    split_handler = """    const handleSplitAudio = async () => {
        if (!activeFile) return;
        const start = parseFloat(splitRange.start);
        const end = parseFloat(splitRange.end);
        
        if (isNaN(start) || isNaN(end) || start >= end || start < 0) {
            toast.error('请输入有效的起止时间');
            return;
        }

        setIsSplitting(true);
        const tid = toast.loading('正在导出切割片段...');
        try {
            const buffer = await decodeAudioData(activeFile.blob);
            // Cap end time to duration
            const safeEnd = Math.min(end, buffer.duration);
            if (start >= safeEnd) throw new Error('起止时间超出音频范围');

            const sliced = sliceAudioBuffer(buffer, start, safeEnd);
            const wavBlob = audioBufferToWav(sliced);
            
            const segmentName = `[片段] ${activeFile.name.replace(/\\.[^/.]+$/, "")} (${Math.floor(start)}s-${Math.floor(safeEnd)}s).wav`;
            
            await saveToFileLibrary({
                name: segmentName,
                type: 'audio/wav',
                blob: wavBlob
            });
            
            toast.success('片段已保存至音频库', { id: tid });
            loadData(); // Refresh list
        } catch (e) {
            console.error('Split failed', e);
            toast.error(`切割失败: ${e.message}`, { id: tid });
        } finally {
            setIsSplitting(false);
        }
    };
"""
    # Insert before returning JSX
    content = content.replace('if (loading) {', split_handler + '\n    if (loading) {')

# 3. Add UI for Splitting
# I'll add a section in the "Audio Info Card" (around line 372 in original)
split_ui = """                                            <div className="flex items-center gap-2 px-3 py-1.5 bg-phy-glass rounded-xl border border-phy-border">
                                                <div className="flex items-center gap-1">
                                                    <span className="text-[10px] text-phy-muted">Start</span>
                                                    <input 
                                                        type="number" 
                                                        value={splitRange.start} 
                                                        onChange={(e) => setSplitRange(prev => ({ ...prev, start: e.target.value }))}
                                                        className="w-12 bg-phy-bg border border-phy-border rounded-md px-1 py-0.5 text-[10px] outline-none" 
                                                    />
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <span className="text-[10px] text-phy-muted">End</span>
                                                    <input 
                                                        type="number" 
                                                        value={splitRange.end} 
                                                        onChange={(e) => setSplitRange(prev => ({ ...prev, end: e.target.value }))}
                                                        className="w-12 bg-phy-bg border border-phy-border rounded-md px-1 py-0.5 text-[10px] outline-none" 
                                                    />
                                                </div>
                                                <button
                                                    onClick={handleSplitAudio}
                                                    disabled={isSplitting}
                                                    className="p-1.5 rounded-lg bg-phy-accent/20 text-phy-accent hover:bg-phy-accent/30 transition-all disabled:opacity-50"
                                                    title="切割为新文件"
                                                >
                                                    {isSplitting ? <Loader2 size={14} className="animate-spin" /> : <Scissors size={14} />}
                                                </button>
                                            </div>"""

# Find the end of the button group to insert UI
insertion_point = """                                            <button
                                                onClick={handleTranscribe}
                                                className="shrink-0 p-2.5 rounded-xl bg-phy-glass border border-phy-border text-phy-muted hover:text-phy-accent transition-all"
                                                title="重新转写"
                                            >
                                                <RefreshCw size={18} />
                                            </button>"""

if split_ui not in content:
    content = content.replace(insertion_point, insertion_point + "\n" + split_ui)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Successfully updated ListeningView.jsx with audio splitting functionality.")
