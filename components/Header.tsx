
import React from 'react';
import { Utensils, Loader2, Camera, Grid, Zap } from 'lucide-react';
import { ProcessedImage } from '../types';

interface HeaderProps {
    images: ProcessedImage[];
    isProcessing: boolean;
    onProcess: () => void;
    appMode: 'scan' | 'collage' | 'nutrition';
    setAppMode: (mode: 'scan' | 'collage' | 'nutrition') => void;
    onNewCollage: () => void;
}

export function Header({ images, isProcessing, onProcess, appMode, setAppMode, onNewCollage }: HeaderProps) {
    const hasIdleImages = images.some(i => i.status === 'idle');

    return (
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
                <div className="bg-black p-2 rounded-lg text-white">
                    <Utensils size={24} />
                </div>
                <h1 className="text-xl font-bold tracking-tight text-gray-900 mr-8">AI Cal</h1>

                {/* Mode Switcher */}
                <div className="bg-gray-100 p-1 rounded-lg flex items-center">
                    <button
                        onClick={() => setAppMode('scan')}
                        className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all flex items-center gap-2 ${appMode === 'scan' ? 'bg-white shadow-sm text-black' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        <Camera size={14} /> Scan
                    </button>
                    <button
                        onClick={() => setAppMode('collage')}
                        className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all flex items-center gap-2 ${appMode === 'collage' ? 'bg-white shadow-sm text-black' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        <Grid size={14} /> Collage
                    </button>
                    <button
                        onClick={() => setAppMode('nutrition')}
                        className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all flex items-center gap-2 ${appMode === 'nutrition' ? 'bg-white shadow-sm text-black' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        <Zap size={14} /> Nutrition
                    </button>
                </div>
            </div>
            <div className="flex items-center gap-4">
                {images.length > 0 && (
                    <button
                        onClick={onProcess}
                        disabled={isProcessing || !hasIdleImages}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-full font-medium transition-all ${isProcessing || !hasIdleImages
                            ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                            : 'bg-black text-white hover:bg-gray-800 shadow-lg hover:shadow-xl'
                            }`}
                    >
                        {isProcessing ? <Loader2 className="animate-spin" size={18} /> : <Camera size={18} />}
                        {isProcessing ? 'Processing...' : 'Process Batch'}
                    </button>
                )}

                {appMode === 'collage' && (
                    <button
                        onClick={onNewCollage}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-full font-medium transition-all bg-black text-white hover:bg-gray-800 shadow-lg hover:shadow-xl"
                    >
                        <Grid size={18} />
                        New Collage
                    </button>
                )}
            </div>
        </header>
    );
}
