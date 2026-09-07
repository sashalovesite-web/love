import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    getUnlockedDays, getDayNumber, getDayContent,
    unlockCard, getSelfiImage, getTogetherImage
} from '../data/gameState';

// ============================================================
// JOURNEY MAP — Clean Flexbox Column (Rock-Solid iPhone Layout)
// 365 Days • Centered Flex Column: display: flex; flex-direction: column; align-items: center;
// Snake Pattern: +/-30px on mobile, +/-60px on desktop via transform: translateX(offset)
// Zero Drift: overflow-x: hidden, relative rows
// Side Photos: Real photos from /game/together/ at edges (135px on mobile)
// NO auto-unlock on open! Cards unlocked ONLY when user clicks "Принять"
// ============================================================

const TOTAL_DAYS = 365;

export default function JourneyMap({ userRole }) {
    const [selectedDay, setSelectedDay] = useState(null);
    const [modalContent, setModalContent] = useState(null);
    const [isMobile, setIsMobile] = useState(
        typeof window !== 'undefined' ? window.innerWidth < 768 : true
    );

    const unlockedDays = getUnlockedDays();
    const currentDay = getDayNumber();

    // Responsive listener for mobile vs desktop zig-zag swing
    useEffect(() => {
        const handleResize = () => {
            setIsMobile(window.innerWidth < 768);
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Calculate zig-zag horizontal offset:
    // Mobile: -30px, 0px, +30px, 0px
    // Desktop: -60px, 0px, +60px, 0px
    const getOffset = useCallback((dayNum) => {
        const swing = isMobile ? 30 : 60;
        const step = (dayNum - 1) % 4;
        if (step === 0) return -swing;
        if (step === 1) return 0;
        if (step === 2) return swing;
        return 0;
    }, [isMobile]);

    // Side Polaroid cards: spaced every 10 days, strictly placed opposite to the island swing
    const sideCardsMap = useMemo(() => {
        const map = new Map();
        for (let d = 5; d <= TOTAL_DAYS; d += 10) {
            const step = (d - 1) % 4;
            // When island swings right (step 2), place polaroid on left.
            // When island swings left (step 0) or center, place polaroid on right.
            const isLeft = (step === 2);
            map.set(d, {
                day: d,
                isLeft,
                rotation: isLeft ? -3.5 : 3.5,
                imageSrc: getTogetherImage(d)
            });
        }
        return map;
    }, []);

    // Island click handler — ONLY opens modal (does NOT auto-unlock cards!)
    const handleIslandClick = useCallback((dayNum) => {
        if (dayNum > unlockedDays) return;
        const content = getDayContent(dayNum);
        setSelectedDay(dayNum);
        setModalContent(content);
    }, [unlockedDays]);

    const closeModal = () => {
        setSelectedDay(null);
        setModalContent(null);
    };

    // Auto-scroll to current day on mount
    useEffect(() => {
        const timer = setTimeout(() => {
            const el = document.getElementById('current-day-island');
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 600);
        return () => clearTimeout(timer);
    }, []);

    // Generate array of 1..365
    const daysList = useMemo(() => Array.from({ length: TOTAL_DAYS }, (_, i) => i + 1), []);

    return (
        <div className="journey-container">
            <h2 className="journey-title">🗺️ Путь 365 дней</h2>

            {/* Clean Flexbox Column for the entire Journey Map — 100% Centered on iPhone */}
            <div className="journey-flex-column">
                {daysList.map((dayNum) => {
                    const isUnlocked = dayNum <= unlockedDays;
                    const isCurrent = dayNum === currentDay;
                    const offset = getOffset(dayNum);
                    const sideCard = sideCardsMap.get(dayNum);

                    let className = 'island';
                    if (isCurrent) className += ' island-current';
                    else if (isUnlocked) className += ' island-unlocked';
                    else className += ' island-locked';

                    return (
                        <div key={dayNum} className="journey-row">
                            {/* Side Polaroid Card (Unlocked days only) */}
                            {sideCard && isUnlocked && (
                                <motion.div
                                    className={`side-polaroid ${sideCard.isLeft ? 'side-polaroid-left' : 'side-polaroid-right'}`}
                                    style={{
                                        rotate: `${sideCard.rotation}deg`
                                    }}
                                    initial={{ opacity: 0, y: 20 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true, margin: '-60px' }}
                                    transition={{ duration: 0.4 }}
                                >
                                    <img
                                        src={sideCard.imageSrc}
                                        alt={`Наш момент ${sideCard.day}`}
                                        onError={(e) => {
                                            e.target.style.display = 'none';
                                            if (e.target.nextElementSibling) {
                                                e.target.nextElementSibling.style.display = 'flex';
                                            }
                                        }}
                                    />
                                    <div className="polaroid-placeholder" style={{ display: 'none' }}>
                                        <span>📸</span>
                                        <span>Наш момент 💕</span>
                                    </div>
                                    <div className="polaroid-label">
                                        День {sideCard.day} 💕
                                    </div>
                                </motion.div>
                            )}

                            {/* Centered Island with clean horizontal offset */}
                            <motion.div
                                id={isCurrent ? 'current-day-island' : undefined}
                                className={className}
                                title={isUnlocked ? `День ${dayNum}` : `День ${dayNum} (заблокирован)`}
                                style={{
                                    x: offset
                                }}
                                initial={{ opacity: 0, scale: 0.6 }}
                                whileInView={{ opacity: 1, scale: 1 }}
                                viewport={{ once: true, margin: '-30px' }}
                                transition={{ duration: 0.3 }}
                                onClick={() => handleIslandClick(dayNum)}
                                whileHover={isUnlocked ? { scale: 1.08 } : {}}
                                whileTap={isUnlocked ? { scale: 0.95 } : {}}
                            >
                                {dayNum}
                            </motion.div>
                        </div>
                    );
                })}
            </div>

            {/* Day Content Modal — Zero-scroll Mobile Architecture with object-contain */}
            <AnimatePresence>
                {modalContent && (
                    <motion.div
                        className="modal-overlay"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
                    >
                        <motion.div
                            className="modal-content modal-day-island"
                            initial={{ opacity: 0, scale: 0.88, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.88, y: 20 }}
                            transition={{ duration: 0.22 }}
                        >
                            <div className="modal-header">
                                <h2>День {selectedDay}</h2>
                                <button className="modal-close" onClick={closeModal} title="Закрыть">✕</button>
                            </div>
                            <div className="modal-body day-modal-body">
                                <DayContentDisplay
                                    content={modalContent}
                                    dayNumber={selectedDay}
                                    userRole={userRole}
                                    onClose={closeModal}
                                />
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// ============================================================
// DAY CONTENT DISPLAY — 7-Day Cycle Handler (Zero Scroll & object-contain)
// Cards are ONLY unlocked when user clicks "Принять"!
// ============================================================
function DayContentDisplay({ content, dayNumber, userRole, onClose }) {
    // Handle click on "Принять": unlocks card if present, then closes modal
    const handleAccept = async () => {
        if (content.hasCard || content.type === 'card' || content.type === 'task_card') {
            await unlockCard(dayNumber, userRole);
        }
        onClose();
    };

    // Day 1: Surprise Selfie Card + Text from Gleb
    if (content.type === 'card') {
        const imageSrc = getSelfiImage(content.selfiFolder, dayNumber);
        const rarityClass = content.rarity === 'GOD' ? 'rarity-god'
            : content.rarity === 'ADVENTURE' ? 'rarity-adventure'
            : 'rarity-normal';
        const rarityName = content.rarity === 'GOD' ? 'БОГ'
            : content.rarity === 'ADVENTURE' ? 'ПРИКЛ'
            : 'Норм';

        return (
            <div className="day-modal-card justify-between">
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div className="day-emoji w-12 h-12">🎴</div>
                    <div className="day-title">{content.title}</div>
                    {content.subtitle && (
                        <div className="day-subtitle">{content.subtitle}</div>
                    )}
                </div>

                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: 0, flex: 1, justifyContent: 'center' }}>
                    {/* Fixed aspect ratio 4/5 with object-contain & soft background */}
                    <div className="day-photo-frame">
                        <img
                            className="day-image-contain"
                            src={imageSrc}
                            alt="Селфи карточка"
                            onError={(e) => {
                                e.target.style.display = 'none';
                                if (e.target.nextElementSibling) {
                                    e.target.nextElementSibling.style.display = 'flex';
                                }
                            }}
                        />
                        <div className="polaroid-placeholder" style={{ display: 'none', height: '100%', width: '100%' }}>
                            <span style={{ fontSize: '2rem' }}>📸</span>
                            <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>Селфи карточка ✨</span>
                        </div>
                    </div>
                    <div className="day-text my-1" style={{ fontStyle: 'italic', fontWeight: 500 }}>
                        «{content.text}»
                    </div>
                    <span className={`rarity-badge ${rarityClass} my-1`}>
                        Редкость: {rarityName}
                    </span>
                </div>

                <button className="day-modal-btn" onClick={handleAccept}>
                    Принять ✨
                </button>
            </div>
        );
    }

    // Days 3 & 5: Task + Selfie Card Reward
    if (content.type === 'task_card') {
        const imageSrc = getSelfiImage(content.selfiFolder, dayNumber);
        const rarityClass = content.rarity === 'GOD' ? 'rarity-god'
            : content.rarity === 'ADVENTURE' ? 'rarity-adventure'
            : 'rarity-normal';
        const rarityName = content.rarity === 'GOD' ? 'БОГ'
            : content.rarity === 'ADVENTURE' ? 'ПРИКЛ'
            : 'Норм';

        return (
            <div className="day-modal-card justify-between">
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div className="day-emoji w-12 h-12">✨</div>
                    <div className="day-title">{content.title}</div>
                </div>

                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: 0, flex: 1, justifyContent: 'center' }}>
                    {/* Task Box */}
                    <div className="day-task-box my-1">
                        📋 Задание: {content.taskText}
                    </div>

                    {/* Reward Card with object-contain & 4/5 ratio */}
                    <div className="day-reward-card my-1">
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--deep-lake)', marginBottom: '2px' }}>
                            🎁 Награда: новая карточка!
                        </div>
                        <div className="day-photo-frame" style={{ maxHeight: '25vh' }}>
                            <img
                                className="day-image-contain"
                                src={imageSrc}
                                alt="Селфи карточка"
                                onError={(e) => {
                                    e.target.style.display = 'none';
                                    if (e.target.nextElementSibling) {
                                        e.target.nextElementSibling.style.display = 'flex';
                                    }
                                }}
                            />
                            <div className="polaroid-placeholder" style={{ display: 'none', height: '100%', width: '100%' }}>
                                <span style={{ fontSize: '1.8rem' }}>📸</span>
                                <span style={{ fontSize: '0.72rem', fontWeight: 600 }}>Селфи карточка ✨</span>
                            </div>
                        </div>
                        <div className="day-text my-1" style={{ fontStyle: 'italic', fontSize: '0.78rem' }}>
                            «{content.cardText}»
                        </div>
                        <span className={`rarity-badge ${rarityClass}`}>
                            Редкость: {rarityName}
                        </span>
                    </div>
                </div>

                <button className="day-modal-btn" onClick={handleAccept}>
                    Принять ✨
                </button>
            </div>
        );
    }

    // Days 2, 4, 6: Daily Tasks
    if (content.type === 'task') {
        return (
            <div className="day-modal-card justify-between">
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div className="day-emoji w-12 h-12">🌱</div>
                    <div className="day-title">{content.title}</div>
                    {content.subtitle && (
                        <div className="day-subtitle">{content.subtitle}</div>
                    )}
                </div>

                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: 0, flex: 1, justifyContent: 'center' }}>
                    <div className="day-task-box my-2" style={{ padding: '14px 16px', fontSize: 'clamp(0.92rem, 3.2vw, 1.05rem)' }}>
                        {content.text}
                    </div>
                    <p style={{ fontSize: '0.78rem', opacity: 0.65, margin: '2px 0' }}>
                        Выполните задание вместе с любимым человеком 💕
                    </p>
                </div>

                <button className="day-modal-btn" onClick={handleAccept}>
                    Принять задание 💕
                </button>
            </div>
        );
    }

    // Day 7: Weekly Milestones
    if (content.type === 'milestone') {
        return (
            <div className="day-modal-card justify-between">
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <motion.div
                        className="day-emoji w-12 h-12"
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', stiffness: 200, damping: 10 }}
                    >
                        🎉
                    </motion.div>
                    <div className="day-title">{content.title}</div>
                </div>

                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: 0, flex: 1, justifyContent: 'center' }}>
                    <div className="day-milestone-box my-2">
                        {content.text}
                    </div>
                    <p style={{ fontSize: '0.78rem', opacity: 0.7, fontStyle: 'italic', margin: '2px 0' }}>
                        Каждая неделя — это ещё один шаг навстречу нашей встрече! 💫
                    </p>
                </div>

                <button className="day-modal-btn" onClick={handleAccept}>
                    Ура! Продолжить путь 💫
                </button>
            </div>
        );
    }

    return null;
}
