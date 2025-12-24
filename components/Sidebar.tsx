
import React from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, Loader2, Cloud, Settings, BookOpen, Crop, Trash2, CheckCircle2, AlertCircle } from 'lucide-react';
import { ProcessedImage } from '../types';

interface SidebarProps {
    images: ProcessedImage[];
    onDrop: (files: File[]) => void;
    onDriveImport: () => void;
    isDriveLoading: boolean;
    onOpenSettings: () => void;
    onOpenHelp: () => void;
    autoCrop: boolean;
    setAutoCrop: (val: boolean) => void;
    batchSelection: Set<string>;
    onToggleSelectAll: () => void;
    onToggleSelection: (id: string) => void;
    selectedImageId: string | null;
    onSelectImage: (id: string) => void;
    onRemoveImage: (e: React.MouseEvent, id: string) => void;
    onBatchSaveToDrive: () => void;
}

export function Sidebar({
    images,
    onDrop,
    onDriveImport,
    isDriveLoading,
    onOpenSettings,
    onOpenHelp,
    autoCrop,
    setAutoCrop,
    batchSelection,
    onToggleSelectAll,
    onToggleSelection,
    selectedImageId,
    onSelectImage,
    onRemoveImage,
    onBatchSaveToDrive
}: SidebarProps) {

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: { 'image/*': [] }
    });

    return (
        <div className="w-1/3 min-w-[350px] max-w-[450px] bg-white border-r border-gray-200 flex flex-col z-10">
            <div className="p-6 shrink-0 space-y-3">
                <div {...getRootProps()} className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors ${isDragActive ? 'border-green-500 bg-green-50' : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'}`}>
                    <input {...getInputProps()} />
                    <div className="flex flex-col items-center gap-3">
                        <div className="bg-gray-100 p-3 rounded-full">
                            <Upload className="text-gray-500" size={24} />
                        </div>
                        <div>
                            <p className="font-semibold text-gray-700">Click or drag images here</p>
                            <p className="text-sm text-gray-500 mt-1">Supports JPG, PNG</p>
                        </div>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button onClick={onDriveImport} disabled={isDriveLoading} className="flex-1 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors shadow-sm">{isDriveLoading ? <Loader2 className="animate-spin" size={18} /> : <Cloud size={18} />}<span>Import from Google Drive</span></button>
                    <button onClick={onOpenSettings} className="bg-white border border-gray-300 text-gray-500 hover:text-gray-700 hover:bg-gray-50 p-2.5 rounded-xl shadow-sm transition-colors" title="Settings"><Settings size={20} /></button>
                    <button onClick={onOpenHelp} className="bg-white border border-gray-300 text-gray-500 hover:text-gray-700 hover:bg-gray-50 p-2.5 rounded-xl shadow-sm transition-colors" title="Usage Guide"><BookOpen size={20} /></button>
                </div>
            </div>
            <div className="flex flex-col px-6 py-4 border-b border-gray-100 bg-gray-50/50 gap-3">
                <div className="flex justify-between items-center"><span className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Queue ({images.length})</span><button onClick={onToggleSelectAll} className="text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors" disabled={images.length === 0}>{batchSelection.size === images.length && images.length > 0 ? 'Deselect All' : 'Select All'}</button></div>

                {batchSelection.size > 0 && (
                    <div className="flex items-center justify-between bg-blue-50 border border-blue-100 p-2 rounded-lg transition-all animate-in fade-in slide-in-from-top-1">
                        <span className="text-xs font-medium text-blue-700 ml-1">{batchSelection.size} selected</span>
                        <button
                            onClick={onBatchSaveToDrive}
                            disabled={isDriveLoading}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-md hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isDriveLoading ? <Loader2 className="animate-spin" size={12} /> : <Cloud size={12} />}
                            Save to Drive
                        </button>
                    </div>
                )}

                <div className="flex items-center justify-between bg-white border border-gray-200 p-2 rounded-lg cursor-pointer hover:border-gray-300 transition-colors" onClick={() => setAutoCrop(!autoCrop)}>
                    <div className="flex items-center gap-2 text-sm text-gray-700">
                        <Crop size={16} className={autoCrop ? "text-pink-500" : "text-gray-400"} />
                        <span className={autoCrop ? "font-medium text-gray-900" : "text-gray-500"}>Auto-Smart Crop</span>
                    </div>
                    <div className={`w-10 h-6 flex items-center rounded-full p-1 transition-colors ${autoCrop ? 'bg-black' : 'bg-gray-300'}`}>
                        <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${autoCrop ? 'translate-x-4' : 'translate-x-0'}`} />
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-3 custom-scrollbar">
                {images.length === 0 ? (
                    <div className="text-center py-12 text-gray-400">
                        <p>No images yet</p>
                    </div>
                ) : (
                    images.map((img) => (
                        <div
                            key={img.id}
                            onClick={() => onSelectImage(img.id)}
                            className={`group relative flex gap-4 p-3 rounded-2xl border transition-all cursor-pointer ${selectedImageId === img.id
                                ? 'bg-white border-black shadow-md ring-1 ring-black/5'
                                : 'bg-white border-gray-100 hover:border-gray-300 hover:shadow-sm'
                                }`}
                        >
                            <div
                                onClick={(e) => { e.stopPropagation(); onToggleSelection(img.id); }}
                                className={`absolute top-3 left-3 w-6 h-6 rounded-full border-2 flex items-center justify-center z-10 transition-colors ${batchSelection.has(img.id)
                                    ? 'bg-blue-500 border-blue-500 text-white'
                                    : 'bg-white/80 border-gray-300 text-transparent hover:border-gray-400'
                                    }`}
                            >
                                <CheckCircle2 size={14} fill="currentColor" className={batchSelection.has(img.id) ? "text-white" : "text-transparent"} />
                            </div>

                            <div className="w-20 h-20 shrink-0 bg-gray-100 rounded-xl overflow-hidden relative">
                                <img src={img.previewUrl} alt="Preview" className="w-full h-full object-cover" />
                                {img.status === 'analyzing' && (
                                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                        <Loader2 className="animate-spin text-white" size={20} />
                                    </div>
                                )}
                                {img.status === 'not-food' && (
                                    <div className="absolute inset-0 bg-red-500/50 flex items-center justify-center" title={img.error}>
                                        <AlertCircle className="text-white" size={20} />
                                    </div>
                                )}
                                {img.status === 'error' && (
                                    <div className="absolute inset-0 bg-red-500/50 flex items-center justify-center" title={img.error}>
                                        <AlertCircle className="text-white" size={20} />
                                    </div>
                                )}
                            </div>

                            <div className="flex-1 min-w-0 py-1">
                                <div className="flex justify-between items-start">
                                    <h3 className="font-medium text-gray-900 truncate pr-6" title={img.file.name}>{img.file.name}</h3>
                                    <button
                                        onClick={(e) => onRemoveImage(e, img.id)}
                                        className="text-gray-400 hover:text-red-500 p-1 -mt-1 -mr-1 rounded-lg hover:bg-red-50 transition-colors"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>

                                <div className="mt-1 flex items-center gap-2">
                                    {img.status === 'complete' && img.analysis ? (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-green-50 text-green-700 text-xs font-medium border border-green-100">
                                            {img.analysis.calories} kcal
                                        </span>
                                    ) : (
                                        <span className={`text-xs ${img.status === 'error' || img.status === 'not-food' ? 'text-red-500' : 'text-gray-500'}`}>
                                            {img.status.charAt(0).toUpperCase() + img.status.slice(1)}
                                        </span>
                                    )}
                                    {img.driveFileId && <Cloud size={12} className="text-blue-500" title="From Google Drive" />}
                                </div>

                                {img.analysis && (
                                    <p className="text-xs text-gray-500 mt-2 truncate">
                                        {img.analysis.summary}
                                    </p>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
