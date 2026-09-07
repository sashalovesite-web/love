import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import {
    generateSudoku,
    getSudokuLives,
    loseSudokuLife,
    getTimeUntilNextLife
} from '../data/gameState';

// ============================================================
// SUDOKU GAME — 9x9 grid, 3 difficulties, 3 lives, 10-min regen
// ============================================================

const DIFFICULTIES = [
    { key: 'normal', label: 'Нормально', clues: 35 },
    { key: 'hard', label: 'Сложно', clues: 25 },
    { key: 'insane', label: 'Нереально', clues: 17 }
];

export default function SudokuGame() {
    const [difficulty, setDifficulty] = useState('normal');
    const [puzzle, setPuzzle] = useState(null);
    const [solution, setSolution] = useState(null);
    const [userGrid, setUserGrid] = useState(null);
    const [givenCells, setGivenCells] = useState(null); // Set of "row-col" strings for given cells
    const [selectedCell, setSelectedCell] = useState(null); // { row, col }
    const [errorCells, setErrorCells] = useState(new Set());
    const [correctCells, setCorrectCells] = useState(new Set());
    const [lives, setLives] = useState(3);
    const [regenTimer, setRegenTimer] = useState(null);
    const [gameWon, setGameWon] = useState(false);
    const [gameTimer, setGameTimer] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [generating, setGenerating] = useState(false);

    const timerRef = useRef(null);

    // Load lives on mount
    useEffect(() => {
        const livesData = getSudokuLives();
        setLives(livesData.lives);
    }, []);

    // Lives regeneration timer
    useEffect(() => {
        const interval = setInterval(() => {
            const livesData = getSudokuLives();
            setLives(livesData.lives);

            const timeLeft = getTimeUntilNextLife();
            if (timeLeft) {
                const mins = Math.floor(timeLeft / 60000);
                const secs = Math.floor((timeLeft % 60000) / 1000);
                setRegenTimer(`${mins}:${secs.toString().padStart(2, '0')}`);
            } else {
                setRegenTimer(null);
            }
        }, 1000);

        return () => clearInterval(interval);
    }, []);

    // Game timer
    useEffect(() => {
        if (isPlaying && !gameWon) {
            timerRef.current = setInterval(() => {
                setGameTimer(prev => prev + 1);
            }, 1000);
        }

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [isPlaying, gameWon]);

    // Format timer
    const formatTime = (seconds) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    // ============================================================
    // GENERATE NEW PUZZLE
    // ============================================================
    const startNewGame = useCallback((diff) => {
        setGenerating(true);
        setDifficulty(diff);

        // Use setTimeout to not block UI during generation
        setTimeout(() => {
            const { puzzle: newPuzzle, solution: newSolution } = generateSudoku(diff);

            // Track given cells
            const given = new Set();
            for (let r = 0; r < 9; r++) {
                for (let c = 0; c < 9; c++) {
                    if (newPuzzle[r][c] !== 0) {
                        given.add(`${r}-${c}`);
                    }
                }
            }

            setPuzzle(newPuzzle);
            setSolution(newSolution);
            setUserGrid(newPuzzle.map(row => [...row]));
            setGivenCells(given);
            setSelectedCell(null);
            setErrorCells(new Set());
            setCorrectCells(new Set());
            setGameWon(false);
            setGameTimer(0);
            setIsPlaying(true);
            setGenerating(false);
        }, 50);
    }, []);

    // ============================================================
    // HANDLE NUMBER INPUT
    // ============================================================
    const handleNumberInput = useCallback((num) => {
        if (!selectedCell || !userGrid || !solution || gameWon) return;
        const { row, col } = selectedCell;

        // Don't modify given cells
        if (givenCells.has(`${row}-${col}`)) return;

        const newGrid = userGrid.map(r => [...r]);
        newGrid[row][col] = num;
        setUserGrid(newGrid);

        const key = `${row}-${col}`;

        if (num === 0) {
            // Erase
            setErrorCells(prev => {
                const next = new Set(prev);
                next.delete(key);
                return next;
            });
            setCorrectCells(prev => {
                const next = new Set(prev);
                next.delete(key);
                return next;
            });
            return;
        }

        // Check correctness
        if (num === solution[row][col]) {
            // Correct
            setCorrectCells(prev => {
                const next = new Set(prev);
                next.add(key);
                return next;
            });
            setErrorCells(prev => {
                const next = new Set(prev);
                next.delete(key);
                return next;
            });

            // Check win
            let allFilled = true;
            for (let r = 0; r < 9; r++) {
                for (let c = 0; c < 9; c++) {
                    const val = r === row && c === col ? num : newGrid[r][c];
                    if (val !== solution[r][c]) {
                        allFilled = false;
                        break;
                    }
                }
                if (!allFilled) break;
            }

            if (allFilled) {
                setGameWon(true);
                setIsPlaying(false);
                // Celebrate!
                confetti({
                    particleCount: 150,
                    spread: 100,
                    origin: { y: 0.6 },
                    colors: ['#a6ceee', '#d8b4cc', '#f9e8e9', '#FFD700']
                });
            }
        } else {
            // Wrong — lose a life
            setErrorCells(prev => {
                const next = new Set(prev);
                next.add(key);
                return next;
            });
            setCorrectCells(prev => {
                const next = new Set(prev);
                next.delete(key);
                return next;
            });

            const result = loseSudokuLife();
            setLives(result.lives);

            // Clear error highlight after 1.5 seconds
            setTimeout(() => {
                setErrorCells(prev => {
                    const next = new Set(prev);
                    next.delete(key);
                    return next;
                });
                // Also clear the wrong number
                setUserGrid(prev => {
                    const updated = prev.map(r => [...r]);
                    updated[row][col] = 0;
                    return updated;
                });
            }, 1500);
        }
    }, [selectedCell, userGrid, solution, givenCells, gameWon]);

    // Keyboard support
    useEffect(() => {
        const handleKeyDown = (e) => {
            const num = parseInt(e.key);
            if (num >= 1 && num <= 9) {
                handleNumberInput(num);
            } else if (e.key === 'Backspace' || e.key === 'Delete') {
                handleNumberInput(0);
            } else if (e.key === 'ArrowUp' && selectedCell) {
                setSelectedCell({ row: Math.max(0, selectedCell.row - 1), col: selectedCell.col });
            } else if (e.key === 'ArrowDown' && selectedCell) {
                setSelectedCell({ row: Math.min(8, selectedCell.row + 1), col: selectedCell.col });
            } else if (e.key === 'ArrowLeft' && selectedCell) {
                setSelectedCell({ row: selectedCell.row, col: Math.max(0, selectedCell.col - 1) });
            } else if (e.key === 'ArrowRight' && selectedCell) {
                setSelectedCell({ row: selectedCell.row, col: Math.min(8, selectedCell.col + 1) });
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleNumberInput, selectedCell]);

    // ============================================================
    // RENDER — No game started yet
    // ============================================================
    if (!puzzle) {
        return (
            <div className="sudoku-game" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, justifyContent: 'center', alignItems: 'center', padding: '16px', textAlign: 'center' }}>
                <div style={{ fontSize: 'clamp(2.5rem, 7vh, 4rem)', marginBottom: '12px' }}>🧩</div>
                <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(1.1rem, 3vh, 1.4rem)', marginBottom: '6px' }}>
                    Судоку
                </h3>
                <p style={{ opacity: 0.6, marginBottom: '18px', fontSize: '0.85rem' }}>
                    Выбери сложность и начни игру
                </p>

                {/* Lives display */}
                <div style={{ marginBottom: '16px' }}>
                    <div className="sudoku-lives" style={{ justifyContent: 'center' }}>
                        {[0, 1, 2].map(i => (
                            <span key={i} style={{ opacity: i < lives ? 1 : 0.2 }}>❤️</span>
                        ))}
                    </div>
                    {regenTimer && (
                        <div className="sudoku-regen-timer">
                            Следующая жизнь через: {regenTimer}
                        </div>
                    )}
                </div>

                {/* No lives screen */}
                {lives <= 0 ? (
                    <div className="no-lives" style={{ padding: '16px' }}>
                        <div className="big-emoji" style={{ fontSize: '3rem', marginBottom: '8px' }}>💔</div>
                        <h3>Жизни закончились!</h3>
                        <p>Жизни восстановятся через 10 минут каждая</p>
                    </div>
                ) : (
                    <div className="sudoku-difficulty" style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
                        {DIFFICULTIES.map((d) => (
                            <button
                                key={d.key}
                                className="sudoku-diff-btn"
                                onClick={() => startNewGame(d.key)}
                                disabled={generating}
                            >
                                {d.label}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    // ============================================================
    // RENDER — Game won
    // ============================================================
    if (gameWon) {
        return (
            <div className="sudoku-game" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, justifyContent: 'center', alignItems: 'center', padding: '20px', textAlign: 'center' }}>
                <div className="celebration" style={{ padding: '10px' }}>
                    <div className="big-emoji" style={{ fontSize: '3.5rem', marginBottom: '10px' }}>🎉</div>
                    <h2>Победа!</h2>
                    <p style={{ marginTop: '6px' }}>
                        Ты решил судоку за {formatTime(gameTimer)}!
                        <br />
                        Сложность: {DIFFICULTIES.find(d => d.key === difficulty)?.label}
                    </p>
                    <div style={{ marginTop: '20px' }}>
                        <button className="btn-primary" onClick={() => {
                            setPuzzle(null);
                            setSolution(null);
                            setUserGrid(null);
                        }}>
                            🔄 Новая игра
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ============================================================
    // RENDER — Active game: No-Scroll layout
    // Header (fixed) -> Grid (flex-1 min-h-0) -> Controls (fixed bottom)
    // ============================================================
    return (
        <div className="sudoku-game" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden', position: 'relative' }}>
            {/* Header: lives, timer, difficulty (small fixed height) */}
            <div className="sudoku-header">
                <div className="sudoku-lives">
                    {[0, 1, 2].map(i => (
                        <span key={i} style={{ opacity: i < lives ? 1 : 0.2 }}>❤️</span>
                    ))}
                    {regenTimer && lives < 3 && (
                        <span className="sudoku-regen-timer" style={{ marginLeft: '6px' }}>
                            +{regenTimer}
                        </span>
                    )}
                </div>

                <div className="sudoku-timer">
                    ⏱️ {formatTime(gameTimer)}
                </div>

                <div>
                    <span style={{
                        padding: '3px 10px',
                        borderRadius: '50px',
                        background: 'var(--sunset-pink)',
                        fontSize: '0.75rem',
                        fontWeight: '600'
                    }}>
                        {DIFFICULTIES.find(d => d.key === difficulty)?.label}
                    </span>
                </div>
            </div>

            {/* Game Canvas / Board Area: flex-1 and min-h-0, automatically shrinks/scales to fit screen */}
            <div className="sudoku-board-area">
                {generating ? (
                    <div style={{ padding: '20px', textAlign: 'center' }}>
                        <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
                            style={{ fontSize: '2.5rem', display: 'inline-block' }}
                        >
                            🧩
                        </motion.div>
                        <p style={{ marginTop: '8px', opacity: 0.6, fontSize: '0.85rem' }}>Генерирую головоломку...</p>
                    </div>
                ) : (
                    <div className="sudoku-grid">
                        {userGrid && userGrid.map((row, r) =>
                            row.map((val, c) => {
                                const key = `${r}-${c}`;
                                const isGiven = givenCells?.has(key);
                                const isSelected = selectedCell?.row === r && selectedCell?.col === c;
                                const isError = errorCells.has(key);
                                const isCorrect = correctCells.has(key);

                                let className = 'sudoku-cell';
                                if (isGiven) className += ' given';
                                if (isSelected) className += ' selected';
                                if (isError) className += ' error';
                                if (isCorrect) className += ' correct-flash';

                                // Thick borders for 3x3 boxes
                                const style = {};
                                if ((c + 1) % 3 === 0 && c < 8) {
                                    style.borderRight = '2px solid var(--deep-lake)';
                                }
                                if ((r + 1) % 3 === 0 && r < 8) {
                                    style.borderBottom = '2px solid var(--deep-lake)';
                                }

                                return (
                                    <div
                                        key={key}
                                        className={className}
                                        style={style}
                                        onClick={() => {
                                            if (!isGiven) setSelectedCell({ row: r, col: c });
                                        }}
                                    >
                                        {val !== 0 ? val : ''}
                                    </div>
                                );
                            })
                        )}
                    </div>
                )}
            </div>

            {/* Control Panel (Buttons): Fixed height at the bottom, ALWAYS VISIBLE */}
            <div className="sudoku-controls-panel">
                {/* Number pad */}
                <div className="sudoku-numpad">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                        <button
                            key={num}
                            className="sudoku-num-btn"
                            onClick={() => handleNumberInput(num)}
                            disabled={lives <= 0}
                        >
                            {num}
                        </button>
                    ))}
                    <button
                        className="sudoku-num-btn erase-btn"
                        onClick={() => handleNumberInput(0)}
                        title="Стереть"
                    >
                        ✕
                    </button>
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                    <button className="btn-secondary" style={{ padding: '4px 12px', fontSize: '0.76rem' }} onClick={() => {
                        setPuzzle(null);
                        setSolution(null);
                        setUserGrid(null);
                        setIsPlaying(false);
                    }}>
                        ← Назад
                    </button>
                    <button className="btn-secondary" style={{ padding: '4px 12px', fontSize: '0.76rem' }} onClick={() => startNewGame(difficulty)}>
                        🔄 Новая
                    </button>
                </div>
            </div>

            {/* No lives overlay */}
            {lives <= 0 && puzzle && !gameWon && (
                <div style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'rgba(227, 240, 249, 0.92)',
                    backdropFilter: 'blur(4px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 'var(--radius)',
                    zIndex: 20
                }}>
                    <div className="no-lives" style={{ padding: '20px' }}>
                        <div className="big-emoji" style={{ fontSize: '3.5rem', marginBottom: '8px' }}>💔</div>
                        <h3>Жизни закончились!</h3>
                        <p style={{ fontSize: '0.85rem' }}>Подожди — они восстановятся</p>
                        {regenTimer && (
                            <div className="sudoku-regen-timer" style={{ marginTop: '8px' }}>
                                Следующая жизнь через: {regenTimer}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
