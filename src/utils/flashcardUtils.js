/**
 * Flashcard Utility Functions and Constants
 * Extracted from FlashcardView.jsx for better maintainability
 */

// ============ Constants ============

/** Undo action timeout in milliseconds */
export const UNDO_TIMEOUT_MS = 5000;

/** Session expiration time (2 hours) */
export const SESSION_EXPIRE_MS = 2 * 60 * 60 * 1000;

/** Weakness score delta for each quality rating */
export const WEAKNESS_DELTA = {
    1: 5,  // Forgot - increases weakness significantly
    2: 3,  // Hard - increases weakness
    3: 1,  // Good - slight increase
    4: -2  // Easy - decreases weakness
};

/** Weakness score bonuses */
export const WEAKNESS_BONUS = {
    NOTES: 3,    // Bonus for having deep notes
    FLAGGED: 2   // Bonus for being flagged
};

// ============ Weakness Score Functions ============

/**
 * Calculate effective weakness score for a card
 * Higher score = less proficient, should appear more often
 * @param {Object} card - Flashcard object
 * @returns {number} Effective weakness score
 */
export const getEffectiveWeaknessScore = (card) => {
    if (!card) return 0;
    const base = card.weaknessScore || 0;
    const notesBonus = card.notes ? WEAKNESS_BONUS.NOTES : 0;
    const flagBonus = card.isFlagged ? WEAKNESS_BONUS.FLAGGED : 0;
    return base + notesBonus + flagBonus;
};

/**
 * Get color classes based on weakness score
 * @param {Object} card - Flashcard object
 * @returns {string} Tailwind CSS classes for background and border
 */
export const getWeaknessColor = (card) => {
    const score = getEffectiveWeaknessScore(card);
    if (score >= 15) return 'bg-red-50 border-red-300';      // Critical - needs work
    if (score >= 10) return 'bg-orange-50 border-orange-300'; // Weak
    if (score >= 5) return 'bg-yellow-50 border-yellow-300';  // Developing
    if (score >= 1) return 'bg-blue-50 border-blue-200';      // Good
    return 'bg-emerald-50 border-emerald-200';                // Strong
};

/**
 * Get label information based on weakness score
 * @param {Object} card - Flashcard object
 * @returns {Object} { label, color, icon }
 */
export const getWeaknessLabel = (card) => {
    const score = getEffectiveWeaknessScore(card);
    if (score >= 15) return { label: '需强化', color: 'text-red-600', icon: '🔴' };
    if (score >= 10) return { label: '较弱', color: 'text-orange-600', icon: '🟠' };
    if (score >= 5) return { label: '一般', color: 'text-yellow-600', icon: '🟡' };
    if (score >= 1) return { label: '良好', color: 'text-blue-600', icon: '🔵' };
    return { label: '熟练', color: 'text-emerald-600', icon: '🟢' };
};

// ============ Retrievability (R) Functions ============

/**
 * Calculate current Retrievability for a card.
 * FSRS formula: R(t,S) = (1 + FACTOR * t/S)^DECAY
 * where FACTOR = 19/81, DECAY = -0.5
 * @param {Object} card - Flashcard object with fsrs_stability, fsrs_last_review
 * @returns {number|null} R value (0-1) or null for new cards
 */
export const getRetrievability = (card) => {
    const S = card?.fsrs_stability;
    if (!S || S <= 0) return null;

    const lastReview = card.fsrs_last_review || card.lastReviewed;
    if (!lastReview) return null;

    const elapsedDays = (Date.now() - lastReview) / (24 * 60 * 60 * 1000);
    const FACTOR = 19 / 81;
    const DECAY = -0.5;
    const R = Math.pow(1 + FACTOR * elapsedDays / S, DECAY);
    return Math.max(0, Math.min(1, R));
};

/**
 * Get display label and color for Retrievability
 * @param {Object} card - Flashcard object
 * @returns {Object} { label, color, percent }
 */
export const getRetrievabilityLabel = (card) => {
    const R = getRetrievability(card);
    if (R === null) return { label: '新卡', color: 'text-slate-400', percent: '—' };
    const percent = Math.round(R * 100);
    if (R >= 0.9) return { label: '记忆清晰', color: 'text-emerald-600', percent: `${percent}%` };
    if (R >= 0.7) return { label: '尚可回忆', color: 'text-blue-600', percent: `${percent}%` };
    if (R >= 0.5) return { label: '逐渐模糊', color: 'text-orange-600', percent: `${percent}%` };
    return { label: '即将遗忘', color: 'text-red-600', percent: `${percent}%` };
};

// ============ Mastery Functions (FSRS-aware) ============

/**
 * Get color classes based on FSRS state and stability
 * @param {Object|number} card - Flashcard object or interval number (legacy)
 * @returns {string} Tailwind CSS classes
 */
export const getMasteryColor = (card) => {
    // Legacy compatibility: if called with a number (interval)
    if (typeof card === 'number' || card === undefined || card === null) {
        const interval = card;
        if (!interval || interval <= 1) return 'bg-white border-slate-200';
        if (interval <= 3) return 'bg-blue-50 border-blue-200';
        if (interval <= 7) return 'bg-indigo-50 border-indigo-200';
        if (interval <= 21) return 'bg-purple-50 border-purple-200';
        return 'bg-amber-50 border-amber-200';
    }
    // FSRS-aware: use state and stability
    const state = card?.fsrs_state;
    if (state === undefined || state === 0) return 'bg-white border-slate-200';
    if (state === 1 || state === 3) return 'bg-blue-50 border-blue-200';
    if (state === 2) {
        const s = card?.fsrs_stability || 0;
        if (s >= 30) return 'bg-amber-50 border-amber-200';
        if (s >= 14) return 'bg-purple-50 border-purple-200';
        if (s >= 7) return 'bg-indigo-50 border-indigo-200';
        return 'bg-blue-50 border-blue-200';
    }
    return 'bg-white border-slate-200';
};

/**
 * Get mastery label based on FSRS state and stability
 * @param {Object|number} card - Flashcard object or interval number (legacy)
 * @returns {string} Mastery level label
 */
export const getMasteryLabel = (card) => {
    // Legacy compatibility: if called with a number (interval)
    if (typeof card === 'number' || card === undefined || card === null) {
        const interval = card;
        if (!interval || interval <= 1) return 'New';
        if (interval <= 3) return 'Learning';
        if (interval <= 7) return 'Developing';
        if (interval <= 21) return 'Proficient';
        return 'Mastered';
    }
    // FSRS-aware
    const state = card?.fsrs_state;
    if (state === undefined || state === 0) return 'New';
    if (state === 1 || state === 3) return 'Learning';
    if (state === 2) {
        const s = card?.fsrs_stability || 0;
        if (s >= 30) return 'Mastered';
        if (s >= 14) return 'Proficient';
        if (s >= 7) return 'Developing';
        return 'Reviewing';
    }
    return 'New';
};

// ============ Session Persistence ============

const STORAGE_KEY = 'smartlearn_flashcard_session';

/**
 * Load saved study session from localStorage
 * @returns {Object|null} Saved session or null if expired/invalid
 */
export const loadStudySession = () => {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (!saved) return null;

        const session = JSON.parse(saved);
        // Check if session is expired (2 hours)
        if (Date.now() - session.savedAt > SESSION_EXPIRE_MS) {
            localStorage.removeItem(STORAGE_KEY);
            return null;
        }
        return session;
    } catch (e) {
        console.error('Failed to load study session:', e);
        return null;
    }
};

/**
 * Save study session to localStorage
 * @param {Object} sessionData - { studyQueue, currentCardIndex, sessionStats }
 */
export const saveStudySession = (sessionData) => {
    try {
        const toSave = {
            ...sessionData,
            savedAt: Date.now()
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch (e) {
        console.error('Failed to save study session:', e);
    }
};

/**
 * Clear saved study session
 */
export const clearStudySession = () => {
    localStorage.removeItem(STORAGE_KEY);
};

// ============ Sorting Functions ============

/**
 * Sort cards by weakness score (high to low)
 * @param {Array} cards - Array of flashcard objects
 * @returns {Array} Sorted array
 */
export const sortByWeaknessDesc = (cards) => {
    return [...cards].sort((a, b) => {
        const scoreA = getEffectiveWeaknessScore(a);
        const scoreB = getEffectiveWeaknessScore(b);
        if (scoreB !== scoreA) return scoreB - scoreA;
        return (a.nextReview || 0) - (b.nextReview || 0);
    });
};

/**
 * Sort cards by weakness score (low to high)
 * @param {Array} cards - Array of flashcard objects
 * @returns {Array} Sorted array
 */
export const sortByWeaknessAsc = (cards) => {
    return [...cards].sort((a, b) => {
        const scoreA = getEffectiveWeaknessScore(a);
        const scoreB = getEffectiveWeaknessScore(b);
        return scoreA - scoreB;
    });
};
