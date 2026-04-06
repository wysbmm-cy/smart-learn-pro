const fs = require('fs');
const path = 'e:\\AIEnglish\\SmartLearnPro\\src\\views\\FlashcardView.jsx';

try {
    let content = fs.readFileSync(path, 'utf8');

    // Cleaned up Sidebar and Toolbar structure
    const cleanSidebarAndToolbar = `    const Sidebar = (
        <div className="h-full flex flex-col bg-phy-glass text-phy-text">
            <div className="p-2 md:p-4 border-b border-phy-border flex justify-between items-center">
                <h2 className="text-base md:text-xl font-bold text-phy-text flex items-center gap-1.5 md:gap-2">
                    <Layers size={isMobile ? 18 : 24} className="text-phy-accent" />
                    卡片库
                </h2>
                <button
                    onClick={() => {
                        setIsMultiSelect(!isMultiSelect);
                        if (!isMultiSelect) setStudySelection([]);
                    }}
                    className={
                        isMultiSelect
                            ? 'text-xs px-2 py-1 rounded border bg-phy-accentGlass text-phy-accent border-phy-borderHover font-bold'
                            : 'text-xs px-2 py-1 rounded border text-phy-muted border-phy-border'
                    }
                >
                    {isMultiSelect ? '完成选择' : '多选'}
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {/* System Folders */}
                {!isMultiSelect && (
                    <>
                        <button
                            onClick={() => setSelectedFolderId('all')}
                            className={sidebarFolderBtnClass(selectedFolderId === 'all')}
                        >
                            <LayoutGrid size={18} />
                            所有内容 (All)
                            <span className="ml-auto text-xs bg-phy-glassHeavy px-1.5 py-0.5 rounded text-phy-muted">{allCards.length}</span>
                        </button>

                        <button
                            onClick={() => setSelectedFolderId('today')}
                            className={sidebarFolderBtnClass(selectedFolderId === 'today')}
                        >
                            <RefreshCw size={18} />
                            今日待复习 (Due Today)
                        </button>

                        <button
                            onClick={() => setSelectedFolderId('flagged')}
                            className={sidebarFolderBtnClass(selectedFolderId === 'flagged')}
                        >
                            <Star size={18} className={selectedFolderId === 'flagged' ? "fill-phy-accent" : ""} />
                            重点标记 (Flagged)
                        </button>

                        <button
                            onClick={() => setSelectedFolderId('mastered')}
                            className={sidebarFolderBtnClass(selectedFolderId === 'mastered')}
                        >
                            <CheckCircle size={18} className={selectedFolderId === 'mastered' ? "text-emerald-500 fill-emerald-500/10" : ""} />
                            已熟记卡片 (Mastered)
                        </button>
                    </>
                )}

                <div className="pt-4 pb-2 px-3 flex items-center justify-between text-xs font-bold text-phy-muted uppercase tracking-wider">
                    <span>{isMultiSelect ? '选择文件夹复习' : '我的文件夹'}</span>
                    {!isMultiSelect && <button onClick={() => setIsAddingFolder(true)} className="hover:text-phy-accent"><Plus size={14} /></button>}
                </div>

                {isAddingFolder && (
                    <div className="px-2 mb-2 animate-fade-in">
                        <input
                            autoFocus
                            className="w-full bg-phy-bg border border-phy-border rounded-lg px-2 py-1.5 text-sm outline-none text-phy-text focus:border-phy-accent"
                            placeholder="输入文件夹名..."
                            value={newFolderName}
                            onChange={(e) => setNewFolderName(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleAddFolder();
                                if (e.key === 'Escape') setIsAddingFolder(false);
                            }}
                            onBlur={() => newFolderName ? handleAddFolder() : setIsAddingFolder(false)}
                        />
                    </div>
                )}

                {folders.map(folder => {
                    const isSelected = isMultiSelect ? studySelection.includes(folder.id) : selectedFolderId === folder.id;
                    const folderItemClass = isSelected
                        ? 'w-full flex items-center gap-2 md:gap-3 px-2 md:px-3 py-1.5 md:py-2.5 rounded-xl text-left font-medium transition-colors group glass-panel text-phy-accent shadow-sm'
                        : 'w-full flex items-center gap-2 md:gap-3 px-2 md:px-3 py-1.5 md:py-2.5 rounded-xl text-left font-medium transition-colors group text-phy-muted hover:bg-phy-glassHover hover:text-phy-text';
                    const checkClass = isSelected
                        ? 'w-4 h-4 rounded border flex items-center justify-center bg-phy-accent border-phy-accent'
                        : 'w-4 h-4 rounded border flex items-center justify-center border-phy-border';
                    return (
                        <button
                            key={folder.id}
                            onClick={() => isMultiSelect ? toggleFolderSelection(folder.id) : setSelectedFolderId(folder.id)}
                            className={folderItemClass}
                        >
                            {isMultiSelect ? (
                                <div className={checkClass}>
                                    {isSelected && <CheckCircle size={10} className="text-white" />}
                                </div>
                            ) : (
                                <Folder size={18} className={isSelected ? 'fill-phy-accentGlass' : ''} />
                            )}
                            <span className="truncate flex-1">{folder.name}</span>
                            {!isMultiSelect && (
                                <div className="opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => handleDeleteFolder(e, folder.id)}>
                                    <Trash2 size={14} className="text-phy-muted hover:text-red-500" />
                                </div>
                            )}
                        </button>
                    )
                })}
            </div>

            <div className="p-2 md:p-4 border-t border-phy-border bg-phy-glassHeavy grid grid-cols-2 lg:flex lg:flex-col gap-2">
                {/* A.I.R. Smart Review Button */}
                <button
                    onClick={handleAIRClick}
                    disabled={airStatus === 'preparing'}
                    className={
                        airStatus === 'preparing'
                            ? 'w-full flex items-center justify-center gap-2 py-1.5 md:py-2.5 rounded-lg text-xs md:text-sm font-bold shadow-md transition-all bg-phy-glass text-phy-muted cursor-wait'
                            : 'w-full flex items-center justify-center gap-2 py-1.5 md:py-2.5 rounded-lg text-xs md:text-sm font-bold shadow-md transition-all bg-phy-accent text-white hover:opacity-90 border border-transparent'
                    }
                >
                    {airStatus === 'preparing' ? (
                        <><Loader2 size={14} className="animate-spin" /> {isMobile ? '' : '准备中...'}</>
                    ) : airStatus === 'ready' ? (
                        <><Brain size={14} /> {isMobile ? '开始' : '点击开始复习'}</>
                    ) : (
                        <><Brain size={14} /> {isMobile ? '智能' : '智能复习 (A.I.R.)'}</>
                    )}
                </button>
                <button
                    onClick={() => setShowStudentPicker(true)}
                    className="w-full flex items-center justify-center gap-2 py-1.5 bg-transparent rounded-lg border border-phy-border text-phy-muted text-xs md:text-sm font-bold shadow-sm hover:text-phy-accent hover:border-phy-accent transition-colors hover:bg-phy-glassHover"
                >
                    <Dices size={14} />
                    {isMobile ? '随机' : '课堂随机点名'}
                </button>
            </div>
        </div>
    );

    return (
        <div className="h-full md:h-[calc(100vh-100px)] animate-fade-in glass-panel rounded-[2rem] shadow-sm overflow-hidden text-phy-text bg-phy-bg/50">
            {mode === 'manage' ? (
                <SplitPane
                    left={Sidebar}
                    right={
                        <div className="h-full flex flex-col bg-transparent">
                            {/* Toolbar */}
                            <div className="p-2 md:p-4 border-b border-phy-border flex items-center justify-between gap-2 bg-phy-glassHeavy backdrop-blur sticky top-0 z-10">
                                <h3 className="min-w-0 flex-1 text-sm md:text-lg font-bold flex items-center gap-2 whitespace-nowrap overflow-hidden">
                                    <span className="truncate">
                                        {isMultiSelect
                                            ? ("多选模式 (" + studySelection.length + ")")
                                            : (selectedFolderId === "all" ? "所有卡片" :
                                                selectedFolderId === "today" ? "今日待复习" :
                                                    selectedFolderId === "flagged" ? ("重点标记 (" + displayCards.length + ")") :
                                                        selectedFolderId === "mastered" ? ("已掌握单词 (" + displayCards.length + ")") :
                                                            folders.find(f => f.id === selectedFolderId)?.name || "文件夹")
                                        }
                                    </span>
                                    <span className="bg-phy-glass text-phy-muted px-1.5 py-0.5 rounded-full text-[10px] md:text-xs border border-phy-border shrink-0">{displayCards.length}</span>
                                </h3>

                                <div className="flex items-center gap-1.5 md:gap-3">
                                    <button
                                        onClick={() => mode === "manage" && startSession()}
                                        disabled={studyQueue.length === 0 && displayCards.length === 0}
                                        className={
                                            studyQueue.length === 0 && displayCards.length === 0
                                                ? "flex items-center justify-center gap-1.5 px-3 py-1.5 md:px-4 md:py-2 rounded-lg font-bold text-xs md:text-sm bg-phy-glassHeavy text-phy-muted border border-phy-border cursor-not-allowed"
                                                : "flex items-center justify-center gap-1.5 px-3 py-1.5 md:px-4 md:py-2 rounded-lg font-bold text-xs md:text-sm bg-phy-accent text-white hover:opacity-90 active:scale-95 shadow-sm"
                                        }
                                    >
                                        <Play size={14} />
                                        <span className={isMobile ? "hidden" : "inline"}>开始复习</span>
                                    </button>

                                    {isMobile ? (
                                        <div className="relative">
                                            <button
                                                onClick={() => setShowMoreActions(!showMoreActions)}
                                                className="p-2 rounded-lg border border-phy-border text-phy-muted hover:text-phy-text hover:bg-phy-glassHover"
                                            >
                                                <MoreVertical size={18} />
                                            </button>
                                            {showMoreActions && (
                                                <div className="absolute top-full mt-2 right-0 bg-phy-glassHeavy border border-phy-border rounded-xl shadow-xl z-[100] min-w-[160px] py-1 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-200">
                                                    <button onClick={() => { setIsAddingCard(true); setShowMoreActions(false); }} className="w-full px-4 py-2.5 text-left text-sm font-medium flex items-center gap-3 hover:bg-phy-accentGlass hover:text-phy-accent transition-colors">
                                                        <Plus size={16} /> 添加卡片
                                                    </button>
                                                    <button onClick={() => { setShowStats(!showStats); setShowMoreActions(false); }} className="w-full px-4 py-2.5 text-left text-sm font-medium flex items-center gap-3 hover:bg-phy-accentGlass hover:text-phy-accent transition-colors">
                                                        <BarChart3 size={16} /> {showStats ? "隐藏统计" : "显示统计"}
                                                    </button>
                                                    <button onClick={() => { 
                                                        if (sortMode === "default") setSortMode("mastery_asc");
                                                        else if (sortMode === "mastery_asc") setSortMode("mastery_desc");
                                                        else setSortMode("default");
                                                        setShowMoreActions(false);
                                                    }} className="w-full px-4 py-2.5 text-left text-sm font-medium flex items-center gap-3 hover:bg-phy-accentGlass hover:text-phy-accent transition-colors">
                                                        <Trophy size={16} /> {sortMode === "default" ? "默认排序" : sortMode === "mastery_asc" ? "掌握度 低->高" : "掌握度 高->低"}
                                                    </button>
                                                    <button onClick={() => { setIsMultiSelect(!isMultiSelect); setShowMoreActions(false); }} className="w-full px-4 py-2.5 text-left text-sm font-medium flex items-center gap-3 hover:bg-phy-accentGlass hover:text-phy-accent transition-colors">
                                                        <LayoutGrid size={16} /> {isMultiSelect ? "取消操作" : "批量操作"}
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2">
                                            <div className="flex items-center gap-1.5 bg-phy-glass border border-phy-border rounded-lg px-2 py-1">
                                                <span className="text-[10px] font-bold text-phy-muted uppercase">抽查数</span>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    max="500"
                                                    value={drawCount}
                                                    onChange={(e) => setDrawCount(parseInt(e.target.value) || 10)}
                                                    className="w-10 md:w-12 bg-transparent text-xs md:text-sm font-bold text-phy-text outline-none text-center"
                                                />
                                            </div>
                                            <button onClick={() => setShowStats(!showStats)} className="p-2 hover:bg-phy-glassHover rounded-lg text-phy-muted hover:text-phy-text" title="统计面板"><BarChart3 size={18} /></button>
                                            <button onClick={() => {
                                                if (sortMode === 'default') setSortMode('mastery_asc');
                                                else if (sortMode === 'mastery_asc') setSortMode('mastery_desc');
                                                else setSortMode('default');
                                            }} className="p-2 hover:bg-phy-glassHover rounded-lg text-phy-muted hover:text-phy-text" title="排序"><Trophy size={18} /></button>
                                            <button onClick={() => setIsMultiSelect(!isMultiSelect)} className="p-2 hover:bg-phy-glassHover rounded-lg text-phy-muted hover:text-phy-text" title="多选"><LayoutGrid size={18} /></button>
                                            <button onClick={() => setIsAddingCard(true)} className="p-2 hover:bg-phy-accentGlass rounded-lg text-phy-accent" title="添加"><Plus size={18} /></button>
                                        </div>
                                    )}
                                </div>
                            </div>
`;

    // Markers for the section to replace
    // Start of Sidebar definition:
    const searchStart = "const Sidebar = (";
    // End of the broken section (Toolbar area):
    // Since I messed up the Toolbar area, I'll search for something AFTER the toolbar, like the Card Grid start.
    const searchEndMarker = "{/* Card Grid */}";

    const startIndex = content.indexOf(searchStart);
    const endIndex = content.indexOf(searchEndMarker);

    if (startIndex !== -1 && endIndex !== -1) {
        const before = content.substring(0, startIndex);
        const after = content.substring(endIndex);
        fs.writeFileSync(path, before + cleanSidebarAndToolbar + after, 'utf8');
        console.log("SUCCESS: FlashcardView.jsx restored and optimized.");
    } else {
        console.error("FAIL: Could not find search markers.");
        console.log("searchStart found:", startIndex !== -1);
        console.log("searchEnd found:", endIndex !== -1);
    }
} catch (err) {
    console.error("ERROR:", err.message);
}
