import React, { useMemo } from 'react';
import { PHOTO_COUNTS, getTogetherPhoto } from '../data/assets';

// ============================================================
// JOINT RIBBON — Infinite Horizontally Scrolling Photo Ribbon
// Movement: Flows smoothly from left to right continuously
// Hover: Does NOT stop on hover
// Assets: Real photos from /game/together/
// Placement: Very top of main page, above "Любимой"
// ============================================================

const CAPTIONS = [
    'Начало нашей сказки ✨',
    'Твоя улыбка — моё счастье 💕',
    'Вместе теплее ☕',
    'Самые нежные моменты 🌸',
    'Ты — мой целый мир 🌍',
    'Люблю тебя каждую секунду ❤️',
    'Наши прогулки под луной 🌙',
    'С тобой время замирает ⏳',
    'Самый лучший день — с тобой 💖',
    'Моё самое любимое счастье 🌿',
    'Всегда рядом в сердце 💌',
    'Навсегда вместе 🕊️',
    'Счастье быть рядом 💫',
    'Моя звёздочка 🌟',
    'Твои объятия — мой дом 🏡'
];

export default function JointRibbon() {
    const ribbonItems = useMemo(() => {
        const totalPhotos = PHOTO_COUNTS.together || 10;
        const count = Math.max(12, totalPhotos);
        const items = [];
        const rotations = [-2.5, 2, -1.5, 3, -2, 1.8, -3, 2.5, -1.8, 2.2, -2, 2.5];

        for (let i = 0; i < count; i++) {
            const photoNum = (i % totalPhotos) + 1;
            items.push({
                id: i + 1,
                photoSrc: getTogetherPhoto(photoNum),
                caption: CAPTIONS[i % CAPTIONS.length],
                rotation: rotations[i % rotations.length]
            });
        }
        return items;
    }, []);

    // Duplicate list to ensure seamless infinite looping
    const infiniteList = useMemo(() => [...ribbonItems, ...ribbonItems], [ribbonItems]);

    return (
        <div className="joint-ribbon-container">
            <div className="joint-ribbon-track">
                {infiniteList.map((item, index) => (
                    <div
                        key={`${item.id}-${index}`}
                        className="ribbon-card"
                        style={{ transform: `rotate(${item.rotation}deg)` }}
                    >
                        <div className="ribbon-card-inner">
                            <div className="ribbon-photo-frame">
                                <img
                                    src={item.photoSrc}
                                    alt={item.caption}
                                    loading="lazy"
                                    onError={(e) => {
                                        // Fallback to cute memory placeholder if photo is missing
                                        e.target.style.display = 'none';
                                        if (e.target.nextElementSibling) {
                                            e.target.nextElementSibling.style.display = 'flex';
                                        }
                                    }}
                                />
                                <div className="ribbon-placeholder" style={{ display: 'none' }}>
                                    <span className="ribbon-placeholder-emoji">📸</span>
                                    <span className="ribbon-placeholder-text">Наш момент 💕</span>
                                </div>
                            </div>
                            <div className="ribbon-caption">
                                {item.caption}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
