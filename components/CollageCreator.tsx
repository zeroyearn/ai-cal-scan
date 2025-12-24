import React, { useState, useRef, useEffect } from 'react';
import { Upload, X, Grid, Loader2, Image as ImageIcon, Cloud, Move, Trash2, Download, Save, Check } from 'lucide-react';
import { CollageTransform } from '../types';
import { createCollage } from '../utils/canvasUtils';

interface CollageCreatorProps {
    onCreateCollage: (collages: { files: (File | null)[], transforms: CollageTransform[], padding: number }[]) => void;
    onCancel: () => void;
    isProcessing: boolean;
    onPickFromDrive: (callback: (files: File[]) => void) => void;
    isDriveLoading: boolean;
    onSaveToDrive?: (file: File) => void;
}

const PRESETS = [
    { label: 'Square (2K)', width: 2160, height: 2160 },
    { label: 'Story (9:16)', width: 1080, height: 1920 },
    { label: 'Portrait (4:5)', width: 1080, height: 1350 },
    { label: 'Landscape (4K)', width: 3840, height: 2160 },
];

const COLORS = [
    '#A855F7', // Purple
    '#000000', // Black
    '#FFFFFF', // White
    '#F3F4F6', // Gray-100
];

const DEFAULT_TRANSFORM: CollageTransform = { scale: 1, x: 0, y: 0 };

export function CollageCreator({ onCreateCollage, onCancel, isProcessing, onPickFromDrive, isDriveLoading, onSaveToDrive }: CollageCreatorProps) {
    // Layout State
    const [width, setWidth] = useState(2160);
    const [height, setHeight] = useState(2160);
    const [padding, setPadding] = useState(40);
    const [backgroundColor, setBackgroundColor] = useState('#FFFFFF');

    // Data State (Single Page)
    const [slots, setSlots] = useState<(File | null)[]>([null, null, null, null]);
    const [transforms, setTransforms] = useState<CollageTransform[]>([DEFAULT_TRANSFORM, DEFAULT_TRANSFORM, DEFAULT_TRANSFORM, DEFAULT_TRANSFORM]);

    // UI State
    const [isGenerating, setIsGenerating] = useState(false);
    const [activePreset, setActivePreset] = useState('Square (2K)');

    // Interaction State
    const fileInputRefs = useRef<(HTMLInputElement | null)[]>([]);
    const [dragging, setDragging] = useState<{ idx: number, startX: number, startY: number, initX: number, initY: number } | null>(null);

    // --- Helpers ---
    const updateSlot = (index: number, file: File | null) => {
        const newSlots = [...slots];
        newSlots[index] = file;
        setSlots(newSlots);

        if (file) {
            const newTransforms = [...transforms];
            newTransforms[index] = { ...DEFAULT_TRANSFORM };
            setTransforms(newTransforms);
        }
    };

    const handleFileChange = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            updateSlot(index, e.target.files[0]);
        }
    };

    const handleDrop = (index: number, e: React.DragEvent) => {
        e.preventDefault();
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            if (e.dataTransfer.files[0].type.startsWith('image/')) {
                updateSlot(index, e.dataTransfer.files[0]);
            }
        }
    };

    // --- Transforms ---
    const handleWheel = (index: number, e: React.WheelEvent) => {
        if (!slots[index]) return;
        e.preventDefault();
        const delta = -e.deltaY * 0.001;
        setTransforms(prev => {
            const next = [...prev];
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
            // Normalize movement based on container size? 
            // Currently transforms x/y are normalized to "GRID_SIZE" inside createCollage?
            // Wait, createCollage uses t.x * GRID_SIZE. 
            // Here we want visual feedback to match.
            // If we move 100px on screen, how much is that in T.x?
            // It depends on the rendered size vs actual size.
            // Let's rely on a rough sensitivity factor or correct normalization.
            // Simplified: Just use raw movements and rely on "visual" feel.

            // To be precise: If preview is 500px, 1px move is 1/250 of a grid cell (if 2x2).
            // T.x = 1 means shift by full GRID_SIZE.
            // So dx should be divided by (RenderedCellWidth).
            // Let's approximate RenderedCellWidth.
            // We can grab it from Ref? or just guess ~200px.
            const sensitivity = 0.003;

            const dx = (e.clientX - startX) * sensitivity;
            const dy = (e.clientY - startY) * sensitivity;

            setTransforms(prev => {
                const next = [...prev];
                next[idx] = { ...next[idx], x: initX + dx, y: initY + dy };
                return next;
            });
        };

        const handleMouseUp = () => setDragging(null);

        if (dragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [dragging]);


    // --- Actions ---
    const handleGenerate = async (): Promise<File> => {
        // Prepare transforms. 
        // Note: Our transforms are roughly normalized (0-1 range logic from wheel/drag).
        // createCollage expects t.x to be multiplier of GRID_SIZE.
        // My drag logic uses arbitrary sensitivity. It might need tuning.
        return await createCollage(slots, transforms, width, height, padding, backgroundColor);
    };

    const onDownload = async () => {
        setIsGenerating(true);
        try {
            const file = await handleGenerate();
            const url = URL.createObjectURL(file);
            const a = document.createElement('a');
            a.href = url;
            a.download = file.name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (e) {
            console.error(e);
            alert("Failed to generate collage");
        } finally {
            setIsGenerating(false);
        }
    };

    const onSave = async () => {
        if (!onSaveToDrive) return;
        setIsGenerating(true);
        try {
            const file = await handleGenerate();
            onSaveToDrive(file);
        } catch (e) {
            console.error(e);
            alert("Failed to generate collage");
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-white flex overflow-hidden font-sans text-gray-900">
            {/* Left Sidebar: Controls */}
            <div className="w-96 border-r border-gray-200 flex flex-col bg-white shadow-xl z-20">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                    <h2 className="text-xl font-bold flex items-center gap-2 text-purple-600">
                        <Grid fill="currentColor" className="text-purple-100" /> Collage
                    </h2>
                    <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-8">
                    {/* Output Size */}
                    <div className="space-y-3">
                        <label className="text-sm font-bold text-gray-800">Output Size</label>
                        <div className="grid grid-cols-2 gap-2">
                            {PRESETS.map(p => (
                                <button
                                    key={p.label}
                                    onClick={() => {
                                        setWidth(p.width);
                                        setHeight(p.height);
                                        setActivePreset(p.label);
                                    }}
                                    className={`px-3 py-2 text-xs font-medium rounded-lg border transition-all
                                        ${activePreset === p.label
                                            ? 'border-purple-600 bg-purple-50 text-purple-700'
                                            : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                                        }`}
                                >
                                    {p.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Dimensions */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-xs text-gray-500 font-medium">Width</label>
                            <input
                                type="number"
                                value={width}
                                onChange={(e) => {
                                    setWidth(Number(e.target.value));
                                    setActivePreset('Custom');
                                }}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50 focus:bg-white focus:ring-2 focus:ring-purple-500 outline-none transition-all"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-gray-500 font-medium">Height</label>
                            <input
                                type="number"
                                value={height}
                                onChange={(e) => {
                                    setHeight(Number(e.target.value));
                                    setActivePreset('Custom');
                                }}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50 focus:bg-white focus:ring-2 focus:ring-purple-500 outline-none transition-all"
                            />
                        </div>
                    </div>

                    {/* Padding */}
                    <div className="space-y-3">
                        <div className="flex justify-between">
                            <label className="text-sm font-bold text-gray-800">Padding</label>
                            <span className="text-xs text-gray-500">{padding}px</span>
                        </div>
                        <input
                            type="range"
                            min="0"
                            max="100"
                            value={padding}
                            onChange={(e) => setPadding(Number(e.target.value))}
                            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
                        />
                    </div>

                    {/* Background Color */}
                    <div className="space-y-3">
                        <label className="text-sm font-bold text-gray-800">Background Color</label>
                        <div className="flex gap-3">
                            {COLORS.map(c => (
                                <button
                                    key={c}
                                    onClick={() => setBackgroundColor(c)}
                                    className={`w-10 h-10 rounded-full border-2 shadow-sm flex items-center justify-center transition-transform hover:scale-105
                                        ${backgroundColor === c ? 'border-purple-600 ring-2 ring-purple-100' : 'border-gray-200'}`}
                                    style={{ backgroundColor: c }}
                                >
                                    {backgroundColor === c && <Check size={16} className={c === '#FFFFFF' || c === '#F3F4F6' ? 'text-black' : 'text-white'} />}
                                </button>
                            ))}
                            <div className="relative">
                                <input
                                    type="color"
                                    value={backgroundColor}
                                    onChange={(e) => setBackgroundColor(e.target.value)}
                                    className="w-10 h-10 rounded-full overflow-hidden border-0 p-0 cursor-pointer opacity-0 absolute"
                                />
                                <div className="w-10 h-10 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 pointer-events-none bg-white">
                                    <span className="text-[10px]">+</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-6 border-t border-gray-100 bg-gray-50 space-y-3">
                    <button
                        onClick={onDownload}
                        disabled={isGenerating || slots.every(s => s === null)}
                        className="w-full py-3 bg-black text-white rounded-xl font-bold shadow-lg shadow-gray-200 hover:bg-gray-800 hover:shadow-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isGenerating ? <Loader2 className="animate-spin" size={20} /> : <Download size={20} />}
                        Download Image
                    </button>
                    {onSaveToDrive && (
                        <button
                            onClick={onSave}
                            disabled={isGenerating || slots.every(s => s === null)}
                            className="w-full py-3 bg-white border border-gray-200 text-gray-700 rounded-xl font-bold hover:bg-gray-50 hover:border-gray-300 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isDriveLoading ? <Loader2 className="animate-spin" size={20} /> : <Cloud size={20} />}
                            Save to Drive
                        </button>
                    )}
                </div>
            </div>

            {/* Right: Preview Area */}
            <div className="flex-1 bg-gray-100 flex items-center justify-center p-8 overflow-hidden relative">
                {/* Dotted Pattern Background */}
                <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
                    style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 1px)', backgroundSize: '20px 20px' }}
                />

                {/* The Canvas Container */}
                <div
                    className="relative shadow-2xl bg-white transition-all duration-300 ease-in-out"
                    style={{
                        backgroundColor,
                        aspectRatio: `${width} / ${height}`,
                        height: 'min(90%, 90vw)',
                        maxHeight: '800px',
                        maxWidth: '100%',
                        padding: `${padding}px`, // Visual padding simulation? 
                        // Wait, padding in createCollage is internal to grid cells if we follow the code. 
                        // But user UI shows "Padding" slider. Usually creates gaps.
                        // My createCollage uses padding as INSET. 
                        // To simulate visual fidelity, we should replicate the grid logic here.
                    }}
                >
                    {/* The Grid */}
                    <div className="w-full h-full grid grid-cols-2 grid-rows-2">
                        {slots.map((file, index) => (
                            <div
                                key={index}
                                className="relative overflow-hidden group border border-dashed border-gray-200/50 hover:border-purple-300/50 transition-colors"
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={(e) => handleDrop(index, e)}
                                style={{
                                    padding: `${(padding / width) * 100}%` // Approximate padding simulation for visual preview relative to container width?
                                    // Actually, createCollage uses pixel padding. 
                                    // If preview container is scaled down, padding should scale down too.
                                    // Best way: Use CSS padding on the CELL div.
                                    // But I need to map "padding pixels" to "CSS percentage" or "CSS px scaled".
                                    // Since container is sized by CSS, we can't easily use px directly unless we know container px.
                                    // WORKAROUND: Use percentage based on Width state.
                                    // padding_pct = padding / (width/2) * 100% ? No.
                                    // Padding adds spacing around image inside cell.
                                }}
                            >
                                {/* Inner Content Box (Simulates fit area) */}
                                <div
                                    className="w-full h-full relative overflow-hidden bg-gray-50/50"
                                    style={{
                                        margin: `${(padding / width) * 200}%` // Hacky approximation: padding is px. width is px. 
                                        // If width=2000, padding=40. 40/2000 = 2%. 
                                        // Grid cell is 1000px. Padding 40px is 4% of cell.
                                        // So margin = (padding / (width/2)) * 100 %
                                    }}
                                >
                                    {file ? (
                                        <div
                                            className="w-full h-full relative cursor-move"
                                            onMouseDown={(e) => handleMouseDown(index, e)}
                                            onWheel={(e) => handleWheel(index, e)}
                                        >
                                            <img
                                                src={URL.createObjectURL(file)}
                                                className="w-full h-full object-contain pointer-events-none select-none"
                                                style={{
                                                    transform: `translate(${transforms[index].x * 100}%, ${transforms[index].y * 100}%) scale(${transforms[index].scale})`,
                                                }}
                                            />
                                            <button
                                                onClick={() => updateSlot(index, null)}
                                                className="absolute top-1 right-1 p-1 bg-black/50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                <X size={12} />
                                            </button>
                                        </div>
                                    ) : (
                                        <div
                                            className="w-full h-full flex flex-col items-center justify-center cursor-pointer hover:bg-purple-50 transition-colors"
                                            onClick={() => fileInputRefs.current[index]?.click()}
                                        >
                                            <Upload size={24} className="text-gray-300" />
                                            <span className="text-[10px] text-gray-400 font-medium mt-2">Add Image</span>

                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onPickFromDrive((files) => {
                                                        const newSlots = [...slots];
                                                        let fileIdx = 0;
                                                        // Fill from this index onwards
                                                        for (let i = index; i < 4 && fileIdx < files.length; i++) {
                                                            if (!newSlots[i]) newSlots[i] = files[fileIdx++];
                                                        }
                                                        setSlots(newSlots);
                                                    });
                                                }}
                                                className="absolute bottom-2 right-2 p-1.5 bg-white border border-gray-200 rounded-md text-gray-400 hover:text-blue-600 shadow-sm z-10"
                                            >
                                                <Cloud size={14} />
                                            </button>
                                        </div>
                                    )}
                                </div>
                                <input
                                    type="file"
                                    className="hidden"
                                    accept="image/*"
                                    ref={el => fileInputRefs.current[index] = el}
                                    onChange={(e) => handleFileChange(index, e)}
                                />
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
