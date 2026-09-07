import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import { supabase } from '../supabaseClient';
import {
    PLANT_STAGES,
    getPlantStageIndex,
    getPlantData,
    performPlantAction,
    adminSetPlantActions
} from '../data/gameState';

// ============================================================
// PLANT GAME — Fixed: Tools animate, NOT the plant
// Admin panel: 3 clicks on title to reveal
// Assets: /game/game_plants/leika.png, /game/game_plants/metla.png
// ============================================================

export default function PlantGame({ userRole }) {
    const [plantData, setPlantData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState(null);

    // Drag state
    const [draggingTool, setDraggingTool] = useState(null);  // 'water' | 'dust' | null
    const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
    const [isOverPlant, setIsOverPlant] = useState(false);   // is ghost over the drop zone?
    const [toolAnimating, setToolAnimating] = useState(null); // 'water' | 'dust' during 2s animation
    const [animCoords, setAnimCoords] = useState({ x: '50%', y: '50%' });
    const [plantVibrating, setPlantVibrating] = useState(false);

    // Admin panel
    const [adminVisible, setAdminVisible] = useState(false);
    const [titleClicks, setTitleClicks] = useState(0);

    const dropZoneRef = useRef(null);
    const leikaRef = useRef(null);
    const metlaRef = useRef(null);
    const dragOffsetRef = useRef({ x: 0, y: 0 });

    // Load plant data + realtime subscription
    useEffect(() => {
        loadPlant();
        const channel = supabase
            .channel('plant_realtime')
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'plant_state',
                filter: 'id=eq.main'
            }, (payload) => {
                setPlantData(payload.new);
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, []);

    const loadPlant = async () => {
        setLoading(true);
        const data = await getPlantData();
        setPlantData(data);
        setLoading(false);
    };

    const showMessage = (text, duration = 3000) => {
        setMessage(text);
        setTimeout(() => setMessage(null), duration);
    };

    const fireCelebration = () => {
        const end = Date.now() + 2000;
        const frame = () => {
            confetti({ particleCount: 3, angle: 60, spread: 55, origin: { x: 0 }, colors: ['#a6ceee', '#d8b4cc', '#f9e8e9', '#FFD700'] });
            confetti({ particleCount: 3, angle: 120, spread: 55, origin: { x: 1 }, colors: ['#a6ceee', '#d8b4cc', '#f9e8e9', '#FFD700'] });
            if (Date.now() < end) requestAnimationFrame(frame);
        };
        frame();
    };

    // ============================================================
    // ADMIN PANEL — 3 clicks on title
    // ============================================================
    const handleTitleClick = () => {
        const newCount = titleClicks + 1;
        setTitleClicks(newCount);
        if (newCount >= 3) {
            setAdminVisible(!adminVisible);
            setTitleClicks(0);
        }
        // Reset click count after 2 seconds
        setTimeout(() => setTitleClicks(0), 2000);
    };

    const adminSetStage = async (actions) => {
        const data = await adminSetPlantActions(actions);
        setPlantData(data);
        showMessage(`🔧 Admin: установлено ${actions} действий`);
    };

    // ============================================================
    // DRAG & DROP — getBoundingClientRect + clientX/Y collision
    // ============================================================
    const handleDragStart = useCallback((e, toolType) => {
        e.preventDefault();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        setDraggingTool(toolType);
        setDragPos({ x: clientX, y: clientY });
    }, []);

    const handleDragMove = useCallback((e) => {
        if (!draggingTool) return;
        e.preventDefault();

        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        setDragPos({ x: clientX, y: clientY });

        // Collision check: is the dragged tool over the plant drop zone?
        if (dropZoneRef.current) {
            const rect = dropZoneRef.current.getBoundingClientRect();
            const over =
                clientX >= rect.left &&
                clientX <= rect.right &&
                clientY >= rect.top &&
                clientY <= rect.bottom;
            setIsOverPlant(over);
        }
    }, [draggingTool]);

    const handleDragEnd = useCallback(async (e) => {
        if (!draggingTool) return;

        const clientX = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
        const clientY = e.changedTouches ? e.changedTouches[0].clientY : e.clientY;

        // Final collision with getBoundingClientRect
        let hitTarget = false;
        if (dropZoneRef.current) {
            const rect = dropZoneRef.current.getBoundingClientRect();
            hitTarget =
                clientX >= rect.left &&
                clientX <= rect.right &&
                clientY >= rect.top &&
                clientY <= rect.bottom;
        }

        const tool = draggingTool;
        setDraggingTool(null);
        setIsOverPlant(false);

        if (hitTarget) {
            await triggerAction(tool);
        }
    }, [draggingTool, userRole, plantData]);

    // Attach global listeners when dragging
    useEffect(() => {
        if (draggingTool) {
            const onMove = (e) => handleDragMove(e);
            const onEnd = (e) => handleDragEnd(e);
            window.addEventListener('mousemove', onMove, { passive: false });
            window.addEventListener('mouseup', onEnd);
            window.addEventListener('touchmove', onMove, { passive: false });
            window.addEventListener('touchend', onEnd);
            return () => {
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onEnd);
                window.removeEventListener('touchmove', onMove);
                window.removeEventListener('touchend', onEnd);
            };
        }
    }, [draggingTool, handleDragMove, handleDragEnd]);

    // ============================================================
    // ACTION: 2-second tool animation → perform action → confetti
    // The TOOL animates (tilt/wiggle), the plant only does subtle vibration
    // ============================================================
    const triggerAction = async (type) => {
        // Compute position over plant drop zone
        if (dropZoneRef.current) {
            const rect = dropZoneRef.current.getBoundingClientRect();
            setAnimCoords({
                x: `${rect.left + rect.width / 2}px`,
                y: `${rect.top + rect.height / 2 - (type === 'water' ? 25 : 0)}px`
            });
        }

        // 1. Start tool animation on the ghost (tool rotates/wiggles)
        setToolAnimating(type);
        // 2. Plant gets subtle vibration only (no plant rotation)
        setPlantVibrating(true);

        // 3. Wait 2 seconds for the animation
        await new Promise(resolve => setTimeout(resolve, 2000));

        setToolAnimating(null);
        setPlantVibrating(false);

        // 4. Perform the actual action
        const result = await performPlantAction(type, userRole);

        if (!result.success) {
            showMessage(result.message);
            return;
        }

        setPlantData(result.data);
        fireCelebration();

        if (result.evolved) {
            const newStage = PLANT_STAGES[getPlantStageIndex(result.data.total_actions)];
            showMessage(`🎉 Эволюция! Теперь это: ${newStage.emoji} ${newStage.name}!`, 5000);
        } else {
            showMessage(type === 'water' ? '💧 Полито с любовью!' : '✨ Протёрто от пыли!');
        }
    };

    // ============================================================
    // RENDER
    // ============================================================
    if (loading || !plantData) {
        return (
            <div className="plant-game" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '400px' }}>
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
                    style={{ fontSize: '3rem' }}
                >🌱</motion.div>
            </div>
        );
    }

    const stageIndex = getPlantStageIndex(plantData.total_actions);
    const stage = PLANT_STAGES[stageIndex];
    const prevMax = stageIndex > 0 ? PLANT_STAGES[stageIndex - 1].maxActions + 1 : 0;
    const currentMax = stage.maxActions === 999 ? 180 : stage.maxActions + 1;
    const stageProgress = ((plantData.total_actions - prevMax) / (currentMax - prevMax)) * 100;

    // Turn info
    const now = new Date();
    const day = now.getDay();
    const isMyTurn = day === 0 ||
        (userRole === 'boy' && [1, 3, 5].includes(day)) ||
        (userRole === 'girl' && [2, 4, 6].includes(day));
    const dayNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    const turnLabel = isMyTurn
        ? `Сегодня (${dayNames[day]}) — твоя очередь! 🌟`
        : `Сегодня (${dayNames[day]}) — очередь ${userRole === 'boy' ? 'Любимой' : 'Глеба'} 💤`;

    return (
        <div className="plant-game" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, justifyContent: 'space-between', overflow: 'hidden' }}>
            {/* Toast */}
            {message && <div className="toast">{message}</div>}

            {/* Top info section: fixed slim height */}
            <div style={{ flexShrink: 0 }}>
                {/* Turn info */}
                <div className="plant-turn-info" style={{ padding: '2px 8px', fontSize: '0.72rem', marginBottom: '2px' }}>{turnLabel}</div>

                {/* Stage label (click 3x for admin) */}
                <div
                    className="plant-stage-label"
                    onClick={handleTitleClick}
                    style={{ cursor: 'default', userSelect: 'none', fontSize: 'clamp(0.95rem, 2.2vh, 1.15rem)', marginBottom: '1px' }}
                >
                    {stage.emoji} {stage.name}
                </div>

                {/* Actions count */}
                <div className="plant-actions-count" style={{ fontSize: '0.72rem', marginBottom: '2px' }}>
                    {plantData.total_actions} / 180 действий • Стадия {stageIndex + 1}/5
                </div>

                {/* Progress bar */}
                <div className="plant-progress-bar" style={{ height: '4px', marginBottom: '4px' }}>
                    <motion.div
                        className="plant-progress-fill"
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(stageProgress, 100)}%` }}
                        transition={{ duration: 0.5 }}
                    />
                </div>
            </div>

            {/* PLANT DROP ZONE — Centered in flex-1 min-h-0 area, auto-scales to fit */}
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                <div
                    ref={dropZoneRef}
                    className={`plant-drop-zone ${isOverPlant && draggingTool ? 'drop-hover' : ''}`}
                    style={{ width: 'clamp(75px, 16vh, 115px)', height: 'clamp(75px, 16vh, 115px)', minHeight: '65px' }}
                >
                    <div
                        className={`plant-display ${plantVibrating ? 'plant-vibrate' : ''}`}
                        key={stageIndex}
                        style={{ fontSize: 'clamp(2.2rem, 5.5vh, 3.2rem)' }}
                    >
                        {stage.emoji}
                    </div>
                </div>

                <p style={{ fontSize: '0.7rem', opacity: 0.5, margin: '3px 0 0' }}>
                    Перетащи лейку или метлу на растение
                </p>
            </div>

            {/* Bottom Tools & Timers — Compact bar (< 15% height), ALWAYS VISIBLE */}
            <div style={{ flexShrink: 0, marginTop: 'auto', paddingTop: '2px' }}>
                {/* Draggable tools */}
                <div className="plant-tools-row" style={{ gap: '24px', margin: '2px 0 4px' }}>
                    {/* LEIKA — watering can */}
                    <div style={{ textAlign: 'center' }}>
                        <div
                            ref={leikaRef}
                            className="plant-tool"
                            onMouseDown={(e) => handleDragStart(e, 'water')}
                            onTouchStart={(e) => handleDragStart(e, 'water')}
                            style={{ opacity: draggingTool === 'water' ? 0.3 : 1, width: 'clamp(44px, 6.2vh, 52px)', height: 'clamp(44px, 6.2vh, 52px)' }}
                        >
                            <img
                                src="/game/game_plants/leika.png"
                                alt="Лейка"
                                onError={(e) => {
                                    e.target.style.display = 'none';
                                    e.target.parentElement.innerHTML = '<div style="font-size:2.5rem;line-height:1">💧</div>';
                                }}
                            />
                        </div>
                        <div className="plant-tool-label" style={{ fontSize: '0.72rem' }}>Полить 💧</div>
                    </div>

                    {/* METLA — broom */}
                    <div style={{ textAlign: 'center' }}>
                        <div
                            ref={metlaRef}
                            className="plant-tool"
                            onMouseDown={(e) => handleDragStart(e, 'dust')}
                            onTouchStart={(e) => handleDragStart(e, 'dust')}
                            style={{ opacity: draggingTool === 'dust' ? 0.3 : 1, width: 'clamp(44px, 6.2vh, 52px)', height: 'clamp(44px, 6.2vh, 52px)' }}
                        >
                            <img
                                src="/game/game_plants/matla.png"
                                alt="Метла"
                                onError={(e) => {
                                    if (e.target.src.includes('matla.png')) {
                                        e.target.src = '/game/game_plants/metla.png';
                                    } else {
                                        e.target.style.display = 'none';
                                        e.target.parentElement.innerHTML = '<div style="font-size:3rem;line-height:1">🧹</div>';
                                    }
                                }}
                            />
                        </div>
                        <div className="plant-tool-label" style={{ fontSize: '0.72rem' }}>Протереть ✨</div>
                    </div>
                </div>

                {/* Cooldown timers in compact inline row */}
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap', margin: '2px 0' }}>
                    {plantData.last_water_time && (
                        <CooldownTimer label="Полив" lastTime={plantData.last_water_time} />
                    )}
                    {plantData.last_dust_time && (
                        <CooldownTimer label="Протирка" lastTime={plantData.last_dust_time} />
                    )}
                </div>

                {/* Stage description */}
                <p style={{ margin: '1px 0 0', fontSize: '0.72rem', opacity: 0.6, fontStyle: 'italic', textAlign: 'center' }}>
                    «{stage.description}»
                </p>
            </div>

            {/* === ADMIN PANEL (hidden, revealed by 3 clicks on stage label) === */}
            {adminVisible && (
                <div className="admin-panel">
                    <h4>🔧 Панель разработчика</h4>
                    <p style={{ fontSize: '0.75rem', opacity: 0.6, marginBottom: '10px' }}>
                        Установить количество действий (обход КД):
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', justifyContent: 'center' }}>
                        <button className="admin-btn" onClick={() => adminSetStage(0)}>🌰 0 (Семечко)</button>
                        <button className="admin-btn" onClick={() => adminSetStage(20)}>🌰 20</button>
                        <button className="admin-btn" onClick={() => adminSetStage(45)}>🌱 45 (Росток)</button>
                        <button className="admin-btn" onClick={() => adminSetStage(90)}>🌿 90 (Листочки)</button>
                        <button className="admin-btn" onClick={() => adminSetStage(135)}>🪴 135 (Кустик)</button>
                        <button className="admin-btn" onClick={() => adminSetStage(180)}>🌸 180 (Цвет!)</button>
                    </div>
                    <div style={{ marginTop: '10px' }}>
                        <button className="admin-btn" onClick={async () => {
                            await performPlantAction('water', userRole, true);
                            await loadPlant();
                            showMessage('🔧 Admin: полив (КД обойдён)');
                            fireCelebration();
                        }}>💧 Полить (без КД)</button>
                        <button className="admin-btn" onClick={async () => {
                            await performPlantAction('dust', userRole, true);
                            await loadPlant();
                            showMessage('🔧 Admin: протирка (КД обойдён)');
                            fireCelebration();
                        }}>🧹 Протереть (без КД)</button>
                    </div>
                </div>
            )}

            {/* === DRAGGING GHOST — The TOOL animates, not the plant === */}
            {draggingTool && !toolAnimating && (
                <div
                    style={{
                        position: 'fixed',
                        left: `${dragPos.x}px`,
                        top: `${dragPos.y}px`,
                        width: '80px',
                        height: '80px',
                        transform: `translate(-50%, -50%) ${isOverPlant && draggingTool === 'water' ? 'rotate(45deg)' : ''}`,
                        pointerEvents: 'none',
                        zIndex: 9999,
                        filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.2))',
                        transition: isOverPlant ? 'transform 0.2s ease-out' : 'none'
                    }}
                >
                    <img
                        src={draggingTool === 'water' ? '/game/game_plants/leika.png' : '/game/game_plants/matla.png'}
                        alt=""
                        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                        onError={(e) => {
                            if (e.target.src.includes('matla.png')) {
                                e.target.src = '/game/game_plants/metla.png';
                            } else {
                                e.target.style.display = 'none';
                                e.target.parentElement.innerHTML = draggingTool === 'water'
                                    ? '<div style="font-size:3rem;text-align:center">💧</div>'
                                    : '<div style="font-size:3rem;text-align:center">🧹</div>';
                            }
                        }}
                    />
                </div>
            )}

            {/* === TOOL ANIMATION GHOST — plays the 2-second tilt/wiggle ON THE TOOL directly over plant === */}
            {toolAnimating && (
                <div
                    style={{
                        position: 'fixed',
                        left: animCoords.x,
                        top: animCoords.y,
                        width: '100px',
                        height: '100px',
                        pointerEvents: 'none',
                        zIndex: 9999,
                        animation: toolAnimating === 'water'
                            ? 'toolTilt45 2s ease-in-out'
                            : 'toolWiggle 2s ease-in-out',
                        filter: 'drop-shadow(0 4px 20px rgba(0,0,0,0.3))'
                    }}
                >
                    <img
                        src={toolAnimating === 'water' ? '/game/game_plants/leika.png' : '/game/game_plants/matla.png'}
                        alt=""
                        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                        onError={(e) => {
                            if (e.target.src.includes('matla.png')) {
                                e.target.src = '/game/game_plants/metla.png';
                            } else {
                                e.target.style.display = 'none';
                                e.target.parentElement.innerHTML = toolAnimating === 'water'
                                    ? '<div style="font-size:4rem;text-align:center">💧</div>'
                                    : '<div style="font-size:4rem;text-align:center">🧹</div>';
                            }
                        }}
                    />
                </div>
            )}
        </div>
    );
}

// ============================================================
// COOLDOWN TIMER
// ============================================================
function CooldownTimer({ label, lastTime }) {
    const [remaining, setRemaining] = useState('');

    useEffect(() => {
        const update = () => {
            const elapsed = Date.now() - new Date(lastTime).getTime();
            const cooldownMs = 48 * 60 * 60 * 1000;
            const left = cooldownMs - elapsed;

            if (left <= 0) {
                setRemaining('✅ Готово!');
                return;
            }
            const h = Math.floor(left / 3600000);
            const m = Math.floor((left % 3600000) / 60000);
            const s = Math.floor((left % 60000) / 1000);
            setRemaining(`${h}ч ${m}мин ${s}с`);
        };
        update();
        const interval = setInterval(update, 1000);
        return () => clearInterval(interval);
    }, [lastTime]);

    return <div className="plant-cooldown" style={{ margin: 0, fontSize: '0.72rem' }}>{label}: {remaining}</div>;
}
