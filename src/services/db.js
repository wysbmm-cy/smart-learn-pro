const DB_NAME = 'SmartLearnDB';
const DB_VERSION = 5;

export const initDB = () => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = (event) => reject(event.target.error);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            // Store for Analysis History
            if (!db.objectStoreNames.contains('history')) {
                const historyStore = db.createObjectStore('history', { keyPath: 'id' });
                historyStore.createIndex('timestamp', 'timestamp', { unique: false });
            }
            // Store for Files (PDFs, Media)
            if (!db.objectStoreNames.contains('files')) {
                const fileStore = db.createObjectStore('files', { keyPath: 'id' });
                fileStore.createIndex('type', 'type', { unique: false });
            }
            // Store for Markdown Notes
            if (!db.objectStoreNames.contains('notes')) {
                const noteStore = db.createObjectStore('notes', { keyPath: 'id' });
                // We might want to search by title or date
                noteStore.createIndex('updatedAt', 'updatedAt', { unique: false });
                noteStore.createIndex('title', 'title', { unique: false });
            }
            // Store for Flashcards
            if (!db.objectStoreNames.contains('flashcards')) {
                const flashcardStore = db.createObjectStore('flashcards', { keyPath: 'id' });
                flashcardStore.createIndex('createdAt', 'createdAt', { unique: false });
                flashcardStore.createIndex('tags', 'tags', { unique: false, multiEntry: true });
            }
            // Store for Learning Tasks (New in v4)
            if (!db.objectStoreNames.contains('tasks')) {
                const taskStore = db.createObjectStore('tasks', { keyPath: 'id' });
                taskStore.createIndex('type', 'type', { unique: false }); // 'long' or 'short'
                taskStore.createIndex('completed', 'completed', { unique: false });
            }
            // Store for Chat Sessions (New in v5)
            if (!db.objectStoreNames.contains('chat_sessions')) {
                const chatStore = db.createObjectStore('chat_sessions', { keyPath: 'id' });
                chatStore.createIndex('updatedAt', 'updatedAt', { unique: false });
            }
        };

        request.onsuccess = (event) => resolve(event.target.result);
    });
};

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

export const getAllData = async () => {
    const db = await initDB();
    const tx = db.transaction(['history', 'notes', 'files', 'flashcards', 'chat_sessions'], 'readonly');

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

        return { history, notes, flashcards, chat_sessions: chatSessions, files: fileMetadata };
    } catch (err) {
        throw err;
    }
};
