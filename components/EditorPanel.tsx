
import React from 'react';
import { Type as TypeIcon, Image as ImageIcon, Palette, Trash2, X, Scaling, Check, CloudUpload } from 'lucide-react';
import { ImageLayout } from '../types';

const DEFAULT_COLORS = [
    '#000000', // Black
    '#FFFFFF', // White
    '#1F2937', // Gray-800
    '#4B5563', // Gray-600
    '#DC2626', // Red-600
    '#EA580C', // Orange-600
    '#D97706', // Amber-600
    '#16A34A', // Green-600
    '#2563EB', // Blue-600
    '#7C3AED', // Violet-600
    '#DB2777', // Pink-600
];

interface EditorPanelProps {
    layout: ImageLayout;
    selectedElement: { type: 'card' | 'title' | 'label' | 'logo', id?: number | string } | null;
    onUpdateScale: (type: 'card' | 'title' | 'logo', value: number) => void;
    onUpdateLabelScale: (id: number, value: number) => void;
    onTextEdit: (type: 'title' | 'label', id: number | undefined, value: string) => void;
    onUpdateColor: (type: 'card' | 'card-text', color: string) => void;
    onUpdateLogo?: (url: string | null) => void;
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
    onUpdateColor,
    onUpdateLogo,
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

    // Helper for file upload
    const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0] && onUpdateLogo) {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onloadend = () => {
                onUpdateLogo(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    return (
        <div className="w-80 bg-white border-l border-gray-200 flex flex-col shadow-xl z-20">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                    {type === 'card' && <><ImageIcon size={18} /> Nutrition Card</>}
                    {type === 'title' && <><TypeIcon size={18} /> Meal Title</>}
                    {type === 'label' && <><TypeIcon size={18} /> Food Label</>}
                    {type === 'logo' && <><ImageIcon size={18} /> Logo</>}
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

                {(type === 'card') && (
                    <div className="space-y-6">
                        {/* Background Color */}
                        <div className="space-y-3">
                            <label className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Background Color</label>
                            <div className="grid grid-cols-6 gap-2">
                                {DEFAULT_COLORS.map(color => (
                                    <button
                                        key={`bg-${color}`}
                                        onClick={() => onUpdateColor('card', color)}
                                        className={`w-8 h-8 rounded-full border border-gray-200 shadow-sm flex items-center justify-center transition-transform hover:scale-110 ${layout.card.backgroundColor === color ? 'ring-2 ring-offset-2 ring-black' : ''}`}
                                        style={{ backgroundColor: color }}
                                    >
                                        {layout.card.backgroundColor === color && <Check size={14} className={['#FFFFFF', '#ffffff'].includes(color) ? 'text-black' : 'text-white'} />}
                                    </button>
                                ))}
                            </div>
                            <div className="flex items-center gap-2 mt-2">
                                <span className="text-gray-500 text-sm">Hex:</span>
                                <input
                                    type="text"
                                    value={layout.card.backgroundColor || "#000000"}
                                    onChange={(e) => onUpdateColor('card', e.target.value)}
                                    className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm font-mono uppercase"
                                />
                            </div>
                        </div>

                        <div className="h-px bg-gray-100"></div>

                        {/* Text Color */}
                        <div className="space-y-3">
                            <label className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Text Color</label>
                            <div className="grid grid-cols-6 gap-2">
                                {DEFAULT_COLORS.map(color => (
                                    <button
                                        key={`txt-${color}`}
                                        onClick={() => {
                                            // Handle update by mutating logic or reusing onUpdateColor with a flag?
                                            // onUpdateColor signature is (type, color). I need to pass 'textColor'.
                                            // But EditorPanelProps says type: 'card'. 
                                            // Hack: Pass special syntax or update parent to handle it?
                                            // Simpler: Just allow parent to handle `color` vs `backgroundColor`.
                                            // But onUpdateColor uses `onUpdateColor('card', val)`.
                                            // I will assume for now I can't easily change prop signature without changing parent.
                                            // Wait, I CAN change signature in Step 1 of this tool call but I missed it.
                                            // I'll assume users will pass a special string or I add a new prop `onUpdateTextColor`.
                                            // Actually, I'll allow `onUpdateColor` to take a property name?
                                            // Or better: I'll use `onUpdateColor('card-text', color)` and handle in parent?
                                            // Type is 'card'.
                                            // I'll change `onUpdateColor` signature in parent now too.
                                            // Wait, I can't change parent in this block.
                                            // I'll emit 'card-text' as type. Parent check `if (type === 'card') ... else if(type === 'card-text')`
                                            onUpdateColor('card-text' as any, color);
                                        }}
                                        className={`w-8 h-8 rounded-full border border-gray-200 shadow-sm flex items-center justify-center transition-transform hover:scale-110 ${layout.card.color === color ? 'ring-2 ring-offset-2 ring-black' : ''}`}
                                        style={{ backgroundColor: color }}
                                    >
                                        {(layout.card.color === color || (!layout.card.color && color === '#FFFFFF')) && <Check size={14} className={['#FFFFFF', '#ffffff'].includes(color) ? 'text-black' : 'text-white'} />}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="h-px bg-gray-100"></div>

                        {/* Logo Upload */}
                        <div className="space-y-3">
                            <label className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Logo</label>
                            {layout.logo?.url ? (
                                <div className="flex items-center justify-between bg-gray-50 p-3 rounded-lg border border-gray-200">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded bg-white border border-gray-200 p-1">
                                            <img src={layout.logo.url} className="w-full h-full object-contain" alt="Logo" />
                                        </div>
                                        <span className="text-sm font-medium text-gray-600">Logo Added</span>
                                    </div>
                                    <button
                                        onClick={() => onUpdateLogo && onUpdateLogo(null)}
                                        className="text-red-500 hover:bg-red-50 p-1.5 rounded-md transition-colors"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            ) : (
                                <label className="flex items-center justify-center gap-2 w-full py-3 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-black hover:bg-gray-50 transition-all text-gray-500 font-medium text-sm">
                                    <CloudUpload size={18} />
                                    <span>Upload Logo</span>
                                    <input type="file" className="hidden" accept="image/*" onChange={handleLogoUpload} />
                                </label>
                            )}
                            {layout.logo?.url && <p className="text-xs text-gray-400">Drag to move, select logo to resize.</p>}
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
                            {type === 'logo' && layout.logo?.scale.toFixed(1)}
                            x
                        </span>
                    </div>
                    <input
                        type="range"
                        min={type === 'card' ? 0.5 : type === 'title' ? 1 : 0.1}
                        max={type === 'card' ? 15 : type === 'title' ? 30 : 8}
                        step="0.1"
                        value={
                            type === 'card' ? layout.card.scale :
                                type === 'title' ? layout.mealType.scale :
                                    type === 'logo' ? layout.logo?.scale || 1 :
                                        typeof id === 'number' ? layout.labels.find(l => l.id === id)?.scale || 1 : 1
                        }
                        onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            if (type === 'card') onUpdateScale('card', val);
                            else if (type === 'title') onUpdateScale('title', val);
                            else if (type === 'logo') onUpdateScale('logo', val);
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
