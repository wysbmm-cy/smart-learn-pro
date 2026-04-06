/**
 * Shared helpers for building a "today review" queue.
 * Keeps review behavior consistent across Dashboard, Flashcards and Review Center.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

const toTimestamp = (value) => {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
};

export const isSameDay = (a, b = Date.now()) => {
    const ta = toTimestamp(a);
    const tb = toTimestamp(b);
    if (!ta || !tb) return false;
    const da = new Date(ta);
    const db = new Date(tb);
    return da.getFullYear() === db.getFullYear()
        && da.getMonth() === db.getMonth()
        && da.getDate() === db.getDate();
};

export const getCardReviewedAt = (card) => {
    // Keep backward compatibility with old fields.
    return toTimestamp(card?.lastReviewed)
        || toTimestamp(card?.fsrs_last_review)
        || toTimestamp(card?.lastReview)
        || null;
};

export const isReviewedToday = (card, now = Date.now()) => {
    return isSameDay(getCardReviewedAt(card), now);
};

export const getCardDueAt = (card) => {
    return toTimestamp(card?.nextReview)
        || toTimestamp(card?.fsrs_due)
        || null;
};

const getEffectiveWeakness = (card) => {
    const base = card?.weaknessScore || 0;
    const notesBonus = card?.notes ? 3 : 0;
    const flagBonus = card?.isFlagged ? 2 : 0;
    return base + notesBonus + flagBonus;
};

export const buildTodayReviewQueue = (cards, options = {}) => {
    const {
        folderIds = 'all',
        includeMastered = false,
        preferUnseenToday = true,
        maxCards = 0,
        now = Date.now()
    } = options;

    const folderSet = Array.isArray(folderIds) ? new Set(folderIds) : null;

    let candidates = Array.isArray(cards) ? [...cards] : [];
    if (!includeMastered) {
        candidates = candidates.filter(c => !c?.isMastered);
    }
    if (folderSet) {
        candidates = candidates.filter(c => folderSet.has(c?.folderId));
    }

    // "Today review" = due now or due field is missing (legacy cards).
    candidates = candidates.filter((card) => {
        const dueAt = getCardDueAt(card);
        return !dueAt || dueAt <= now;
    });

    candidates.sort((a, b) => {
        if (preferUnseenToday) {
            const aSeen = isReviewedToday(a, now);
            const bSeen = isReviewedToday(b, now);
            if (aSeen !== bSeen) return aSeen ? 1 : -1;
        }

        const aDue = getCardDueAt(a) || 0;
        const bDue = getCardDueAt(b) || 0;
        // Older due timestamp first (more overdue first).
        if (aDue !== bDue) return aDue - bDue;

        const weaknessDiff = getEffectiveWeakness(b) - getEffectiveWeakness(a);
        if (weaknessDiff !== 0) return weaknessDiff;

        const aCreated = toTimestamp(a?.createdAt) || now + DAY_MS;
        const bCreated = toTimestamp(b?.createdAt) || now + DAY_MS;
        // Older cards first for stability.
        return aCreated - bCreated;
    });

    if (maxCards > 0) {
        return candidates.slice(0, maxCards);
    }
    return candidates;
};

