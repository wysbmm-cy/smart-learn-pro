const DB_NAME = 'SmartLearnDB';
const DB_VERSION = 10; // Bumped for A.I.R. System (Drill Logs & Diagnosis)

export const initDB = () => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = (event) => reject(event.target.error);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            // Analysis History
            if (!db.objectStoreNames.contains('history')) {
                const historyStore = db.createObjectStore('history', { keyPath: 'id' });
                historyStore.createIndex('timestamp', 'timestamp', { unique: false });
            }
            // Files
            if (!db.objectStoreNames.contains('files')) {
                const fileStore = db.createObjectStore('files', { keyPath: 'id' });
                fileStore.createIndex('type', 'type', { unique: false });
            }
            // Notes
            if (!db.objectStoreNames.contains('notes')) {
                const noteStore = db.createObjectStore('notes', { keyPath: 'id' });
                noteStore.createIndex('updatedAt', 'updatedAt', { unique: false });
                noteStore.createIndex('title', 'title', { unique: false });
            }
            // Flashcards (Updated)
            if (!db.objectStoreNames.contains('flashcards')) {
                const flashcardStore = db.createObjectStore('flashcards', { keyPath: 'id' });
                flashcardStore.createIndex('createdAt', 'createdAt', { unique: false });
                flashcardStore.createIndex('tags', 'tags', { unique: false, multiEntry: true });
                flashcardStore.createIndex('folderId', 'folderId', { unique: false });
            } else {
                const store = request.transaction.objectStore('flashcards');
                if (!store.indexNames.contains('folderId')) {
                    store.createIndex('folderId', 'folderId', { unique: false });
                }
            }
            // Folders (New in v7)
            if (!db.objectStoreNames.contains('folders')) {
                const folderStore = db.createObjectStore('folders', { keyPath: 'id' });
                folderStore.createIndex('createdAt', 'createdAt', { unique: false });
            }
            // Tasks
            if (!db.objectStoreNames.contains('tasks')) {
                const taskStore = db.createObjectStore('tasks', { keyPath: 'id' });
                taskStore.createIndex('type', 'type', { unique: false });
                taskStore.createIndex('completed', 'completed', { unique: false });
            }
            // Chat Sessions
            if (!db.objectStoreNames.contains('chat_sessions')) {
                const chatStore = db.createObjectStore('chat_sessions', { keyPath: 'id' });
                chatStore.createIndex('updatedAt', 'updatedAt', { unique: false });
            }
            // Video History
            if (!db.objectStoreNames.contains('video_history')) {
                const videoStore = db.createObjectStore('video_history', { keyPath: 'url' });
                videoStore.createIndex('timestamp', 'timestamp', { unique: false });
            }
            // Writings
            if (!db.objectStoreNames.contains('writings')) {
                const writingStore = db.createObjectStore('writings', { keyPath: 'id' });
                writingStore.createIndex('updatedAt', 'updatedAt', { unique: false });
            }
            // --- NEW V8 STORES ---
            // User Goals
            if (!db.objectStoreNames.contains('user_goals')) {
                const goalStore = db.createObjectStore('user_goals', { keyPath: 'id' });
            }
            // Study Logs
            if (!db.objectStoreNames.contains('study_logs')) {
                const logStore = db.createObjectStore('study_logs', { keyPath: 'id' });
                logStore.createIndex('date', 'date', { unique: false });
                logStore.createIndex('type', 'type', { unique: false });
            }
            // --- NEW V9 STORE ---
            // Daily Plans (Cache for Smart Coach)
            if (!db.objectStoreNames.contains('daily_plans')) {
                const planStore = db.createObjectStore('daily_plans', { keyPath: 'date' }); // Key: YYYY-MM-DD
            }

            // --- NEW V10 STORES (A.I.R. System) ---
            // Drill Logs (Raw data for diagnosis)
            if (!db.objectStoreNames.contains('drill_logs')) {
                const drillLogStore = db.createObjectStore('drill_logs', { keyPath: 'id' });
                drillLogStore.createIndex('timestamp', 'timestamp', { unique: false });
                drillLogStore.createIndex('dimension', 'dimension', { unique: false });
                // We keep logs for ~7 days for analysis
            }
            // Learning Diagnosis (Daily reports)
            if (!db.objectStoreNames.contains('learning_diagnosis')) {
                const diagnosisStore = db.createObjectStore('learning_diagnosis', { keyPath: 'date' }); // YYYY-MM-DD
            }
        };

        request.onsuccess = (event) => resolve(event.target.result);
    });
};

// ... (Existing exports: saveHistory, getHistory, deleteHistory, saveFile, saveVideoHistory, getVideoHistory, deleteVideoHistory, saveWriting, getWritings, deleteWriting, getFiles, getFile, deleteFile, saveNote, getNotes, deleteNote, saveFlashcard, getFlashcards, deleteFlashcard, saveTask, getTasks, deleteTask, saveChatSession, getChatSessions, deleteChatSession, saveFolder, getFolders, deleteFolder)

// --- NEW CRUD ---

export const saveUserGoal = async (goal) => {
    const db = await initDB();
    const tx = db.transaction('user_goals', 'readwrite');
    const store = tx.objectStore('user_goals');
    return new Promise((resolve, reject) => {
        // Enforce ID='main' for simplicity unless multiple goals needed
        const request = store.put({ ...goal, id: 'main', updatedAt: Date.now() });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

export const getUserGoal = async () => {
    const db = await initDB();
    const tx = db.transaction('user_goals', 'readonly');
    const store = tx.objectStore('user_goals');
    return new Promise((resolve, reject) => {
        const request = store.get('main');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

export const saveStudyLog = async (log) => {
    // log: { type: 'reading'|'writing'|'vocab', count: Number, date: 'YYYY-MM-DD' }
    const db = await initDB();
    const tx = db.transaction('study_logs', 'readwrite');
    const store = tx.objectStore('study_logs');
    return new Promise((resolve, reject) => {
        const request = store.put({ ...log, id: crypto.randomUUID(), timestamp: Date.now() });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

export const getStudyLogs = async () => {
    const db = await initDB();
    const tx = db.transaction('study_logs', 'readonly');
    const store = tx.objectStore('study_logs');
    return new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

// Daily Plan Cache
export const saveDailyPlan = async (date, plan) => {
    const db = await initDB();
    const tx = db.transaction('daily_plans', 'readwrite');
    const store = tx.objectStore('daily_plans');
    return new Promise((resolve, reject) => {
        const request = store.put({ date, plan, timestamp: Date.now() });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

export const getDailyPlan = async (date) => {
    const db = await initDB();
    const tx = db.transaction('daily_plans', 'readonly');
    const store = tx.objectStore('daily_plans');
    return new Promise((resolve, reject) => {
        const request = store.get(date);
        request.onsuccess = () => resolve(request.result ? request.result.plan : null);
        request.onerror = () => reject(request.error);
    });
};

// --- A.I.R. System CRUD ---

// Save a single drill attempt log
export const saveDrillLog = async (log) => {
    // log: { word, dimension, item_type, user_choice, correct_answer, is_correct, error_type, timestamp }
    const db = await initDB();
    const tx = db.transaction('drill_logs', 'readwrite');
    const store = tx.objectStore('drill_logs');
    return new Promise((resolve, reject) => {
        const request = store.put({ ...log, id: crypto.randomUUID(), timestamp: Date.now() });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

// Get recent drill logs (e.g., last 24h) for diagnosis
export const getRecentDrillLogs = async (startTime) => {
    const db = await initDB();
    const tx = db.transaction('drill_logs', 'readonly');
    const store = tx.objectStore('drill_logs');
    const index = store.index('timestamp');
    const range = IDBKeyRange.lowerBound(startTime);

    return new Promise((resolve, reject) => {
        const request = index.getAll(range);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

// Save a daily diagnosis
export const saveDiagnosis = async (date, diagnosis) => {
    // date: 'YYYY-MM-DD'
    // diagnosis: JSON object from AI
    const db = await initDB();
    const tx = db.transaction('learning_diagnosis', 'readwrite');
    const store = tx.objectStore('learning_diagnosis');
    return new Promise((resolve, reject) => {
        const request = store.put({ date, diagnosis, timestamp: Date.now() });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

// Get diagnosis by date
export const getDiagnosis = async (date) => {
    const db = await initDB();
    const tx = db.transaction('learning_diagnosis', 'readonly');
    const store = tx.objectStore('learning_diagnosis');
    return new Promise((resolve, reject) => {
        const request = store.get(date);
        request.onsuccess = () => resolve(request.result ? request.result.diagnosis : null);
        request.onerror = () => reject(request.error);
    });
};

// ... (getAllData logic)


export const saveHistory = async (record) => {
    const db = await initDB();
    const tx = db.transaction('history', 'readwrite');
    const store = tx.objectStore('history');
    return new Promise((resolve, reject) => {
        const request = store.put({ ...record, timestamp: Date.now() });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

export const getHistory = async () => {
    const db = await initDB();
    const tx = db.transaction('history', 'readonly');
    const store = tx.objectStore('history');
    return new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => {
            // Sort by latest first
            const results = request.result.sort((a, b) => b.timestamp - a.timestamp);
            resolve(results);
        };
        request.onerror = () => reject(request.error);
    });
};

export const deleteHistory = async (id) => {
    const db = await initDB();
    const tx = db.transaction('history', 'readwrite');
    const store = tx.objectStore('history');
    return new Promise((resolve, reject) => {
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
};

export const saveFile = async (fileObj) => {
    const db = await initDB();
    const tx = db.transaction('files', 'readwrite');
    const store = tx.objectStore('files');
    return new Promise((resolve, reject) => {
        // fileObj should include: id, name, type, blob, timestamp
        const request = store.put(fileObj);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

export const saveVideoHistory = async (record) => {
    const db = await initDB();
    const tx = db.transaction('video_history', 'readwrite');
    const store = tx.objectStore('video_history');
    return new Promise((resolve, reject) => {
        const request = store.put({ ...record, timestamp: Date.now() });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

export const getVideoHistory = async () => {
    const db = await initDB();
    const tx = db.transaction('video_history', 'readonly');
    const store = tx.objectStore('video_history');
    return new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => {
            const results = request.result.sort((a, b) => b.timestamp - a.timestamp);
            resolve(results);
        };
        request.onerror = () => reject(request.error);
    });
};

export const deleteVideoHistory = async (url) => {
    const db = await initDB();
    const tx = db.transaction('video_history', 'readwrite');
    const store = tx.objectStore('video_history');
    return new Promise((resolve, reject) => {
        const request = store.delete(url);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
};

// Writings CRUD
export const saveWriting = async (writing) => {
    const db = await initDB();
    const tx = db.transaction('writings', 'readwrite');
    const store = tx.objectStore('writings');
    return new Promise((resolve, reject) => {
        const request = store.put({ ...writing, updatedAt: Date.now() });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

export const getWritings = async () => {
    const db = await initDB();
    const tx = db.transaction('writings', 'readonly');
    const store = tx.objectStore('writings');
    return new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => {
            const results = request.result.sort((a, b) => b.updatedAt - a.updatedAt);
            resolve(results);
        };
        request.onerror = () => reject(request.error);
    });
};

export const deleteWriting = async (id) => {
    const db = await initDB();
    const tx = db.transaction('writings', 'readwrite');
    const store = tx.objectStore('writings');
    return new Promise((resolve, reject) => {
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
};

export const getFiles = async () => {
    const db = await initDB();
    const tx = db.transaction('files', 'readonly');
    const store = tx.objectStore('files');
    return new Promise((resolve, reject) => {
        // Optimization: For lists, we might not want to load the full Blobs if they are huge.
        // But IndexedDB usually loads the whole object. 
        // For a simple app, loading everything is okay up to a few hundred MBs.
        const request = store.getAll();
        request.onsuccess = () => {
            const results = request.result.sort((a, b) => b.timestamp - a.timestamp);
            resolve(results);
        };
        request.onerror = () => reject(request.error);
    });
};

export const getFile = async (id) => {
    const db = await initDB();
    const tx = db.transaction('files', 'readonly');
    const store = tx.objectStore('files');
    return new Promise((resolve, reject) => {
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

export const deleteFile = async (id) => {
    const db = await initDB();
    const tx = db.transaction('files', 'readwrite');
    const store = tx.objectStore('files');
    return new Promise((resolve, reject) => {
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
};

export const saveNote = async (note) => {
    const db = await initDB();
    const tx = db.transaction('notes', 'readwrite');
    const store = tx.objectStore('notes');
    return new Promise((resolve, reject) => {
        // note: { id, title, content, updatedAt }
        const request = store.put({ ...note, updatedAt: Date.now() });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

export const getNotes = async () => {
    const db = await initDB();
    const tx = db.transaction('notes', 'readonly');
    const store = tx.objectStore('notes');
    return new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => {
            const results = request.result.sort((a, b) => b.updatedAt - a.updatedAt);
            resolve(results);
        };
        request.onerror = () => reject(request.error);
    });
};

export const deleteNote = async (id) => {
    const db = await initDB();
    const tx = db.transaction('notes', 'readwrite');
    const store = tx.objectStore('notes');
    return new Promise((resolve, reject) => {
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
};

export const saveFlashcard = async (card) => {
    const db = await initDB();
    const tx = db.transaction('flashcards', 'readwrite');
    const store = tx.objectStore('flashcards');
    return new Promise((resolve, reject) => {
        const request = store.put({ ...card, createdAt: card.createdAt || Date.now() });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

export const getFlashcards = async () => {
    const db = await initDB();
    const tx = db.transaction('flashcards', 'readonly');
    const store = tx.objectStore('flashcards');
    return new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => {
            const results = request.result.sort((a, b) => b.createdAt - a.createdAt);
            resolve(results);
        };
        request.onerror = () => reject(request.error);
    });
};

export const deleteFlashcard = async (id) => {
    const db = await initDB();
    const tx = db.transaction('flashcards', 'readwrite');
    const store = tx.objectStore('flashcards');
    return new Promise((resolve, reject) => {
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
};

export const saveTask = async (task) => {
    const db = await initDB();
    const tx = db.transaction('tasks', 'readwrite');
    const store = tx.objectStore('tasks');
    return new Promise((resolve, reject) => {
        // task: { id, title, type, completed, createdAt }
        const request = store.put({ ...task, createdAt: task.createdAt || Date.now() });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

export const getTasks = async () => {
    const db = await initDB();
    const tx = db.transaction('tasks', 'readonly');
    const store = tx.objectStore('tasks');
    return new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => {
            const results = request.result.sort((a, b) => b.createdAt - a.createdAt);
            resolve(results);
        };
        request.onerror = () => reject(request.error);
    });
};

export const deleteTask = async (id) => {
    const db = await initDB();
    const tx = db.transaction('tasks', 'readwrite');
    const store = tx.objectStore('tasks');
    return new Promise((resolve, reject) => {
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
};

export const saveChatSession = async (session) => {
    const db = await initDB();
    const tx = db.transaction('chat_sessions', 'readwrite');
    const store = tx.objectStore('chat_sessions');
    return new Promise((resolve, reject) => {
        // session: { id, title, messages, updatedAt }
        const request = store.put({ ...session, updatedAt: Date.now() });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

export const getChatSessions = async () => {
    const db = await initDB();
    const tx = db.transaction('chat_sessions', 'readonly');
    const store = tx.objectStore('chat_sessions');
    return new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => {
            const results = request.result.sort((a, b) => b.updatedAt - a.updatedAt);
            resolve(results);
        };
        request.onerror = () => reject(request.error);
    });
};

export const deleteChatSession = async (id) => {
    const db = await initDB();
    const tx = db.transaction('chat_sessions', 'readwrite');
    const store = tx.objectStore('chat_sessions');
    return new Promise((resolve, reject) => {
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
};

// Folders CRUD
export const saveFolder = async (folder) => {
    const db = await initDB();
    const tx = db.transaction('folders', 'readwrite');
    const store = tx.objectStore('folders');
    return new Promise((resolve, reject) => {
        const request = store.put({ ...folder, createdAt: folder.createdAt || Date.now() });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

export const getFolders = async () => {
    const db = await initDB();
    const tx = db.transaction('folders', 'readonly');
    const store = tx.objectStore('folders');
    return new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => {
            const results = request.result.sort((a, b) => b.createdAt - a.createdAt);
            resolve(results);
        };
        request.onerror = () => reject(request.error);
    });
};

export const deleteFolder = async (id) => {
    const db = await initDB();
    const tx = db.transaction('folders', 'readwrite');
    const store = tx.objectStore('folders');
    return new Promise((resolve, reject) => {
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
};

export const getAllData = async () => {
    const db = await initDB();
    const tx = db.transaction(['history', 'notes', 'files', 'flashcards', 'chat_sessions', 'folders'], 'readonly');

    // Helper to promisify store.getAll
    const getAll = (storeName) => new Promise((resolve, reject) => {
        const req = tx.objectStore(storeName).getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });

    try {
        const history = await getAll('history');
        const notes = await getAll('notes');
        const flashcards = await getAll('flashcards');
        const files = await getAll('files');
        const folders = await getAll('folders');
        // We can include sessions if we want
        const chatSessions = await getAll('chat_sessions');

        // Map files to metadata only (exclude giant Blobs for JSON export)
        const fileMetadata = files.map(f => ({
            id: f.id,
            name: f.name,
            type: f.type,
            timestamp: f.timestamp,
            size: f.blob?.size || 0
        }));

        return { history, notes, flashcards, chat_sessions: chatSessions, files: fileMetadata, folders };
    } catch (err) {
        throw err;
    }
};
