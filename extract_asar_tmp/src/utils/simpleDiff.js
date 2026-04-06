export const computeDiff = (oldText, newText) => {
    const oldWords = oldText.split(/\s+/);
    const newWords = newText.split(/\s+/);

    // Very naive diff for demonstration (LCS is better but complex to impl from scratch perfectly)
    // This allows for side-by-side comparison logic or basic highlighting
    // For a robust implementation, usually we'd use a library.
    // Here we will just return the two texts for now or simple changes if lengths match closely.

    // Actually, let's just return a structure that helps side-by-side view mainly.
    // If we want inline diff (red/green), we need a real Diff algo.
    // Let's implement a simplified O(ND) or just use a simple match.

    const diffs = [];
    let i = 0, j = 0;

    while (i < oldWords.length || j < newWords.length) {
        if (i < oldWords.length && j < newWords.length && oldWords[i] === newWords[j]) {
            diffs.push({ value: oldWords[i] + ' ', type: 'equal' });
            i++; j++;
        } else {
            // Mismatch
            // Try to look ahead to resync
            let k = 1;
            let foundSync = false;
            const maxLookahead = 5;

            while (k <= maxLookahead) {
                if (i + k < oldWords.length && oldWords[i + k] === newWords[j]) {
                    // Deletion detected (old words skipped)
                    for (let x = 0; x < k; x++) {
                        diffs.push({ value: oldWords[i + x] + ' ', type: 'delete' });
                    }
                    i += k;
                    foundSync = true;
                    break;
                }
                if (j + k < newWords.length && oldWords[i] === newWords[j + k]) {
                    // Insertion detected (new words added)
                    for (let x = 0; x < k; x++) {
                        diffs.push({ value: newWords[j + x] + ' ', type: 'insert' });
                    }
                    j += k;
                    foundSync = true;
                    break;
                }
                k++;
            }

            if (!foundSync) {
                // If no sync found, just mark strictly as replace (del + ins) for this word
                if (i < oldWords.length) diffs.push({ value: oldWords[i] + ' ', type: 'delete' });
                if (j < newWords.length) diffs.push({ value: newWords[j] + ' ', type: 'insert' });
                i++; j++;
            }
        }
    }

    return diffs;
};
