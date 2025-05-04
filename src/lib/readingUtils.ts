
// Helper function to check if a token (split by whitespace) contains letters/numbers
export const isActualWord = (token: string): boolean => !!token && /[\p{L}\p{N}'-]+/gu.test(token);

// Helper function to determine punctuation type at the end of a token
export const getPunctuationType = (token: string): 'sentence' | 'clause' | 'none' => {
    if (!token) return 'none';
    // Check specifically for sentence-ending punctuation
    if (/[.?!]$/.test(token)) return 'sentence';
    // Check specifically for clause-ending punctuation
    if (/[,;:]$/.test(token)) return 'clause';
    return 'none';
};

// --- START Word Category Lists ---
const PREPOSITIONS = new Set(['about', 'above', 'across', 'after', 'against', 'along', 'among', 'around', 'at', 'before', 'behind', 'below', 'beneath', 'beside', 'between', 'beyond', 'but', 'by', 'concerning', 'despite', 'down', 'during', 'except', 'for', 'from', 'in', 'inside', 'into', 'like', 'near', 'of', 'off', 'on', 'onto', 'out', 'outside', 'over', 'past', 'regarding', 'since', 'through', 'throughout', 'to', 'toward', 'under', 'underneath', 'until', 'unto', 'up', 'upon', 'with', 'within', 'without']);
const ARTICLES = new Set(['a', 'an', 'the']);
const PRONOUNS = new Set([ // Possessive and demonstrative often act like articles/determiners
    'my', 'your', 'his', 'her', 'its', 'our', 'their', // Possessive adjectives
    'this', 'that', 'these', 'those' // Demonstratives
    // Add personal/object pronouns? Maybe not needed for this rule.
]);
// Combine into a single set for easy checking
export const STICKY_WORDS = new Set([...PREPOSITIONS, ...ARTICLES, ...PRONOUNS]);
// --- END Word Category Lists ---
