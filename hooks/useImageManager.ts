
import { useState, useCallback } from 'react';
import { ProcessedImage, LabelStyle } from '../types';
import { analyzeFoodImage } from '../services/geminiService';
import { resizeImage, getInitialLayout } from '../utils/canvasUtils';

export interface ProcessingConfig {
    geminiApiKey: string;
    geminiApiUrl: string;
    autoCrop: boolean;
    defaultLabelStyle: LabelStyle;
    defaultTitleScale: number;
    defaultCardScale: number;
    defaultLabelScale: number;
    defaultCardX?: number;
    defaultCardY?: number;
    defaultTitleY?: number;
}

export function useImageManager() {
    const [images, setImages] = useState<ProcessedImage[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [batchSelection, setBatchSelection] = useState<Set<string>>(new Set());
    const [selectedImageId, setSelectedImageId] = useState<string | null>(null);

    const addImages = useCallback((newFiles: File[], sourceMode: 'scan' | 'collage' = 'scan') => {
        const newImages: ProcessedImage[] = newFiles.map((file) => ({
            id: Math.random().toString(36).substr(2, 9),
            sourceMode,
            file,
            previewUrl: URL.createObjectURL(file),
            status: 'idle',
        }));
        setImages((prev) => [...prev, ...newImages]);
    }, []);

    const addProcessedImages = useCallback((newImages: ProcessedImage[]) => {
        setImages((prev) => [...prev, ...newImages]);
    }, []);

    const removeImage = useCallback((id: string) => {
        setImages(prev => prev.filter(img => img.id !== id));
        if (selectedImageId === id) setSelectedImageId(null);
        setBatchSelection(prev => { const next = new Set(prev); next.delete(id); return next; });
    }, [selectedImageId]);

    const toggleSelection = useCallback((id: string) => {
        setBatchSelection(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const toggleSelectAll = useCallback(() => {
        if (batchSelection.size === images.length && images.length > 0) {
            setBatchSelection(new Set());
        } else {
            setBatchSelection(new Set(images.map(img => img.id)));
        }
    }, [batchSelection.size, images]);

    const processPendingImages = async (config: ProcessingConfig) => {
        setIsProcessing(true);
        const imagesToProcess = images.filter(img => img.status === 'idle' || img.status === 'error');
        const BATCH_SIZE = 3;

        const processSingleImage = async (imgData: ProcessedImage) => {
            try {
                setImages(prev => prev.map(p => p.id === imgData.id ? { ...p, status: 'analyzing' } : p));

                // Force disable auto-crop for collage images (they are already square)
                const shouldAutoCrop = imgData.sourceMode === 'collage' ? false : config.autoCrop;

                const { base64: base64Data, mimeType } = await resizeImage(imgData.file, 1024, shouldAutoCrop);

                const correctedPreviewUrl = `data:${mimeType};base64,${base64Data}`;
                const analysis = await analyzeFoodImage(base64Data, mimeType, config.geminiApiKey, config.geminiApiUrl);

                if (!analysis.isFood) {
                    setImages(prev => prev.map(p => p.id === imgData.id ? { ...p, status: 'not-food', error: 'Not recognized as food' } : p));
                    return;
                }

                const img = new Image();
                img.src = correctedPreviewUrl;
                await new Promise(r => img.onload = r);

                const layout = getInitialLayout(img.width, img.height, analysis, {
                    defaultLabelStyle: config.defaultLabelStyle,
                    defaultTitleScale: config.defaultTitleScale,
                    defaultCardScale: config.defaultCardScale,
                    defaultLabelScale: config.defaultLabelScale,
                    defaultCardY: config.defaultCardY,
                    defaultTitleY: config.defaultTitleY
                });

                // Collage Mode Specific Overrides
                if (imgData.sourceMode === 'collage') {
                    // 1. Remove individual item labels
                    layout.labels = [];

                    // 2. Title Logic: Use specific food name instead of generic Meal Type
                    let titleText = analysis.mealType; // Default fallback

                    if (analysis.items && analysis.items.length > 0) {
                        // Use the first item name
                        titleText = analysis.items[0].name;

                        // Optional: If there are exactly 2 items and they are short, combine them? 
                        // For now, let's stick to the primary one as it's cleaner "Sweet Potato" vs "Sweet Potato and Butter"
                    } else if (analysis.summary && analysis.summary.length < 20) {
                        // Fallback to summary if it's short enough
                        titleText = analysis.summary;
                    }

                    // 3. Ensure Title is Centered and slightly larger
                    layout.mealType.x = 0.5;
                    layout.mealType.text = titleText;
                    layout.mealType.scale = (config.defaultTitleScale || 7.6) * 1.2;
                }

                setImages(prev => prev.map(p => p.id === imgData.id ? { ...p, previewUrl: correctedPreviewUrl, status: 'complete', analysis, layout } : p));
            } catch (error: any) {
                setImages(prev => prev.map(p => p.id === imgData.id ? { ...p, status: 'error', error: error.message || 'Processing failed' } : p));
            }
        };

        for (let i = 0; i < imagesToProcess.length; i += BATCH_SIZE) {
            const batch = imagesToProcess.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map(img => processSingleImage(img)));
        }
        setIsProcessing(false);
    };

    // Helper to update a specific image layout
    const updateImageLayout = useCallback((id: string, newLayout: any) => {
        setImages(prev => prev.map(img => img.id === id ? { ...img, layout: newLayout } : img));
    }, []);

    // Helper to update image text
    const updateImageText = useCallback((id: string, type: 'title' | 'label', itemId: number | undefined, newText: string) => {
        setImages(prev => prev.map(img => {
            if (img.id !== id || !img.layout) return img;
            const newLayout = { ...img.layout };
            if (type === 'title') newLayout.mealType = { ...newLayout.mealType, text: newText };
            else if (type === 'label' && itemId !== undefined) newLayout.labels = newLayout.labels.map(l => l.id === itemId ? { ...l, text: newText } : l);
            return { ...img, layout: newLayout };
        }));
    }, []);

    return {
        images,
        setImages, // Exposed for external updates (e.g. drive import)
        isProcessing,
        batchSelection,
        selectedImageId,
        setSelectedImageId,
        addImages,
        addProcessedImages,
        removeImage,
        toggleSelection,
        toggleSelectAll,
        processPendingImages,
        updateImageLayout,
        updateImageText
    };
}
