
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
import { LabelStyle, CollageTransform } from './types';
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
  const [geminiApiKey, setGeminiApiKey] = useState(process.env.API_KEY || "");
  const [geminiApiUrl, setGeminiApiUrl] = useState("");
  const [defaultLabelStyle, setDefaultLabelStyle] = useState<LabelStyle>('default');
  const [defaultTitleScale, setDefaultTitleScale] = useState(7.6);
  const [defaultCardScale, setDefaultCardScale] = useState(4.2);
  const [defaultLabelScale, setDefaultLabelScale] = useState(1.0);
  const [defaultCardX, setDefaultCardX] = useState(0.05);
  const [defaultCardY, setDefaultCardY] = useState(0.85);
  const [defaultTitleY, setDefaultTitleY] = useState(0.08);
  const [deleteAfterSave, setDeleteAfterSave] = useState(false);
  const [autoCrop, setAutoCrop] = useState(false);

  // App Mode State
  const [appMode, setAppMode] = useState<'scan' | 'collage'>('scan');
  const [showCollageCreator, setShowCollageCreator] = useState(false);
  const [isCreatingCollage, setIsCreatingCollage] = useState(false);

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
    const storedLabelStyle = localStorage.getItem('aical_default_label_style');
    const storedTitleScale = localStorage.getItem('aical_default_title_scale');
    const storedCardScale = localStorage.getItem('aical_default_card_scale');
    const storedLabelScale = localStorage.getItem('aical_default_label_scale');
    const storedCardX = localStorage.getItem('aical_default_card_x');
    const storedCardY = localStorage.getItem('aical_default_card_y');
    const storedTitleY = localStorage.getItem('aical_default_title_y');

    if (storedDeleteOption) setDeleteAfterSave(storedDeleteOption === 'true');
    if (storedGeminiKey) setGeminiApiKey(storedGeminiKey);
    if (storedGeminiUrl) setGeminiApiUrl(storedGeminiUrl);

    if (storedLabelStyle) setDefaultLabelStyle(storedLabelStyle as LabelStyle);
    if (storedTitleScale) setDefaultTitleScale(parseFloat(storedTitleScale));
    if (storedCardScale) setDefaultCardScale(parseFloat(storedCardScale));
    if (storedLabelScale) setDefaultLabelScale(parseFloat(storedLabelScale));
    if (storedCardX) setDefaultCardX(parseFloat(storedCardX));
    if (storedCardY) setDefaultCardY(parseFloat(storedCardY));
    if (storedTitleY) setDefaultTitleY(parseFloat(storedTitleY));
  }, []);

  const saveConfig = () => {
    localStorage.setItem('aical_delete_after_save', String(deleteAfterSave));
    localStorage.setItem('aical_gemini_api_key', geminiApiKey);
    localStorage.setItem('aical_gemini_api_url', geminiApiUrl);
    localStorage.setItem('aical_default_label_style', defaultLabelStyle);
    localStorage.setItem('aical_default_title_scale', String(defaultTitleScale));
    localStorage.setItem('aical_default_card_scale', String(defaultCardScale));
    localStorage.setItem('aical_default_label_scale', String(defaultLabelScale));
    localStorage.setItem('aical_default_card_x', String(defaultCardX));
    localStorage.setItem('aical_default_card_y', String(defaultCardY));
    localStorage.setItem('aical_default_title_y', String(defaultTitleY));
  };

  useEffect(() => { saveConfig(); }, [deleteAfterSave, geminiApiKey, geminiApiUrl, defaultLabelStyle, defaultTitleScale, defaultCardScale, defaultLabelScale, defaultCardX, defaultCardY, defaultTitleY]);

  const handleProcess = () => {
    processPendingImages({
      geminiApiKey,
      geminiApiUrl,
      autoCrop,
      defaultLabelStyle,
      defaultTitleScale,
      defaultCardScale,
      defaultLabelScale,
      defaultCardX,
      defaultCardY,
      defaultTitleY
    });
  };

  const handleDriveImport = () => {
    drive.openPicker((newImages) => {
      addProcessedImages(newImages);
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
        const url = await renderFinalImage(selectedImage.previewUrl, selectedImage.analysis!, selectedImage.layout!);
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

  const handleDownload = async () => {
    if (!selectedImage || !selectedImage.layout || !selectedImage.analysis) return;
    const url = await renderFinalImage(selectedImage.previewUrl, selectedImage.analysis, selectedImage.layout);
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
        />

        {selectedImage ? (
          <CanvasEditor
            image={selectedImage}
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

        defaultLabelStyle={defaultLabelStyle}
        onUpdateLabelStyle={setDefaultLabelStyle}

        defaultTitleScale={defaultTitleScale}
        onUpdateTitleScale={setDefaultTitleScale}
        defaultCardScale={defaultCardScale}
        onUpdateCardScale={setDefaultCardScale}
        defaultLabelScale={defaultLabelScale}
        onUpdateLabelScale={setDefaultLabelScale}
        defaultCardX={defaultCardX}
        onUpdateCardX={setDefaultCardX}
        defaultCardY={defaultCardY}
        onUpdateCardY={setDefaultCardY}
        defaultTitleY={defaultTitleY}
        onUpdateTitleY={setDefaultTitleY}

        deleteAfterSave={deleteAfterSave}
        onUpdateDeleteAfterSave={setDeleteAfterSave}
      />
    </div>
  );
}

export default App;