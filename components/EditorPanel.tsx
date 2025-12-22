
import React from 'react';
import { Type as TypeIcon, Image as ImageIcon, Palette, Trash2, X, Scaling } from 'lucide-react';
import { ImageLayout } from '../types';

interface EditorPanelProps {
    layout: ImageLayout;
    selectedElement: { type: 'card' | 'title' | 'label', id?: number | string } | null;
    onUpdateScale: (type: 'card' | 'title', value: number) => void;
    onUpdateLabelScale: (id: number, value: number) => void;
    onTextEdit: (type: 'title' | 'label', id: number | undefined, value: string) => void;
    onCycleStyle: (id: number) => void;
    onDeleteLabel: (id: number) => void;
    onClose: () => void;
}

export function EditorPanel({
    layout,
    selectedElement,
    onUpdateScale,
    onUpdateLabelScale,
    onTextEdit,
    onCycleStyle,
    onDeleteLabel,
    onClose
}: EditorPanelProps) {
    if (!selectedElement) {
        return (
            <div className="w-80 bg-white border-l border-gray-200 p-6 flex flex-col items-center justify-center text-gray-400">
                <Scaling size={48} className="mb-4 text-gray-200" />
                <p className="text-center font-medium">Select an element on the canvas to edit properties.</p>
            </div>
        );
    }

    const { type, id } = selectedElement;

    return (
        <div className="w-80 bg-white border-l border-gray-200 flex flex-col shadow-xl z-20">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                    {type === 'card' && <><ImageIcon size={18} /> Nutrition Card</>}
                    {type === 'title' && <><TypeIcon size={18} /> Meal Title</>}
                    {type === 'label' && <><TypeIcon size={18} /> Food Label</>}
                </h3>
                <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-200 rounded-full transition-colors">
                    <X size={18} />
                </button>
            </div>

            <div className="p-6 space-y-6 overflow-y-auto">

                {/* TEXT EDITING */}
                {(type === 'title' || type === 'label') && (
                    <div className="space-y-3">
                        <label className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Content</label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={type === 'title' ? layout.mealType.text || "" : layout.labels.find(l => l.id === id)?.text || ""}
                                onChange={(e) => {
                                    if (type === 'title') onTextEdit('title', undefined, e.target.value);
                                    else if (typeof id === 'number') onTextEdit('label', id, e.target.value);
                                }}
                                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all"
                                placeholder="Enter text..."
                            />
                        </div>
                    </div>
                )}

                <div className="h-px bg-gray-100"></div>

                {/* SCALE */}
                <div className="space-y-3">
                    <div className="flex justify-between">
                        <label className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Size</label>
                        <span className="text-xs text-gray-500 font-mono">
                            {type === 'card' && layout.card.scale.toFixed(1)}
                            {type === 'title' && layout.mealType.scale.toFixed(1)}
                            {type === 'label' && typeof id === 'number' && layout.labels.find(l => l.id === id)?.scale.toFixed(1)}
                            x
                        </span>
                    </div>
                    <input
                        type="range"
                        min={type === 'card' ? 1 : type === 'title' ? 3 : 0.5}
                        max={type === 'card' ? 8 : type === 'title' ? 15 : 2}
                        step="0.1"
                        value={
                            type === 'card' ? layout.card.scale :
                                type === 'title' ? layout.mealType.scale :
                                    typeof id === 'number' ? layout.labels.find(l => l.id === id)?.scale || 1 : 1
                        }
                        onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            if (type === 'card') onUpdateScale('card', val);
                            else if (type === 'title') onUpdateScale('title', val);
                            else if (typeof id === 'number') onUpdateLabelScale(id, val);
                        }}
                        className="w-full bg-gray-200 rounded-lg appearance-none cursor-pointer h-2 accent-black"
                    />
                </div>

                {/* STYLE & ACTIONS (Label Only) */}
                {type === 'label' && typeof id === 'number' && (
                    <>
                        <div className="h-px bg-gray-100"></div>
                        <div className="space-y-3">
                            <label className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Style</label>
                            <button
                                onClick={() => onCycleStyle(id)}
                                className="w-full flex items-center justify-between px-4 py-3 bg-white border border-gray-200 rounded-xl hover:border-gray-400 transition-all font-medium text-sm"
                            >
                                <span className="flex items-center gap-2"><Palette size={16} /> Cycle Style</span>
                                <span className="bg-gray-100 px-2 py-1 rounded text-xs text-gray-500 uppercase">
                                    {layout.labels.find(l => l.id === id)?.style || 'default'}
                                </span>
                            </button>
                        </div>

                        <div className="pt-4">
                            <button
                                onClick={() => { onDeleteLabel(id); onClose(); }}
                                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 font-medium transition-colors"
                            >
                                <Trash2 size={18} /> Delete Label
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
