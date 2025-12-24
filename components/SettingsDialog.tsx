import React, { useState, useEffect, useRef } from 'react';
import { X, Save, Key, Layout, Eye, Grid, Zap, Scan } from 'lucide-react';
import { LabelStyle, FoodAnalysis, AppMode, ModeConfig } from '../types';
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

    modeConfigs: Record<AppMode, ModeConfig>;
    onUpdateModeConfig: (mode: AppMode, config: ModeConfig) => void;

    deleteAfterSave: boolean;
    onUpdateDeleteAfterSave: (val: boolean) => void;
}

const MOCK_ANALYSIS: FoodAnalysis = {
    mealType: "Healthy Bowl",
    nutrition: { calories: 650, carbs: "45g", fat: "22g", protein: "40g" },
    items: [
        { name: "Avocado", box_2d: [300, 300, 500, 500], calories: 150 },
        { name: "Salmon", box_2d: [600, 400, 800, 600], calories: 350 }
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

    modeConfigs,
    onUpdateModeConfig,

    deleteAfterSave,
    onUpdateDeleteAfterSave
}: SettingsDialogProps) {
    const [localClientId, setLocalClientId] = useState(googleClientId);
    const [localApiKey, setLocalApiKey] = useState(googleApiKey);
    const [localGeminiKey, setLocalGeminiKey] = useState(geminiApiKey);
    const [localGeminiUrl, setLocalGeminiUrl] = useState(geminiApiUrl);

    // Active Tab
    const [activeTab, setActiveTab] = useState<AppMode>('scan');

    // Local Config State (Clone of props)
    const [localConfigs, setLocalConfigs] = useState<Record<AppMode, ModeConfig>>(modeConfigs);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [mockImage, setMockImage] = useState<HTMLImageElement | null>(null);

    // Initialize local state
    useEffect(() => {
        if (isOpen) {
            setLocalClientId(googleClientId);
            setLocalApiKey(googleApiKey);
            setLocalGeminiKey(geminiApiKey);
            setLocalGeminiUrl(geminiApiUrl);
            // Deep copy configs to allow local editing without affecting parent until save
            if (modeConfigs) {
                setLocalConfigs(JSON.parse(JSON.stringify(modeConfigs)));
            }
        }
    }, [isOpen, googleClientId, googleApiKey, geminiApiKey, geminiApiUrl, modeConfigs]);

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

    // Helper to update specific config
    const updateConfig = (key: keyof ModeConfig, value: any) => {
        setLocalConfigs(prev => ({
            ...prev,
            [activeTab]: {
                ...prev[activeTab],
                [key]: value
            }
        }));
    };

    const currentConfig = localConfigs[activeTab] || {
        defaultLabelStyle: 'default',
        defaultTitleScale: 7.6,
        defaultCardScale: 4.2,
        defaultLabelScale: 1.0,
        defaultCardX: 0.05,
        defaultCardY: 0.85,
        defaultTitleY: 0.08,
    };

    // Render Preview
    useEffect(() => {
        if (!isOpen || !canvasRef.current || !mockImage) return;

        // Generate a layout based on current sliders
        const configToUse = { ...currentConfig };

        const layout = getInitialLayout(1080, 1920, MOCK_ANALYSIS, configToUse);

        // Adjust Label Positions for the Mock (Override getInitialLayout's simple centering if needed, but defaults are fine)
        // We override the auto-generated positions to match our mock shapes
        layout.labels[0].x = 0.5; layout.labels[0].y = 0.5; // Center
        layout.labels[1].x = 0.6; layout.labels[1].y = 0.4;

        // Apply Nutrition specifics if in nutrition mode
        if (activeTab === 'nutrition') {
            if (configToUse.cardBackgroundColor) layout.card.backgroundColor = configToUse.cardBackgroundColor;
            if (configToUse.cardTextColor) layout.card.color = configToUse.cardTextColor;
        }

        const canvas = canvasRef.current;
        // visual size is small, but internal resolution matches mock image
        canvas.width = 1080;
        canvas.height = 1920;

        const ctx = canvas.getContext('2d');
        if (ctx) {
            drawScene(ctx, mockImage, MOCK_ANALYSIS, layout, activeTab);
        }

    }, [isOpen, mockImage, localConfigs, activeTab]);


    const handleSave = () => {
        onUpdateDriveSettings(localClientId, localApiKey);
        onUpdateGeminiSettings(localGeminiKey, localGeminiUrl);

        // Save all configs
        if (localConfigs) {
            (Object.keys(localConfigs) as AppMode[]).forEach(mode => {
                onUpdateModeConfig(mode, localConfigs[mode]);
            });
        }

        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl w-full max-w-5xl h-[90vh] shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex justify-between items-center shrink-0">
                    <h2 className="font-bold text-xl text-gray-800 flex items-center gap-2"><Key size={20} /> Settings & Defaults</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-2 hover:bg-gray-200 rounded-full transition-all"><X size={20} /></button>
                </div>

                <div className="flex-1 flex overflow-hidden">
                    {/* Left: Controls */}
                    <div className="w-1/2 flex flex-col border-r border-gray-200">
                        {/* Mode Tabs */}
                        <div className="flex border-b border-gray-200 bg-gray-50/50">
                            {[
                                { id: 'scan', label: 'Scan', icon: Scan },
                                { id: 'collage', label: 'Collage', icon: Grid },
                                { id: 'nutrition', label: 'Nutrition', icon: Zap }
                            ].map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id as AppMode)}
                                    className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors border-b-2 ${activeTab === tab.id ? 'border-black text-black bg-white' : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100'}`}
                                >
                                    <tab.icon size={16} />
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        <div className="p-6 overflow-y-auto space-y-8 flex-1">
                            {/* DEFAULTS SECTION */}
                            <div className="space-y-6">
                                <div className="flex items-center gap-2 text-gray-900 pb-2 border-b border-gray-100">
                                    <Layout size={18} />
                                    <h3 className="font-bold text-sm uppercase tracking-wider">{activeTab} Defaults</h3>
                                </div>

                                {/* Title Scale */}
                                <div className="space-y-3">
                                    <div className="flex justify-between">
                                        <label className="text-sm font-medium text-gray-700">Meal Title Size</label>
                                        <span className="text-xs font-mono bg-gray-100 px-2 py-0.5 rounded text-gray-600">{(currentConfig.defaultTitleScale ?? 7.6).toFixed(1)}x</span>
                                    </div>

                                </div>

                                {/* Title Position Y */}
                                <div className="space-y-3">
                                    <div className="flex justify-between">
                                        <label className="text-sm font-medium text-gray-700">Meal Title Vertical Position</label>
                                        <span className="text-xs font-mono bg-gray-100 px-2 py-0.5 rounded text-gray-600">{Math.round((currentConfig.defaultTitleY ?? 0.08) * 100)}%</span>
                                    </div>
                                    <input type="range" min="0.01" max="0.5" step="0.01" value={currentConfig.defaultTitleY ?? 0.08} onChange={(e) => updateConfig('defaultTitleY', parseFloat(e.target.value))} className="w-full accent-black h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer" />
                                </div>

                                {/* Card Scale */}
                                <div className="space-y-3">
                                    <div className="flex justify-between">
                                        <label className="text-sm font-medium text-gray-700">Nutrition Card Size</label>
                                        <span className="text-xs font-mono bg-gray-100 px-2 py-0.5 rounded text-gray-600">{(currentConfig.defaultCardScale ?? 4.2).toFixed(1)}x</span>
                                    </div>
                                    <input type="range" min="1" max="15" step="0.1" value={currentConfig.defaultCardScale ?? 4.2} onChange={(e) => updateConfig('defaultCardScale', parseFloat(e.target.value))} className="w-full accent-black h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer" />
                                </div>

                                <div className="space-y-3">
                                    <label className="text-sm font-medium text-gray-700 block">Nutrition Card Position</label>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <div className="flex justify-between mb-1">
                                                <label className="text-xs text-gray-500">Horizontal (X)</label>
                                                <span className="text-xs font-mono text-gray-600">{Math.round((currentConfig.defaultCardX ?? 0.5) * 100)}%</span>
                                            </div>
                                            <input type="range" min="0" max="1" step="0.01" value={currentConfig.defaultCardX ?? 0.5} onChange={(e) => updateConfig('defaultCardX', parseFloat(e.target.value))} className="w-full accent-black h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer" />
                                        </div>
                                        <div>
                                            <div className="flex justify-between mb-1">
                                                <label className="text-xs text-gray-500">Vertical (Y)</label>
                                                <span className="text-xs font-mono text-gray-600">{Math.round((currentConfig.defaultCardY ?? 0.85) * 100)}%</span>
                                            </div>
                                            <input type="range" min="0" max="1" step="0.01" value={currentConfig.defaultCardY ?? 0.85} onChange={(e) => updateConfig('defaultCardY', parseFloat(e.target.value))} className="w-full accent-black h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer" />
                                        </div>
                                    </div>
                                </div>

                                {/* Label Scale */}
                                <div className="space-y-3">
                                    <div className="flex justify-between">
                                        <label className="text-sm font-medium text-gray-700">Food Label Size</label>
                                        <span className="text-xs font-mono bg-gray-100 px-2 py-0.5 rounded text-gray-600">{(currentConfig.defaultLabelScale ?? 1.0).toFixed(1)}x</span>
                                    </div>
                                    <input type="range" min="0.2" max="8" step="0.1" value={currentConfig.defaultLabelScale ?? 1.0} onChange={(e) => updateConfig('defaultLabelScale', parseFloat(e.target.value))} className="w-full accent-black h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer" />
                                </div>

                                {/* Label Style */}
                                <div className="space-y-3">
                                    <label className="text-sm font-medium text-gray-700 block">Default Label Style</label>
                                    <div className="flex bg-gray-100 p-1 rounded-lg">
                                        {(['default', 'pill', 'text'] as const).map(style => (
                                            <button
                                                key={style}
                                                onClick={() => updateConfig('defaultLabelStyle', style)}
                                                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${currentConfig.defaultLabelStyle === style ? 'bg-white shadow-sm text-black' : 'text-gray-500 hover:text-gray-700'}`}
                                            >
                                                {style.charAt(0).toUpperCase() + style.slice(1)}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* API KEYS SECTION */}
                            <div className="space-y-6 pt-4 border-t border-gray-100">
                                <div className="flex items-center gap-2 text-gray-900 pb-2 border-b border-gray-100">
                                    <Key size={18} />
                                    <h3 className="font-bold text-sm uppercase tracking-wider">Services (Global)</h3>
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
                    </div>

                    {/* Right: Live Preview */}
                    <div className="w-1/2 bg-gray-100 flex flex-col">
                        <div className="px-6 py-3 border-b border-gray-200 bg-white/50 backdrop-blur-sm flex items-center justify-between">
                            <h3 className="font-semibold text-gray-600 flex items-center gap-2"><Eye size={16} /> Live Preview ({activeTab})</h3>
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
