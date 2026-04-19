import re
import os

file_path = r'e:\AIEnglish\SmartLearnPro\src\views\TranslationChallengeView.jsx'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update Imports
content = content.replace("import { generateTranslationChallenge, gradeTranslation } from '../services/ai';", 
                          "import { generateTranslationChallenge, gradeTranslation, checkTranslationComponents } from '../services/ai';")

# 2. Update buildTasks
content = re.sub(r'(targetWords: Array\.isArray\(item\.targetWords\) \? item\.targetWords : \[\]\s+)\}\)\);', 
                 r'\1, scaffold: item.scaffold || null\n    }));', content)
content = re.sub(r'(targetWords: Array\.isArray\(challenge\.mainTask\.targetWords\) \? challenge\.mainTask\.targetWords : \[\]\s+)\}\]', 
                 r'\1, scaffold: challenge.mainTask.scaffold || null\n        }]', content)

# 3. Add States
content = content.replace("const [customTargetWordsText, setCustomTargetWordsText] = useState('');", 
                          "const [customTargetWordsText, setCustomTargetWordsText] = useState('');\n\n    // Scaffolded Translation States\n    const [practiceMode, setPracticeMode] = useState('full'); // 'full' | 'scaffolded'\n    const [subStage, setSubStage] = useState('phrases'); // 'phrases' | 'cloze' | 'full'\n    const [scaffoldAnswers, setScaffoldAnswers] = useState({});\n    const [scaffoldFeedback, setScaffoldFeedback] = useState({});\n    const [checkingSubStep, setCheckingSubStep] = useState(false);")

# 4. Update startChallenge to reset states
content = content.replace("setAnswers({});\n            setResults({});", 
                          "setAnswers({});\n            setResults({});\n            setSubStage('phrases');\n            setScaffoldAnswers({});\n            setScaffoldFeedback({});")

# 5. Add checkSubStep helper
check_substep_func = """
    const checkSubStep = async (type, originalText, inputKey) => {
        const input = String(scaffoldAnswers[inputKey] || '').trim();
        if (!input) {
            toast.error('请输入内容');
            return;
        }
        setCheckingSubStep(true);
        try {
            const result = await checkTranslationComponents(type, {
                chinese: currentTask.chinese,
                originalText: originalText
            }, input, settings);
            
            setScaffoldFeedback(prev => ({
                ...prev,
                [inputKey]: result
            }));
            
            if (result.isCorrect) {
                toast.success(result.feedback || '回答正确！');
            } else {
                toast.error(result.feedback || '再想想看？');
            }
        } catch (e) {
            toast.error(`检查失败：${e?.message || '未知错误'}`);
        } finally {
            setCheckingSubStep(false);
        }
    };

    const handleNextSubStage = () => {
        if (subStage === 'phrases') setSubStage('cloze');
        else if (subStage === 'cloze') {
            // Pre-fill the final answer area if it's empty
            if (!currentAnswer) {
                // Try to use the cloze correctly filled version or just let the user type
                // For now, just advance
            }
            setSubStage('full');
        }
    };

"""

content = content.replace("const nextTask = () => {", check_substep_func + "const nextTask = () => {")

# 6. Add Mode Toggle in Setup UI
content = content.replace('<button onClick={() => startChallenge()} disabled={loadingGen} className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold inline-flex items-center gap-2 disabled:opacity-60">', 
                          '<div className="flex rounded-xl bg-phy-glass border border-phy-border p-0.5">\n                                <button onClick={() => setPracticeMode(\'full\')} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${practiceMode === \'full\' ? \'bg-indigo-600 text-white shadow-lg\' : \'text-phy-muted hover:text-phy-text\'}`}>全句模式</button>\n                                <button onClick={() => setPracticeMode(\'scaffolded\')} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${practiceMode === \'scaffolded\' ? \'bg-indigo-600 text-white shadow-lg\' : \'text-phy-muted hover:text-phy-text\'}`}>阶梯模式</button>\n                            </div>\n                            <button onClick={() => startChallenge()} disabled={loadingGen} className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold inline-flex items-center gap-2 disabled:opacity-60">')

# 7. Update Answer Stage Rendering
# This is the tricky part. I'll replace the text area block with a conditional rendering.
answer_box_start = '<div className="glass-panel rounded-2xl border border-phy-border p-4">'
# We need to find the specific answer box.
# I'll look for the textarea inside it.

full_answer_block = """
                                    <div className="glass-panel rounded-2xl border border-phy-border p-4">
                                        {practiceMode === 'scaffolded' && subStage !== 'full' ? (
                                            <div className="space-y-6">
                                                {/* Sub-stage tabs */}
                                                <div className="flex items-center gap-2 border-b border-phy-border pb-3">
                                                    <div className={`px-3 py-1 rounded-full text-[10px] font-bold ${subStage === 'phrases' ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-400/30' : 'bg-phy-glass text-phy-muted border border-phy-border'}`}>1. 核心短语</div>
                                                    <div className={`w-4 h-px bg-phy-border`} />
                                                    <div className={`px-3 py-1 rounded-full text-[10px] font-bold ${subStage === 'cloze' ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-400/30' : 'bg-phy-glass text-phy-muted border border-phy-border'}`}>2. 完形填空</div>
                                                    <div className={`w-4 h-px bg-phy-border`} />
                                                    <div className={`px-3 py-1 rounded-full text-[10px] font-bold ${subStage === 'full' ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-400/30' : 'bg-phy-glass text-phy-muted border border-phy-border'}`}>3. 全句翻译</div>
                                                </div>

                                                {subStage === 'phrases' && (
                                                    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2">
                                                        {(currentTask.scaffold?.phrases || []).map((p, i) => (
                                                            <div key={i} className="space-y-2">
                                                                <div className="flex items-center justify-between">
                                                                    <label className="text-xs text-phy-muted">短语 {i + 1}：{p.cn}</label>
                                                                    {scaffoldFeedback[`p${i}`] && (
                                                                        <span className={`text-[10px] font-bold ${scaffoldFeedback[`p${i}`].isCorrect ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                                            {scaffoldFeedback[`p${i}`].isCorrect ? '√ 正确' : '× 建议参考'}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <div className="flex gap-2">
                                                                    <input 
                                                                        type="text"
                                                                        value={scaffoldAnswers[`p${i}`] || ''}
                                                                        onChange={(e) => setScaffoldAnswers(prev => ({...prev, [`p${i}`]: e.target.value}))}
                                                                        className="flex-1 rounded-lg border border-phy-border bg-phy-bg px-3 py-2 text-sm text-phy-text"
                                                                        placeholder="输入对应英文短语..."
                                                                    />
                                                                    <button 
                                                                        onClick={() => checkSubStep('phrases', p.en, `p${i}`)}
                                                                        disabled={checkingSubStep}
                                                                        className="px-3 py-2 rounded-lg bg-phy-glass border border-phy-border text-phy-text text-xs hover:bg-phy-bg transition-colors"
                                                                    >
                                                                        {checkingSubStep ? <Loader2 size={12} className="animate-spin" /> : '核对'}
                                                                    </button>
                                                                </div>
                                                                {scaffoldFeedback[`p${i}`] && !scaffoldFeedback[`p${i}`].isCorrect && (
                                                                    <div className="text-[11px] text-amber-200 bg-amber-500/10 p-2 rounded-lg border border-amber-400/20">
                                                                        建议：{scaffoldFeedback[`p${i}`].suggestion}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ))}
                                                        <button 
                                                            onClick={handleNextSubStage}
                                                            className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold shadow-lg shadow-indigo-500/20 transition-all"
                                                        >
                                                            下一步：进入完形填空
                                                        </button>
                                                    </div>
                                                )}

                                                {subStage === 'cloze' && (
                                                    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2">
                                                        <div className="space-y-3">
                                                            <div className="text-xs text-phy-muted">补充完整句子：</div>
                                                            <div className="p-4 rounded-xl border border-phy-border bg-phy-glass text-sm text-phy-text leading-relaxed">
                                                                {currentTask.scaffold?.cloze || 'AI未能生成填空模板，请直接进行全句翻译。'}
                                                            </div>
                                                            <div className="flex flex-col gap-2">
                                                                <textarea 
                                                                    value={scaffoldAnswers['cloze'] || ''}
                                                                    onChange={(e) => setScaffoldAnswers(prev => ({...prev, 'cloze': e.target.value}))}
                                                                    className="w-full rounded-xl border border-phy-border bg-phy-bg px-3 py-2 text-sm text-phy-text min-h-[100px]"
                                                                    placeholder="在此填补空缺部分或完整复写句子..."
                                                                />
                                                                <button 
                                                                    onClick={() => checkSubStep('cloze', currentTask.scaffold?.cloze, 'cloze')}
                                                                    disabled={checkingSubStep}
                                                                    className="w-full py-2 rounded-lg bg-phy-glass border border-phy-border text-phy-text text-xs hover:bg-phy-bg transition-colors inline-flex items-center justify-center gap-2"
                                                                >
                                                                    {checkingSubStep ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                                                                    {checkingSubStep ? 'AI 检查中...' : '提交这一步'}
                                                                </button>
                                                            </div>
                                                        </div>
                                                        {scaffoldFeedback['cloze'] && (
                                                            <div className={`p-3 rounded-xl border ${scaffoldFeedback['cloze'].isCorrect ? 'border-emerald-400/30 bg-emerald-500/10' : 'border-amber-400/30 bg-amber-500/10'}`}>
                                                                <div className={`text-xs font-bold ${scaffoldFeedback['cloze'].isCorrect ? 'text-emerald-300' : 'text-amber-200'}`}>反馈：</div>
                                                                <p className="text-sm mt-1 text-phy-text">{scaffoldFeedback['cloze'].feedback}</p>
                                                                {!scaffoldFeedback['cloze'].isCorrect && (
                                                                    <p className="text-[11px] mt-2 text-phy-muted border-t border-phy-border pt-2 italic">参考：{scaffoldFeedback['cloze'].suggestion}</p>
                                                                )}
                                                            </div>
                                                        )}
                                                        <button 
                                                            onClick={() => setSubStage('full')}
                                                            className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold shadow-lg shadow-indigo-500/20"
                                                        >
                                                            下一步：通关全句翻译
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <>
                                                <div className="flex items-center justify-between gap-2">
                                                    <label className="text-xs text-phy-muted">你的英文翻译</label>
                                                    <span className="text-xs text-phy-muted">Ctrl/Cmd + Enter 提交</span>
                                                </div>
                                                <textarea
                                                    value={currentAnswer}
                                                    onChange={(e) => setAnswers((prev) => ({ ...prev, [currentTask.id]: e.target.value }))}
                                                    rows={9}
                                                    placeholder="在这里输入你的译文..."
                                                    className="mt-2 w-full rounded-xl border border-phy-border bg-phy-bg px-3 py-2 text-sm text-phy-text resize-y min-h-[220px]"
                                                />
                                                <div className="mt-3 flex flex-wrap items-center gap-2">
                                                    <button onClick={submitScore} disabled={loadingScore} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold inline-flex items-center gap-2 disabled:opacity-60">
                                                        {loadingScore ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                                                        {loadingScore ? '评分中...' : '提交评分'}
                                                    </button>
                                                    {latest ? <span className="text-xs text-phy-muted">最近得分：{latest.score100}/100 · {latest.score15}/15 · 尝试 {latest.attempt}</span> : null}
                                                    {practiceMode === 'scaffolded' && (
                                                        <button onClick={() => setSubStage('phrases')} className="ml-auto text-[10px] text-phy-muted hover:text-indigo-300 underline underline-offset-2">返回阶梯练习</button>
                                                    )}
                                                </div>
                                            </>
                                        )}
                                    </div>
"""

# Now I need to find the old answer box and replace it.
# The old block is lines 823-842 in the previous view.
content = re.sub(r'<div className="glass-panel rounded-2xl border border-phy-border p-4">\s+<div className="flex items-center justify-between gap-2">\s+<label className="text-xs text-phy-muted">你的英文翻译</label>.*?</div>\s+</div>', 
                 full_answer_block, content, flags=re.DOTALL)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Successfully updated TranslationChallengeView.jsx")
