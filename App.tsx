
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { Camera, Upload, Utensils, Download, X, AlertCircle, CheckCircle2, Loader2, Image as ImageIcon, Move, Pencil, SlidersHorizontal, Trash2, Cloud, Settings, Info, Copy, Check, Key, Tag, CloudUpload, Square, CheckSquare, Sparkles, Globe, Trash } from 'lucide-react';
import { ProcessedImage, ImageLayout, ElementState } from './types';
import { analyzeFoodImage } from './services/geminiService';
import { resizeImage, getInitialLayout, generateCardSprite, generateLabelSprite, generateTitleSprite, renderFinalImage } from './utils/canvasUtils';

// --- Google Drive Configuration ---
const DEFAULT_GOOGLE_CLIENT_ID = "959444237240-lca07hnf1qclkj3o93o1k3kuo65bkqr7.apps.googleusercontent.com"; 
const DEFAULT_API_KEY = process.env.API_KEY || ""; 
// Added https://www.googleapis.com/auth/drive to allow deletion of original files
const GOOGLE_SCOPES = 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive';

const dataURLtoBlob = (dataurl: string) => {
    const arr = dataurl.split(',');
    const mime = arr[0].match(/:(.*?);/)![1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while(n--){
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], {type:mime});
};

function App() {
  const [images, setImages] = useState<ProcessedImage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [batchSelection, setBatchSelection] = useState<Set<string>>(new Set());
  const [exportTag, setExportTag] = useState("Food");
  const [deleteAfterSave, setDeleteAfterSave] = useState(false);

  const [editorContainerRef, setEditorContainerRef] = useState<HTMLDivElement | null>(null);
  const [cardSprite, setCardSprite] = useState<string>("");
  const [titleSprite, setTitleSprite] = useState<string>("");
  const [labelSprites, setLabelSprites] = useState<Record<number, string>>({});
  const [dragTarget, setDragTarget] = useState<{ type: 'card' | 'title' | 'label', id?: number } | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number, y: number } | null>(null);
  const [originalImageMeta, setOriginalImageMeta] = useState<{w: number, h: number} | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(1000);

  const [isDriveLoading, setIsDriveLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showDriveSettings, setShowDriveSettings] = useState(false);
  const [googleClientId, setGoogleClientId] = useState(DEFAULT_GOOGLE_CLIENT_ID);
  const [googleApiKey, setGoogleApiKey] = useState(DEFAULT_API_KEY);
  const [copied, setCopied] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const tokenClientRef = useRef<any>(null);
  const onAuthSuccessRef = useRef<((token: string) => void) | null>(null);
  
  useEffect(() => {
    const storedId = localStorage.getItem('aical_google_client_id');
    const storedKey = localStorage.getItem('aical_google_api_key');
    const storedDeleteOption = localStorage.getItem('aical_delete_after_save');

    if (storedId) setGoogleClientId(storedId);
    if (storedKey) setGoogleApiKey(storedKey);
    if (storedDeleteOption) setDeleteAfterSave(storedDeleteOption === 'true');
  }, []);

  const saveSettings = () => {
    localStorage.setItem('aical_google_client_id', googleClientId);
    localStorage.setItem('aical_google_api_key', googleApiKey);
    localStorage.setItem('aical_delete_after_save', String(deleteAfterSave));
    setAccessToken(null);
    tokenClientRef.current = null;
    setShowDriveSettings(false);
  };

  const copyOrigin = () => {
    navigator.clipboard.writeText(window.location.origin);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const deleteFromDrive = async (fileId: string, token: string) => {
    try {
      const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) {
        console.warn(`Failed to delete original file ${fileId}: ${response.statusText}`);
      } else {
        console.log(`Successfully deleted original file ${fileId} from Drive.`);
      }
    } catch (e) {
      console.error(`Error deleting file ${fileId}:`, e);
    }
  };

  const requestGoogleAuth = (callback: (token: string) => void) => {
    if (!googleClientId) {
      setShowDriveSettings(true);
      return;
    }
    try {
        const google = (window as any).google;
        if (!google) return;
        if (!tokenClientRef.current) {
            tokenClientRef.current = google.accounts.oauth2.initTokenClient({
                client_id: googleClientId,
                scope: GOOGLE_SCOPES,
                callback: (resp: any) => {
                    if (resp.error !== undefined) {
                        setIsDriveLoading(false);
                        setIsUploading(false);
                        return;
                    }
                    setAccessToken(resp.access_token);
                    if (onAuthSuccessRef.current) {
                        onAuthSuccessRef.current(resp.access_token);
                        onAuthSuccessRef.current = null;
                    }
                },
            });
        }
        onAuthSuccessRef.current = callback;
        tokenClientRef.current.requestAccessToken({ prompt: '' });
    } catch (e: any) {
        setIsDriveLoading(false);
        setIsUploading(false);
    }
  };

  const createPicker = useCallback((token: string) => {
    try {
      const google = (window as any).google;
      const pickerCallback = async (data: any) => {
        if (data.action === google.picker.Action.PICKED) {
          const docs = data.docs;
          const newImages: ProcessedImage[] = [];
          for (const doc of docs) {
             try {
              const fileId = doc.id;
              const mimeType = doc.mimeType;
              const fileName = doc.name;
              const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              if (!response.ok) throw new Error("Failed to download file");
              const blob = await response.blob();
              const file = new File([blob], fileName, { type: mimeType });
              newImages.push({
                id: Math.random().toString(36).substr(2, 9),
                file,
                previewUrl: URL.createObjectURL(file),
                status: 'idle',
                driveFileId: fileId // Track the original ID
              });
             } catch(e) { console.error(e) }
          }
          if (newImages.length > 0) setImages((prev) => [...prev, ...newImages]);
        }
        setIsDriveLoading(false);
      };

      const view = new google.picker.View(google.picker.ViewId.DOCS_IMAGES);
      view.setMimeTypes("image/png,image/jpeg,image/jpg");
      const picker = new google.picker.PickerBuilder()
        .setDeveloperKey(googleApiKey)
        .setAppId(googleClientId)
        .setOAuthToken(token)
        .addView(view)
        .addView(new google.picker.DocsUploadView())
        .setCallback(pickerCallback)
        .enableFeature(google.picker.Feature.MULTISELECT_ENABLED)
        .enableFeature(google.picker.Feature.SUPPORT_DRIVES)
        .build();
      picker.setVisible(true);
    } catch (e: any) {
      setIsDriveLoading(false);
    }
  }, [googleApiKey, googleClientId]);

  const createFolderPicker = useCallback((token: string, onFolderSelect: (folderId: string) => void) => {
    const google = (window as any).google;
    const view = new google.picker.DocsView(google.picker.ViewId.FOLDERS)
        .setSelectFolderEnabled(true)
        .setIncludeFolders(true)
        .setMimeTypes('application/vnd.google-apps.folder');
    const picker = new google.picker.PickerBuilder()
        .setDeveloperKey(googleApiKey)
        .setAppId(googleClientId)
        .setOAuthToken(token)
        .addView(view)
        .setCallback((data: any) => {
            if (data.action === google.picker.Action.PICKED) {
                const doc = data.docs[0];
                if (doc) onFolderSelect(doc.id);
            }
        })
        .setTitle("Select Destination Folder")
        .build();
    picker.setVisible(true);
  }, [googleApiKey, googleClientId]);

  const handleDriveImport = async () => {
    if (!googleClientId || !googleApiKey) { setShowDriveSettings(true); return; }
    if (accessToken) { createPicker(accessToken); } 
    else { setIsDriveLoading(true); requestGoogleAuth((token) => createPicker(token)); }
  };

  const handleSaveToDrive = async () => {
    if (!selectedImage || !selectedImage.layout || !selectedImage.analysis) return;
    const performUpload = async (token: string, folderId: string) => {
        setIsUploading(true);
        try {
            const url = await renderFinalImage(selectedImage.previewUrl, selectedImage.analysis, selectedImage.layout);
            const blob = dataURLtoBlob(url);
            const date = new Date().toISOString().split('T')[0];
            const safeTag = exportTag.trim().replace(/[\/\\:*?"<>|]/g, '') || "Style";
            const fileName = `${date}-${safeTag}.jpg`;
            const metadata = { name: fileName, mimeType: 'image/jpeg', parents: [folderId] };
            const formData = new FormData();
            formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
            formData.append('file', blob);
            const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });
            if (!response.ok) throw new Error('Upload failed');
            
            // Delete original if requested
            if (deleteAfterSave && selectedImage.driveFileId) {
                await deleteFromDrive(selectedImage.driveFileId, token);
                setImages(prev => prev.map(img => img.id === selectedImage.id ? { ...img, driveFileId: undefined } : img));
            }

            alert(`✅ Saved to Google Drive!\nFile: ${fileName}${deleteAfterSave && selectedImage.driveFileId ? '\nOriginal file deleted.' : ''}`);
        } catch (error: any) { alert("Failed: " + error.message); } 
        finally { setIsUploading(false); }
    };
    if (accessToken) { createFolderPicker(accessToken, (fid) => performUpload(accessToken, fid)); } 
    else { requestGoogleAuth((token) => createFolderPicker(token, (fid) => performUpload(token, fid))); }
  };

  const handleBatchSaveToDrive = async () => {
    const selectedIds = Array.from(batchSelection);
    const imagesToSave = images.filter(img => selectedIds.includes(img.id) && img.status === 'complete');
    if (imagesToSave.length === 0) return;

    const performBatchUpload = async (token: string, folderId: string) => {
        setIsUploading(true);
        let successCount = 0;
        let deleteCount = 0;
        const date = new Date().toISOString().split('T')[0];
        const safeTag = exportTag.trim().replace(/[\/\\:*?"<>|]/g, '') || "Style";

        for (const img of imagesToSave) {
            try {
                if (!img.layout || !img.analysis) continue;
                const url = await renderFinalImage(img.previewUrl, img.analysis, img.layout);
                const blob = dataURLtoBlob(url);
                const originalNameWithoutExt = img.file.name.replace(/\.[^/.]+$/, "");
                const fileName = `${date}-${safeTag}-${originalNameWithoutExt}.jpg`;
                const metadata = { name: fileName, mimeType: 'image/jpeg', parents: [folderId] };
                const formData = new FormData();
                formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
                formData.append('file', blob);

                const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: formData
                });
                if (response.ok) {
                    successCount++;
                    if (deleteAfterSave && img.driveFileId) {
                        await deleteFromDrive(img.driveFileId, token);
                        deleteCount++;
                    }
                }
            } catch (err) { console.error(err); }
        }
        alert(`Batch Complete!\n✅ Success: ${successCount}\n🗑️ Deleted Original: ${deleteCount}`);
        setIsUploading(false);
        setBatchSelection(new Set());
    };
    if (accessToken) { createFolderPicker(accessToken, (fid) => performBatchUpload(accessToken, fid)); } 
    else { requestGoogleAuth((token) => createFolderPicker(token, (fid) => performBatchUpload(token, fid))); }
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const newImages: ProcessedImage[] = acceptedFiles.map((file) => ({
      id: Math.random().toString(36).substr(2, 9),
      file,
      previewUrl: URL.createObjectURL(file),
      status: 'idle',
    }));
    setImages((prev) => [...prev, ...newImages]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: { 'image/*': [] } });

  useEffect(() => {
    if (!editorContainerRef) return;
    const observer = new ResizeObserver((entries) => { for (const entry of entries) setContainerWidth(entry.contentRect.width); });
    observer.observe(editorContainerRef);
    return () => observer.disconnect();
  }, [editorContainerRef]);

  const processImages = async () => {
    setIsProcessing(true);
    const imagesToProcess = images.filter(img => img.status === 'idle' || img.status === 'error');
    const BATCH_SIZE = 3; 

    const processSingleImage = async (imgData: ProcessedImage) => {
        try {
            setImages(prev => prev.map(p => p.id === imgData.id ? { ...p, status: 'analyzing' } : p));
            const { base64: base64Data, mimeType } = await resizeImage(imgData.file);
            const correctedPreviewUrl = `data:${mimeType};base64,${base64Data}`;
            // Use Gemini API service with environment variable key.
            const analysis = await analyzeFoodImage(base64Data, mimeType);
            if (!analysis.isFood) {
                setImages(prev => prev.map(p => p.id === imgData.id ? { ...p, status: 'not-food', error: 'Not recognized as food' } : p));
                return;
            }
            const img = new Image();
            img.src = correctedPreviewUrl;
            await new Promise(r => img.onload = r);
            const layout = getInitialLayout(img.width, img.height, analysis);
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

  // Fix: Implemented toggleSelection to allow users to select/deselect items for batch operations.
  const toggleSelection = (id: string) => {
    setBatchSelection(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Fix: Implemented toggleSelectAll to allow users to quickly select/deselect all items in the queue.
  const toggleSelectAll = () => {
    if (batchSelection.size === images.length && images.length > 0) {
      setBatchSelection(new Set());
    } else {
      setBatchSelection(new Set(images.map(img => img.id)));
    }
  };

  const removeImage = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setImages(prev => prev.filter(img => img.id !== id));
    if (selectedImageId === id) setSelectedImageId(null);
    setBatchSelection(prev => { const next = new Set(prev); next.delete(id); return next; });
  };

  const selectedImage = images.find(img => img.id === selectedImageId);

  useEffect(() => {
    if (selectedImage?.status === 'complete' && selectedImage.analysis && selectedImage.layout) {
      const img = new Image();
      img.src = selectedImage.previewUrl;
      img.onload = () => setOriginalImageMeta({ w: img.width, h: img.height });
      generateCardSprite(selectedImage.analysis).then(setCardSprite);
      generateTitleSprite(selectedImage.layout.mealType.text || selectedImage.analysis.mealType).then(setTitleSprite);
      const newSprites: Record<number, string> = {};
      const promises = selectedImage.layout.labels.map(async (l) => {
        const url = await generateLabelSprite(l.text || "");
        newSprites[l.id] = url;
      });
      Promise.all(promises).then(() => setLabelSprites(newSprites));
    }
  }, [selectedImageId, selectedImage?.status, selectedImage?.layout?.mealType.text]);

  const handleDragStart = (e: React.MouseEvent, type: 'card' | 'title' | 'label', id?: number) => {
    e.preventDefault(); e.stopPropagation();
    if (!editorContainerRef || !selectedImage?.layout) return;
    const rect = editorContainerRef.getBoundingClientRect();
    let elemX = 0, elemY = 0;
    if (type === 'card') { elemX = selectedImage.layout.card.x * rect.width; elemY = selectedImage.layout.card.y * rect.height; } 
    else if (type === 'title') { elemX = selectedImage.layout.mealType.x * rect.width; elemY = selectedImage.layout.mealType.y * rect.height; } 
    else if (type === 'label' && id !== undefined) {
        const l = selectedImage.layout.labels.find(item => item.id === id);
        if (l) { elemX = l.x * rect.width; elemY = l.y * rect.height; }
    }
    const mouseX = e.clientX - rect.left, mouseY = e.clientY - rect.top;
    setDragTarget({ type, id });
    setDragOffset({ x: mouseX - elemX, y: mouseY - elemY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragTarget || !selectedImage || !editorContainerRef || !dragOffset) return;
    const rect = editorContainerRef.getBoundingClientRect();
    const xPct = (e.clientX - rect.left - dragOffset.x) / rect.width;
    const yPct = (e.clientY - rect.top - dragOffset.y) / rect.height;
    setImages(prev => prev.map(img => {
      if (img.id !== selectedImage.id || !img.layout) return img;
      const newLayout = { ...img.layout };
      if (dragTarget.type === 'card') newLayout.card = { ...newLayout.card, x: xPct, y: yPct };
      else if (dragTarget.type === 'title') newLayout.mealType = { ...newLayout.mealType, x: xPct, y: yPct };
      else if (dragTarget.type === 'label' && dragTarget.id !== undefined) {
        newLayout.labels = newLayout.labels.map(l => l.id === dragTarget.id ? { ...l, x: xPct, y: yPct } : l);
      }
      return { ...img, layout: newLayout };
    }));
  };

  const handleScaleChange = (type: 'card' | 'title', value: number) => {
    if (!selectedImage?.layout) return;
    setImages(prev => prev.map(img => {
      if (img.id !== selectedImage.id || !img.layout) return img;
      const newLayout = { ...img.layout };
      if (type === 'card') newLayout.card = { ...newLayout.card, scale: value };
      else if (type === 'title') newLayout.mealType = { ...newLayout.mealType, scale: value };
      return { ...img, layout: newLayout };
    }));
  };
  
  const handleLabelScaleChange = (id: number, value: number) => {
    if (!selectedImage?.layout) return;
    setImages(prev => prev.map(img => {
      if (img.id !== selectedImage.id || !img.layout) return img;
      const newLayout = { ...img.layout };
      newLayout.labels = newLayout.labels.map(l => l.id === id ? { ...l, scale: value } : l);
      return { ...img, layout: newLayout };
    }));
  };

  const handleDeleteLabel = (id: number) => {
    if (!selectedImage?.layout) return;
    setImages(prev => prev.map(img => {
      if (img.id !== selectedImage.id || !img.layout) return img;
      const newLayout = { ...img.layout };
      newLayout.labels = newLayout.labels.filter(l => l.id !== id);
      return { ...img, layout: newLayout };
    }));
  };

  const handleTextEdit = (type: 'title' | 'label', id?: number) => {
    if (!selectedImage?.layout) return;
    let currentText = "";
    if (type === 'title') currentText = selectedImage.layout.mealType.text || "";
    if (type === 'label' && id !== undefined) { const l = selectedImage.layout.labels.find(l => l.id === id); if (l) currentText = l.text || ""; }
    const newText = prompt("Edit text:", currentText);
    if (newText !== null && newText !== currentText) {
       setImages(prev => prev.map(img => {
        if (img.id !== selectedImage.id || !img.layout) return img;
        const newLayout = { ...img.layout };
        if (type === 'title') newLayout.mealType = { ...newLayout.mealType, text: newText };
        else if (type === 'label' && id !== undefined) newLayout.labels = newLayout.labels.map(l => l.id === id ? { ...l, text: newText } : l);
        return { ...img, layout: newLayout };
      }));
    }
  };

  const handleDownload = async () => {
    if (!selectedImage || !selectedImage.layout || !selectedImage.analysis) return;
    const url = await renderFinalImage(selectedImage.previewUrl, selectedImage.analysis, selectedImage.layout);
    const date = new Date().toISOString().split('T')[0], safeTag = exportTag.trim().replace(/[\/\\:*?"<>|]/g, '') || "Style";
    const a = document.createElement('a'); a.href = url; a.download = `${date}-${safeTag}.jpg`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const getVisualScale = (userScale: number, type: 'title' | 'card' | 'label' = 'label') => {
    const baseScale = containerWidth / 1200;
    let correction = 0.5;
    if (type === 'title') correction = 0.075; 
    else if (type === 'card') correction = 0.125;
    return userScale * baseScale * correction;
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 font-sans flex flex-col h-screen overflow-hidden" onMouseUp={() => setDragTarget(null)} onMouseMove={handleMouseMove}>
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="bg-black p-2 rounded-lg text-white"><Utensils size={24} /></div>
          <h1 className="text-xl font-bold tracking-tight text-gray-900">AI Cal</h1>
        </div>
        <div className="flex items-center gap-4">
           {images.length > 0 && (
            <button onClick={processImages} disabled={isProcessing || !images.some(i => i.status === 'idle')} className={`flex items-center gap-2 px-5 py-2.5 rounded-full font-medium transition-all ${isProcessing || !images.some(i => i.status === 'idle') ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-black text-white hover:bg-gray-800 shadow-lg hover:shadow-xl'}`}>
              {isProcessing ? <Loader2 className="animate-spin" size={18} /> : <Camera size={18} />}
              {isProcessing ? 'Processing...' : 'Process Batch'}
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        <div className="w-1/3 min-w-[350px] max-w-[450px] bg-white border-r border-gray-200 flex flex-col z-10">
          <div className="p-6 shrink-0 space-y-3">
            <div {...getRootProps()} className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors ${isDragActive ? 'border-green-500 bg-green-50' : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'}`}>
              <input {...getInputProps()} />
              <div className="flex flex-col items-center gap-3">
                <div className="bg-gray-100 p-3 rounded-full"><Upload className="text-gray-500" size={24} /></div>
                <div><p className="font-semibold text-gray-700">Click or drag images here</p><p className="text-sm text-gray-500 mt-1">Supports JPG, PNG</p></div>
              </div>
            </div>
            <div className="flex gap-2">
                <button onClick={handleDriveImport} disabled={isDriveLoading} className="flex-1 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors shadow-sm">
                {isDriveLoading ? <Loader2 className="animate-spin" size={18} /> : <Cloud size={18} />}
                <span>Import from Google Drive</span>
                </button>
                <button onClick={() => setShowDriveSettings(true)} className="bg-white border border-gray-300 text-gray-500 hover:text-gray-700 hover:bg-gray-50 p-2.5 rounded-xl shadow-sm transition-colors"><Settings size={20} /></button>
            </div>
          </div>

          <div className="flex flex-col px-6 py-4 border-b border-gray-100 bg-gray-50/50 gap-3">
            <div className="flex justify-between items-center">
                <span className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Queue ({images.length})</span>
                <button onClick={toggleSelectAll} className="text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors" disabled={images.length === 0}>
                    {batchSelection.size === images.length && images.length > 0 ? 'Deselect All' : 'Select All'}
                </button>
            </div>
            {batchSelection.size > 0 && (
                <div className="flex flex-col gap-2 animate-in slide-in-from-top-2 duration-200">
                     <div className="flex items-center gap-2">
                        <Tag size={14} className="text-gray-400" />
                        <input type="text" value={exportTag} onChange={(e) => setExportTag(e.target.value)} className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:border-black focus:ring-1 focus:ring-black outline-none" placeholder="Style Tag" />
                     </div>
                     <button onClick={handleBatchSaveToDrive} disabled={isUploading} className="w-full flex items-center justify-center gap-2 bg-black text-white py-2 rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors shadow-sm">
                        {isUploading ? <Loader2 className="animate-spin" size={14}/> : <CloudUpload size={14} />}
                        Save {batchSelection.size} to Drive
                     </button>
                </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
            {images.length === 0 && <div className="h-full flex flex-col items-center justify-center text-gray-400 opacity-50"><ImageIcon size={48} className="mb-4" /><p>No images uploaded yet</p></div>}
            {images.map((img) => (
              <div key={img.id} onClick={() => setSelectedImageId(img.id)} className={`relative group flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${selectedImageId === img.id ? 'border-green-500 bg-green-50/30 ring-1 ring-green-500' : 'border-gray-200 hover:border-gray-300 bg-white'}`}>
                <div onClick={(e) => { e.stopPropagation(); toggleSelection(img.id); }} className="cursor-pointer text-gray-300 hover:text-black transition-colors">
                    {batchSelection.has(img.id) ? <CheckSquare size={20} className="text-black" /> : <Square size={20} />}
                </div>
                <div className="w-16 h-16 shrink-0 rounded-lg overflow-hidden bg-gray-100 relative">
                  <img src={img.previewUrl} alt="preview" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                    {img.status === 'analyzing' && <Loader2 className="animate-spin text-white" size={16} />}
                    {img.status === 'complete' && <CheckCircle2 className="text-green-400 bg-white rounded-full" size={16} />}
                    {img.status === 'error' && <AlertCircle className="text-red-400 bg-white rounded-full" size={16} />}
                    {img.status === 'not-food' && <X className="text-orange-400 bg-white rounded-full" size={16} />}
                  </div>
                  {img.driveFileId && <div className="absolute top-0 right-0 bg-blue-500 text-white p-0.5 rounded-bl-lg" title="Imported from Drive"><Cloud size={10} /></div>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{img.file.name}</p>
                  <p className={`text-xs mt-0.5 capitalize ${img.status === 'error' ? 'text-red-500 font-medium' : 'text-gray-500'}`}>{img.status.replace('-', ' ')}</p>
                </div>
                <button onClick={(e) => removeImage(e, img.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"><X size={16} /></button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 bg-gray-100 overflow-y-auto p-8 relative custom-scrollbar">
          <div className="absolute inset-0 pattern-grid opacity-[0.03] pointer-events-none fixed"></div>
          <div className="flex flex-col items-center min-h-full justify-center">
            {selectedImage ? (
              <div className="max-w-4xl w-full flex flex-col gap-6 pb-12">
                <div className="flex justify-center relative">
                  <div className="relative shadow-2xl rounded-lg overflow-hidden bg-white select-none inline-flex" style={{ maxWidth: '100%' }} >
                    <img src={selectedImage.previewUrl} alt="Original" className="block max-h-[60vh] object-contain w-auto h-auto pointer-events-none" ref={imgEl => { if(imgEl && imgEl.parentElement) setEditorContainerRef(imgEl.parentElement as HTMLDivElement); }} />
                    {selectedImage.status === 'complete' && selectedImage.layout && originalImageMeta && (
                      <div className="absolute inset-0 pointer-events-none">
                        <svg className="absolute inset-0 w-full h-full pointer-events-none z-0">
                          {selectedImage.layout.labels.map((l) => l.visible && <line key={l.id} x1={`${l.anchorX * 100}%`} y1={`${l.anchorY * 100}%`} x2={`${l.x * 100}%`} y2={`${l.y * 100}%`} stroke="rgba(255,255,255,0.8)" strokeWidth="2" />)}
                          {selectedImage.layout.labels.map((l) => <circle key={`dot-${l.id}`} cx={`${l.anchorX * 100}%`} cy={`${l.anchorY * 100}%`} r="4" fill="white" stroke="rgba(0,0,0,0.3)" strokeWidth="1" />)}
                        </svg>
                        {titleSprite && <div onMouseDown={(e) => handleDragStart(e, 'title')} onDoubleClick={() => handleTextEdit('title')} className="absolute z-20 cursor-move pointer-events-auto hover:brightness-95 transition-filter origin-top" style={{ left: `${selectedImage.layout.mealType.x * 100}%`, top: `${selectedImage.layout.mealType.y * 100}%`, transform: `translate(-50%, 0) scale(${getVisualScale(selectedImage.layout.mealType.scale, 'title')})` }}><img src={titleSprite} alt="Title" className="pointer-events-none" /></div>}
                        {cardSprite && <div onMouseDown={(e) => handleDragStart(e, 'card')} className="absolute z-10 cursor-move pointer-events-auto hover:brightness-95 transition-filter origin-top-left" style={{ left: `${selectedImage.layout.card.x * 100}%`, top: `${selectedImage.layout.card.y * 100}%`, transform: `scale(${getVisualScale(selectedImage.layout.card.scale, 'card')})` }}><img src={cardSprite} alt="Nutrition Card" className="pointer-events-none" /></div>}
                        {selectedImage.layout.labels.map((l) => labelSprites[l.id] && <div key={l.id} onMouseDown={(e) => handleDragStart(e, 'label', l.id)} onDoubleClick={() => handleTextEdit('label', l.id)} className="absolute z-20 cursor-move pointer-events-auto hover:brightness-95 transition-filter origin-center group" style={{ left: `${l.x * 100}%`, top: `${l.y * 100}%`, transform: `translate(-50%, -50%) scale(${getVisualScale(l.scale, 'label')})` }}><img src={labelSprites[l.id]} alt="Label" className="pointer-events-none" /><button className="absolute -top-3 -right-3 bg-red-500 text-white rounded-full p-1 shadow-md opacity-0 group-hover:opacity-100 transition-opacity hover:scale-110 pointer-events-auto" onMouseDown={(e) => { e.stopPropagation(); handleDeleteLabel(l.id); }}><X size={12} /></button></div>)}
                      </div>
                    )}
                    {selectedImage.status === 'analyzing' && <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 backdrop-blur-sm z-50"><Loader2 className="animate-spin text-white mb-2" size={48} /><p className="text-white font-medium">Analysing food...</p></div>}
                  </div>
                </div>

                {selectedImage.status === 'complete' && selectedImage.layout && (
                  <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                    <div className="flex items-center gap-2 mb-3 text-gray-500"><SlidersHorizontal size={16} /><h4 className="text-xs font-semibold uppercase tracking-wider">Editor Controls</h4></div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                      <div className="space-y-6">
                          <h5 className="font-medium text-sm text-gray-900 border-b pb-2">Main Elements</h5>
                          <div className="flex flex-col gap-1">
                              <div className="flex justify-between text-xs font-medium text-gray-600"><span>Meal Title Size</span><span>{Math.round(selectedImage.layout.mealType.scale * 100)}%</span></div>
                              <input type="range" min="0" max="20" step="0.1" value={selectedImage.layout.mealType.scale} onChange={(e) => handleScaleChange('title', parseFloat(e.target.value))} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-black" />
                          </div>
                          <div className="flex flex-col gap-1">
                              <div className="flex justify-between text-xs font-medium text-gray-600"><span>Nutrition Card Size</span><span>{Math.round(selectedImage.layout.card.scale * 100)}%</span></div>
                              <input type="range" min="0" max="20" step="0.1" value={selectedImage.layout.card.scale} onChange={(e) => handleScaleChange('card', parseFloat(e.target.value))} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-black" />
                          </div>
                      </div>
                      <div>
                          <h5 className="font-medium text-sm text-gray-900 border-b pb-2 mb-4">Detected Food Labels</h5>
                          <div className="space-y-3 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                              {selectedImage.layout.labels.map(label => (
                                  <div key={label.id} className="flex items-center gap-3 bg-gray-50 p-2 rounded-lg border border-gray-100 hover:border-gray-300 transition-colors">
                                      <span className="text-sm font-medium w-32 truncate text-gray-700 cursor-help" title={label.text}>{label.text}</span>
                                      <div className="flex-1 flex flex-col justify-center"><input type="range" min="0" max="20" step="0.1" value={label.scale} onChange={(e) => handleLabelScaleChange(label.id, parseFloat(e.target.value))} className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600" /></div>
                                      <button onClick={() => handleDeleteLabel(label.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-all"><Trash2 size={16} /></button>
                                  </div>
                              ))}
                          </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                  <div>
                    <h3 className="font-semibold text-gray-900">{selectedImage.analysis?.summary || selectedImage.file.name}</h3>
                    {selectedImage.analysis && <p className="text-sm text-gray-500">{selectedImage.analysis.items.length} items detected • {selectedImage.analysis.nutrition.calories} kcal</p>}
                  </div>
                  {selectedImage.status === 'complete' && (
                    <div className="flex items-end gap-3">
                        <div className="flex flex-col items-end">
                             <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 flex items-center gap-1"><Tag size={10} /> Filename Tag</label>
                             <input type="text" value={exportTag} onChange={(e) => setExportTag(e.target.value)} className="w-32 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 focus:bg-white focus:border-black focus:ring-1 focus:ring-black outline-none transition-all text-right" placeholder="e.g. Food" />
                        </div>
                        <button onClick={handleSaveToDrive} disabled={isUploading} className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-200 shadow-sm transition-all ${isUploading ? 'bg-gray-100 text-gray-400' : 'bg-white hover:bg-gray-50 text-gray-700'}`} title="Save to Google Drive">{isUploading ? <Loader2 className="animate-spin" size={18} /> : <CloudUpload size={18} />}</button>
                        <button onClick={handleDownload} className="flex items-center gap-2 bg-black text-white px-5 py-2.5 rounded-lg hover:bg-gray-800 transition-colors shadow-sm"><Download size={18} /> Download</button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center text-gray-400"><div className="bg-white p-6 rounded-full inline-block shadow-sm mb-4"><ImageIcon size={48} className="text-gray-300" /></div><h3 className="text-lg font-medium text-gray-600">Select an image to preview</h3><p className="text-sm text-gray-400 mt-2">Processed images will appear here</p></div>
            )}
          </div>
        </div>
      </main>

      {showDriveSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6"><h2 className="text-xl font-bold text-gray-900 flex items-center gap-2"><Settings size={24} className="text-gray-500" />Settings</h2><button onClick={() => setShowDriveSettings(false)} className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100 transition-colors"><X size={20} /></button></div>
            <div className="space-y-6">
                <div className="space-y-3 pt-2">
                     <h3 className="text-sm font-semibold text-gray-900 border-b pb-2 flex items-center gap-2"><Cloud size={16} className="text-blue-600"/>Google Drive Integration</h3>
                     <div className="flex items-center justify-between p-3 bg-orange-50 border border-orange-100 rounded-lg">
                        <div className="flex items-center gap-2 text-orange-800 text-xs font-medium"><Trash size={14} /> <span>Delete original from Drive after saving</span></div>
                        <input type="checkbox" checked={deleteAfterSave} onChange={(e) => setDeleteAfterSave(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500" />
                     </div>
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">OAuth 2.0 Client ID</label><input type="text" value={googleClientId} onChange={(e) => setGoogleClientId(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-mono" /></div>
                    <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                        <label className="block text-xs font-semibold text-gray-500 uppercase mb-2">Authorized Origin</label>
                        <div className="flex gap-2"><div className="flex-1 bg-white border border-gray-200 px-3 py-2 rounded text-sm font-mono truncate text-gray-600">{window.location.origin}</div><button onClick={copyOrigin} className="bg-white border border-gray-200 hover:bg-gray-50 text-gray-600 px-3 rounded flex items-center justify-center transition-colors">{copied ? <Check size={16} className="text-green-500"/> : <Copy size={16}/>}</button></div>
                    </div>
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Google Picker API Key</label><input type="password" value={googleApiKey} onChange={(e) => setGoogleApiKey(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-mono" /></div>
                </div>
            </div>
            <div className="mt-8 flex justify-end"><button onClick={saveSettings} className="bg-black text-white px-5 py-2 rounded-lg hover:bg-gray-800 transition-colors font-medium">Save & Close</button></div>
          </div>
        </div>
      )}
      <style>{`.pattern-grid { background-image: radial-gradient(#000 1px, transparent 1px); background-size: 20px 20px; }`}</style>
    </div>
  );
}

export default App;
