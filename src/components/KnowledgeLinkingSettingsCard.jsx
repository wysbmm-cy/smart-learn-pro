import React from 'react';
import { Link2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { normalizeKnowledgeLinkingSettings } from '../utils/knowledgeLinking';

const ToggleRow = ({ title, desc, checked, onChange }) => {
    return (
        <button
            type="button"
            onClick={() => onChange(!checked)}
            className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${
                checked
                    ? 'border-emerald-400/40 bg-emerald-500/10'
                    : 'border-phy-border bg-phy-glass hover:bg-phy-bg'
            }`}
        >
            <div className="flex items-center justify-between gap-3">
                <div>
                    <div className="text-sm font-bold text-phy-text">{title}</div>
                    <div className="mt-1 text-xs text-phy-muted">{desc}</div>
                </div>
                <div
                    className={`h-5 w-5 rounded-full border flex items-center justify-center text-[10px] font-bold ${
                        checked
                            ? 'border-emerald-300 bg-emerald-500 text-white'
                            : 'border-phy-border text-phy-muted'
                    }`}
                >
                    {checked ? 'ON' : 'OFF'}
                </div>
            </div>
        </button>
    );
};

const KnowledgeLinkingSettingsCard = () => {
    const { settings, updateSetting } = useApp();
    const linking = normalizeKnowledgeLinkingSettings(settings?.knowledgeLinking);

    const patch = (next) => {
        updateSetting(
            'knowledgeLinking',
            normalizeKnowledgeLinkingSettings({
                ...linking,
                ...next,
                rules: {
                    ...linking.rules,
                    ...(next?.rules || {})
                }
            })
        );
    };

    return (
        <div id="knowledge-linking" className="bg-phy-glass rounded-[2rem] p-8 shadow-sm border border-phy-border scroll-mt-4">
            <div className="flex items-center gap-3 text-phy-text font-bold border-b border-phy-border pb-4 mb-6">
                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                    <Link2 size={20} />
                </div>
                <h3 className="text-lg">知识关联规则</h3>
            </div>

            <div className="space-y-3">
                <ToggleRow
                    title="启用深度笔记跨模块同步"
                    desc="允许笔记内容被解析为写作/翻译关联数据（可手动触发同步）。"
                    checked={Boolean(linking.enabled)}
                    onChange={(checked) => patch({ enabled: checked })}
                />
                <ToggleRow
                    title="保存笔记时自动同步"
                    desc="关闭后改为在笔记页手动同步，避免未整理内容直接进入素材/翻译。"
                    checked={Boolean(linking.autoSyncOnSave)}
                    onChange={(checked) => patch({ autoSyncOnSave: checked })}
                />
                <ToggleRow
                    title="写作指导 -> AI写作素材包"
                    desc="把“写作指导/Writing Guidance”块同步为可插入素材。"
                    checked={Boolean(linking.rules.writingGuidanceToMaterials)}
                    onChange={(checked) =>
                        patch({ rules: { writingGuidanceToMaterials: checked } })
                    }
                />
                <ToggleRow
                    title="例句 -> 翻译挑战练习输入"
                    desc="把“例句/Examples”块同步到翻译挑战上下文。"
                    checked={Boolean(linking.rules.examplesToTranslation)}
                    onChange={(checked) =>
                        patch({ rules: { examplesToTranslation: checked } })
                    }
                />
            </div>
        </div>
    );
};

export default KnowledgeLinkingSettingsCard;
