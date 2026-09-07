import { supabase } from '../supabaseClient';
import { PHOTO_COUNTS, getTogetherPhoto, getSelfiePhoto, getRarityFolder } from './assets.js';
export { PHOTO_COUNTS, getTogetherPhoto, getSelfiePhoto, getRarityFolder };

// ============================================================
// PLANT GAME — 180 actions to full bloom (1 year cycle)
// Stages: 0-44, 45-89, 90-134, 135-179, 180+
// ============================================================

export const PLANT_STAGES = [
    { name: 'Семечко', minActions: 0, maxActions: 44, emoji: '🌰', description: 'Маленькое семечко нашей любви' },
    { name: 'Росток', minActions: 45, maxActions: 89, emoji: '🌱', description: 'Первые ростки пробиваются к свету' },
    { name: 'Листочки', minActions: 90, maxActions: 134, emoji: '🌿', description: 'Листья тянутся к солнцу' },
    { name: 'Кустик', minActions: 135, maxActions: 179, emoji: '🪴', description: 'Крепкий кустик с бутонами' },
    { name: 'Цветущее Чудо', minActions: 180, maxActions: 999, emoji: '🌸', description: 'Наш цветок расцвёл!' }
];

export const getPlantStageIndex = (totalActions) => {
    if (totalActions >= 180) return 4;
    if (totalActions >= 135) return 3;
    if (totalActions >= 90) return 2;
    if (totalActions >= 45) return 1;
    return 0;
};

export const getPlantData = async () => {
    const { data, error } = await supabase
        .from('plant_state')
        .select('*')
        .eq('id', 'main')
        .single();

    if (error) {
        console.error("Ошибка загрузки ростка:", error);
        return JSON.parse(localStorage.getItem('plant_state')) || {
            id: 'main',
            total_actions: 0,
            stage: 0,
            last_water_time: null,
            last_dust_time: null,
            updated_at: null,
            updated_by: null
        };
    }
    return data;
};

export const canPerformPlantAction = (userRole, lastActionTime, bypassCooldown = false) => {
    const now = new Date();
    const day = now.getDay();

    // Turn check: Boy Mon/Wed/Fri, Girl Tue/Thu/Sat, Sunday both
    let canAct = false;
    if (day === 0) canAct = true;
    if (userRole === 'boy' && [1, 3, 5].includes(day)) canAct = true;
    if (userRole === 'girl' && [2, 4, 6].includes(day)) canAct = true;

    if (!canAct && !bypassCooldown) {
        const dayNames = userRole === 'boy'
            ? 'Понедельник, Среда, Пятница'
            : 'Вторник, Четверг, Суббота';
        return { allowed: false, reason: `Сегодня не твоя очередь! Твои дни: ${dayNames} и Воскресенье` };
    }

    // 48-hour cooldown
    if (lastActionTime && !bypassCooldown) {
        const elapsed = now - new Date(lastActionTime);
        const cooldownMs = 48 * 60 * 60 * 1000;
        if (elapsed < cooldownMs) {
            const remaining = cooldownMs - elapsed;
            const hours = Math.floor(remaining / (60 * 60 * 1000));
            const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
            return { allowed: false, reason: `Растению нужно отдохнуть! Подожди ещё ${hours}ч ${minutes}мин` };
        }
    }

    return { allowed: true };
};

export const performPlantAction = async (type, userRole, bypassCooldown = false) => {
    const currentData = await getPlantData();
    const now = new Date();

    const lastTime = type === 'water' ? currentData.last_water_time : currentData.last_dust_time;
    const check = canPerformPlantAction(userRole, lastTime, bypassCooldown);
    if (!check.allowed) {
        return { success: false, message: check.reason };
    }

    const newActions = currentData.total_actions + 1;
    const oldStage = getPlantStageIndex(currentData.total_actions);
    const newStage = getPlantStageIndex(newActions);

    const updateData = {
        total_actions: newActions,
        stage: newStage,
        [type === 'water' ? 'last_water_time' : 'last_dust_time']: now.toISOString(),
        updated_at: now.toISOString(),
        updated_by: userRole
    };

    const { data, error } = await supabase
        .from('plant_state')
        .update(updateData)
        .eq('id', 'main')
        .select()
        .single();

    if (error) {
        console.error("Ошибка обновления ростка:", error);
        const fallback = { ...currentData, ...updateData };
        localStorage.setItem('plant_state', JSON.stringify(fallback));
        return { success: true, data: fallback, evolved: newStage > oldStage };
    }

    localStorage.setItem('plant_state', JSON.stringify(data));
    return { success: true, data, evolved: newStage > oldStage };
};

// Admin: force set total actions for testing all 5 stages
export const adminSetPlantActions = async (totalActions) => {
    const newStage = getPlantStageIndex(totalActions);
    const updateData = {
        total_actions: totalActions,
        stage: newStage,
        last_water_time: null,
        last_dust_time: null,
        updated_at: new Date().toISOString(),
        updated_by: 'admin'
    };

    const { data, error } = await supabase
        .from('plant_state')
        .update(updateData)
        .eq('id', 'main')
        .select()
        .single();

    if (error) {
        const fallback = { id: 'main', ...updateData };
        localStorage.setItem('plant_state', JSON.stringify(fallback));
        return fallback;
    }
    localStorage.setItem('plant_state', JSON.stringify(data));
    return data;
};

// ============================================================
// PRODUCTION VERSION & RESET SYSTEM
// Clears all test state on first load of this release
// ============================================================
export const APP_VERSION = 'v1.0.0-final-prod';
const VERSION_KEY = 'our_story_app_version';

export const runProductionResetIfNeeded = async () => {
    if (typeof window === 'undefined') return;
    try {
        const storedVer = localStorage.getItem(VERSION_KEY);
        if (storedVer !== APP_VERSION) {
            console.log('🚀 [Production Reset] Activating production release. Resetting state...');
            localStorage.removeItem('plant_state');
            localStorage.removeItem('unlocked_cards');
            localStorage.removeItem('saved_drawings');
            localStorage.removeItem('sudoku_lives');
            localStorage.setItem(VERSION_KEY, APP_VERSION);

            // Reset Supabase plant_state to Stage 0, 0 actions
            try {
                await supabase
                    .from('plant_state')
                    .update({
                        stage: 0,
                        water_count: 0,
                        clean_count: 0,
                        level: 1,
                        exp: 0,
                        exp_to_next: 100,
                        last_watered: null,
                        last_cleaned: null,
                        last_action_by: null,
                        water_cooldown_her: null,
                        water_cooldown_him: null,
                        clean_cooldown_her: null,
                        clean_cooldown_him: null,
                        total_actions: 0,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', 'main');
            } catch (e) {
                console.warn('Supabase plant_state reset error:', e);
            }

            // Reset Supabase unlocked_cards
            try {
                await supabase
                    .from('unlocked_cards')
                    .delete()
                    .neq('id', '00000000-0000-0000-0000-000000000000');
            } catch (e) {
                console.warn('Supabase unlocked_cards reset error:', e);
            }
        }
    } catch (err) {
        console.warn('Production reset check error:', err);
    }
};

// Run automatically on module load
if (typeof window !== 'undefined') {
    runProductionResetIfNeeded();
}

// ============================================================
// JOURNEY MAP — 365-day content system & 7-Day Content Cycle
// Official Launch Date: September 7, 2026 (Today)
// Enforce 1 Day = 1 Island (No debug all-unlocked mode!)
// ============================================================

export const START_DATE = new Date('2026-09-07T00:00:00');

export const getDayNumber = () => {
    const now = new Date();
    const diff = now.getTime() - START_DATE.getTime();
    if (diff < 0) return 1;
    return Math.floor(diff / (1000 * 60 * 60 * 24)) + 1;
};

export const getUnlockedDays = () => {
    // 1 Day = 1 Island!
    // Day 1 is unlocked initially.
    // Day 2 unlocks when currentDate >= START_DATE + 1 day, etc.
    return getDayNumber();
};

// 7-day content cycle for all 365 days
// Day 1, 3, 5: Reward (Selfie Card from Windows-named folders)
// Day 2, 4, 6: Task (Water/Call)
// Day 7: Sweet Message
export const getDayContent = (dayNumber) => {
    const dayIndex = (dayNumber - 1) % 7; // 0..6
    const weekNumber = Math.ceil(dayNumber / 7);

    const glebTexts = [
        'Каждый день с тобой — самое большое счастье 💝',
        'Ты — моё самое красивое приключение ✨',
        'Люблю тебя до луны и обратно 🌙',
        'Ты делаешь мой мир теплее и ярче 🌈',
        'С тобой даже расстояние — ничто 💫',
        'Ты — причина моей улыбки каждый день 😊',
        'Наша любовь сильнее любых километров 💪❤️',
        'Скучаю по тебе каждую секунду 💭',
        'Ты — мой дом, где бы я ни находился 🏠',
        'Каждый закат напоминает о твоей красоте 🌅',
        'Моё сердце всегда рядом с тобой 💖',
        'Ты — самое лучшее, что случилось в моей жизни 🌟'
    ];

    const glebText = glebTexts[(dayNumber * 7 + 3) % glebTexts.length];
    const rarity = getCardRarity(dayNumber);
    const selfiFolder = getRarityFolder(rarity);

    // Day 1 (dayIndex 0): Reward (Selfie Card) + Text from Gleb
    if (dayIndex === 0) {
        return {
            type: 'card',
            hasCard: true,
            title: '🎴 Сюрприз: Селфи-карточка!',
            subtitle: 'Послание от Глеба 💕',
            text: glebText,
            selfiFolder,
            rarity
        };
    }

    // Day 2 (dayIndex 1): Task: Water the plant + Play any game
    if (dayIndex === 1) {
        return {
            type: 'task',
            hasCard: false,
            title: '📋 Задание дня',
            subtitle: 'Забота и веселье 🌱🎮',
            text: 'Полить росточек 🌱 + Сыграть в любую игру 🎮'
        };
    }

    // Day 3 (dayIndex 2): Task: Write "I love you" to him + Reward: Selfie Card
    if (dayIndex === 2) {
        return {
            type: 'task_card',
            hasCard: true,
            title: '💌 Задание + 🎴 Карточка!',
            subtitle: 'Любовное признание 💌',
            text: 'Напиши ему «Я тебя люблю» 💌 + Получи селфи-карточку ✨',
            taskText: 'Напиши ему «Я тебя люблю» 💌',
            cardText: glebText,
            selfiFolder,
            rarity
        };
    }

    // Day 4 (dayIndex 3): Task: Water the plant + Call him
    if (dayIndex === 3) {
        return {
            type: 'task',
            hasCard: false,
            title: '📋 Задание дня',
            subtitle: 'Услышать родной голос 📞',
            text: 'Полить росточек 🌱 + Позвонить ему 📞'
        };
    }

    // Day 5 (dayIndex 4): Task: Send him a selfie + Reward: Selfie Card
    if (dayIndex === 4) {
        return {
            type: 'task_card',
            hasCard: true,
            title: '📸 Задание + 🎴 Карточка!',
            subtitle: 'Твоя улыбка 📸',
            text: 'Отправь ему селфи 📸 + Получи селфи-карточку ✨',
            taskText: 'Отправь ему селфи 📸',
            cardText: glebText,
            selfiFolder,
            rarity
        };
    }

    // Day 6 (dayIndex 5): Task: Water the plant + Call him
    if (dayIndex === 5) {
        return {
            type: 'task',
            hasCard: false,
            title: '📋 Задание дня',
            subtitle: 'Услышать родной голос 📞',
            text: 'Полить росточек 🌱 + Позвонить ему 📞'
        };
    }

    // Day 7 (dayIndex 6): Milestone: Sweet message
    return {
        type: 'milestone',
        hasCard: false,
        title: `🎉 Неделя ${weekNumber}!`,
        subtitle: 'One week closer! ❤️',
        text: 'Ещё на одну неделю ближе! ❤️\nКаждый день приближает нас к встрече!'
    };
};

// ============================================================
// CARD COLLECTION — Rarity system
// БОГ (God/Gold 5%), ПРИКЛ (Adventure/Purple 20%), Норм (Normal/Blue 75%)
// ============================================================

export const CARD_RARITIES = {
    GOD: { name: 'БОГ', color: '#FFD700', glow: '0 0 20px rgba(255, 215, 0, 0.8), 0 0 40px rgba(255, 215, 0, 0.4)', chance: 0.05 },
    ADVENTURE: { name: 'ПРИКЛ', color: '#d8b4cc', glow: '0 0 20px rgba(216, 180, 204, 0.8), 0 0 40px rgba(216, 180, 204, 0.4)', chance: 0.20 },
    NORMAL: { name: 'Норм', color: '#a6ceee', glow: 'none', border: '2px solid #a6ceee', chance: 0.75 }
};

export const getCardRarity = (dayNumber) => {
    const seed = (dayNumber * 2654435761) % 100;
    if (seed < 5) return 'GOD';
    if (seed < 25) return 'ADVENTURE';
    return 'NORMAL';
};

// Initial state starts as an EMPTY ARRAY [] (No fake progress!)
export const getUnlockedCards = () => {
    try {
        const stored = localStorage.getItem('unlocked_cards');
        return stored ? JSON.parse(stored) : [];
    } catch {
        return [];
    }
};

export const fetchUnlockedCards = async () => {
    try {
        const { data, error } = await supabase
            .from('unlocked_cards')
            .select('*')
            .order('unlocked_day', { ascending: true });

        const localCards = getUnlockedCards();
        if (!error && Array.isArray(data) && data.length > 0) {
            const cardMap = new Map();
            localCards.forEach(c => cardMap.set(c.day, c));
            data.forEach(row => {
                const dayNum = row.unlocked_day || row.card_id;
                if (!dayNum) return;
                const content = getDayContent(dayNum);
                if (!content.hasCard) return;
                cardMap.set(dayNum, {
                    day: dayNum,
                    rarity: row.rarity || content.rarity,
                    text: content.cardText || content.text,
                    selfiFolder: content.selfiFolder,
                    unlockedAt: row.unlocked_at
                });
            });

            const merged = Array.from(cardMap.values()).sort((a, b) => a.day - b.day);
            localStorage.setItem('unlocked_cards', JSON.stringify(merged));
            return merged;
        }
        return localCards;
    } catch (err) {
        console.error('Error fetching unlocked cards from Supabase:', err);
        return getUnlockedCards();
    }
};

// Cards are ONLY added when user clicks "Принять" in the island modal!
export const unlockCard = async (dayNumber, userRole = 'her') => {
    const cards = getUnlockedCards();
    const content = getDayContent(dayNumber);
    if (!content.hasCard) return cards;

    const existing = cards.find(c => c.day === dayNumber);
    if (existing) return cards;

    const newCard = {
        day: dayNumber,
        rarity: content.rarity,
        text: content.cardText || content.text,
        selfiFolder: content.selfiFolder,
        unlockedAt: new Date().toISOString()
    };

    const updated = [...cards, newCard];
    localStorage.setItem('unlocked_cards', JSON.stringify(updated));

    try {
        window.dispatchEvent(new CustomEvent('cardUnlocked'));
    } catch (e) { }

    try {
        await supabase
            .from('unlocked_cards')
            .insert({
                unlocked_day: dayNumber,
                card_id: dayNumber,
                rarity: content.rarity,
                unlocked_by: userRole || 'her',
                unlocked_at: new Date().toISOString()
            });
    } catch (e) {
        console.warn('Supabase unlocked_cards insert error:', e);
    }

    return updated;
};

// ============================================================
// IMAGE HELPERS — Real photos from /game/
// ============================================================

export const getSelfiImage = (folder, dayNumber) => {
    return getSelfiePhoto(folder, dayNumber);
};

export const getTogetherImage = (index) => {
    return getTogetherPhoto(index);
};

// ============================================================
// SUDOKU GENERATOR — Backtracking solver
// ============================================================

const SUDOKU_SIZE = 9;
const BOX_SIZE = 3;

const createEmptyGrid = () => Array.from({ length: SUDOKU_SIZE }, () => Array(SUDOKU_SIZE).fill(0));

const isValidPlacement = (grid, row, col, num) => {
    for (let c = 0; c < SUDOKU_SIZE; c++) {
        if (grid[row][c] === num) return false;
    }
    for (let r = 0; r < SUDOKU_SIZE; r++) {
        if (grid[r][col] === num) return false;
    }
    const boxRow = Math.floor(row / BOX_SIZE) * BOX_SIZE;
    const boxCol = Math.floor(col / BOX_SIZE) * BOX_SIZE;
    for (let r = boxRow; r < boxRow + BOX_SIZE; r++) {
        for (let c = boxCol; c < boxCol + BOX_SIZE; c++) {
            if (grid[r][c] === num) return false;
        }
    }
    return true;
};

const shuffleArray = (arr) => {
    const shuffled = [...arr];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
};

const solveSudoku = (grid) => {
    for (let row = 0; row < SUDOKU_SIZE; row++) {
        for (let col = 0; col < SUDOKU_SIZE; col++) {
            if (grid[row][col] === 0) {
                const nums = shuffleArray([1, 2, 3, 4, 5, 6, 7, 8, 9]);
                for (const num of nums) {
                    if (isValidPlacement(grid, row, col, num)) {
                        grid[row][col] = num;
                        if (solveSudoku(grid)) return true;
                        grid[row][col] = 0;
                    }
                }
                return false;
            }
        }
    }
    return true;
};

const countSolutions = (grid, limit = 2) => {
    let count = 0;
    const solve = (g) => {
        if (count >= limit) return;
        for (let row = 0; row < SUDOKU_SIZE; row++) {
            for (let col = 0; col < SUDOKU_SIZE; col++) {
                if (g[row][col] === 0) {
                    for (let num = 1; num <= 9; num++) {
                        if (isValidPlacement(g, row, col, num)) {
                            g[row][col] = num;
                            solve(g);
                            g[row][col] = 0;
                        }
                    }
                    return;
                }
            }
        }
        count++;
    };
    solve(grid.map(r => [...r]));
    return count;
};

export const generateSudoku = (difficulty = 'easy') => {
    const solved = createEmptyGrid();
    solveSudoku(solved);

    const cluesMap = {
        easy: 36,
        medium: 28,
        hard: 22
    };
    const targetClues = cluesMap[difficulty] || 36;
    const puzzle = solved.map(r => [...r]);

    const positions = [];
    for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
            positions.push([r, c]);
        }
    }
    const shuffledPositions = shuffleArray(positions);

    let cluesRemaining = 81;
    for (const [r, c] of shuffledPositions) {
        if (cluesRemaining <= targetClues) break;
        const backup = puzzle[r][c];
        puzzle[r][c] = 0;

        if (countSolutions(puzzle) !== 1) {
            puzzle[r][c] = backup; // Restore if not unique
        } else {
            cluesRemaining--;
        }
    }

    return { puzzle, solution: solved };
};

// ============================================================
// SUDOKU LIVES — 3 lives, 10-min auto-regen in localStorage
// ============================================================

const SUDOKU_LIVES_KEY = 'sudoku_lives';
const MAX_LIVES = 3;
const REGEN_TIME_MS = 10 * 60 * 1000;

export const getSudokuLives = () => {
    const stored = localStorage.getItem(SUDOKU_LIVES_KEY);
    if (!stored) {
        const initial = { lives: MAX_LIVES, lastLostTime: null };
        localStorage.setItem(SUDOKU_LIVES_KEY, JSON.stringify(initial));
        return initial;
    }

    const parsed = JSON.parse(stored);
    const now = Date.now();

    if (parsed.lives < MAX_LIVES && parsed.lastLostTime) {
        const elapsed = now - parsed.lastLostTime;
        const livesRegained = Math.floor(elapsed / REGEN_TIME_MS);
        if (livesRegained > 0) {
            parsed.lives = Math.min(MAX_LIVES, parsed.lives + livesRegained);
            parsed.lastLostTime = parsed.lives >= MAX_LIVES
                ? null
                : parsed.lastLostTime + (livesRegained * REGEN_TIME_MS);
            localStorage.setItem(SUDOKU_LIVES_KEY, JSON.stringify(parsed));
        }
    }

    return parsed;
};

export const loseSudokuLife = () => {
    const current = getSudokuLives();
    if (current.lives <= 0) return { lives: 0, canPlay: false };

    const updated = {
        lives: current.lives - 1,
        lastLostTime: Date.now()
    };
    localStorage.setItem(SUDOKU_LIVES_KEY, JSON.stringify(updated));
    return { lives: updated.lives, canPlay: updated.lives > 0 };
};

export const getTimeUntilNextLife = () => {
    const current = getSudokuLives();
    if (current.lives >= MAX_LIVES) return null;
    if (!current.lastLostTime) return null;

    const elapsed = Date.now() - current.lastLostTime;
    const remaining = REGEN_TIME_MS - (elapsed % REGEN_TIME_MS);
    return remaining;
};