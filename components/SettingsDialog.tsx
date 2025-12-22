
import React, { useState, useEffect, useRef } from 'react';
import { X, Save, Key, Layout, Eye } from 'lucide-react';
import { LabelStyle, FoodAnalysis, ImageLayout } from '../types';
import { drawScene, getInitialLayout } from '../utils/canvasUtils';

interface SettingsDialogProps {
    isOpen: boolean;
    onClose: () => void;
    googleClientId: string;
    googleApiKey: string;
    onUpdateDriveSettings: (clientId: string, apiKey: string) => void;
    geminiApiKey: string;
    geminiApiUrl: string;
    onUpdateGeminiSettings: (key: string, url: string) => void;

    defaultLabelStyle: LabelStyle;
    onUpdateLabelStyle: (style: LabelStyle) => void;

    defaultTitleScale: number;
    onUpdateTitleScale: (s: number) => void;
    defaultCardScale: number;
    onUpdateCardScale: (s: number) => void;
    defaultLabelScale: number;
    onUpdateLabelScale: (s: number) => void;
    defaultCardX: number;
    onUpdateCardX: (x: number) => void;
    defaultCardY: number;
    onUpdateCardY: (y: number) => void;
    defaultTitleY: number;
    onUpdateTitleY: (y: number) => void;

    deleteAfterSave: boolean;
    onUpdateDeleteAfterSave: (val: boolean) => void;
}

const MOCK_ANALYSIS: FoodAnalysis = {
    mealType: "Healthy Bowl",
    nutrition: { calories: 650, carbs: "45g", fat: "22g", protein: "40g" },
    items: [
        { name: "Avocado", box_2d: [300, 300, 500, 500] },
        { name: "Salmon", box_2d: [600, 400, 800, 600] }
    ],
    summary: "A nutritious salmon bowl with avocado.",
    isFood: true,
    hasExistingText: false
};

export function SettingsDialog({
    isOpen,
    onClose,
    googleClientId,
    googleApiKey,
    onUpdateDriveSettings,
    geminiApiKey,
    geminiApiUrl,
    onUpdateGeminiSettings,

    defaultLabelStyle,
    onUpdateLabelStyle,

    defaultTitleScale,
    onUpdateTitleScale,
    defaultCardScale,
    onUpdateCardScale,
    defaultLabelScale,
    onUpdateLabelScale,
    defaultCardX,
    onUpdateCardX,
    defaultCardY,
    onUpdateCardY,
    defaultTitleY,
    onUpdateTitleY,

    deleteAfterSave,
    onUpdateDeleteAfterSave
}: SettingsDialogProps) {
    const [localClientId, setLocalClientId] = useState(googleClientId);
    const [localApiKey, setLocalApiKey] = useState(googleApiKey);
    const [localGeminiKey, setLocalGeminiKey] = useState(geminiApiKey);
    const [localGeminiUrl, setLocalGeminiUrl] = useState(geminiApiUrl);

    // Local state for live preview (synced with props initially)
    const [previewTitleScale, setPreviewTitleScale] = useState(defaultTitleScale);
    const [previewCardScale, setPreviewCardScale] = useState(defaultCardScale);
    const [previewLabelScale, setPreviewLabelScale] = useState(defaultLabelScale);
    const [previewLabelStyle, setPreviewLabelStyle] = useState(defaultLabelStyle);
    const [previewCardX, setPreviewCardX] = useState(defaultCardX);
    const [previewCardY, setPreviewCardY] = useState(defaultCardY);
    const [previewTitleY, setPreviewTitleY] = useState(defaultTitleY);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [mockImage, setMockImage] = useState<HTMLImageElement | null>(null);

    // Sync local state when props change or dialog opens
    useEffect(() => {
        if (isOpen) {
            setLocalClientId(googleClientId);
            setLocalApiKey(googleApiKey);
            setLocalGeminiKey(geminiApiKey);
            setLocalGeminiUrl(geminiApiUrl);

            setPreviewTitleScale(defaultTitleScale);
            setPreviewCardScale(defaultCardScale);
            setPreviewLabelScale(defaultLabelScale);
            setPreviewLabelStyle(defaultLabelStyle);
            setPreviewCardX(defaultCardX);
            setPreviewCardY(defaultCardY);
            setPreviewTitleY(defaultTitleY);
        }
    }, [isOpen, googleClientId, googleApiKey, geminiApiKey, geminiApiUrl, defaultTitleScale, defaultCardScale, defaultLabelScale, defaultLabelStyle, defaultCardX, defaultCardY, defaultTitleY]);

    // Create a mock image once
    useEffect(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 1080;
        canvas.height = 1920;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.fillStyle = '#e5e7eb'; // Gray background
            ctx.fillRect(0, 0, 1080, 1920);

            // Draw some abstract shapes to represent food
            ctx.fillStyle = '#bbf7d0';
            ctx.beginPath(); ctx.arc(540, 960, 400, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#fecaca';
            ctx.beginPath(); ctx.rect(400, 800, 200, 200); ctx.fill();

            const img = new Image();
            img.onload = () => setMockImage(img);
            img.src = canvas.toDataURL();
        }
    }, []);

    // Render Preview
    useEffect(() => {
        if (!isOpen || !canvasRef.current || !mockImage) return;

        const config = {
            defaultTitleScale: previewTitleScale,
            defaultCardScale: previewCardScale,
            defaultLabelScale: previewLabelScale,
            defaultLabelStyle: previewLabelStyle,
            defaultCardX: previewCardX,
            defaultCardY: previewCardY,
            defaultTitleY: previewTitleY
        };

        // Generate a layout based on current sliders
        const layout = getInitialLayout(1080, 1920, MOCK_ANALYSIS, config);

        // Adjust Label Positions for the Mock (Override getInitialLayout's simple centering if needed, but defaults are fine)
        // We override the auto-generated positions to match our mock shapes
        layout.labels[0].x = 0.5; layout.labels[0].y = 0.5; // Center
        layout.labels[1].x = 0.6; layout.labels[1].y = 0.4;

        const canvas = canvasRef.current;
        // visual size is small, but internal resolution matches mock image
        canvas.width = 1080;
        canvas.height = 1920;

        const ctx = canvas.getContext('2d');
        if (ctx) {
            drawScene(ctx, mockImage, MOCK_ANALYSIS, layout);
        }

    }, [isOpen, mockImage, previewTitleScale, previewCardScale, previewLabelScale, previewLabelStyle, previewCardX, previewCardY, previewTitleY]);


    const handleSave = () => {
        onUpdateDriveSettings(localClientId, localApiKey);
        onUpdateGeminiSettings(localGeminiKey, localGeminiUrl);

        onUpdateTitleScale(previewTitleScale);
        onUpdateCardScale(previewCardScale);
        onUpdateLabelScale(previewLabelScale);
        onUpdateLabelStyle(previewLabelStyle);
        onUpdateCardX(previewCardX);
        onUpdateCardY(previewCardY);
        onUpdateTitleY(previewTitleY);

        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl w-full max-w-5xl h-[85vh] shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex justify-between items-center shrink-0">
                    <h2 className="font-bold text-xl text-gray-800 flex items-center gap-2"><Key size={20} /> Settings & Defaults</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-2 hover:bg-gray-200 rounded-full transition-all"><X size={20} /></button>
                </div>

                <div className="flex-1 flex overflow-hidden">
                    {/* Left: Controls */}
                    <div className="w-1/2 p-6 overflow-y-auto border-r border-gray-200 space-y-8">

                        {/* DEFAULTS SECTION */}
                        <div className="space-y-6">
                            <div className="flex items-center gap-2 text-gray-900 pb-2 border-b border-gray-100">
                                <Layout size={18} />
                                <h3 className="font-bold text-sm uppercase tracking-wider">Appearance Defaults</h3>
                            </div>

                            {/* Title Scale */}
                            <div className="space-y-3">
                                <div className="flex justify-between">
                                    <label className="text-sm font-medium text-gray-700">Meal Title Size</label>
                                    <span className="text-xs font-mono bg-gray-100 px-2 py-0.5 rounded text-gray-600">{previewTitleScale.toFixed(1)}x</span>
                                </div>
                                <input type="range" min="3" max="15" step="0.1" value={previewTitleScale} onChange={(e) => setPreviewTitleScale(parseFloat(e.target.value))} className="w-full accent-black h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer" />
                            </div>

                            {/* Title Position Y */}
                            <div className="space-y-3">
                                <div className="flex justify-between">
                                    <label className="text-sm font-medium text-gray-700">Meal Title Vertical Position</label>
                                    <span className="text-xs font-mono bg-gray-100 px-2 py-0.5 rounded text-gray-600">{Math.round(previewTitleY * 100)}%</span>
                                </div>
                                <input type="range" min="0.01" max="0.5" step="0.01" value={previewTitleY} onChange={(e) => setPreviewTitleY(parseFloat(e.target.value))} className="w-full accent-black h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer" />
                            </div>

                            {/* Card Scale */}
                            <div className="space-y-3">
                                <div className="flex justify-between">
                                    <label className="text-sm font-medium text-gray-700">Nutrition Card Size</label>
                                    <span className="text-xs font-mono bg-gray-100 px-2 py-0.5 rounded text-gray-600">{previewCardScale.toFixed(1)}x</span>
                                </div>
                                <input type="range" min="1" max="8" step="0.1" value={previewCardScale} onChange={(e) => setPreviewCardScale(parseFloat(e.target.value))} className="w-full accent-black h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer" />
                            </div>

                            <div className="space-y-3">
                                <label className="text-sm font-medium text-gray-700 block">Nutrition Card Position</label>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <div className="flex justify-between mb-1">
                                            <label className="text-xs text-gray-500">Horizontal (X)</label>
                                            <span className="text-xs font-mono text-gray-600">{Math.round(previewCardX * 100)}%</span>
                                        </div>
                                        <input type="range" min="0" max="1" step="0.01" value={previewCardX} onChange={(e) => setPreviewCardX(parseFloat(e.target.value))} className="w-full accent-black h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer" />
                                    </div>
                                    <div>
                                        <div className="flex justify-between mb-1">
                                            <label className="text-xs text-gray-500">Vertical (Y)</label>
                                            <span className="text-xs font-mono text-gray-600">{Math.round(previewCardY * 100)}%</span>
                                        </div>
                                        <input type="range" min="0" max="1" step="0.01" value={previewCardY} onChange={(e) => setPreviewCardY(parseFloat(e.target.value))} className="w-full accent-black h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer" />
                                    </div>
                                </div>
                            </div>

                            {/* Label Scale */}
                            <div className="space-y-3">
                                <div className="flex justify-between">
                                    <label className="text-sm font-medium text-gray-700">Food Label Size</label>
                                    <span className="text-xs font-mono bg-gray-100 px-2 py-0.5 rounded text-gray-600">{previewLabelScale.toFixed(1)}x</span>
                                </div>
                                <input type="range" min="0.5" max="3" step="0.1" value={previewLabelScale} onChange={(e) => setPreviewLabelScale(parseFloat(e.target.value))} className="w-full accent-black h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer" />
                            </div>

                            {/* Label Style */}
                            <div className="space-y-3">
                                <label className="text-sm font-medium text-gray-700 block">Default Label Style</label>
                                <div className="flex bg-gray-100 p-1 rounded-lg">
                                    {(['default', 'pill', 'text'] as const).map(style => (
                                        <button
                                            key={style}
                                            onClick={() => setPreviewLabelStyle(style)}
                                            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${previewLabelStyle === style ? 'bg-white shadow-sm text-black' : 'text-gray-500 hover:text-gray-700'}`}
                                        >
                                            {style.charAt(0).toUpperCase() + style.slice(1)}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* API KEYS SECTION */}
                        <div className="space-y-6 pt-4">
                            <div className="flex items-center gap-2 text-gray-900 pb-2 border-b border-gray-100">
                                <Key size={18} />
                                <h3 className="font-bold text-sm uppercase tracking-wider">Services</h3>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-700 block">Gemini API Key</label>
                                <input type="password" value={localGeminiKey} onChange={(e) => setLocalGeminiKey(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all" />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-700 block">Google Drive Client ID</label>
                                <input type="text" value={localClientId} onChange={(e) => setLocalClientId(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all" />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-700 block">Google Drive API Key</label>
                                <input type="password" value={localApiKey} onChange={(e) => setLocalApiKey(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all" />
                            </div>

                            <div className="flex items-center gap-3 pt-2">
                                <input type="checkbox" id="deleteOption" checked={deleteAfterSave} onChange={(e) => onUpdateDeleteAfterSave(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-black focus:ring-black" />
                                <label htmlFor="deleteOption" className="text-sm text-gray-700 select-none">Delete original from Drive after saving?</label>
                            </div>
                        </div>
                    </div>

                    {/* Right: Live Preview */}
                    <div className="w-1/2 bg-gray-100 flex flex-col">
                        <div className="px-6 py-3 border-b border-gray-200 bg-white/50 backdrop-blur-sm flex items-center justify-between">
                            <h3 className="font-semibold text-gray-600 flex items-center gap-2"><Eye size={16} /> Live Preview</h3>
                        </div>
                        <div className="flex-1 flex items-center justify-center p-8 bg-gray-100/50">
                            <div className="relative shadow-2xl rounded-sm overflow-hidden bg-white">
                                <canvas
                                    ref={canvasRef}
                                    style={{ width: '270px', height: '480px' }}
                                    className="block max-w-full max-h-full"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex justify-end gap-3 shrink-0">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-200 rounded-lg transition-colors">Cancel</button>
                    <button onClick={handleSave} className="flex items-center gap-2 px-6 py-2 bg-black text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors shadow-lg shadow-black/20"><Save size={16} /> Save Changes</button>
                </div>
            </div>
        </div>
    );
}
