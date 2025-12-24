
import React, { useState, useEffect } from 'react';
import { useAuth } from './hooks/useAuth';
import { useGoogleDrive } from './hooks/useGoogleDrive';
import { useImageManager } from './hooks/useImageManager';
import { AuthScreen } from './components/AuthScreen';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { CanvasEditor } from './components/CanvasEditor';
import { SettingsDialog } from './components/SettingsDialog';
import { CollageCreator } from './components/CollageCreator';
import { LabelStyle, CollageTransform, AppMode, ModeConfig } from './types';
import { renderFinalImage, createCollage } from './utils/canvasUtils';

const dataURLtoBlob = (dataurl: string) => {
  const arr = dataurl.split(',');
  const mime = arr[0].match(/:(.*?);/)![1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
};

function App() {
  const { isAuthenticated, login, authError, setAuthError } = useAuth();
  const drive = useGoogleDrive();

  // App Configuration State
  // App Configuration State
  const [geminiApiKey, setGeminiApiKey] = useState(process.env.API_KEY || "");
  const [geminiApiUrl, setGeminiApiUrl] = useState("");
  const [deleteAfterSave, setDeleteAfterSave] = useState(false);
  const [autoCrop, setAutoCrop] = useState(false);

  // App Mode State
  const [appMode, setAppMode] = useState<AppMode>('scan');
  const [showCollageCreator, setShowCollageCreator] = useState(false);
  const [isCreatingCollage, setIsCreatingCollage] = useState(false);

  // Default Config Base
  const DEFAULT_CONFIG: ModeConfig = {
    defaultLabelStyle: 'default',
    defaultTitleScale: 7.6,
    defaultCardScale: 4.2,
    defaultLabelScale: 1.0,
    defaultCardX: 0.05,
    defaultCardY: 0.85,
    defaultTitleY: 0.08,
  };

  // Mode Configuration State
  const [modeConfigs, setModeConfigs] = useState<Record<AppMode, ModeConfig>>({
    scan: { ...DEFAULT_CONFIG },
    collage: { ...DEFAULT_CONFIG },
    nutrition: { ...DEFAULT_CONFIG, defaultLabelStyle: 'pill', defaultCardScale: 1.0, defaultCardY: 0.8, cardBackgroundColor: '#000000', cardTextColor: '#FFFFFF' }
  });

  // UI State
  const [showDriveSettings, setShowDriveSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  // We pass config to imageManager if it needs it, or just use it in the process function
  const imageManager = useImageManager();

  const {
    images, selectedImageId, addImages, addProcessedImages,
    processPendingImages,
    removeImage, setSelectedImageId, updateImageLayout, updateImageText
  } = imageManager;

  // Filter images based on active mode
  const filteredImages = images.filter(img =>
    // Legacy images (no sourceMode) are treated as 'scan'
    (img.sourceMode || 'scan') === appMode
  );

  const selectedImage = filteredImages.find(img => img.id === selectedImageId);

  // Load Defaults
  useEffect(() => {
    const storedDeleteOption = localStorage.getItem('aical_delete_after_save');
    const storedGeminiKey = localStorage.getItem('aical_gemini_api_key');
    const storedGeminiUrl = localStorage.getItem('aical_gemini_api_url');

    if (storedDeleteOption) setDeleteAfterSave(storedDeleteOption === 'true');
    if (storedGeminiKey) setGeminiApiKey(storedGeminiKey);
    if (storedGeminiUrl) setGeminiApiUrl(storedGeminiUrl);

    // Load Mode Configs
    const modes: AppMode[] = ['scan', 'collage', 'nutrition'];
    const newConfigs = { ...modeConfigs };
    let hasLoaded = false;

    modes.forEach(mode => {
      const stored = localStorage.getItem(`aical_config_${mode}`);
      if (stored) {
        try {
          newConfigs[mode] = { ...newConfigs[mode], ...JSON.parse(stored) };
          hasLoaded = true;
        } catch (e) { console.error("Failed to parse config for", mode, e); }
      }
    });

    // Migration for legacy single-mode users (treat as 'scan' defaults if no specific scan config found)
    if (!localStorage.getItem('aical_config_scan')) {
      const storedLabelStyle = localStorage.getItem('aical_default_label_style');
      if (storedLabelStyle) {
        newConfigs.scan.defaultLabelStyle = storedLabelStyle as LabelStyle;
        // We could migrate others but let's assume if one exists, others might. 
        // Simplification: Just load what we find into scan.
        const sTitleScale = localStorage.getItem('aical_default_title_scale');
        if (sTitleScale) newConfigs.scan.defaultTitleScale = parseFloat(sTitleScale);
        // ... etc ... for migration completeness or just skip. User can re-set.
        // Given the instructions, isolation is key. Let's restart with defaults or migrated values.
        // Prioritize clean separation.
        hasLoaded = true;
      }
    }

    if (hasLoaded) setModeConfigs(newConfigs);

  }, []);

  const saveConfig = () => {
    localStorage.setItem('aical_delete_after_save', String(deleteAfterSave));
    localStorage.setItem('aical_gemini_api_key', geminiApiKey);
    localStorage.setItem('aical_gemini_api_url', geminiApiUrl);

    // Save per mode
    (Object.keys(modeConfigs) as AppMode[]).forEach(mode => {
      localStorage.setItem(`aical_config_${mode}`, JSON.stringify(modeConfigs[mode]));
    });
  };

  useEffect(() => { saveConfig(); }, [deleteAfterSave, geminiApiKey, geminiApiUrl, modeConfigs]);

  const handleProcess = () => {
    processPendingImages({
      geminiApiKey,
      geminiApiUrl,
      autoCrop,
      ...modeConfigs[appMode]
    });
  };

  const handleDriveImport = () => {
    drive.openPicker((newImages) => {
      const imagesWithMode = newImages.map(img => ({ ...img, sourceMode: appMode }));
      addProcessedImages(imagesWithMode);
    });
  };

  const handleCreateCollage = async (collages: { files: (File | null)[], transforms: CollageTransform[], padding: number }[]) => {
    setIsCreatingCollage(true);
    // Allow UI to update
    await new Promise(r => setTimeout(r, 100));

    try {
      const newCollageFiles: File[] = [];

      // Process chunks sequentially to avoid memory spikes
      for (const collage of collages) {
        const collageFile = await createCollage(collage.files, collage.transforms, collage.padding);
        newCollageFiles.push(collageFile);
      }

      // 2. Add them to our images list (mark as collage)
      addImages(newCollageFiles, 'collage');

      // 3. Switch back to view it (we stay in collage mode now)
      // setAppMode('scan'); 
      setShowCollageCreator(false);
    } catch (e) {
      console.error("Failed to create collage", e);
      alert("Failed to create collage.");
    } finally {
      setIsCreatingCollage(false);
    }
  };

  const handleCollageDrivePicker = (callback: (files: File[]) => void) => {
    drive.openPicker((newImages) => {
      const files = newImages.map(img => img.file);
      callback(files);
    });
  };

  const handleSaveToDrive = () => {
    if (!selectedImage || !selectedImage.layout || !selectedImage.analysis) return;

    drive.openFolderPicker(async (folderId, token) => {
      drive.setIsUploading(true);
      try {
        const url = await renderFinalImage(selectedImage.previewUrl, selectedImage.analysis!, selectedImage.layout!, appMode);
        const blob = dataURLtoBlob(url);
        const date = new Date().toISOString().split('T')[0];
        const safeName = selectedImage.file.name.replace(/\.[^/.]+$/, "").replace(/[^a-z0-9]/gi, '_');
        const fileName = `${date}-Food-${safeName}.jpg`;
        const metadata = { name: fileName, mimeType: 'image/jpeg', parents: [folderId] };

        await drive.uploadFile(blob, metadata, token);

        let msg = `✅ Saved to Google Drive!\nFile: ${fileName}`;
        if (deleteAfterSave && selectedImage.driveFileId) {
          const result = await drive.deleteFile(selectedImage.driveFileId, token);
          if (result.success) {
            msg += '\n🗑️ Original file moved to Trash.';
          } else {
            msg += `\n⚠️ Could not delete original: ${result.error}`;
          }
        }
        alert(msg);
      } catch (e: any) { alert("Upload failed: " + e.message); }
      finally { drive.setIsUploading(false); }
    });
  };

  const handleBatchSaveToDrive = () => {
    const selectedIds = Array.from(imageManager.batchSelection);
    const imagesToSave = images.filter(img => selectedIds.includes(img.id));
    const validImages = imagesToSave.filter(img => img.status === 'complete' && img.analysis && img.layout);

    if (validImages.length === 0) {
      alert("No valid completed images selected to save.");
      return;
    }

    if (validImages.length < selectedIds.length) {
      if (!confirm(`Only ${validImages.length} of ${selectedIds.length} selected images are fully processed. Continue saving valid images?`)) {
        return;
      }
    }

    drive.openFolderPicker(async (folderId, token) => {
      drive.setIsUploading(true);
      let successCount = 0;
      let errorCount = 0;

      try {
        for (const img of validImages) {
          try {
            // Note: Batch save uses the CURRENT appMode for all images in the batch.
            // If images were processed in different modes, this might be tricky, 
            // but the UX implies we are in a specific mode view.
            // Ideally, we should check img.sourceMode if we want to respect individual image origins.
            // However, the user asked for "Nutrition Mode" so let's enforce current appMode OR fallback to img.sourceMode if it exists and matches known types.
            // Let's use img.sourceMode if available, else appMode.
            const renderMode = (img.sourceMode === 'nutrition' || img.sourceMode === 'collage') ? img.sourceMode : 'scan';

            const url = await renderFinalImage(img.previewUrl, img.analysis!, img.layout!, renderMode);
            const blob = dataURLtoBlob(url);
            const date = new Date().toISOString().split('T')[0];
            const safeName = img.file.name.replace(/\.[^/.]+$/, "").replace(/[^a-z0-9]/gi, '_');
            const fileName = `${date}-Food-${safeName}.jpg`;
            const metadata = { name: fileName, mimeType: 'image/jpeg', parents: [folderId] };

            await drive.uploadFile(blob, metadata, token);
            successCount++;

            if (deleteAfterSave && img.driveFileId) {
              await drive.deleteFile(img.driveFileId, token);
            }
          } catch (e) {
            console.error(`Failed to save image ${img.file.name}:`, e);
            errorCount++;
          }
        }

        alert(`Batch Save Complete!\n✅ Saved: ${successCount}\n❌ Failed: ${errorCount}`);
      } catch (e: any) {
        alert("Batch upload failed process: " + e.message);
      } finally {
        drive.setIsUploading(false);
      }
    });
  };

  const handleCollageSaveToDrive = (file: File) => {
    drive.openFolderPicker(async (folderId, token) => {
      drive.setIsUploading(true);
      try {
        const metadata = { name: file.name, mimeType: file.type, parents: [folderId] };
        await drive.uploadFile(file, metadata, token);
        alert(`✅ Saved collage to Drive!\nFile: ${file.name}`);
      } catch (e: any) {
        alert("Upload failed: " + e.message);
      } finally {
        drive.setIsUploading(false);
      }
    });
  };

  const handleDownload = async () => {
    if (!selectedImage || !selectedImage.layout || !selectedImage.analysis) return;
    const url = await renderFinalImage(selectedImage.previewUrl, selectedImage.analysis, selectedImage.layout, appMode);
    const date = new Date().toISOString().split('T')[0];
    const a = document.createElement('a'); a.href = url; a.download = `${date}-Food.jpg`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  if (!isAuthenticated) {
    return <AuthScreen onLogin={login} authError={authError} setAuthError={setAuthError} />;
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 font-sans flex flex-col h-screen overflow-hidden">
      <Header
        images={filteredImages}
        isProcessing={imageManager.isProcessing}
        onProcess={handleProcess}
        appMode={appMode}
        setAppMode={setAppMode}
        onNewCollage={() => setShowCollageCreator(true)}
      />

      <main className="flex-1 flex overflow-hidden">
        <Sidebar
          images={filteredImages}
          onDrop={(files) => addImages(files, appMode)}
          onDriveImport={handleDriveImport}
          isDriveLoading={drive.isLoading}
          onOpenSettings={() => setShowDriveSettings(true)}
          onOpenHelp={() => setShowHelp(true)}
          autoCrop={autoCrop}
          setAutoCrop={setAutoCrop}
          batchSelection={imageManager.batchSelection}
          onToggleSelectAll={imageManager.toggleSelectAll}
          onToggleSelection={imageManager.toggleSelection}
          selectedImageId={selectedImageId}
          onSelectImage={setSelectedImageId}
          onRemoveImage={(e, id) => { e.stopPropagation(); removeImage(id); }}
          onBatchSaveToDrive={handleBatchSaveToDrive}
        />

        {selectedImage ? (
          <CanvasEditor
            image={selectedImage}
            appMode={appMode}
            onUpdateLayout={updateImageLayout}
            onTextEdit={updateImageText}
            onDownload={handleDownload}
            onSave={handleSaveToDrive}
          />
        ) : (
          <div className="flex-1 bg-gray-100 flex items-center justify-center text-gray-400">
            <p>Select an image to edit</p>
          </div>
        )}
      </main>

      {/* Collage Mode Overlay */}
      {showCollageCreator && (
        <div className="fixed inset-0 z-20 bg-white">
          <CollageCreator
            onCreateCollage={handleCreateCollage}
            onCancel={() => setShowCollageCreator(false)}
            isProcessing={isCreatingCollage}
            onPickFromDrive={handleCollageDrivePicker}
            isDriveLoading={drive.isLoading}
            onSaveToDrive={handleCollageSaveToDrive}
          /></div>
      )}

      {/* Settings Dialog */}
      <SettingsDialog
        isOpen={showDriveSettings}
        onClose={() => setShowDriveSettings(false)}
        googleClientId={drive.clientId}
        googleApiKey={drive.apiKey}
        onUpdateDriveSettings={drive.updateSettings}
        geminiApiKey={geminiApiKey}
        geminiApiUrl={geminiApiUrl}
        onUpdateGeminiSettings={(k, u) => { setGeminiApiKey(k); setGeminiApiUrl(u); }}

        modeConfigs={modeConfigs}
        onUpdateModeConfig={(mode, config) => setModeConfigs(prev => ({ ...prev, [mode]: config }))}

        deleteAfterSave={deleteAfterSave}
        onUpdateDeleteAfterSave={setDeleteAfterSave}
      />
    </div>
  );
}

export default App;