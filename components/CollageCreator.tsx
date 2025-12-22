import React, { useState, useRef, useEffect } from 'react';
import { Upload, X, Grid, Loader2, Image as ImageIcon, Cloud, Move, Sliders, ArrowLeftRight, Check, GripVertical } from 'lucide-react';
import { CollageTransform } from '../types';

interface CollageCreatorProps {
    onCreateCollage: (collages: { files: (File | null)[], transforms: CollageTransform[], padding: number }[]) => void;
    onCancel: () => void;
    isProcessing: boolean;
    onPickFromDrive: (callback: (files: File[]) => void) => void;
    isDriveLoading: boolean;
}

const DEFAULT_TRANSFORM: CollageTransform = { scale: 1, x: 0, y: 0 };

export function CollageCreator({ onCreateCollage, onCancel, isProcessing, onPickFromDrive, isDriveLoading }: CollageCreatorProps) {
    const [page, setPage] = useState(0);
    // Each group has up to 4 files. We store an array of arrays.
    const [groups, setGroups] = useState<(File | null)[][]>([[null, null, null, null]]);

    // Transforms need to be tracked PER GROUP. 
    // Array of arrays of transforms.
    const [transformsMap, setTransformsMap] = useState<CollageTransform[][]>([Array(4).fill(DEFAULT_TRANSFORM)]);

    // Reordering State
    const [isReordering, setIsReordering] = useState(false);
    const [reorderList, setReorderList] = useState<File[]>([]);
    const [draggingId, setDraggingId] = useState<number | null>(null);

    const [padding, setPadding] = useState(0); // 0 to 50 range

    // Current derived state
    const slots = groups[page] || [null, null, null, null];
    const transforms = transformsMap[page] || Array(4).fill(DEFAULT_TRANSFORM);

    const setSlots = (newSlots: (File | null)[]) => {
        setGroups(prev => {
            const next = [...prev];
            next[page] = newSlots;
            return next;
        });
    };

    const setTransforms = (updater: (prev: CollageTransform[]) => CollageTransform[]) => {
        setTransformsMap(prev => {
            const next = [...prev];
            const current = next[page] || Array(4).fill(DEFAULT_TRANSFORM);
            next[page] = updater(current);
            return next;
        });
    };

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
        setTransforms(() => newTransforms);
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

    // --- Reorder Logic ---
    const handleStartReorder = () => {
        // Flatten all groups into a single list of files (filtering out nulls? No, keep nulls as placeholders? 
        // Better to filter out nulls for easier sorting, then fill pages.
        // Or keep nulls to preserve empty slots? 
        // User asked to "specify 4 images as a group".
        // Best UX: Flatten and Filter out nulls. Then filling pages fills them sequentially.
        const flat = groups.flat().filter((f): f is File => f !== null);
        setReorderList(flat);
        setIsReordering(true);
    };

    const handleSaveReorder = () => {
        // Re-chunk the list into groups of 4
        const newGroups: (File | null)[][] = [];
        const newTransformsMap: CollageTransform[][] = [];

        const files = reorderList;
        let idx = 0;

        while (idx < files.length) {
            const chunk = files.slice(idx, idx + 4);
            // Pad chunk with nulls if needed
            const pageSlots = Array(4).fill(null);
            chunk.forEach((f, i) => pageSlots[i] = f);
            newGroups.push(pageSlots);

            // Reset transforms for re-ordered items (safer than trying to map old transforms)
            newTransformsMap.push(Array(4).fill(DEFAULT_TRANSFORM).map(() => ({ ...DEFAULT_TRANSFORM })));

            idx += 4;
        }

        if (newGroups.length === 0) {
            newGroups.push([null, null, null, null]);
            newTransformsMap.push(Array(4).fill(DEFAULT_TRANSFORM));
        }

        setGroups(newGroups);
        setTransformsMap(newTransformsMap);
        setPage(0); // Go back to start
        setIsReordering(false);
    };

    const onDragStart = (e: React.DragEvent, index: number) => {
        setDraggingId(index);
        e.dataTransfer.effectAllowed = "move";
        // Ghost image logic handled by browser usually
    };

    const onDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        if (draggingId === null || draggingId === index) return;

        // Swap locally for visual feedback
        const newList = [...reorderList];
        const item = newList[draggingId];
        newList.splice(draggingId, 1);
        newList.splice(index, 0, item);

        setReorderList(newList);
        setDraggingId(index);
    };

    const onDragEnd = () => {
        setDraggingId(null);
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

            {/* Reorder Overlay */}
            {isReordering && (
                <div className="absolute inset-0 z-50 bg-white/95 backdrop-blur-sm flex flex-col animate-in fade-in duration-200">
                    <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-white shadow-sm">
                        <div>
                            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                                <ArrowLeftRight className="text-blue-600" />
                                Reorder Images
                            </h3>
                            <p className="text-xs text-gray-500">Drag images to change their order & pagination</p>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setIsReordering(false)}
                                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveReorder}
                                className="px-4 py-2 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded-lg flex items-center gap-2"
                            >
                                <Check size={16} /> Done
                            </button>
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-8">
                        <div className="flex flex-wrap gap-4 justify-center max-w-4xl mx-auto pb-20">
                            {reorderList.map((file, i) => (
                                <div
                                    key={i}
                                    draggable
                                    onDragStart={(e) => onDragStart(e, i)}
                                    onDragOver={(e) => onDragOver(e, i)}
                                    onDragEnd={onDragEnd}
                                    className={`relative w-24 h-24 rounded-lg overflow-hidden border-2 cursor-move transition-all
                                        ${draggingId === i ? 'opacity-50 border-blue-400 scale-95' : 'border-gray-200 hover:border-blue-400 hover:shadow-md'}
                                    `}
                                >
                                    <div className="absolute top-1 left-1 bg-black/60 text-white text-[10px] w-5 h-5 flex items-center justify-center rounded-full pointer-events-none z-10">
                                        {i + 1}
                                    </div>
                                    <img src={URL.createObjectURL(file)} className="w-full h-full object-cover pointer-events-none" />

                                    {/* Page Break indicator */}
                                    {(i + 1) % 4 === 0 && i !== reorderList.length - 1 && (
                                        <div className="absolute -right-5 top-1/2 -translate-y-1/2 w-6 h-8 border-r-2 border-dashed border-gray-300 z-0"></div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

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
                                                            // Split files into chunks of 4
                                                            const newGroups = [...groups];
                                                            const newTransformsMap = [...transformsMap];

                                                            let currentFileIdx = 0;

                                                            // Fill current page first
                                                            let currentPageInfo = [...(newGroups[page] || [null, null, null, null])];
                                                            let currentTransformInfo = [...(newTransformsMap[page] || Array(4).fill({ ...DEFAULT_TRANSFORM }))];

                                                            for (let i = index; i < 4 && currentFileIdx < files.length; i++) {
                                                                if (!currentPageInfo[i]) {
                                                                    currentPageInfo[i] = files[currentFileIdx];
                                                                    currentTransformInfo[i] = { ...DEFAULT_TRANSFORM };
                                                                    currentFileIdx++;
                                                                }
                                                            }

                                                            newGroups[page] = currentPageInfo;
                                                            newTransformsMap[page] = currentTransformInfo;

                                                            // If we have more files, create new pages
                                                            while (currentFileIdx < files.length) {
                                                                const chunk = files.slice(currentFileIdx, currentFileIdx + 4);
                                                                const pageSlots = Array(4).fill(null);
                                                                chunk.forEach((f, i) => pageSlots[i] = f);

                                                                const pageTransforms = Array(4).fill(DEFAULT_TRANSFORM).map(() => ({ ...DEFAULT_TRANSFORM }));

                                                                newGroups.push(pageSlots);
                                                                newTransformsMap.push(pageTransforms);
                                                                currentFileIdx += 4;
                                                            }

                                                            setGroups(newGroups);
                                                            setTransformsMap(newTransformsMap);
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
                                {groups.length > 1 && (
                                    <div className="flex items-center gap-1 mr-2">
                                        <button
                                            onClick={() => setPage(p => Math.max(0, p - 1))}
                                            disabled={page === 0}
                                            className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"
                                        >
                                            Previous
                                        </button>
                                        <span className="text-sm font-medium text-gray-600">
                                            Page {page + 1} / {groups.length}
                                        </span>
                                        <button
                                            onClick={() => setPage(p => Math.min(groups.length - 1, p + 1))}
                                            disabled={page === groups.length - 1}
                                            className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"
                                        >
                                            Next
                                        </button>
                                    </div>
                                )}

                                {groups.length > 0 && groups.some(g => g.some(Boolean)) && (
                                    <button
                                        onClick={handleStartReorder}
                                        className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg mr-2 transition-colors"
                                        title="Reorder all images"
                                    >
                                        <ArrowLeftRight size={20} />
                                    </button>
                                )}

                                <button
                                    onClick={onCancel}
                                    className="px-5 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => {
                                        // Normalize transforms for ALL groups
                                        const batchConfigs = groups.map((groupSlots, groupIdx) => {
                                            const groupTransforms = transformsMap[groupIdx];

                                            const normalizedTransforms = groupTransforms.map((t, i) => {
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
                                                normalizedPadding = padding / width;
                                            }

                                            return {
                                                files: groupSlots,
                                                transforms: normalizedTransforms,
                                                padding: normalizedPadding
                                            };
                                        });

                                        const validBatch = batchConfigs.filter(b => b.files.some(f => f !== null));

                                        if (validBatch.length > 0) {
                                            onCreateCollage(validBatch);
                                        }
                                    }}
                                    disabled={!canCreate || isProcessing}
                                    className={`px-6 py-2 text-sm font-bold text-white rounded-lg shadow-md flex items-center gap-2 transition-all transform active:scale-95
                                        ${!canCreate || isProcessing
                                            ? 'bg-gray-300 shadow-none cursor-not-allowed'
                                            : 'bg-indigo-600 hover:bg-indigo-700'}`}
                                >
                                    {isProcessing ? <Loader2 className="animate-spin" size={16} /> : <ImageIcon size={16} />}
                                    {isProcessing ? `Create ${groups.length > 1 ? 'All' : 'Collage'}` : `Create ${groups.length > 1 ? 'All (' + groups.length + ')' : 'Collage'}`}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
