import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart } from 'lucide-react';
import PlantGame from './components/PlantGame.jsx';
import DrawingBoard from './components/DrawingBoard.jsx';
import SudokuGame from './components/SudokuGame.jsx';
import KissGame from './components/KissGame.jsx';
import JourneyMap from './components/JourneyMap.jsx';
import SelfieCollection from './components/SelfieCollection.jsx';
import JointRibbon from './components/JointRibbon.jsx';
import { getUnlockedCards } from './data/gameState';

// ============================================================
// BACKGROUND PETALS — Lavender petals across the whole page
// ============================================================
function BackgroundPetals() {
    const petals = useMemo(() => {
        const items = [];
        for (let i = 0; i < 30; i++) {
            items.push({
                id: i,
                left: `${Math.random() * 100}%`,
                duration: `${8 + Math.random() * 14}s`,
                delay: `${Math.random() * 12}s`,
                size: 8 + Math.random() * 10,
                opacity: 0.15 + Math.random() * 0.2
            });
        }
        return items;
    }, []);

    return (
        <div className="petals-container">
            {petals.map((p) => (
                <div
                    key={p.id}
                    className="petal"
                    style={{
                        left: p.left,
                        width: `${p.size}px`,
                        height: `${p.size}px`,
                        opacity: p.opacity,
                        animationDuration: p.duration,
                        animationDelay: p.delay
                    }}
                />
            ))}
        </div>
    );
}

// ============================================================
// MAIN APP — Single continuous page, no tabs
// Mobile-first with centered floating bottom dock (NO overlap)
// ============================================================
export default function App() {
    const [userRole, setUserRole] = useState(localStorage.getItem('userRole') || null);
    const [activeGame, setActiveGame] = useState(null);
    const [collectionOpen, setCollectionOpen] = useState(false);
    const [cardsCount, setCardsCount] = useState(() => getUnlockedCards().length);

    // Token detection: ?token=love → girl, ?token=gleb → boy
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const token = params.get('token');
        if (token === 'love') {
            localStorage.setItem('userRole', 'girl');
            setUserRole('girl');
            window.history.replaceState({}, '', window.location.pathname);
        } else if (token === 'gleb') {
            localStorage.setItem('userRole', 'boy');
            setUserRole('boy');
            window.history.replaceState({}, '', window.location.pathname);
        }
    }, []);

    // Keep card count updated
    useEffect(() => {
        const updateCount = () => {
            setCardsCount(getUnlockedCards().length);
        };
        updateCount();
        window.addEventListener('cardUnlocked', updateCount);
        window.addEventListener('storage', updateCount);
        const interval = setInterval(updateCount, 3000);
        return () => {
            window.removeEventListener('cardUnlocked', updateCount);
            window.removeEventListener('storage', updateCount);
            clearInterval(interval);
        };
    }, [collectionOpen]);

    // Navigation handlers
    const scrollToGames = useCallback(() => {
        const el = document.getElementById('games-section');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
    }, []);

    const scrollToCurrentDay = useCallback(() => {
        const el = document.getElementById('current-day-island');
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
            // Fallback: scroll towards journey map
            const mapEl = document.querySelector('.journey-container');
            if (mapEl) mapEl.scrollIntoView({ behavior: 'smooth' });
        }
    }, []);

    // ---- ROLE SELECTION SCREEN ----
    if (!userRole) {
        return (
            <>
                <BackgroundPetals />
                <div className="role-screen">
                    <motion.div
                        className="role-card"
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        transition={{ duration: 0.5, ease: 'easeOut' }}
                    >
                        <Heart
                            size={60}
                            style={{ display: 'block', margin: '0 auto 24px', color: '#f5a0a8' }}
                        />
                        <h1>Кто зашел на сайт?</h1>
                        <div style={{ marginTop: '32px' }}>
                            <button
                                className="role-btn role-btn-girl"
                                onClick={() => { localStorage.setItem('userRole', 'girl'); setUserRole('girl'); }}
                            >
                                Я — Твоя Любимая ❤️
                            </button>
                            <button
                                className="role-btn role-btn-boy"
                                onClick={() => { localStorage.setItem('userRole', 'boy'); setUserRole('boy'); }}
                            >
                                Я — Твой Глеб 🌿
                            </button>
                        </div>
                    </motion.div>
                </div>
            </>
        );
    }

    // ---- GAME MODALS ----
    const renderGameModal = () => {
        if (!activeGame) return null;

        const gameMap = {
            plant:   { title: '🌱 Наш росток',  component: <PlantGame userRole={userRole} /> },
            drawing: { title: '🎨 Наша доска',   component: <DrawingBoard userRole={userRole} /> },
            sudoku:  { title: '🧩 Судоку',       component: <SudokuGame /> },
            kiss:    { title: '💋 Поцелуй',      component: <KissGame userRole={userRole} /> }
        };

        const game = gameMap[activeGame];
        if (!game) return null;

        return (
            <AnimatePresence>
                <motion.div
                    className="modal-overlay"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={(e) => { if (e.target === e.currentTarget) setActiveGame(null); }}
                >
                    <motion.div
                        className="modal-content modal-lg modal-game"
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        transition={{ duration: 0.25 }}
                    >
                        <div className="modal-header">
                            <h2>{game.title}</h2>
                            <button className="modal-close" onClick={() => setActiveGame(null)}>✕</button>
                        </div>
                        <div className="modal-body">
                            {game.component}
                        </div>
                    </motion.div>
                </motion.div>
            </AnimatePresence>
        );
    };

    // ---- MAIN SINGLE-PAGE LAYOUT ----
    return (
        <>
            <BackgroundPetals />

            <div className="app-container" style={{ paddingBottom: '90px' }}>
                {/* Infinite Photo Ribbon at the VERY TOP */}
                <JointRibbon />

                {/* Header */}
                <header className="app-header">
                    <motion.h1
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6 }}
                    >
                        Любимой
                    </motion.h1>
                    <motion.p
                        className="subtitle"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 0.6 }}
                        transition={{ delay: 0.3, duration: 0.6 }}
                    >
                        Наша история через расстояние
                    </motion.p>
                </header>

                {/* Mini-Games Grid — immediately after header */}
                <section className="games-section" id="games-section">
                    <h2>Мини-игры</h2>
                    <div className="games-grid">
                        <div className="game-card" onClick={() => setActiveGame('plant')}>
                            <span className="game-emoji">🌱</span>
                            <div className="game-name">Наш росток</div>
                            <div className="game-desc">Вырасти цветок вместе</div>
                        </div>
                        <div className="game-card" onClick={() => setActiveGame('drawing')}>
                            <span className="game-emoji">🎨</span>
                            <div className="game-name">Наша доска</div>
                            <div className="game-desc">Рисуй в реальном времени</div>
                        </div>
                        <div className="game-card" onClick={() => setActiveGame('sudoku')}>
                            <span className="game-emoji">🧩</span>
                            <div className="game-name">Судоку</div>
                            <div className="game-desc">3 уровня сложности</div>
                        </div>
                        <div className="game-card" onClick={() => setActiveGame('kiss')}>
                            <span className="game-emoji">💋</span>
                            <div className="game-name">Поцелуй</div>
                            <div className="game-desc">Angry Birds стиль!</div>
                        </div>
                    </div>
                </section>

                {/* Journey Map — immediately after games, no gap */}
                <JourneyMap userRole={userRole} />
            </div>

            {/* Game Modals (Rendered at root level to prevent stacking context clipping) */}
            {renderGameModal()}

            {/* Unified Floating Bottom Navigation Dock (Hidden when a game or modal is open) */}
            {!activeGame && !collectionOpen && (
                <nav className="bottom-dock" aria-label="Быстрая навигация">
                    <button className="dock-btn" onClick={scrollToGames} title="К мини-играм">
                        <span className="dock-icon">🎮</span>
                        <span className="dock-label">Игры</span>
                    </button>
                    <button className="dock-btn dock-btn-primary" onClick={scrollToCurrentDay} title="К сегодняшнему дню">
                        <span className="dock-icon">📍</span>
                        <span className="dock-label">Сегодня</span>
                    </button>
                    <button className="dock-btn" onClick={() => setCollectionOpen(true)} title="Моя коллекция карточек">
                        <span className="dock-icon">🎴</span>
                        <span className="dock-label">Карты</span>
                        {cardsCount > 0 && <span className="dock-badge">{cardsCount}</span>}
                    </button>
                </nav>
            )}

            {/* Selfie Collection Modal without overlapping bubble */}
            <SelfieCollection
                isOpen={collectionOpen}
                onClose={() => setCollectionOpen(false)}
                showFab={false}
            />
        </>
    );
}