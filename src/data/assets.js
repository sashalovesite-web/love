// ============================================================
// ASSETS & REAL PHOTOS HELPER
// Exact template strings matching Windows filenames:
// /game/all_photo/selfie_1/3 (X).jpg (God)
// /game/all_photo/selfie_2/2 (X).jpg (Rare)
// /game/all_photo/selfie_3/1 (X).jpg (Normal)
// /game/together/X.jpg (1..50)
// ============================================================

export const PHOTO_COUNTS = {
    together: 10,  // Photos in /game/together/ (1.jpg .. 10.jpg, expandable up to 50)
    selfie_1: 4,   // БОГ (God) — 3 (1).jpg .. 3 (4).jpg
    selfie_2: 20,  // ПРИКЛ (Rare) — 2 (1).jpg .. 2 (20).jpg
    selfie_3: 53   // Норм (Normal) — 1 (1).jpg .. 1 (53).jpg
};

/**
 * Returns URL for a together photo from /game/together/{id}.jpg
 */
export const getTogetherPhoto = (indexOrSeed) => {
    const total = PHOTO_COUNTS.together || 10;
    const num = Math.abs(Number(indexOrSeed) || 1);
    const id = ((num - 1) % total) + 1;
    return `/game/together/${id}.jpg`;
};

/**
 * Returns exact template path: /game/all_photo/selfie_X/X (id).jpg
 */
export const getSelfiePhoto = (folder = 'selfie_3', indexOrSeed) => {
    let prefix = '1';
    let total = PHOTO_COUNTS.selfie_3 || 53;

    if (folder === 'selfie_1') {
        prefix = '3';
        total = PHOTO_COUNTS.selfie_1 || 4;
    } else if (folder === 'selfie_2') {
        prefix = '2';
        total = PHOTO_COUNTS.selfie_2 || 20;
    }

    const num = Math.abs(Number(indexOrSeed) || 1);
    const id = ((num - 1) % total) + 1;
    return `/game/all_photo/${folder}/${prefix} (${id}).jpg`;
};

/**
 * Maps rarity tier to the specific selfie folder
 */
export const getRarityFolder = (rarity) => {
    if (rarity === 'GOD') return 'selfie_1';
    if (rarity === 'ADVENTURE') return 'selfie_2';
    return 'selfie_3';
};
