import re
import os

file_path = r'e:\AIEnglish\SmartLearnPro\src\views\ListeningView.jsx'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update Imports
if 'useRef' not in content:
    content = content.replace('useEffect, useMemo, useState', 'useEffect, useMemo, useState, useRef')

if 'Plus,' not in content:
    content = content.replace('Play,', 'Play, Plus,')

# 2. Update Context Destructuring
if 'saveToFileLibrary' not in content:
    content = content.replace('const { loadFiles, playAudio, settings } = useApp();', 
                              'const { loadFiles, playAudio, settings, saveToFileLibrary } = useApp();')

# 3. Add Ref and Upload Handler
if 'fileInputRef' not in content:
    # Add ref
    content = content.replace('const ListeningView = () => {', 
                              'const ListeningView = () => {\n    const fileInputRef = useRef(null);')
    
    # Add handler
    upload_handler = """    const handleDirectUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.size > 25 * 1024 * 1024) {
            toast.error('文件太大（需 <25MB）');
            return;
        }

        const tid = toast.loading('正在上传音频...');
        try {
            await saveToFileLibrary({
                name: file.name,
                type: file.type || 'audio/mpeg',
                blob: file
            });
            toast.success('上传成功', { id: tid });
            await loadData();
            e.target.value = null; // Reset
        } catch (err) {
            toast.error(`上传失败: ${err.message}`, { id: tid });
        }
    };
"""
    # Insert before loadData
    content = content.replace('const loadData = async () => {', upload_handler + '\n    const loadData = async () => {')

# 4. Add UI Elements
# Hidden File Input
if 'type="file"' not in content:
    content = content.replace('const Sidebar = (', 
                              'const Sidebar = (\n        <>\n            <input type="file" ref={fileInputRef} onChange={handleDirectUpload} accept="audio/*" className="hidden" />')
    # Close fragment at the end of Sidebar JSX
    # Find the end of Sidebar JSX (it ends with </div>;)
    # We'll just append it to the end of the div
    content = content.replace('        </div>\n    );', '        </div>\n        </>\n    );')

# Plus Button in Header
plus_button = """                    <div className="flex items-center gap-2">
                        <button 
                            onClick={() => fileInputRef.current?.click()}
                            className="p-2 bg-phy-accent text-white rounded-xl hover:bg-phy-accent/80 transition-all shadow-lg shadow-phy-accent/20"
                            title="上传音频"
                        >
                            <Plus size={16} />
                        </button>
                    </div>"""

header_target = """                    <div>
                        <h2 className="text-lg font-bold text-phy-text">音频库</h2>
                        <p className="text-[10px] text-phy-muted uppercase tracking-wider font-bold">精听训练专用</p>
                    </div>"""

if plus_button not in content:
    content = content.replace(header_target, header_target + "\n" + plus_button)
    # Ensure items-center is present for the container
    content = content.replace('className="flex items-center gap-3 mb-4"', 'className="flex items-center justify-between mb-4"')

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Successfully updated ListeningView.jsx with direct audio upload functionality.")
