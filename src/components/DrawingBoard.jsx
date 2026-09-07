import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../supabaseClient';

// ============================================================
// DRAWING BOARD — Cross-Platform Normalized Sync (1000x1000 Virtual Coordinates)
// - Fixed Square Canvas (aspect-ratio: 1/1, width: 100%, max-width: 500px)
// - Virtual 1000x1000 coordinate system ensures PC and iPhone strokes match 1:1
// - Supabase Realtime Broadcast: 'drawing_room'
// ============================================================

const VIRTUAL_SIZE = 1000;
const BROADCAST_CHANNEL = 'drawing_room';

export default function DrawingBoard({ userRole }) {
    const canvasRef = useRef(null);
    const contextRef = useRef(null);
    const containerRef = useRef(null);

    const [isDrawing, setIsDrawing] = useState(false);
    const [color, setColor] = useState('#3a769d');
    const [brushSize, setBrushSize] = useState(4);
    const [isEraser, setIsEraser] = useState(false);
    const [partnerDrawing, setPartnerDrawing] = useState(false);
    const [showGallery, setShowGallery] = useState(false);
    const [gallery, setGallery] = useState([]);
    const [message, setMessage] = useState(null);

    const channelRef = useRef(null);
    const lastPointRef = useRef(null);

    // Fetch drawings from Supabase
    const fetchDrawings = useCallback(async () => {
        try {
            const { data, error } = await supabase
                .from('drawings')
                .select('*')
                .order('created_at', { ascending: false });

            if (!error && data) {
                setGallery(data);
                localStorage.setItem('saved_drawings', JSON.stringify(data));
                return data;
            } else {
                const local = JSON.parse(localStorage.getItem('saved_drawings') || '[]');
                setGallery(local);
                return local;
            }
        } catch (err) {
            console.error('fetchDrawings error:', err);
            const local = JSON.parse(localStorage.getItem('saved_drawings') || '[]');
            setGallery(local);
            return local;
        }
    }, []);

    // Initial fetch on mount + Realtime DB sync
    useEffect(() => {
        fetchDrawings();

        const drawingsChannel = supabase
            .channel('drawings_db_sync')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'drawings' }, () => {
                fetchDrawings();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(drawingsChannel);
        };
    }, [fetchDrawings]);

    useEffect(() => {
        if (showGallery) {
            fetchDrawings();
        }
    }, [showGallery, fetchDrawings]);

    // Canvas setup with fixed 1000x1000 Virtual Resolution
    useEffect(() => {
        const setupCanvas = () => {
            const canvas = canvasRef.current;
            if (!canvas) return;

            // Preserve current drawing if already has content
            let savedData = null;
            if (canvas.width > 0 && canvas.height > 0 && contextRef.current) {
                try {
                    savedData = canvas.toDataURL();
                } catch (e) { }
            }

            // Fixed internal buffer: 1000x1000 square
            canvas.width = VIRTUAL_SIZE;
            canvas.height = VIRTUAL_SIZE;

            const ctx = canvas.getContext('2d');
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            if (savedData) {
                const img = new Image();
                img.onload = () => { ctx.drawImage(img, 0, 0, VIRTUAL_SIZE, VIRTUAL_SIZE); };
                img.src = savedData;
            } else {
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, VIRTUAL_SIZE, VIRTUAL_SIZE);
            }

            contextRef.current = ctx;
        };

        setupCanvas();
        const t1 = setTimeout(setupCanvas, 100);
        return () => clearTimeout(t1);
    }, []);

    // Supabase Realtime Broadcast for live drawing collaboration
    useEffect(() => {
        const channel = supabase.channel(BROADCAST_CHANNEL, {
            config: { broadcast: { self: false } }
        });

        channel
            .on('broadcast', { event: 'draw_stroke' }, (payload) => {
                const { x1, y1, x2, y2, strokeColor, strokeWidth } = payload.payload;
                drawRemoteStroke(x1, y1, x2, y2, strokeColor, strokeWidth);
            })
            .on('broadcast', { event: 'draw_start' }, () => {
                setPartnerDrawing(true);
            })
            .on('broadcast', { event: 'draw_end' }, () => {
                setPartnerDrawing(false);
            })
            .on('broadcast', { event: 'clear_canvas' }, () => {
                clearCanvasLocal();
            })
            .subscribe();

        channelRef.current = channel;
        return () => { supabase.removeChannel(channel); };
    }, []);

    // Remote stroke arrives already in 1000x1000 virtual units
    const drawRemoteStroke = (x1, y1, x2, y2, strokeColor, strokeWidth) => {
        const ctx = contextRef.current;
        if (!ctx) return;
        const prevColor = ctx.strokeStyle;
        const prevWidth = ctx.lineWidth;

        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = strokeWidth;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        ctx.strokeStyle = prevColor;
        ctx.lineWidth = prevWidth;
    };

    // Normalize touch/mouse to 1000x1000 Virtual Coordinates
    const getVirtualCoords = useCallback((e) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        const x_actual = clientX - rect.left;
        const y_actual = clientY - rect.top;

        // Normalized to 0..1000 virtual units
        const x_virtual = Math.max(0, Math.min(VIRTUAL_SIZE, (x_actual / rect.width) * VIRTUAL_SIZE));
        const y_virtual = Math.max(0, Math.min(VIRTUAL_SIZE, (y_actual / rect.height) * VIRTUAL_SIZE));

        return { x: x_virtual, y: y_virtual };
    }, []);

    // Drawing handlers
    const startDrawing = useCallback((e) => {
        e.preventDefault();
        const { x, y } = getVirtualCoords(e);
        const ctx = contextRef.current;
        if (!ctx) return;

        ctx.beginPath();
        ctx.moveTo(x, y);
        lastPointRef.current = { x, y };
        setIsDrawing(true);

        channelRef.current?.send({
            type: 'broadcast', event: 'draw_start', payload: { user: userRole }
        });
    }, [getVirtualCoords, userRole]);

    const draw = useCallback((e) => {
        if (!isDrawing) return;
        e.preventDefault();
        const { x, y } = getVirtualCoords(e);
        const ctx = contextRef.current;
        if (!ctx || !lastPointRef.current) return;

        const prev = lastPointRef.current;
        const strokeColor = isEraser ? '#ffffff' : color;
        // Virtual stroke width calibrated to 1000px coordinate system
        const virtualWidth = isEraser ? brushSize * 6.5 : brushSize * 2.5;

        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = virtualWidth;
        ctx.beginPath();
        ctx.moveTo(prev.x, prev.y);
        ctx.lineTo(x, y);
        ctx.stroke();

        channelRef.current?.send({
            type: 'broadcast',
            event: 'draw_stroke',
            payload: {
                x1: prev.x,
                y1: prev.y,
                x2: x,
                y2: y,
                strokeColor,
                strokeWidth: virtualWidth
            }
        });

        lastPointRef.current = { x, y };
    }, [isDrawing, getVirtualCoords, color, brushSize, isEraser]);

    const stopDrawing = useCallback(() => {
        if (!isDrawing) return;
        setIsDrawing(false);
        lastPointRef.current = null;
        contextRef.current?.closePath();

        channelRef.current?.send({
            type: 'broadcast', event: 'draw_end', payload: { user: userRole }
        });
    }, [isDrawing, userRole]);

    // Canvas clearing
    const clearCanvas = () => {
        clearCanvasLocal();
        channelRef.current?.send({ type: 'broadcast', event: 'clear_canvas', payload: {} });
    };

    const clearCanvasLocal = () => {
        const ctx = contextRef.current;
        if (!ctx) return;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, VIRTUAL_SIZE, VIRTUAL_SIZE);
    };

    // Save drawing to Supabase and cache
    const handleSave = async () => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const base64Data = canvas.toDataURL('image/png');
        const drawingId = 'draw-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
        const now = new Date().toISOString();

        try {
            const { error } = await supabase
                .from('drawings')
                .insert({
                    id: drawingId,
                    image_data: base64Data,
                    created_by: userRole || 'her',
                    created_at: now
                });

            if (error) {
                console.error('Error inserting drawing to Supabase:', error);
                const local = JSON.parse(localStorage.getItem('saved_drawings') || '[]');
                local.unshift({ id: drawingId, image_data: base64Data, created_by: userRole || 'her', created_at: now });
                localStorage.setItem('saved_drawings', JSON.stringify(local));
            }

            setMessage('💾 Рисунок сохранён!');
            setTimeout(() => setMessage(null), 3000);
            await fetchDrawings();
        } catch (err) {
            console.error('Exception during saveDrawing:', err);
            await fetchDrawings();
        }
    };

    // Delete drawing from Supabase
    const handleDeleteDrawing = async (id) => {
        if (!window.confirm('Точно удалить этот рисунок?')) return;

        setGallery(prev => prev.filter(d => d.id !== id));

        try {
            const { error } = await supabase
                .from('drawings')
                .delete()
                .eq('id', id);

            if (error) console.error('Error deleting drawing:', error);

            const local = JSON.parse(localStorage.getItem('saved_drawings') || '[]');
            const updated = local.filter(d => d.id !== id);
            localStorage.setItem('saved_drawings', JSON.stringify(updated));

            setMessage('🗑️ Рисунок удалён');
            setTimeout(() => setMessage(null), 2500);
            await fetchDrawings();
        } catch (err) {
            console.error('Exception during handleDeleteDrawing:', err);
            await fetchDrawings();
        }
    };

    const handleLoadGallery = async () => {
        await fetchDrawings();
        setShowGallery(true);
    };

    const handleSelectFromGallery = (imageData) => {
        const ctx = contextRef.current;
        if (!ctx) return;
        const img = new Image();
        img.onload = () => {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, VIRTUAL_SIZE, VIRTUAL_SIZE);
            ctx.drawImage(img, 0, 0, VIRTUAL_SIZE, VIRTUAL_SIZE);
            setShowGallery(false);
            setMessage('🎨 Рисунок загружен на холст!');
            setTimeout(() => setMessage(null), 2500);
        };
        img.src = imageData;
    };

    const presetColors = [
        '#3a769d', '#e74c3c', '#2ecc71', '#f39c12', '#9b59b6',
        '#1abc9c', '#34495e', '#e67e22', '#ff6b81'
    ];

    return (
        <div className="drawing-board" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden' }}>
            {message && <div className="toast">{message}</div>}

            {/* ===== PARTNER DRAWING INDICATOR ===== */}
            {partnerDrawing && (
                <div className="partner-indicator">
                    <span>✨</span>
                    <span>Партнёр рисует...</span>
                    <span>✨</span>
                </div>
            )}

            {/* Toolbar — Compact bar (< 15% total height) */}
            <div className="drawing-toolbar" style={{ flexShrink: 0, padding: '2px 0 4px', gap: '6px' }}>
                <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap', alignItems: 'center' }}>
                    {presetColors.map((c) => (
                        <button
                            key={c}
                            onClick={() => { setColor(c); setIsEraser(false); }}
                            style={{
                                width: '20px', height: '20px', borderRadius: '50%',
                                border: color === c && !isEraser ? '2.5px solid #3a769d' : '1.5px solid rgba(166,206,238,0.3)',
                                background: c, cursor: 'pointer', transition: 'all 0.2s', padding: 0
                            }}
                        />
                    ))}
                </div>

                <input
                    type="color"
                    value={color}
                    onChange={(e) => { setColor(e.target.value); setIsEraser(false); }}
                    style={{ width: '26px', height: '26px', padding: 0, border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                />

                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ fontSize: '0.7rem', opacity: 0.6 }}>Кисть:</span>
                    <input
                        type="range"
                        min="1"
                        max="20"
                        value={brushSize}
                        onChange={(e) => setBrushSize(Number(e.target.value))}
                        style={{ width: '55px' }}
                    />
                    <span style={{ fontSize: '0.7rem', fontWeight: '600' }}>{brushSize}px</span>
                </div>

                <button
                    className={`drawing-btn ${isEraser ? 'drawing-btn-primary' : 'drawing-btn-secondary'}`}
                    onClick={() => setIsEraser(!isEraser)}
                    style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                >
                    {isEraser ? '🧽 Ластик ✓' : '🧽 Ластик'}
                </button>
            </div>

            {/* Canvas Area — Square 1:1 Canvas with 1000x1000 virtual coordinates, max-width: 500px */}
            <div
                className="drawing-canvas-wrap"
                ref={containerRef}
                style={{
                    flex: 1,
                    minHeight: 0,
                    position: 'relative',
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '2px'
                }}
            >
                <canvas
                    ref={canvasRef}
                    width={VIRTUAL_SIZE}
                    height={VIRTUAL_SIZE}
                    className="drawing-canvas"
                    style={{
                        width: '100%',
                        maxWidth: '500px',
                        aspectRatio: '1 / 1',
                        height: 'auto',
                        maxHeight: '100%',
                        objectFit: 'contain',
                        cursor: isEraser ? 'cell' : 'crosshair',
                        display: 'block',
                        borderRadius: '12px',
                        boxShadow: '0 4px 20px rgba(58, 118, 157, 0.15)',
                        background: '#ffffff',
                        touchAction: 'none'
                    }}
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                />
            </div>

            {/* Action buttons — Compact bar at bottom, ALWAYS VISIBLE */}
            <div style={{
                display: 'flex',
                gap: '8px',
                padding: '6px 0 4px',
                flexWrap: 'wrap',
                justifyContent: 'center',
                flexShrink: 0
            }}>
                <button className="drawing-btn drawing-btn-primary" onClick={handleSave} style={{ padding: '6px 14px', fontSize: '0.8rem' }}>💾 Сохранить</button>
                <button className="drawing-btn drawing-btn-secondary" onClick={clearCanvas} style={{ padding: '6px 14px', fontSize: '0.8rem' }}>🗑️ Очистить</button>
                <button className="drawing-btn drawing-btn-secondary" onClick={handleLoadGallery} style={{ padding: '6px 14px', fontSize: '0.8rem' }}>🖼️ Галерея</button>
            </div>

            {/* Gallery Modal */}
            <AnimatePresence>
                {showGallery && (
                    <motion.div
                        className="modal-overlay"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        onClick={(e) => { if (e.target === e.currentTarget) setShowGallery(false); }}
                        style={{ zIndex: 2100 }}
                    >
                        <motion.div
                            className="modal-content modal-lg"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            style={{ maxHeight: '92vh', height: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
                        >
                            <div className="modal-header" style={{ flexShrink: 0, height: '42px', padding: '6px 16px' }}>
                                <h2 style={{ fontSize: '1.1rem' }}>🖼️ Наши рисунки</h2>
                                <button className="modal-close" onClick={() => setShowGallery(false)}>✕</button>
                            </div>
                            <div className="modal-body" style={{ flex: 1, overflowY: 'auto' }}>
                                {gallery.length === 0 ? (
                                    <p style={{ textAlign: 'center', opacity: 0.5, padding: '40px 0' }}>
                                        Пока нет сохранённых рисунков. Нарисуй что-нибудь красивое! 🎨
                                    </p>
                                ) : (
                                    <div className="drawing-gallery">
                                        {gallery.map((item) => (
                                            <div key={item.id} className="drawing-gallery-item" style={{ position: 'relative' }}>
                                                <img
                                                    src={item.image_data}
                                                    alt="Рисунок"
                                                    onClick={() => handleSelectFromGallery(item.image_data)}
                                                    style={{ width: '100%', height: 'auto', display: 'block', maxHeight: '220px', objectFit: 'contain', background: '#fafafa', cursor: 'pointer' }}
                                                />
                                                <div className="gallery-meta" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <span>
                                                        {item.created_by === 'boy' ? '🌿 Глеб' : '❤️ Любимая'} •{' '}
                                                        {item.created_at ? new Date(item.created_at).toLocaleDateString('ru-RU') : 'Сегодня'}
                                                    </span>
                                                    <button
                                                        onClick={() => handleDeleteDrawing(item.id)}
                                                        title="Удалить рисунок"
                                                        style={{
                                                            background: 'rgba(231, 76, 60, 0.12)',
                                                            border: '1px solid rgba(231, 76, 60, 0.3)',
                                                            borderRadius: '8px',
                                                            padding: '4px 8px',
                                                            cursor: 'pointer',
                                                            color: '#e74c3c',
                                                            fontSize: '0.9rem',
                                                            lineHeight: 1
                                                        }}
                                                    >
                                                        🗑️
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
