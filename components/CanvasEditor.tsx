
import React, { useRef, useState, useEffect } from 'react';
import { Download, CloudUpload, SlidersHorizontal, Image as ImageIcon, Type as TypeIcon, Trash2, Move, Pencil, Palette, RotateCcw } from 'lucide-react';
import { ProcessedImage, HitRegion, ImageLayout } from '../types';
import { drawScene } from '../utils/canvasUtils';
import { EditorPanel } from './EditorPanel';

interface CanvasEditorProps {
    image: ProcessedImage;
    onUpdateLayout: (id: string, layout: ImageLayout) => void;
    onTextEdit: (id: string, type: 'title' | 'label', itemId: number | undefined, newText: string) => void;
    onDownload: () => void;
    onSave: () => void;
}

export function CanvasEditor({
    image,
    onUpdateLayout,
    onTextEdit,
    onDownload,
    onSave
}: CanvasEditorProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const [hitRegions, setHitRegions] = useState<HitRegion[]>([]);
    const [dragTarget, setDragTarget] = useState<{ type: 'card' | 'title' | 'label', id?: number | string } | null>(null);
    const [dragOffset, setDragOffset] = useState<{ x: number, y: number } | null>(null);
    const [originalImageMeta, setOriginalImageMeta] = useState<{ w: number, h: number } | null>(null);
    const [renderScale, setRenderScale] = useState(1);

    // Selection State for the Editor Panel
    const [selectedElement, setSelectedElement] = useState<{ type: 'card' | 'title' | 'label', id?: number | string } | null>(null);

    const { layout, analysis } = image;

    useEffect(() => {
        if (image.status === 'complete' && analysis && layout && canvasRef.current) {
            const img = new Image();
            img.src = image.previewUrl;
            img.onload = () => {
                const canvas = canvasRef.current;
                if (!canvas) return;
                canvas.width = img.width;
                canvas.height = img.height;
                setOriginalImageMeta({ w: img.width, h: img.height });

                const ctx = canvas.getContext('2d');
                if (ctx) {
                    const regions = drawScene(ctx, img, analysis, layout);
                    setHitRegions(regions);
                }
            };
        }
    }, [image.previewUrl, layout, analysis, image.status]);

    useEffect(() => {
        if (!containerRef.current || !originalImageMeta) return;
        const updateScale = () => {
            if (!containerRef.current || !originalImageMeta) return;
            const currentWidth = containerRef.current.clientWidth;
            setRenderScale(currentWidth / originalImageMeta.w);
        };
        updateScale();
        const observer = new ResizeObserver(() => updateScale());
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, [originalImageMeta]);

    // -- Interaction Handlers --

    const handleMouseDown = (e: React.MouseEvent, type: 'card' | 'title' | 'label', id: number | string) => {
        e.stopPropagation(); // Prevent clearing selection
        if (!layout || !originalImageMeta || !containerRef.current) return;

        // Select the element
        setSelectedElement({ type, id });

        // Initiate Drag
        const rect = (e.target as HTMLElement).getBoundingClientRect();
        const containerRect = containerRef.current.getBoundingClientRect();
        const elLeft = rect.left - containerRect.left;
        const elTop = rect.top - containerRect.top;
        const mouseX = e.clientX - containerRect.left;
        const mouseY = e.clientY - containerRect.top;

        setDragTarget({ type, id });
        setDragOffset({ x: mouseX - elLeft, y: mouseY - elTop });
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!dragTarget || !layout || !containerRef.current || !dragOffset) return;
        const rect = containerRef.current.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const newElX = mouseX - dragOffset.x;
        const newElY = mouseY - dragOffset.y;

        const xPct = newElX / rect.width;
        const yPct = newElY / rect.height;

        const newLayout = { ...layout };

        if (dragTarget.type === 'card') {
            newLayout.card = { ...newLayout.card, x: xPct, y: yPct };
        }
        else if (dragTarget.type === 'title') {
            const region = hitRegions.find(r => r.type === 'title');
            if (region) {
                const pctW = originalImageMeta ? region.w / originalImageMeta.w : 0;
                newLayout.mealType = { ...newLayout.mealType, x: xPct + pctW / 2, y: yPct };
            }
        }
        else if (dragTarget.type === 'label' && dragTarget.id !== undefined) {
            const region = hitRegions.find(r => r.id === dragTarget.id);
            if (region && originalImageMeta) {
                const pctW = region.w / originalImageMeta.w;
                const pctH = region.h / originalImageMeta.h;
                newLayout.labels = newLayout.labels.map(l => l.id === dragTarget.id ? { ...l, x: xPct + pctW / 2, y: yPct + pctH / 2 } : l);
            }
        }
        onUpdateLayout(image.id, newLayout);
    };

    const handleMouseUp = () => setDragTarget(null);

    // Clear selection when clicking empty space
    const handleBackgroundClick = () => setSelectedElement(null);

    // -- Editor Panel Handlers --

    const updateScale = (type: 'card' | 'title', value: number) => {
        if (!layout) return;
        const newLayout = { ...layout };
        if (type === 'card') newLayout.card = { ...newLayout.card, scale: value };
        else if (type === 'title') newLayout.mealType = { ...newLayout.mealType, scale: value };
        onUpdateLayout(image.id, newLayout);
    };

    const updateLabelScale = (id: number, value: number) => {
        if (!layout) return;
        const newLayout = { ...layout };
        newLayout.labels = newLayout.labels.map(l => l.id === id ? { ...l, scale: value } : l);
        onUpdateLayout(image.id, newLayout);
    };

    const cycleLabelStyle = (id: number) => {
        if (!layout) return;
        const newLayout = { ...layout };
        const styles = ['default', 'pill', 'text'];
        newLayout.labels = newLayout.labels.map(l => {
            if (l.id === id) {
                const currentIdx = styles.indexOf(l.style);
                const nextStyle = styles[(currentIdx + 1) % styles.length] as any;
                return { ...l, style: nextStyle };
            }
            return l;
        });
        onUpdateLayout(image.id, newLayout);
    };

    const deleteLabel = (id: number) => {
        if (!layout) return;
        const newLayout = { ...layout };
        newLayout.labels = newLayout.labels.filter(l => l.id !== id);
        onUpdateLayout(image.id, newLayout);
        setSelectedElement(null); // Clear selection if deleted
    };

    const handleTextUpdate = (type: 'title' | 'label', id: number | undefined, value: string) => {
        onTextEdit(image.id, type, id, value);
    };

    // Handling different image statuses
    if (image.status === 'idle') {
        return (
            <div className="flex-1 flex flex-col items-center justify-center bg-gray-100 p-8 gap-6 text-center">
                <img
                    src={image.previewUrl}
                    alt="Preview"
                    className="max-w-md max-h-[50vh] w-auto h-auto shadow-xl rounded-lg opacity-60 grayscale-[0.2]"
                />
                <div>
                    <h3 className="text-xl font-bold text-gray-800 mb-2">Ready to Analyze</h3>
                    <p className="text-gray-500 max-w-sm mx-auto mb-6">This image needs to be processed to identify food and generate nutrition facts.</p>
                </div>
            </div>
        );
    }

    if (image.status === 'analyzing') {
        return (
            <div className="flex-1 flex flex-col items-center justify-center bg-gray-100 gap-4">
                <div className="relative">
                    <img
                        src={image.previewUrl}
                        alt="Analyzing"
                        className="w-32 h-32 object-cover rounded-full opacity-50 animate-pulse"
                    />
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-16 h-16 border-4 border-black border-t-transparent rounded-full animate-spin"></div>
                    </div>
                </div>
                <p className="text-gray-600 font-medium animate-pulse">Analyzing Food content...</p>
            </div>
        );
    }

    if (image.status === 'error') {
        return (
            <div className="flex-1 flex flex-col items-center justify-center bg-red-50 p-8 text-center">
                <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-4">
                    <Trash2 size={32} />
                </div>
                <h3 className="text-lg font-bold text-red-800 mb-2">Processing Failed</h3>
                <p className="text-red-600 mb-6 max-w-xs mx-auto">{image.error || "Could not analyze this image"}</p>
            </div>
        );
    }

    if (!layout || !analysis) return <div className="flex-1 flex items-center justify-center text-gray-400">Loading editor data...</div>;

    return (
        <div className="flex-1 flex h-full overflow-hidden bg-gray-100">
            <div
                className="flex-1 flex flex-col h-full overflow-hidden relative"
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onClick={handleBackgroundClick}
            >
                {/* Interaction Layer */}
                <div className="flex-1 relative flex items-center justify-center p-8 overflow-hidden">
                    <div ref={containerRef} className="relative shadow-2xl bg-white transition-all will-change-transform inline-block">
                        <img
                            src={image.previewUrl}
                            alt="Canvas Base"
                            className="block max-h-[80vh] w-auto h-auto object-contain select-none pointer-events-none"
                            style={{ maxWidth: '100%', maxHeight: 'calc(100vh - 200px)' }}
                        />
                        <canvas
                            ref={canvasRef}
                            className="absolute top-0 left-0 w-full h-full pointer-events-none"
                        />

                        {/* Interactive Overlays */}
                        {layout && hitRegions.map(region => {
                            const isSelected = selectedElement?.id === region.id && selectedElement?.type === region.type;
                            return (
                                <div
                                    key={`${region.type}-${region.id}`}
                                    onMouseDown={(e) => handleMouseDown(e, region.type, region.id)}
                                    onClick={(e) => e.stopPropagation()}
                                    className={`absolute cursor-move group rounded z-20 transition-all ${isSelected
                                        ? 'border-2 border-blue-500 shadow-lg bg-blue-500/10'
                                        : 'border border-transparent hover:border-blue-400/50 hover:bg-blue-400/5'
                                        }`}
                                    style={{
                                        left: region.x * renderScale,
                                        top: region.y * renderScale,
                                        width: region.w * renderScale,
                                        height: region.h * renderScale,
                                        transform: region.rotation ? `rotate(${region.rotation}deg)` : 'none'
                                    }}
                                />
                            );
                        })}
                    </div>
                </div>

                {/* Action Bar */}
                <div className="bg-white border-t border-gray-200 p-4 shrink-0 flex items-center justify-between z-30">
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                        <div className="flex items-center gap-2"><Move size={16} /><span>Click & Drag to move</span></div>
                        <div className="w-px h-4 bg-gray-300"></div>
                        <div className="flex items-center gap-2 text-black font-medium"><p>Select element to edit properties →</p></div>
                    </div>

                    <div className="flex gap-3">
                        <button onClick={onDownload} className="flex items-center gap-2 px-6 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl font-medium transition-colors"><Download size={18} /><span>Download</span></button>
                        <button onClick={onSave} className="flex items-center gap-2 px-6 py-2.5 bg-black hover:bg-gray-800 text-white rounded-xl font-medium shadow-lg hover:shadow-xl transition-all active:scale-95"><CloudUpload size={18} /><span>Save to Drive</span></button>
                    </div>
                </div>
            </div>

            {/* EDITOR PANEL */}
            <EditorPanel
                layout={layout}
                selectedElement={selectedElement}
                onUpdateScale={updateScale}
                onUpdateLabelScale={updateLabelScale}
                onTextEdit={handleTextUpdate}
                onCycleStyle={cycleLabelStyle}
                onDeleteLabel={deleteLabel}
                onClose={() => setSelectedElement(null)}
            />
        </div>
    );
}
