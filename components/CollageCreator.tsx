import React, { useState, useRef, useEffect } from 'react';
import { Upload, X, Grid, Loader2, Image as ImageIcon, Cloud, Move, Sliders } from 'lucide-react';
import { CollageTransform } from '../types';

interface CollageCreatorProps {
    onCreateCollage: (images: (File | null)[], transforms: CollageTransform[], padding: number) => void;
    onCancel: () => void;
    isProcessing: boolean;
    onPickFromDrive: (callback: (files: File[]) => void) => void;
    isDriveLoading: boolean;
}

const DEFAULT_TRANSFORM: CollageTransform = { scale: 1, x: 0, y: 0 };

export function CollageCreator({ onCreateCollage, onCancel, isProcessing, onPickFromDrive, isDriveLoading }: CollageCreatorProps) {
    const [slots, setSlots] = useState<(File | null)[]>([null, null, null, null]);
    const [transforms, setTransforms] = useState<CollageTransform[]>(Array(4).fill(DEFAULT_TRANSFORM));
    const [padding, setPadding] = useState(0); // 0 to 50 range

    // Interaction State
    const [dragging, setDragging] = useState<{ idx: number, startX: number, startY: number, initX: number, initY: number } | null>(null);
    const containerRefs = useRef<(HTMLDivElement | null)[]>([]);
    const fileInputRefs = useRef<(HTMLInputElement | null)[]>([]);

    const handleFileChange = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            updateSlot(index, e.target.files[0]);
        }
    };

    const updateSlot = (index: number, file: File | null) => {
        const newSlots = [...slots];
        newSlots[index] = file;
        setSlots(newSlots);

        // Reset transform for this slot
        const newTransforms = [...transforms];
        newTransforms[index] = { ...DEFAULT_TRANSFORM };
        setTransforms(newTransforms);
    };

    const handleDrop = (index: number, e: React.DragEvent) => {
        e.preventDefault();
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            const file = e.dataTransfer.files[0];
            if (file.type.startsWith('image/')) {
                updateSlot(index, file);
            }
        }
    };

    // --- Interaction Handlers ---

    const handleWheel = (index: number, e: React.WheelEvent) => {
        if (!slots[index]) return;
        e.preventDefault();
        const delta = -e.deltaY * 0.001;

        setTransforms(prev => {
            const next = [...prev];
            // Clamp scale:
            // Min 0.1 (allows zooming out to fit large images)
            // Max 5 (allows zooming in for details)
            const newScale = Math.min(Math.max(next[index].scale + delta, 0.1), 5);
            next[index] = { ...next[index], scale: newScale };
            return next;
        });
    };

    const handleMouseDown = (index: number, e: React.MouseEvent) => {
        if (!slots[index]) return;
        e.preventDefault();
        setDragging({
            idx: index,
            startX: e.clientX,
            startY: e.clientY,
            initX: transforms[index].x,
            initY: transforms[index].y
        });
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!dragging) return;
            const { idx, startX, startY, initX, initY } = dragging;

            const dx = e.clientX - startX;
            const dy = e.clientY - startY;

            setTransforms(prev => {
                const next = [...prev];
                next[idx] = {
                    ...next[idx],
                    x: initX + dx,
                    y: initY + dy
                };
                return next;
            });
        };

        const handleMouseUp = () => {
            setDragging(null);
        };

        if (dragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [dragging]);


    const filledCount = slots.filter(Boolean).length;
    const canCreate = filledCount >= 1;

    return (
        <div className="flex-1 flex flex-col h-full bg-gray-50 overflow-hidden relative">
            <div className="absolute inset-0 flex items-center justify-center p-8">
                <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col h-[85vh]">

                    {/* Header */}
                    <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-white sticky top-0 z-10">
                        <div>
                            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                                <Grid className="text-purple-600" />
                                Collage Mode
                            </h2>
                            <p className="text-sm text-gray-500">
                                Drag to pan • Scroll to zoom • {filledCount}/4 filled
                            </p>
                        </div>
                        <button onClick={onCancel} className="p-2 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600 transition-colors">
                            <X size={20} />
                        </button>
                    </div>

                    {/* Grid Area */}
                    <div className="flex-1 p-6 overflow-hidden flex flex-col bg-gray-50">
                        {/* The Grid itself has a gap, but we want dynamic padding INSIDE dimensions or OUTSIDE? 
                            If strict grid 2048x2048, "padding" usually means gap between images.
                            For preview accuracy, we can apply padding to the container div.
                        */}
                        <div className="grid grid-cols-2 h-full min-h-0 bg-white shadow-sm border border-gray-200"
                            style={{ gap: `${padding}px`, padding: `${padding}px`, transition: 'all 0.2s' }}>
                            {slots.map((file, index) => (
                                <div
                                    key={index}
                                    ref={el => containerRefs.current[index] = el}
                                    onDragOver={(e) => e.preventDefault()}
                                    onDrop={(e) => handleDrop(index, e)}
                                    className={`relative group overflow-hidden flex items-center justify-center bg-gray-100 transition-colors
                                        ${file ? '' : 'hover:bg-purple-50'}`}
                                >
                                    {file ? (
                                        <div
                                            className="absolute inset-0 cursor-move touch-none"
                                            onWheel={(e) => handleWheel(index, e)}
                                            onMouseDown={(e) => handleMouseDown(index, e)}
                                        >
                                            <div
                                                className="w-full h-full relative"
                                                style={{
                                                    transform: `translate(${transforms[index].x}px, ${transforms[index].y}px) scale(${transforms[index].scale})`,
                                                    transformOrigin: 'center center',
                                                    transition: dragging?.idx === index ? 'none' : 'transform 0.1s ease-out'
                                                }}
                                            >
                                                <img
                                                    src={URL.createObjectURL(file)}
                                                    alt={`Slot ${index + 1}`}
                                                    className="w-full h-full object-contain pointer-events-none select-none"
                                                />
                                            </div>

                                            {/* Overlay controls (delete) */}
                                            <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); updateSlot(index, null); }}
                                                    className="p-1.5 bg-black/50 hover:bg-black/70 text-white rounded-full backdrop-blur-sm transition-all"
                                                >
                                                    <X size={16} />
                                                </button>
                                            </div>

                                            {/* Visual Guide for Interaction */}
                                            <div className="absolute bottom-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                                <div className="bg-black/50 text-white text-[10px] px-2 py-1 rounded-full backdrop-blur-sm flex items-center gap-1">
                                                    <Move size={10} /> Pan & Zoom
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="text-center cursor-pointer p-4 w-full h-full flex flex-col items-center justify-center relative border-2 border-dashed border-gray-200 hover:border-purple-300">
                                            <div
                                                onClick={() => fileInputRefs.current[index]?.click()}
                                                className="w-full h-full flex flex-col items-center justify-center"
                                            >
                                                <div className="w-10 h-10 rounded-full bg-white mb-2 flex items-center justify-center shadow-sm">
                                                    <Upload size={18} className="text-gray-400 group-hover:text-purple-600" />
                                                </div>
                                                <p className="text-xs font-medium text-gray-500 group-hover:text-purple-700">Add Image</p>
                                            </div>

                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onPickFromDrive((files) => {
                                                        if (files && files.length > 0) {
                                                            let fileIdx = 0;
                                                            const newSlots = [...slots];
                                                            const newTransforms = [...transforms];
                                                            for (let i = index; i < 4 && fileIdx < files.length; i++) {
                                                                if (!newSlots[i]) {
                                                                    newSlots[i] = files[fileIdx];
                                                                    newTransforms[i] = { ...DEFAULT_TRANSFORM };
                                                                    fileIdx++;
                                                                }
                                                            }
                                                            setSlots(newSlots);
                                                            setTransforms(newTransforms);
                                                        }
                                                    });
                                                }}
                                                disabled={isDriveLoading}
                                                className="absolute bottom-2 right-2 p-1.5 bg-white hover:bg-gray-50 text-gray-400 hover:text-blue-600 rounded-md shadow-sm border border-gray-200 transition-colors z-20"
                                            >
                                                {isDriveLoading ? <Loader2 className="animate-spin" size={14} /> : <Cloud size={14} />}
                                            </button>
                                        </div>
                                    )}
                                    <input
                                        type="file"
                                        ref={el => fileInputRefs.current[index] = el}
                                        className="hidden"
                                        accept="image/*"
                                        onChange={(e) => handleFileChange(index, e)}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Footer / Controls */}
                    <div className="p-4 bg-white border-t border-gray-100 flex flex-col gap-4">

                        {/* Spacing Control */}
                        <div className="flex items-center gap-4 px-2">
                            <div className="flex items-center gap-2 text-gray-600 w-24 shrink-0">
                                <Sliders size={16} />
                                <span className="text-sm font-medium">Spacing</span>
                            </div>
                            <input
                                type="range"
                                min="0"
                                max="50"
                                value={padding}
                                onChange={(e) => setPadding(Number(e.target.value))}
                                className="flex-1 h-2 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-purple-600"
                            />
                            <span className="text-xs text-gray-400 w-8 text-right">{padding}</span>
                        </div>

                        <div className="flex justify-between items-center pt-2 border-t border-gray-50">
                            <span className="text-xs text-gray-400">
                                {filledCount}/4 slots filled
                            </span>

                            <div className="flex gap-3">
                                <button
                                    onClick={onCancel}
                                    className="px-5 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => {
                                        // Normalize transforms
                                        const normalizedTransforms = transforms.map((t, i) => {
                                            const el = containerRefs.current[i];
                                            if (el) {
                                                const { width, height } = el.getBoundingClientRect();
                                                return {
                                                    scale: t.scale,
                                                    x: t.x / width,
                                                    y: t.y / height
                                                };
                                            }
                                            return t;
                                        });

                                        const slot0 = containerRefs.current[0];
                                        let normalizedPadding = 0;
                                        if (slot0) {
                                            const { width } = slot0.getBoundingClientRect();
                                            // Padding is applied to gap+padding.
                                            // Ratio = padding / width.
                                            normalizedPadding = padding / width;
                                        }

                                        onCreateCollage(slots, normalizedTransforms, normalizedPadding);
                                    }}
                                    disabled={!canCreate || isProcessing}
                                    className={`px-6 py-2 text-sm font-bold text-white rounded-lg shadow-md flex items-center gap-2 transition-all transform active:scale-95
                                        ${!canCreate || isProcessing
                                            ? 'bg-gray-300 shadow-none cursor-not-allowed'
                                            : 'bg-indigo-600 hover:bg-indigo-700'}`}
                                >
                                    {isProcessing ? <Loader2 className="animate-spin" size={16} /> : <ImageIcon size={16} />}
                                    {isProcessing ? 'Creating...' : 'Create Collage'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
