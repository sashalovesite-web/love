import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getUnlockedCards, fetchUnlockedCards, CARD_RARITIES, getSelfiImage } from '../data/gameState';
import { supabase } from '../supabaseClient';

// ============================================================
// SELFIE COLLECTION — Modal Gallery
// Initial state starts as an EMPTY ARRAY [] (No fake progress!)
// Cards are ONLY added when a user clicks "Принять" in the island modal.
// Rarity glows: БОГ (Gold), ПРИКЛ (Purple), Норм (Blue)
// Asset path: /game/all_photo/selfie_1,2,3/
// ============================================================

export default function SelfieCollection({ isOpen: controlledIsOpen, onClose: controlledOnClose, showFab = false }) {
    const [internalIsOpen, setInternalIsOpen] = useState(false);
    const isOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;
    const closeModal = controlledOnClose || (() => setInternalIsOpen(false));
    const openModal = () => setInternalIsOpen(true);

    // Initial state is strictly an EMPTY ARRAY [] (Clean start, no fake progress)
    const [cards, setCards] = useState([]);
    const [filterRarity, setFilterRarity] = useState('all');

    const loadCards = useCallback(async () => {
        const local = getUnlockedCards();
        setCards(local);
        const data = await fetchUnlockedCards();
        if (Array.isArray(data)) {
            setCards(data);
        }
    }, []);

    // Initial load + Realtime listener on unlocked_cards
    useEffect(() => {
        loadCards();

        const channel = supabase
            .channel('unlocked_cards_sync')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'unlocked_cards' }, () => {
                loadCards();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [loadCards]);

    // Re-fetch whenever modal opens
    useEffect(() => {
        if (isOpen) {
            loadCards();
        }
    }, [isOpen, loadCards]);

    const filteredCards = filterRarity === 'all'
        ? cards
        : cards.filter(c => c.rarity === filterRarity);

    const godCount = cards.filter(c => c.rarity === 'GOD').length;
    const adventureCount = cards.filter(c => c.rarity === 'ADVENTURE').length;
    const normalCount = cards.filter(c => c.rarity === 'NORMAL').length;

    return (
        <>
            {/* Optional FAB Bubble (only when explicitly enabled) */}
            {showFab && (
                <motion.button
                    className="fab-button"
                    onClick={openModal}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 1, type: 'spring', stiffness: 200 }}
                >
                    🎴
                    {cards.length > 0 && (
                        <span className="fab-count">{cards.length}</span>
                    )}
                </motion.button>
            )}

            {/* Collection Modal */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        className="modal-overlay"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
                        style={{ zIndex: 1050 }}
                    >
                        <motion.div
                            className="modal-content modal-lg"
                            initial={{ opacity: 0, scale: 0.9, y: 30 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 30 }}
                        >
                            <div className="modal-header">
                                <h2>🎴 Моя коллекция</h2>
                                <button className="modal-close" onClick={closeModal}>✕</button>
                            </div>
                            <div className="modal-body" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '10px 14px' }}>
                                {/* Stats */}
                                <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '10px', flexWrap: 'wrap' }}>
                                    <StatBadge label="Всего" count={cards.length} color="var(--deep-lake)" bg="var(--mist-white)" />
                                    <StatBadge label="БОГ" count={godCount} color="#FFD700" bg="rgba(255,215,0,0.1)" glow="var(--gold-glow)" />
                                    <StatBadge label="ПРИКЛ" count={adventureCount} color="var(--lavender-glow)" bg="rgba(216,180,204,0.1)" glow="var(--purple-glow)" />
                                    <StatBadge label="Норм" count={normalCount} color="var(--sky-blue)" bg="rgba(166,206,238,0.1)" />
                                </div>

                                {/* Filters */}
                                <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', marginBottom: '12px', flexWrap: 'wrap' }}>
                                    {[
                                        { key: 'all', label: 'Все' },
                                        { key: 'GOD', label: '✨ БОГ' },
                                        { key: 'ADVENTURE', label: '💜 ПРИКЛ' },
                                        { key: 'NORMAL', label: '💙 Норм' }
                                    ].map(f => (
                                        <button
                                            key={f.key}
                                            className={`sudoku-diff-btn ${filterRarity === f.key ? 'active' : ''}`}
                                            onClick={() => setFilterRarity(f.key)}
                                        >
                                            {f.label}
                                        </button>
                                    ))}
                                </div>

                                {/* Cards Grid */}
                                {filteredCards.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '40px 16px' }}>
                                        <div style={{ fontSize: '3rem', marginBottom: '12px' }}>📭</div>
                                        <p style={{ opacity: 0.65, fontSize: '0.9rem', maxWidth: '320px', margin: '0 auto', lineHeight: 1.5 }}>
                                            {cards.length === 0
                                                ? 'Здесь пока пусто! Открывай острова на карте и нажимай «Принять», чтобы собирать карточки 💕'
                                                : 'Нет карточек с такой редкостью'}
                                        </p>
                                    </div>
                                ) : (
                                    <div className="collection-grid">
                                        {filteredCards.map((card, idx) => (
                                            <CollectionCard key={card.day} card={card} index={idx} />
                                        ))}
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}

function StatBadge({ label, count, color, bg, glow }) {
    return (
        <div style={{
            padding: '10px 20px', borderRadius: '16px', background: bg,
            textAlign: 'center', boxShadow: glow || 'none', minWidth: '80px'
        }}>
            <div style={{ fontSize: '1.4rem', fontWeight: '800', color }}>{count}</div>
            <div style={{ fontSize: '0.7rem', fontWeight: '600', opacity: 0.7, marginTop: '2px' }}>{label}</div>
        </div>
    );
}

function CollectionCard({ card, index }) {
    const rarityInfo = CARD_RARITIES[card.rarity] || CARD_RARITIES.NORMAL;
    const imageSrc = getSelfiImage(card.selfiFolder, card.day);

    let cardClass = 'collection-card';
    if (card.rarity === 'GOD') cardClass += ' rarity-god-card';
    else if (card.rarity === 'ADVENTURE') cardClass += ' rarity-adventure-card';
    else cardClass += ' rarity-normal-card';

    const badgeClass = card.rarity === 'GOD' ? 'rarity-god'
        : card.rarity === 'ADVENTURE' ? 'rarity-adventure'
        : 'rarity-normal';

    return (
        <motion.div
            className={cardClass}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05, duration: 0.3 }}
        >
            <div style={{
                width: '100%',
                height: '200px',
                background: 'rgba(166, 206, 238, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden'
            }}>
                <img
                    src={imageSrc}
                    alt={`День ${card.day}`}
                    style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'contain',
                        display: 'block'
                    }}
                    onError={(e) => {
                        e.target.style.display = 'none';
                        if (e.target.nextElementSibling) {
                            e.target.nextElementSibling.style.display = 'flex';
                        }
                    }}
                />
                <div style={{ display: 'none', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: '2.5rem' }}>📷</span>
                    <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>Селфи 💕</span>
                </div>
            </div>
            <div className="card-info">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="card-day">День {card.day}</span>
                    <span className={`rarity-badge ${badgeClass}`} style={{ marginTop: 0 }}>{rarityInfo.name}</span>
                </div>
                <div className="card-text">
                    {card.text}
                </div>
            </div>
        </motion.div>
    );
}
