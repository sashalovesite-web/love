import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Matter from 'matter-js';
import confetti from 'canvas-confetti';

// ============================================================
// KISS GAME — PHYSICS SYNC & POWER BALANCING
// 1. STANDARDIZED LAUNCH VELOCITY:
//    - Fixed comfortable velocity range (10 to 22, baseline 15).
//    - Matter.Body.setVelocity(projectile, { x: Math.cos(angleRad) * launchVelocity, y: Math.sin(angleRad) * launchVelocity });
//    - Prevents velocity explosion.
// 2. SYNCHRONIZED TRAJECTORY DOTS:
//    - Exact Matter.js formula matching world gravity (1.0).
//    - const x = startX + (Math.cos(angleRad) * velocity) * t * 60;
//    - const y = startY + (Math.sin(angleRad) * velocity * t + 0.5 * gravity * t * t) * 60;
//    - Dots start directly at the tip of the barrel where the ball spawns.
// 3. VISUAL CORRECTION:
//    - gun.png horizontally flipped (scale -1, 1) to face the targets.
//    - Wheel centered on axle.
// 4. PROCEDURAL GENERATOR & ZERO-SCROLL LAYOUT:
//    - 2 to 5 targets per level with defensive wood structures.
//    - Fits within 92vh mobile modal with mandatory min-height (300px/400px).
// ============================================================

const GAME_WIDTH = 800;
const GAME_HEIGHT = 520;
const CANNON_X = 110;
const GROUND_Y = 470;
const CANNON_Y = GROUND_Y - 45;
const WHEEL_RADIUS = 30;
const BARREL_LENGTH = 75;

// Launch velocity boundaries (shared between aiming, trajectory simulation, and fire)
const MIN_LAUNCH_VELOCITY = 10.0;
const MAX_LAUNCH_VELOCITY = 20.0;
const BASE_LAUNCH_VELOCITY = 15.0;

// Planks & targets dimensions
const VW = 32;       // Vertical plank width
const VH = 85;       // Vertical plank height
const HW = 145;      // Horizontal plank width
const HH = 32;       // Horizontal plank height
const TARGET_R = 24; // Target radius

export default function KissGame({ userRole }) {
    const [phase, setPhase] = useState('camera'); // 'camera' | 'game'
    const [selfieTexture, setSelfieTexture] = useState(null);

    // Fallback circular selfie texture
    const createDefaultSelfieTexture = () => {
        const c = document.createElement('canvas');
        c.width = 200;
        c.height = 200;
        const ctx = c.getContext('2d');
        ctx.beginPath();
        ctx.arc(100, 100, 96, 0, Math.PI * 2);
        ctx.fillStyle = '#f9e8e9';
        ctx.fill();
        ctx.lineWidth = 6;
        ctx.strokeStyle = '#d8b4cc';
        ctx.stroke();
        ctx.font = '80px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('💋', 100, 105);
        return c.toDataURL('image/png');
    };

    if (phase === 'camera') {
        return (
            <CameraCapture
                onCapture={(dataUrl) => { setSelfieTexture(dataUrl); setPhase('game'); }}
                onSkip={() => { setSelfieTexture(createDefaultSelfieTexture()); setPhase('game'); }}
            />
        );
    }

    return (
        <PhysicsGame
            selfieTexture={selfieTexture || createDefaultSelfieTexture()}
            onRetakeSelfie={() => setPhase('camera')}
        />
    );
}

// ============================================================
// CAMERA CAPTURE — Circular Crop Pre-Game Capture
// ============================================================
function CameraCapture({ onCapture, onSkip }) {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const streamRef = useRef(null);
    const fileInputRef = useRef(null);
    const [cameraReady, setCameraReady] = useState(false);
    const [cameraError, setCameraError] = useState(false);

    useEffect(() => {
        startCamera();
        return () => stopCamera();
    }, []);

    const startCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: 480, height: 480 }
            });
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.onloadedmetadata = () => {
                    videoRef.current.play();
                    setCameraReady(true);
                };
            }
        } catch (err) {
            console.warn('Camera not available or access denied:', err);
            setCameraError(true);
        }
    };

    const stopCamera = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
    };

    const cropCircle = (source, sourceWidth, sourceHeight) => {
        const canvas = canvasRef.current;
        const size = 200;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, size, size);

        ctx.beginPath();
        ctx.arc(size / 2, size / 2, (size / 2) - 4, 0, Math.PI * 2);
        ctx.clip();

        const minDim = Math.min(sourceWidth, sourceHeight);
        const sx = (sourceWidth - minDim) / 2;
        const sy = (sourceHeight - minDim) / 2;
        ctx.drawImage(source, sx, sy, minDim, minDim, 0, 0, size, size);

        ctx.restore();
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, (size / 2) - 4, 0, Math.PI * 2);
        ctx.lineWidth = 6;
        ctx.strokeStyle = '#d8b4cc';
        ctx.stroke();

        return canvas.toDataURL('image/png');
    };

    const capturePhoto = () => {
        const video = videoRef.current;
        if (!video) return;
        const dataUrl = cropCircle(video, video.videoWidth || 480, video.videoHeight || 480);
        stopCamera();
        onCapture(dataUrl);
    };

    const handleFile = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const img = new Image();
            img.onload = () => {
                const dataUrl = cropCircle(img, img.width, img.height);
                stopCamera();
                onCapture(dataUrl);
            };
            img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
    };

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            minHeight: 0,
            overflow: 'hidden',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '12px',
            textAlign: 'center'
        }}>
            <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(1.05rem, 2.8vh, 1.35rem)', marginBottom: '6px', flexShrink: 0 }}>
                📸 Сделай селфи для любовного снаряда!
            </h3>
            <p style={{ opacity: 0.6, marginBottom: '12px', fontSize: '0.8rem', flexShrink: 0 }}>
                Твоё лицо зарядится в пушку и полетит целовать мишени 💋
            </p>

            <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                {!cameraError ? (
                    <video
                        ref={videoRef}
                        autoPlay playsInline muted
                        style={{
                            width: 'clamp(120px, 26vh, 200px)',
                            height: 'clamp(120px, 26vh, 200px)',
                            borderRadius: '50%', objectFit: 'cover',
                            border: '4px solid #a6ceee',
                            boxShadow: '0 8px 32px rgba(166, 206, 238, 0.4)',
                            display: 'block'
                        }}
                    />
                ) : (
                    <div style={{
                        width: 'clamp(120px, 26vh, 200px)',
                        height: 'clamp(120px, 26vh, 200px)',
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, #a6ceee, #d8b4cc)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '3rem',
                        boxShadow: '0 8px 32px rgba(166, 206, 238, 0.4)'
                    }}>📷</div>
                )}
            </div>

            <canvas ref={canvasRef} style={{ display: 'none' }} />
            <input ref={fileInputRef} type="file" accept="image/*" capture="user" style={{ display: 'none' }} onChange={handleFile} />

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '12px', flexWrap: 'wrap', flexShrink: 0 }}>
                {cameraReady && <button className="btn-primary" onClick={capturePhoto} style={{ padding: '8px 16px', fontSize: '0.85rem' }}>📸 Снять!</button>}
                <button className="btn-secondary" onClick={() => fileInputRef.current?.click()} style={{ padding: '8px 16px', fontSize: '0.85rem' }}>📁 Загрузить фото</button>
                <button className="btn-secondary" onClick={onSkip} style={{ padding: '8px 16px', fontSize: '0.85rem' }}>⏭️ Пропустить</button>
            </div>
        </div>
    );
}

// ============================================================
// MAIN GAME COMPONENT — Synchronized Physics & Visuals
// ============================================================
function PhysicsGame({ selfieTexture, onRetakeSelfie }) {
    const sceneRef = useRef(null);
    const engineRef = useRef(null);
    const renderRef = useRef(null);
    const runnerRef = useRef(null);
    const worldRef = useRef(null);

    const towerBodiesRef = useRef([]);
    const targetBodiesRef = useRef([]);
    const projectilesRef = useRef([]);
    const burstingTargetsRef = useRef([]);

    // Game state
    const [level, setLevel] = useState(1);
    const [score, setScore] = useState(0);
    const [shotsLeft, setShotsLeft] = useState(10);
    const [targetsRemaining, setTargetsRemaining] = useState(2);
    const [hasWon, setHasWon] = useState(false);
    const [isOutOfShots, setIsOutOfShots] = useState(false);
    const [message, setMessage] = useState(null);

    // Aiming state (Direct pointer tracking)
    const [isAiming, setIsAiming] = useState(false);
    const [aimAngle, setAimAngle] = useState(-Math.PI / 4); // -45°
    const [aimPower, setAimPower] = useState(15.0);          // Standard launch velocity: 15

    // Refs to avoid stale closures in render/tick callbacks
    const isAimingRef = useRef(false);
    const aimAngleRef = useRef(-Math.PI / 4);
    const aimPowerRef = useRef(15.0);
    const shotsLeftRef = useRef(10);
    const hasWonRef = useRef(false);
    const isTransitioningRef = useRef(false);

    // Textures
    const weelImg = useRef(null);
    const gunImg = useRef(null);
    const woodHImg = useRef(null);
    const woodVImg = useRef(null);
    const selfieImg = useRef(null);

    const showMsg = (text) => {
        setMessage(text);
        setTimeout(() => setMessage(null), 3000);
    };

    // Keep refs in sync
    useEffect(() => { isAimingRef.current = isAiming; }, [isAiming]);
    useEffect(() => { aimAngleRef.current = aimAngle; }, [aimAngle]);
    useEffect(() => { aimPowerRef.current = aimPower; }, [aimPower]);
    useEffect(() => { shotsLeftRef.current = shotsLeft; }, [shotsLeft]);
    useEffect(() => { hasWonRef.current = hasWon; }, [hasWon]);

    // Check when out of shots and targets remain
    useEffect(() => {
        if (shotsLeft === 0 && targetsRemaining > 0 && !hasWon) {
            const timer = setTimeout(() => {
                if (targetBodiesRef.current.length > 0) {
                    setIsOutOfShots(true);
                }
            }, 2600);
            return () => clearTimeout(timer);
        } else {
            setIsOutOfShots(false);
        }
    }, [shotsLeft, targetsRemaining, hasWon]);

    // Preload textures on mount and initialize physics with delay
    useEffect(() => {
        let isMounted = true;

        const load = (src) => new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = src;
        });

        Promise.all([
            load('/game/game_gun/weel.png'),
            load('/game/game_gun/gun.png'),
            load('/game/game_gun/wood_h.png'),
            load('/game/game_gun/wood_v.png'),
            selfieTexture ? load(selfieTexture) : Promise.resolve(null)
        ]).then(([w, g, wh, wv, s]) => {
            if (!isMounted) return;
            weelImg.current = w;
            gunImg.current = g;
            woodHImg.current = wh;
            woodVImg.current = wv;
            selfieImg.current = s;

            // Small delay with requestAnimationFrame to ensure sceneRef container DOM is mounted & sized
            requestAnimationFrame(() => {
                if (isMounted) {
                    console.log('🚀 [KissGame] Textures loaded, initializing Matter.js for Level:', level);
                    initPhysics(level);
                }
            });
        });

        return () => {
            isMounted = false;
            cleanupPhysics();
        };
    }, []);

    // ============================================================
    // PROCEDURAL LEVEL GENERATOR
    // Generates dynamic targets (2 to 5) and defensive structures
    // Complexity scales with levelNumber, with fresh variety every run
    // ============================================================
    const generateLevel = (levelNumber, Bodies) => {
        const towerBodies = [];
        const targetBodies = [];

        const woodHTexture = '/game/game_gun/wood_h.png';
        const woodVTexture = '/game/game_gun/wood_v.png';

        const makeH = (x, y) => Bodies.rectangle(x, y, HW, HH, {
            label: 'plank',
            friction: 0.88,
            frictionStatic: 1.0,
            density: 0.08,
            restitution: 0.02,
            sleepThreshold: 12,
            render: {
                visible: true,
                sprite: {
                    texture: woodHTexture,
                    xScale: HW / 304,
                    yScale: HH / 78
                }
            }
        });

        const makeV = (x, y) => Bodies.rectangle(x, y, VW, VH, {
            label: 'plank',
            friction: 0.88,
            frictionStatic: 1.0,
            density: 0.08,
            restitution: 0.02,
            sleepThreshold: 12,
            render: {
                visible: true,
                sprite: {
                    texture: woodVTexture,
                    xScale: VW / 144,
                    yScale: VH / 141
                }
            }
        });

        const makeTarget = (x, y, isElevated = false) => {
            const t = Bodies.circle(x, y, TARGET_R, {
                label: 'target',
                friction: 0.85,
                frictionStatic: 1.0,
                density: 0.06, // has weight so direct hits launch it!
                restitution: 0.25,
                sleepThreshold: 12,
                render: {
                    visible: true,
                    fillStyle: '#111111',
                    strokeStyle: '#2ecc71',
                    lineWidth: 2
                }
            });
            t.initialY = y;
            t.isElevated = isElevated;
            return t;
        };

        // Determine target count (2 to 5 targets)
        const targetCount = Math.min(5, Math.max(2, Math.floor(2 + (levelNumber - 1) * 0.75)));

        // Random jitter for fresh positions every time
        const rJitter = () => (Math.random() - 0.5) * 24;

        if (levelNumber === 1) {
            // Level 1: 2 targets. One open ground target, one on a 1-story arch
            const xArch = 580 + rJitter();
            // Arch posts
            towerBodies.push(makeV(xArch - 55, GROUND_Y - VH / 2));
            towerBodies.push(makeV(xArch + 55, GROUND_Y - VH / 2));
            // Arch roof beam
            const yBeam = GROUND_Y - VH - HH / 2;
            towerBodies.push(makeH(xArch, yBeam));

            // Target 1: on ground
            targetBodies.push(makeTarget(430 + rJitter(), GROUND_Y - TARGET_R, false));
            // Target 2: elevated on arch roof
            targetBodies.push(makeTarget(xArch, yBeam - HH / 2 - TARGET_R, true));
        }
        else if (levelNumber === 2) {
            // Level 2: 3 targets. Ground target behind shield post, plus 1-story shelter
            const xFront = 420 + rJitter();
            const xMid = 620 + rJitter();

            // Front protective post
            towerBodies.push(makeV(xFront - 35, GROUND_Y - VH / 2));
            targetBodies.push(makeTarget(xFront + 10, GROUND_Y - TARGET_R, false));

            // Middle Shelter
            towerBodies.push(makeV(xMid - 55, GROUND_Y - VH / 2));
            towerBodies.push(makeV(xMid + 55, GROUND_Y - VH / 2));
            const yBeam = GROUND_Y - VH - HH / 2;
            towerBodies.push(makeH(xMid, yBeam));

            // Target inside shelter
            targetBodies.push(makeTarget(xMid, GROUND_Y - TARGET_R, false));
            // Target on top of shelter
            targetBodies.push(makeTarget(xMid, yBeam - HH / 2 - TARGET_R, true));
        }
        else if (levelNumber === 3) {
            // Level 3: 3-4 targets. 2-Story Tower + Pedestal
            const xTower = 590 + rJitter();
            const xPed = 440 + rJitter();

            // Pedestal on left
            towerBodies.push(makeV(xPed, GROUND_Y - VH / 2));
            targetBodies.push(makeTarget(xPed, GROUND_Y - VH - TARGET_R, true));

            // 2-story tower
            // Floor 1
            towerBodies.push(makeV(xTower - 52, GROUND_Y - VH / 2));
            towerBodies.push(makeV(xTower + 52, GROUND_Y - VH / 2));
            const yBeam1 = GROUND_Y - VH - HH / 2;
            towerBodies.push(makeH(xTower, yBeam1));
            targetBodies.push(makeTarget(xTower, GROUND_Y - TARGET_R, false));

            // Floor 2
            const yPost2 = yBeam1 - HH / 2 - VH / 2;
            towerBodies.push(makeV(xTower - 52, yPost2));
            towerBodies.push(makeV(xTower + 52, yPost2));
            const yBeam2 = yBeam1 - HH - VH;
            towerBodies.push(makeH(xTower, yBeam2));

            // Target on crown
            targetBodies.push(makeTarget(xTower, yBeam2 - HH / 2 - TARGET_R, true));

            if (targetCount >= 4) {
                targetBodies.push(makeTarget(710 + rJitter(), GROUND_Y - TARGET_R, false));
            }
        }
        else {
            // Level 4+: 4 to 5 targets. Complex multi-structure compound
            const x1 = 410 + rJitter();
            const x2 = 560 + rJitter();
            const x3 = 700 + rJitter();

            // Structure 1: T-stand on left
            towerBodies.push(makeV(x1, GROUND_Y - VH / 2));
            const yTBeam = GROUND_Y - VH - HH / 2;
            towerBodies.push(makeH(x1, yTBeam));
            targetBodies.push(makeTarget(x1 - 45, yTBeam - HH / 2 - TARGET_R, true));

            // Structure 2: 2-Story Tower in middle
            towerBodies.push(makeV(x2 - 52, GROUND_Y - VH / 2));
            towerBodies.push(makeV(x2 + 52, GROUND_Y - VH / 2));
            const yB1 = GROUND_Y - VH - HH / 2;
            towerBodies.push(makeH(x2, yB1));
            targetBodies.push(makeTarget(x2, GROUND_Y - TARGET_R, false));

            const yP2 = yB1 - HH / 2 - VH / 2;
            towerBodies.push(makeV(x2 - 52, yP2));
            towerBodies.push(makeV(x2 + 52, yP2));
            const yB2 = yB1 - HH - VH;
            towerBodies.push(makeH(x2, yB2));
            targetBodies.push(makeTarget(x2, yB2 - HH / 2 - TARGET_R, true));

            // Structure 3: Back fortress or high nest
            towerBodies.push(makeV(x3, GROUND_Y - VH / 2));
            towerBodies.push(makeH(x3, GROUND_Y - VH - HH / 2));
            targetBodies.push(makeTarget(x3, GROUND_Y - VH - HH - TARGET_R, true));

            if (targetCount >= 5) {
                // Ground target behind front barricade
                towerBodies.push(makeV(x1 + 60, GROUND_Y - VH / 2));
                targetBodies.push(makeTarget(x1 + 90, GROUND_Y - TARGET_R, false));
            }
        }

        return { towerBodies, targetBodies };
    };

    // ============================================================
    // INIT PHYSICS (ROBUST MATTER.JS SETUP)
    // ============================================================
    const initPhysics = (lvlNum) => {
        cleanupPhysics();

        if (!sceneRef.current) {
            console.warn('⏳ [KissGame] sceneRef.current is not ready, scheduling initPhysics on next frame...');
            requestAnimationFrame(() => initPhysics(lvlNum));
            return;
        }

        const { Engine, Render, Runner, Bodies, Composite, Events } = Matter;

        // Container dimensions with fallback values
        const containerWidth = sceneRef.current.clientWidth || GAME_WIDTH;
        const containerHeight = sceneRef.current.clientHeight || GAME_HEIGHT;
        console.log(`📐 [KissGame] sceneRef dimensions: ${containerWidth}x${containerHeight}`);

        const engine = Engine.create({
            enableSleeping: true,
            gravity: { x: 0, y: 1.0, scale: 0.001 }
        });
        engineRef.current = engine;
        worldRef.current = engine.world;

        // Create Render attached directly to sceneRef.current
        const render = Render.create({
            element: sceneRef.current,
            engine,
            options: {
                width: GAME_WIDTH,
                height: GAME_HEIGHT,
                wireframes: false,
                background: 'transparent',
                pixelRatio: 1
            }
        });
        renderRef.current = render;

        // Style the created canvas to scale responsively
        if (render.canvas) {
            render.canvas.style.maxWidth = '100%';
            render.canvas.style.maxHeight = '100%';
            render.canvas.style.width = '100%';
            render.canvas.style.height = 'auto';
            render.canvas.style.aspectRatio = `${GAME_WIDTH} / ${GAME_HEIGHT}`;
            render.canvas.style.display = 'block';
            render.canvas.style.objectFit = 'contain';
            render.canvas.style.borderRadius = '10px';
            render.canvas.style.pointerEvents = 'none'; // Events captured by sceneRef
        }

        console.log('✅ [KissGame] Matter.js canvas successfully created and attached to sceneRef!');

        // Ground & Boundaries
        const ground = Bodies.rectangle(GAME_WIDTH / 2, GROUND_Y + 12.5, GAME_WIDTH * 2, 25, {
            isStatic: true,
            friction: 1.0,
            frictionStatic: 1.0,
            render: { fillStyle: '#7ca2bd', visible: true }
        });
        const leftWall = Bodies.rectangle(-20, GAME_HEIGHT / 2, 40, GAME_HEIGHT * 2, { isStatic: true });
        const rightWall = Bodies.rectangle(GAME_WIDTH + 20, GAME_HEIGHT / 2, 40, GAME_HEIGHT * 2, { isStatic: true });

        // Cannon Base Body
        const cannonBase = Bodies.rectangle(CANNON_X, CANNON_Y, 60, 40, {
            isStatic: true,
            render: { visible: false }
        });

        // Procedural Level Generation
        const { towerBodies, targetBodies } = generateLevel(lvlNum, Bodies);
        towerBodiesRef.current = towerBodies;
        targetBodiesRef.current = targetBodies;
        setTargetsRemaining(targetBodies.length);
        setHasWon(false);
        setIsOutOfShots(false);

        Composite.add(engine.world, [ground, leftWall, rightWall, cannonBase, ...towerBodies, ...targetBodies]);

        // ------------------------------------------------------------
        // COLLISION HANDLING
        // Goal: Destroy all targets on direct hit OR when knocked off platform
        // ------------------------------------------------------------
        Events.on(engine, 'collisionStart', (e) => {
            e.pairs.forEach(pair => {
                const { bodyA, bodyB } = pair;

                // 1. Direct hit by projectile
                const pA = bodyA.label === 'projectile' || projectilesRef.current.includes(bodyA);
                const pB = bodyB.label === 'projectile' || projectilesRef.current.includes(bodyB);
                if (pA || pB) {
                    const other = pA ? bodyB : bodyA;
                    if (other.label === 'target' || targetBodiesRef.current.includes(other)) {
                        burstTarget(other);
                        return;
                    }
                }

                // 2. Elevated target knocked off platform and hits ground
                const gA = bodyA.isStatic;
                const gB = bodyB.isStatic;
                if (gA || gB) {
                    const other = gA ? bodyB : bodyA;
                    if (other.label === 'target' && other.isElevated) {
                        burstTarget(other);
                        return;
                    }
                }
            });
        });

        // ------------------------------------------------------------
        // CHECK ELEVATED TARGET FALLS OFF PLATFORM
        // ------------------------------------------------------------
        Events.on(engine, 'afterUpdate', () => {
            targetBodiesRef.current.forEach(t => {
                if (t.isDestroyed) return;

                // Elevated target fell below threshold
                if (t.isElevated && t.position.y > t.initialY + 55) {
                    burstTarget(t);
                }
                // Target knocked off screen or deep ground
                else if (t.position.y > GROUND_Y + 15 || t.position.x > GAME_WIDTH + 40) {
                    burstTarget(t);
                }
            });
        });

        // ------------------------------------------------------------
        // RENDER LOOP: Cannon, Synchronized Trajectory Dots, Targets, Projectiles
        // ------------------------------------------------------------
        Events.on(render, 'afterRender', () => {
            const ctx = render.context;
            if (!ctx) return;
            drawCannon(ctx);
            renderTrajectory(ctx);
            drawTargetDecor(ctx);
            drawBurstingTargets(ctx);
            drawProjectiles(ctx);
        });

        const runner = Runner.create();
        Runner.run(runner, engine);
        Render.run(render);
        runnerRef.current = runner;
    };

    // ============================================================
    // TARGET BURST (Confetti of hearts + expanding ring animation)
    // ============================================================
    const burstTarget = (tBody) => {
        if (tBody.isDestroyed) return;
        tBody.isDestroyed = true;

        const { Composite } = Matter;
        if (!worldRef.current) return;

        // 1. Remove target body from world immediately
        try {
            Composite.remove(worldRef.current, tBody);
        } catch (e) { }

        // 2. Canvas-confetti burst of hearts at target's position
        const canvas = renderRef.current?.canvas;
        if (canvas) {
            const rect = canvas.getBoundingClientRect();
            const originX = (rect.left + (tBody.position.x / GAME_WIDTH) * rect.width) / window.innerWidth;
            const originY = (rect.top + (tBody.position.y / GAME_HEIGHT) * rect.height) / window.innerHeight;

            try {
                confetti({
                    particleCount: 50,
                    spread: 80,
                    origin: { x: originX, y: originY },
                    colors: ['#ff4757', '#ff6b81', '#f50057', '#d8b4cc', '#ffd700'],
                    shapes: ['heart'],
                    scalar: 1.5
                });
            } catch (e) { }
        }

        // 3. Canvas expanding ring animation
        burstingTargetsRef.current.push({
            x: tBody.position.x,
            y: tBody.position.y,
            radius: TARGET_R,
            createdAt: Date.now(),
            duration: 400
        });

        targetBodiesRef.current = targetBodiesRef.current.filter(t => t !== tBody);
        const left = targetBodiesRef.current.length;
        setTargetsRemaining(left);
        setScore(s => s + 100);
        showMsg('🎯 В яблочко! Мишень поражена! +100');

        // 4. Win Condition: When all targets are destroyed -> DIRECT TRANSITION
        if (left === 0) {
            setHasWon(true);
            showMsg('🎉 ПОБЕДА! Загрузка следующего уровня... ❤️');

            try {
                confetti({
                    particleCount: 140,
                    spread: 110,
                    origin: { y: 0.6 },
                    colors: ['#ff4757', '#ff6b81', '#a6ceee', '#ffd700'],
                    shapes: ['heart']
                });
            } catch (e) { }

            // Direct Transition to Next Level (No modal/popup needed!)
            if (!isTransitioningRef.current) {
                isTransitioningRef.current = true;
                setTimeout(() => {
                    handleNextLevel();
                    isTransitioningRef.current = false;
                }, 850);
            }
        }
    };

    // ============================================================
    // CANNON RENDERING (Mirror horizontally to point right)
    // ============================================================
    const drawCannon = (ctx) => {
        const angle = aimAngleRef.current;

        ctx.save();
        ctx.translate(CANNON_X, CANNON_Y);
        ctx.rotate(angle);
        ctx.rotate(0.285); // aligns gun.png's internal diagonal axis

        if (gunImg.current) {
            const s = BARREL_LENGTH / 302; // scale factor to 75px barrel
            ctx.save();
            ctx.scale(-1, 1); // MIRROR HORIZONTALLY: points right towards targets!
            ctx.drawImage(gunImg.current, -360 * s, -260 * s, 512 * s, 512 * s);
            ctx.restore();
        } else {
            ctx.fillStyle = '#3a769d';
            ctx.fillRect(0, -12, BARREL_LENGTH, 24);
        }
        ctx.restore();

        // Draw wheel over axle
        ctx.save();
        if (weelImg.current) {
            ctx.drawImage(
                weelImg.current,
                CANNON_X - WHEEL_RADIUS,
                CANNON_Y - WHEEL_RADIUS,
                WHEEL_RADIUS * 2,
                WHEEL_RADIUS * 2
            );
        } else {
            ctx.beginPath();
            ctx.arc(CANNON_X, CANNON_Y, WHEEL_RADIUS, 0, Math.PI * 2);
            ctx.fillStyle = '#b8860b';
            ctx.fill();
        }
        ctx.restore();
    };

    // ============================================================
    // SYNCHRONIZED TRAJECTORY DOTS (Step-by-Step Simulation)
    // Matches Matter.js discrete integration:
    // 1. Origin: EXACT same (spawnX, spawnY) as projectile spawn in fire()
    // 2. Simulation Loop:
    //    tempX += tempVx * timeStep;
    //    tempY += tempVy * timeStep;
    //    tempVy += gravity * timeStep;
    // 3. Visual Polish: Subtle dots (w-1 to w-1.5) in Sunset Pink
    // 4. Power: Capped at shared limits with fire()
    // ============================================================
    const renderTrajectory = (ctx) => {
        if (!isAimingRef.current) return;

        const angleRad = aimAngleRef.current;
        // Limit the Power: strictly clamped to shared limits (10 to 20, baseline 15)
        const launchVelocity = Math.min(MAX_LAUNCH_VELOCITY, Math.max(MIN_LAUNCH_VELOCITY, aimPowerRef.current || BASE_LAUNCH_VELOCITY));

        // 1. Match the Origin Point: exact same coordinates as fire()
        const spawnX = CANNON_X + Math.cos(angleRad) * BARREL_LENGTH;
        const spawnY = CANNON_Y + Math.sin(angleRad) * BARREL_LENGTH;

        let tempX = spawnX;
        let tempY = spawnY;
        let tempVx = Math.cos(angleRad) * launchVelocity;
        let tempVy = Math.sin(angleRad) * launchVelocity;

        // 2. Simulation Loop (The "Step" Method):
        // Match Matter.js gravity per frame: gravity.y * gravity.scale * (1000/60)^2
        const engine = engineRef.current;
        const gy = engine?.world?.gravity?.y ?? 1.0;
        const gScale = engine?.world?.gravity?.scale ?? 0.001;
        const gravity = gy * gScale * Math.pow(1000 / 60, 2); // ~0.2778 px/frame^2

        const timeStep = 2.2; // Calibrated time step to perfectly overlay actual ball path
        const dots = [];

        for (let i = 0; i < 20; i++) {
            // Update position
            tempX += tempVx * timeStep;
            tempY += tempVy * timeStep;
            // Update velocity with gravity
            tempVy += gravity * timeStep;

            if (tempY > GROUND_Y) break;
            if (tempX > GAME_WIDTH + 60) break;

            // Save this point for a dot
            dots.push({ x: tempX, y: tempY });
        }

        // 3. Visual Polish: Smaller, subtle dots (w-1 to w-1.5, radius ~1.8px) in Sunset Pink
        ctx.save();
        dots.forEach((dot, index) => {
            const alpha = Math.max(0.25, 0.85 - (index / dots.length) * 0.55);

            // Sunset Pink dot (#ff6b81)
            ctx.beginPath();
            ctx.arc(dot.x, dot.y, 1.8, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 107, 129, ${alpha})`;
            ctx.fill();

            // Subtle bright center
            ctx.beginPath();
            ctx.arc(dot.x, dot.y, 0.9, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(1, alpha + 0.3)})`;
            ctx.fill();
        });
        ctx.restore();
    };

    // ============================================================
    // TARGET DECORATION (Black circles with selfie face / emoji)
    // ============================================================
    const drawTargetDecor = (ctx) => {
        targetBodiesRef.current.forEach(t => {
            if (t.isDestroyed) return;
            const { x, y } = t.position;
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(t.angle);

            // 1. Black circle base
            ctx.beginPath();
            ctx.arc(0, 0, TARGET_R, 0, Math.PI * 2);
            ctx.fillStyle = '#111111';
            ctx.fill();

            // 2. Selfie texture or emoji in center
            if (selfieImg.current) {
                ctx.save();
                ctx.beginPath();
                ctx.arc(0, 0, TARGET_R - 2, 0, Math.PI * 2);
                ctx.clip();
                ctx.drawImage(selfieImg.current, -TARGET_R + 2, -TARGET_R + 2, (TARGET_R - 2) * 2, (TARGET_R - 2) * 2);
                ctx.restore();
            } else {
                ctx.font = `${TARGET_R}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('😎', 0, 1);
            }

            // 3. Green/gold outer ring
            ctx.beginPath();
            ctx.arc(0, 0, TARGET_R, 0, Math.PI * 2);
            ctx.lineWidth = 2.5;
            ctx.strokeStyle = '#2ecc71';
            ctx.stroke();

            ctx.restore();
        });
    };

    // Expanding shockwave ring on hit
    const drawBurstingTargets = (ctx) => {
        const now = Date.now();
        burstingTargetsRef.current = burstingTargetsRef.current.filter(bt => {
            const elapsed = now - bt.createdAt;
            if (elapsed > bt.duration) return false;

            const progress = elapsed / bt.duration;
            const scale = 1 + progress * 2.5;
            const alpha = 1 - progress;

            ctx.save();
            ctx.beginPath();
            ctx.arc(bt.x, bt.y, bt.radius * scale, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(255, 71, 87, ${alpha})`;
            ctx.lineWidth = 3 * (1 - progress);
            ctx.stroke();

            // Heart icon in center
            ctx.font = `${Math.round(18 * scale)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('💖', bt.x, bt.y);

            ctx.restore();
            return true;
        });
    };

    // Draw active selfie projectiles
    const drawProjectiles = (ctx) => {
        projectilesRef.current.forEach(p => {
            ctx.save();
            ctx.beginPath();
            ctx.arc(p.position.x, p.position.y, 20, 0, Math.PI * 2);
            ctx.lineWidth = 3;
            ctx.strokeStyle = 'rgba(216, 180, 204, 0.9)';
            ctx.stroke();
            ctx.restore();
        });
    };

    // ============================================================
    // DIRECT AIMING: POINTER & TOUCH ("Follow Me" Logic)
    // ============================================================
    const getCanvasPoint = (e) => {
        const canvas = renderRef.current?.canvas;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const scaleX = GAME_WIDTH / rect.width;
        const scaleY = GAME_HEIGHT / rect.height;
        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY
        };
    };

    // The cannon barrel follows user's finger/mouse in front of the cannon perfectly
    const updateAimFromPointer = (pt) => {
        const dx = Math.max(12, pt.x - CANNON_X);
        const dy = pt.y - CANNON_Y;

        // Angle points EXACTLY at cursor/touch point
        let angle = Math.atan2(dy, dx);

        // Clamp angle: upward and rightward (-80° to +10°)
        angle = Math.max(-Math.PI * 0.45, Math.min(angle, Math.PI * 0.08));

        // Power Scaling: Distance smoothly adjusts launchVelocity strictly between MIN and MAX.
        // Baseline power is 15.0. Capped at MAX_LAUNCH_VELOCITY.
        const dist = Math.hypot(dx, dy);
        const powerRatio = Math.min(1, Math.max(0, (dist - 50) / 200));
        const power = MIN_LAUNCH_VELOCITY + powerRatio * (MAX_LAUNCH_VELOCITY - MIN_LAUNCH_VELOCITY);

        setAimAngle(angle);
        setAimPower(power);
    };

    const handlePointerStart = (e) => {
        setIsAiming(true);
        const pt = getCanvasPoint(e);
        updateAimFromPointer(pt);
    };

    const handlePointerMove = (e) => {
        if (!isAimingRef.current) return;
        const pt = getCanvasPoint(e);
        updateAimFromPointer(pt);
    };

    // Fire on tap or release after aiming
    const handlePointerEnd = () => {
        if (!isAimingRef.current) return;
        setIsAiming(false);
        fire();
    };

    // ============================================================
    // FIRE PROJECTILE (Standardized Launch Velocity & Zero Offset)
    // ============================================================
    const fire = () => {
        if (shotsLeftRef.current <= 0 || hasWonRef.current) {
            showMsg('⚠️ Выстрелы закончились! Нажми "Заново" 🔄');
            return;
        }

        const { Bodies, Composite } = Matter;
        if (!worldRef.current) return;

        const angleRad = aimAngleRef.current;
        // Standardized launch velocity: strictly between MIN and MAX (shared with simulation)
        const launchVelocity = Math.min(MAX_LAUNCH_VELOCITY, Math.max(MIN_LAUNCH_VELOCITY, aimPowerRef.current || BASE_LAUNCH_VELOCITY));
        const radius = 20;

        // Exact spawn location at the tip of the barrel (matches start of trajectory dots)
        const tipX = CANNON_X + Math.cos(angleRad) * BARREL_LENGTH;
        const tipY = CANNON_Y + Math.sin(angleRad) * BARREL_LENGTH;

        const vx = Math.cos(angleRad) * launchVelocity;
        const vy = Math.sin(angleRad) * launchVelocity;

        // Deduct 1 shot
        setShotsLeft(s => s - 1);

        // FrictionAir: 0 ensures exact parabolic flight matching predicted trajectory
        const projectile = Bodies.circle(tipX, tipY, radius, {
            label: 'projectile',
            frictionAir: 0,
            restitution: 0.25,
            friction: 0.6,
            density: 0.05,
            render: {
                visible: true,
                sprite: {
                    texture: selfieTexture,
                    xScale: (radius * 2) / 200,
                    yScale: (radius * 2) / 200
                }
            }
        });

        // Set standardized velocity vector
        Matter.Body.setVelocity(projectile, { x: vx, y: vy });
        Composite.add(worldRef.current, projectile);
        projectilesRef.current.push(projectile);

        // Cleanup projectile after 5 seconds to free memory
        setTimeout(() => {
            if (worldRef.current) {
                try {
                    Composite.remove(worldRef.current, projectile);
                    projectilesRef.current = projectilesRef.current.filter(p => p !== projectile);
                } catch (e) { }
            }
        }, 5000);
    };

    const handleResetLevel = () => {
        projectilesRef.current = [];
        burstingTargetsRef.current = [];
        setShotsLeft(10);
        setHasWon(false);
        setIsOutOfShots(false);
        setAimPower(15.0);
        requestAnimationFrame(() => initPhysics(level));
        showMsg('🔄 Уровень сброшен! 10 новых выстрелов');
    };

    const handleNextLevel = () => {
        const nextLvl = level + 1;
        setLevel(nextLvl);
        projectilesRef.current = [];
        burstingTargetsRef.current = [];
        setShotsLeft(10);
        setHasWon(false);
        setIsOutOfShots(false);
        setAimPower(15.0);
        requestAnimationFrame(() => initPhysics(nextLvl));
        showMsg(`🏆 Уровень ${nextLvl}! Новые препятствия 🎯`);
    };

    const cleanupPhysics = () => {
        if (renderRef.current) {
            Matter.Render.stop(renderRef.current);
            if (renderRef.current.canvas && renderRef.current.canvas.parentNode) {
                renderRef.current.canvas.parentNode.removeChild(renderRef.current.canvas);
            }
            renderRef.current.canvas = null;
            renderRef.current.context = null;
            renderRef.current.textures = {};
            renderRef.current = null;
        }
        if (runnerRef.current) {
            Matter.Runner.stop(runnerRef.current);
            runnerRef.current = null;
        }
        if (engineRef.current) {
            Matter.World.clear(engineRef.current.world, false);
            Matter.Engine.clear(engineRef.current);
            engineRef.current = null;
        }
        if (sceneRef.current) {
            const canvases = sceneRef.current.querySelectorAll('canvas');
            canvases.forEach(c => c.remove());
        }
    };

    // ============================================================
    // NO-SCROLL LAYOUT (Header -> flex-1 Canvas -> Pinned Bottom Controls)
    // ============================================================
    return (
        <div className="kiss-game" style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            minHeight: 0,
            overflow: 'hidden',
            maxWidth: `${GAME_WIDTH}px`,
            margin: '0 auto',
            width: '100%'
        }}>
            {message && <div className="toast">{message}</div>}

            {/* Header: Title + Score + Level Number + Shots left (Compact slim bar) */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '4px 10px',
                background: 'rgba(255,255,255,0.94)',
                borderRadius: '14px 14px 0 0',
                flexShrink: 0,
                gap: '6px',
                flexWrap: 'wrap'
            }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span style={{
                        padding: '2px 8px',
                        borderRadius: '50px',
                        background: 'var(--sky-blue)',
                        color: '#fff',
                        fontWeight: '800',
                        fontSize: '0.78rem'
                    }}>
                        🏆 Уровень {level}
                    </span>
                    <span style={{ fontSize: '0.85rem', fontWeight: '800', color: 'var(--deep-lake)' }}>
                        💋 {score}
                    </span>
                </div>

                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <span style={{
                        padding: '2px 7px',
                        borderRadius: '8px',
                        background: 'rgba(231, 76, 60, 0.1)',
                        color: '#e74c3c',
                        fontSize: '0.75rem',
                        fontWeight: '700'
                    }}>
                        🎯 {targetsRemaining}
                    </span>
                    <span style={{
                        padding: '2px 7px',
                        borderRadius: '8px',
                        background: shotsLeft <= 3 ? 'rgba(231, 76, 60, 0.18)' : 'rgba(58, 118, 157, 0.1)',
                        color: shotsLeft <= 3 ? '#e74c3c' : 'var(--deep-lake)',
                        fontSize: '0.75rem',
                        fontWeight: '800'
                    }}>
                        🏹 {shotsLeft}/10
                    </span>
                </div>
            </div>

            {/* Game Canvas Area: sceneRef with mandatory min-height & sky gradient */}
            <div
                ref={sceneRef}
                className="kiss-scene-container"
                style={{
                    flex: 1,
                    minHeight: '210px',
                    height: typeof window !== 'undefined' && window.innerWidth < 600 ? '44vh' : '400px',
                    maxHeight: typeof window !== 'undefined' && window.innerWidth < 600 ? '48vh' : '55vh',
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    background: 'linear-gradient(180deg, #d8eefc 0%, #eef7fc 65%, #cde5bf 100%)',
                    borderRadius: '12px',
                    margin: '2px 0',
                    width: '100%',
                    touchAction: 'none',
                    boxShadow: 'inset 0 0 20px rgba(58, 118, 157, 0.12)'
                }}
                onMouseDown={handlePointerStart}
                onMouseMove={handlePointerMove}
                onMouseUp={handlePointerEnd}
                onTouchStart={handlePointerStart}
                onTouchMove={handlePointerMove}
                onTouchEnd={handlePointerEnd}
            >
                {/* Out of Shots Banner (Zero-scroll Mobile Friendly) */}
                <AnimatePresence>
                    {!hasWon && isOutOfShots && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.85 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.85 }}
                            style={{
                                position: 'absolute',
                                top: '50%', left: '50%',
                                transform: 'translate(-50%, -50%)',
                                background: 'rgba(255, 255, 255, 0.97)',
                                backdropFilter: 'blur(12px)',
                                padding: 'clamp(10px, 2vh, 16px) clamp(14px, 3vw, 24px)',
                                borderRadius: '18px',
                                boxShadow: '0 16px 48px rgba(231, 76, 60, 0.25)',
                                textAlign: 'center',
                                zIndex: 20,
                                border: '2px solid #f9e8e9',
                                maxWidth: '92%',
                                pointerEvents: 'auto'
                            }}
                        >
                            <div style={{ fontSize: 'clamp(1.6rem, 3.5vh, 2.2rem)', marginBottom: '4px' }}>💔🥺</div>
                            <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(1rem, 2.2vh, 1.2rem)', color: '#e74c3c', marginBottom: '2px' }}>
                                Снаряды закончились!
                            </h3>
                            <p style={{ fontSize: 'clamp(0.75rem, 1.8vh, 0.82rem)', opacity: 0.8, marginBottom: '10px' }}>
                                Осталось мишеней: {targetsRemaining}. Попробуем снова!
                            </p>
                            <button
                                className="btn-primary"
                                onClick={handleResetLevel}
                                style={{ padding: '6px 16px', fontSize: '0.85rem', background: '#3a769d' }}
                            >
                                🔄 Попробовать снова
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Control Panel: Positioned at bottom, compact bar (< 15% height) */}
            <div className="kiss-controls" style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '6px 10px',
                background: 'rgba(255,255,255,0.94)',
                borderRadius: '0 0 14px 14px',
                flexShrink: 0,
                gap: '6px',
                flexWrap: 'wrap'
            }}>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                    {/* Compact FIRE Button */}
                    <button
                        className="btn-primary"
                        onClick={fire}
                        disabled={shotsLeft <= 0 || hasWon}
                        style={{
                            padding: '7px 16px',
                            fontSize: '0.88rem',
                            fontWeight: '800',
                            background: shotsLeft > 0 ? 'linear-gradient(135deg, #e74c3c, #ff6b81)' : '#bbb',
                            boxShadow: shotsLeft > 0 ? '0 3px 12px rgba(231, 76, 60, 0.35)' : 'none',
                            border: 'none',
                            color: '#fff',
                            cursor: shotsLeft > 0 ? 'pointer' : 'not-allowed',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                        }}
                    >
                        🔥 ОГОНЬ!
                    </button>

                    {/* Reset Button */}
                    <button
                        className="btn-secondary"
                        onClick={handleResetLevel}
                        style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                    >
                        🔄 Заново
                    </button>

                    {/* Next Level Button */}
                    <button
                        className={hasWon ? "btn-primary" : "btn-secondary"}
                        onClick={handleNextLevel}
                        style={{
                            padding: '6px 12px',
                            fontSize: '0.8rem',
                            background: hasWon ? 'linear-gradient(135deg, #2ecc71, #27ae60)' : undefined,
                            color: hasWon ? '#fff' : undefined,
                            borderColor: hasWon ? '#27ae60' : undefined
                        }}
                    >
                        ⏭️ Уровень
                    </button>
                </div>

                {/* New Selfie Button */}
                <button
                    className="btn-secondary"
                    onClick={onRetakeSelfie}
                    style={{ padding: '6px 10px', fontSize: '0.78rem' }}
                >
                    📸 Селфи
                </button>
            </div>
        </div>
    );
}
