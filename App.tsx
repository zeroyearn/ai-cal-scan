
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { Camera, Upload, Utensils, Download, X, AlertCircle, CheckCircle2, Loader2, Image as ImageIcon, Move, Pencil, SlidersHorizontal, Trash2, Cloud, Settings, Info, Copy, Check, Key, Tag, CloudUpload, Square, CheckSquare, Sparkles, Globe, Trash, Type as TypeIcon, AlertTriangle, Link as LinkIcon, Palette, RotateCcw, BookOpen, Crop, LayoutTemplate, Plus, Eye, EyeOff, Smartphone, LayoutGrid, Zap, ListOrdered } from 'lucide-react';
import { ProcessedImage, ImageLayout, ElementState, LabelStyle, HitRegion, FoodAnalysis } from './types';
import { analyzeFoodImage, generateViralCaption } from './services/geminiService';
import { resizeImage, getInitialLayout, drawScene, renderFinalImage, generateCollage } from './utils/canvasUtils';

// --- Google Drive Configuration ---
const DEFAULT_GOOGLE_CLIENT_ID = "959444237240-lca07hnf1qclkj3o93o1k3kuo65bkqr7.apps.googleusercontent.com"; 
const DEFAULT_API_KEY = process.env.API_KEY || ""; 
const GOOGLE_SCOPES = 'https://www.googleapis.com/auth/drive';

// --- Viral Formulas ---
const VIRAL_FORMULAS = [
  { step: 1, title: "Hook (FOMO)", formula: "如果你真的想在 [明年/下个月/具体日期] 彻底改变你的 [痛点]，现在立刻开始做这几件事！！" },
  { step: 2, title: "Low Barrier Start", formula: "1. 先从 [低门槛动作] 开始。不要试图 [极端行为]，否则你坚持不了三天。慢就是快。" },
  { step: 3, title: "Micro Habit", formula: "2. 每次 [主要动作] 后，必须加上 [额外的微小努力，如15分钟复盘/走路]。这是拉开差距的关键。" },
  { step: 4, title: "Hard Rules", formula: "3. 修正你的 [核心输入]。黄金法则：[数字] + [数字] + 绝对禁止 [坏习惯]。这是底线。" },
  { step: 5, title: "Tool/Resource", formula: "4. 没有数据就是在那瞎忙！我用 [APP名称/工具] 来追踪 [核心指标]。这一步不可或缺。" },
  { step: 6, title: "CTA / Hack", formula: "小技巧：当你想 [放弃/犯错] 时，就去 [做一个打断动作，如刷牙]。这会给大脑发送信号：结束了。// 关注我，每天一点狠货。" }
];

// --- Mock Data ---
const MOCK_ANALYSIS: FoodAnalysis = {
  isFood: true,
  hasExistingText: false,
  mealType: "Lunch",
  summary: "Avocado Toast",
  healthScore: 8,
  healthTag: "Heart Healthy Fats",
  items: [
    { name: "Avocado", box_2d: [400, 300, 600, 700] } 
  ],
  nutrition: {
    calories: 450,
    carbs: "45g",
    protein: "12g",
    fat: "22g"
  }
};

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
  // --- Authentication State ---
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return localStorage.getItem('aical_is_authenticated') === 'true';
  });
  const [passwordInput, setPasswordInput] = useState("");
  const [authError, setAuthError] = useState(false);

  // --- App Mode ---
  const [mode, setMode] = useState<'food' | 'viral'>('food');

  const [images, setImages] = useState<ProcessedImage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [batchSelection, setBatchSelection] = useState<Set<string>>(new Set());
  const [exportTag, setExportTag] = useState("Food");
  const [deleteAfterSave, setDeleteAfterSave] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [autoCrop, setAutoCrop] = useState(false);

  // Collage State
  const [showCollageModal, setShowCollageModal] = useState(false);
  const [collagePreviewUrl, setCollagePreviewUrl] = useState<string | null>(null);
  const [collageConfig, setCollageConfig] = useState({
      width: 2160,
      height: 2160,
      padding: 40,
      color: '#ffffff'
  });
  const [isGeneratingCollage, setIsGeneratingCollage] = useState(false);

  // Gemini Settings
  const [geminiApiKey, setGeminiApiKey] = useState(process.env.API_KEY || "");
  const [geminiApiUrl, setGeminiApiUrl] = useState("");

  // Appearance Defaults
  const [defaultLabelStyle, setDefaultLabelStyle] = useState<LabelStyle>('default');
  const [defaultTitleScale, setDefaultTitleScale] = useState(7.6);
  const [defaultCardScale, setDefaultCardScale] = useState(4.2);
  const [defaultLabelScale, setDefaultLabelScale] = useState(1.0);
  
  const [defaultTitlePos, setDefaultTitlePos] = useState({ x: 50, y: 8 });
  const [defaultCardPos, setDefaultCardPos] = useState({ x: 5, y: 75 }); 

  const [editorContainerRef, setEditorContainerRef] = useState<HTMLDivElement | null>(null);
  const [dragTarget, setDragTarget] = useState<{ type: 'card' | 'title' | 'label' | 'caption', id?: number | string } | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number, y: number } | null>(null);
  const [originalImageMeta, setOriginalImageMeta] = useState<{w: number, h: number} | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(1000);

  // Canvas & Interaction
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const settingsCanvasRef = useRef<HTMLCanvasElement>(null);
  const [hitRegions, setHitRegions] = useState<HitRegion[]>([]);

  const [isDriveLoading, setIsDriveLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showDriveSettings, setShowDriveSettings] = useState(false);
  const [googleClientId, setGoogleClientId] = useState(DEFAULT_GOOGLE_CLIENT_ID);
  const [googleApiKey, setGoogleApiKey] = useState(DEFAULT_API_KEY);
  const [copied, setCopied] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  
  const [forceAuthPrompt, setForceAuthPrompt] = useState(false);
  
  const tokenClientRef = useRef<any>(null);
  const onAuthSuccessRef = useRef<((token: string) => void) | null>(null);
  
  useEffect(() => {
    const storedId = localStorage.getItem('aical_google_client_id');
    const storedKey = localStorage.getItem('aical_google_api_key');
    const storedDeleteOption = localStorage.getItem('aical_delete_after_save');
    const storedGeminiKey = localStorage.getItem('aical_gemini_api_key');
    const storedGeminiUrl = localStorage.getItem('aical_gemini_api_url');
    
    const storedLabelStyle = localStorage.getItem('aical_default_label_style');
    const storedTitleScale = localStorage.getItem('aical_default_title_scale');
    const storedCardScale = localStorage.getItem('aical_default_card_scale');
    const storedLabelScale = localStorage.getItem('aical_default_label_scale');
    
    const storedTitlePos = localStorage.getItem('aical_default_title_pos');
    const storedCardPos = localStorage.getItem('aical_default_card_pos');

    if (storedId) setGoogleClientId(storedId);
    if (storedKey) setGoogleApiKey(storedKey);
    if (storedDeleteOption) setDeleteAfterSave(storedDeleteOption === 'true');
    if (storedGeminiKey) setGeminiApiKey(storedGeminiKey);
    if (storedGeminiUrl) setGeminiApiUrl(storedGeminiUrl);

    if (storedLabelStyle) setDefaultLabelStyle(storedLabelStyle as LabelStyle);
    if (storedTitleScale) setDefaultTitleScale(parseFloat(storedTitleScale));
    if (storedCardScale) setDefaultCardScale(parseFloat(storedCardScale));
    if (storedLabelScale) setDefaultLabelScale(parseFloat(storedLabelScale));
    
    if (storedTitlePos) setDefaultTitlePos(JSON.parse(storedTitlePos));
    if (storedCardPos) setDefaultCardPos(JSON.parse(storedCardPos));
  }, []);

  useEffect(() => {
    if (!showDriveSettings || !settingsCanvasRef.current) return;
    
    const ctx = settingsCanvasRef.current.getContext('2d');
    if (!ctx) return;

    const w = 360; 
    const h = 640;
    settingsCanvasRef.current.width = w;
    settingsCanvasRef.current.height = h;

    ctx.fillStyle = '#f3f4f6';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    for(let i=0; i<w; i+=40) { ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i,h); ctx.stroke(); }
    for(let i=0; i<h; i+=40) { ctx.beginPath(); ctx.moveTo(0,i); ctx.lineTo(w,i); ctx.stroke(); }
    
    ctx.beginPath();
    ctx.arc(w/2, h/2, 80, 0, Math.PI * 2);
    ctx.fillStyle = '#d1d5db';
    ctx.fill();
    ctx.font = "bold 14px Inter";
    ctx.fillStyle = "#6b7280";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Sample Image", w/2, h/2);

    const config = {
        defaultLabelStyle,
        defaultTitleScale,
        defaultCardScale,
        defaultLabelScale,
        defaultTitlePos,
        defaultCardPos
    };

    const layout = getInitialLayout(w, h, MOCK_ANALYSIS, config);
    drawScene(ctx, null, MOCK_ANALYSIS, layout);

  }, [
    showDriveSettings, 
    defaultLabelStyle, 
    defaultTitleScale, 
    defaultCardScale, 
    defaultLabelScale, 
    defaultTitlePos, 
    defaultCardPos
  ]);

  useEffect(() => {
    if (!showCollageModal || batchSelection.size !== 4) return;
    
    const run = async () => {
        setIsGeneratingCollage(true);
        try {
            const selectedIds = Array.from(batchSelection);
            const selectedImgs = images.filter(img => selectedIds.includes(img.id));
            const urls = selectedImgs.map(img => img.previewUrl);
            
            if (urls.length === 4) {
                const url = await generateCollage(urls, collageConfig);
                setCollagePreviewUrl(url);
            }
        } catch (e) {
            console.error("Collage gen error", e);
        } finally {
            setIsGeneratingCollage(false);
        }
    };
    
    const timeout = setTimeout(run, 500); 
    return () => clearTimeout(timeout);

  }, [showCollageModal, collageConfig, batchSelection, images]);


  const saveSettings = () => {
    localStorage.setItem('aical_google_client_id', googleClientId);
    localStorage.setItem('aical_google_api_key', googleApiKey);
    localStorage.setItem('aical_delete_after_save', String(deleteAfterSave));
    localStorage.setItem('aical_gemini_api_key', geminiApiKey);
    localStorage.setItem('aical_gemini_api_url', geminiApiUrl);

    localStorage.setItem('aical_default_label_style', defaultLabelStyle);
    localStorage.setItem('aical_default_title_scale', String(defaultTitleScale));
    localStorage.setItem('aical_default_card_scale', String(defaultCardScale));
    localStorage.setItem('aical_default_label_scale', String(defaultLabelScale));
    
    localStorage.setItem('aical_default_title_pos', JSON.stringify(defaultTitlePos));
    localStorage.setItem('aical_default_card_pos', JSON.stringify(defaultCardPos));

    setShowDriveSettings(false);
  };
  
  const handleResetAuth = () => {
      const google = (window as any).google;
      if (accessToken && google) {
          try {
             google.accounts.oauth2.revoke(accessToken, () => {
                 console.log('Access token revoked');
             });
          } catch(e) { console.error("Revoke error", e); }
      }
      setAccessToken(null);
      tokenClientRef.current = null;
      setForceAuthPrompt(true);
      alert("Authorization reset complete. \n\nNext time you Import or Save, you will be asked to sign in.\n\nIMPORTANT: Make sure to check ALL permission boxes (See, edit, create, delete) to enable the 'Delete Original' feature.");
  };

  const copyOrigin = () => {
    navigator.clipboard.writeText(window.location.origin);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput === 'aical999') {
      setIsAuthenticated(true);
      localStorage.setItem('aical_is_authenticated', 'true');
      setAuthError(false);
    } else {
      setAuthError(true);
    }
  };

  const deleteFromDrive = async (fileId: string, token: string): Promise<{success: boolean, error?: string}> => {
    try {
      const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`, {
        method: 'PATCH',
        headers: { 
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ trashed: true })
      });
      
      if (!response.ok) {
        const errText = await response.text();
        return { success: false, error: errText };
      } else {
        return { success: true };
      }
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  };

  const requestGoogleAuth = (callback: (token: string) => void) => {
    if (!googleClientId) {
      setShowDriveSettings(true);
      return;
    }
    try {
        const google = (window as any).google;
        if (!google) {
            alert("Google Scripts not yet loaded. Please refresh.");
            setIsDriveLoading(false);
            return;
        }
        
        if (!tokenClientRef.current || forceAuthPrompt) {
            tokenClientRef.current = google.accounts.oauth2.initTokenClient({
                client_id: googleClientId,
                scope: GOOGLE_SCOPES,
                callback: (resp: any) => {
                    if (resp.error !== undefined) {
                        setIsDriveLoading(false);
                        setIsUploading(false);
                        return;
                    }
                    const hasGrantedAllScopes = google.accounts.oauth2.hasGrantedAllScopes(resp, GOOGLE_SCOPES);
                    
                    if (!hasGrantedAllScopes) {
                         alert("⚠️ Warning: Not all permissions were granted. The app will be able to SAVE, but NOT DELETE files. Please Reset Access if you need deletion.");
                    }

                    setAccessToken(resp.access_token);
                    setForceAuthPrompt(false); 
                    
                    if (onAuthSuccessRef.current) {
                        onAuthSuccessRef.current(resp.access_token);
                        onAuthSuccessRef.current = null;
                    }
                },
            });
        }
        onAuthSuccessRef.current = callback;
        const promptSetting = forceAuthPrompt ? 'consent select_account' : '';
        tokenClientRef.current.requestAccessToken({ prompt: promptSetting });

    } catch (e: any) {
        setIsDriveLoading(false);
        setIsUploading(false);
    }
  };

  const createPicker = useCallback((token: string) => {
    try {
      const google = (window as any).google;
      const gapi = (window as any).gapi;

      const showPicker = () => {
        const pickerCallback = async (data: any) => {
          if (data.action === google.picker.Action.PICKED) {
            const docs = data.docs;
            const newImages: ProcessedImage[] = [];
            let currentCount = images.length;
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
                  driveFileId: fileId,
                  viralStep: (currentCount % 6) + 1 // Auto-assign sequence
                });
                currentCount++;
               } catch(e) { console.error(e) }
            }
            if (newImages.length > 0) setImages((prev) => [...prev, ...newImages]);
          }
          setIsDriveLoading(false);
        };

        const view = new google.picker.DocsView()
            .setIncludeFolders(true)
            .setMimeTypes("image/png,image/jpeg,image/jpg")
            .setSelectFolderEnabled(false); 
        
        const appId = googleClientId.split('-')[0];

        const picker = new google.picker.PickerBuilder()
          .setDeveloperKey(googleApiKey)
          .setAppId(appId) 
          .setOAuthToken(token)
          .addView(view)
          .addView(new google.picker.DocsUploadView())
          .setCallback(pickerCallback)
          .enableFeature(google.picker.Feature.MULTISELECT_ENABLED)
          .enableFeature(google.picker.Feature.SUPPORT_DRIVES)
          .build();
        picker.setVisible(true);
      };

      if (!google.picker) {
        gapi.load('picker', showPicker);
      } else {
        showPicker();
      }
    } catch (e: any) {
      console.error("Picker creation failed:", e);
      setIsDriveLoading(false);
    }
  }, [googleApiKey, googleClientId, images.length]);

  const createFolderPicker = useCallback((token: string, onFolderSelect: (folderId: string) => void) => {
    const google = (window as any).google;
    const gapi = (window as any).gapi;

    const showFolderPicker = () => {
        const view = new google.picker.DocsView(google.picker.ViewId.FOLDERS)
            .setSelectFolderEnabled(true)
            .setIncludeFolders(true)
            .setMimeTypes('application/vnd.google-apps.folder');
        
        const appId = googleClientId.split('-')[0];

        const picker = new google.picker.PickerBuilder()
            .setDeveloperKey(googleApiKey)
            .setAppId(appId)
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
    };

    if (!google.picker) {
        gapi.load('picker', showFolderPicker);
    } else {
        showFolderPicker();
    }
  }, [googleApiKey, googleClientId]);

  const handleDriveImport = async () => {
    if (!googleClientId || !googleApiKey) { setShowDriveSettings(true); return; }
    if (accessToken) { createPicker(accessToken); } 
    else { 
        setIsDriveLoading(true); 
        requestGoogleAuth((token) => createPicker(token)); 
    }
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
            
            let deleteSuccess = false;
            let deleteErrorMsg = "";
            
            if (deleteAfterSave && selectedImage.driveFileId) {
                const result = await deleteFromDrive(selectedImage.driveFileId, token);
                deleteSuccess = result.success;
                deleteErrorMsg = result.error || "";
                
                if (deleteSuccess) {
                  setImages(prev => prev.map(img => img.id === selectedImage.id ? { ...img, driveFileId: undefined } : img));
                }
            }

            let msg = `✅ Saved to Google Drive!\nFile: ${fileName}`;
            if (deleteAfterSave && selectedImage.driveFileId) {
                msg += deleteSuccess 
                  ? '\n🗑️ Original file moved to Trash.' 
                  : `\n⚠️ Could not delete original file.\nReason: ${deleteErrorMsg}`;
            }
            alert(msg);

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
        let deleteFailures = 0;
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
                        const result = await deleteFromDrive(img.driveFileId, token);
                        if (result.success) {
                            deleteCount++;
                            setImages(prev => prev.map(p => p.id === img.id ? { ...p, driveFileId: undefined } : p));
                        } else {
                            deleteFailures++;
                        }
                    }
                }
            } catch (err) { console.error(err); }
        }
        
        let msg = `Batch Complete!\n✅ Success: ${successCount}`;
        if (deleteCount > 0) msg += `\n🗑️ Moved to Trash: ${deleteCount}`;
        if (deleteFailures > 0) msg += `\n⚠️ Failed to delete: ${deleteFailures} (Check Permissions)`;
        
        alert(msg);
        setIsUploading(false);
        setBatchSelection(new Set());
    };
    if (accessToken) { createFolderPicker(accessToken, (fid) => performBatchUpload(accessToken, fid)); } 
    else { requestGoogleAuth((token) => createFolderPicker(token, (fid) => performBatchUpload(token, fid))); }
  };
  
  const handleDownloadCollage = () => {
      if (!collagePreviewUrl) return;
      const a = document.createElement('a');
      a.href = collagePreviewUrl;
      const date = new Date().toISOString().split('T')[0];
      a.download = `Collage-${date}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
  };
  
  const handleSaveCollageToDrive = async () => {
    if (!collagePreviewUrl) return;
    const performUpload = async (token: string, folderId: string) => {
        setIsUploading(true);
        try {
            const blob = dataURLtoBlob(collagePreviewUrl);
            const date = new Date().toISOString().split('T')[0];
            const fileName = `Collage-${date}.jpg`;
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
            alert(`✅ Collage Saved to Google Drive!\nFile: ${fileName}`);
        } catch (error: any) { alert("Failed: " + error.message); } 
        finally { setIsUploading(false); }
    };
    if (accessToken) { createFolderPicker(accessToken, (fid) => performUpload(accessToken, fid)); } 
    else { requestGoogleAuth((token) => createFolderPicker(token, (fid) => performUpload(token, fid))); }
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const currentCount = images.length;
    const newImages: ProcessedImage[] = acceptedFiles.map((file, i) => ({
      id: Math.random().toString(36).substr(2, 9),
      file,
      previewUrl: URL.createObjectURL(file),
      status: 'idle',
      viralStep: ((currentCount + i) % 6) + 1 // Cycle 1-6
    }));
    setImages((prev) => [...prev, ...newImages]);
  }, [images.length]);

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
            
            // Standard resize logic
            const { base64: base64Data, mimeType } = await resizeImage(imgData.file, 2560, autoCrop);
            const correctedPreviewUrl = `data:${mimeType};base64,${base64Data}`;
            
            // Re-load image to get dims
            const img = new Image();
            img.src = correctedPreviewUrl;
            await new Promise(r => img.onload = r);

            // --- VIRAL MODE LOGIC ---
            if (mode === 'viral') {
                const step = imgData.viralStep || 1;
                const formulaObj = VIRAL_FORMULAS.find(f => f.step === step) || VIRAL_FORMULAS[0];
                
                const generatedCaption = await generateViralCaption(base64Data, mimeType, formulaObj.formula, geminiApiKey, geminiApiUrl);
                
                // Use a dummy analysis object for viral mode (we don't need nutrition here)
                const dummyAnalysis: FoodAnalysis = { ...MOCK_ANALYSIS, summary: formulaObj.title, items: [] };
                
                const layout = getInitialLayout(img.width, img.height, dummyAnalysis, {
                   defaultLabelStyle, defaultTitleScale, defaultCardScale, defaultLabelScale
                });
                
                // Customize layout for viral
                if (layout.caption) {
                    layout.caption.text = generatedCaption;
                    layout.caption.visible = true;
                }
                // Hide other elements by default in Viral Mode
                if (layout.mealType) layout.mealType.visible = false;
                if (layout.card) layout.card.visible = false;
                if (layout.labels) layout.labels = [];

                setImages(prev => prev.map(p => p.id === imgData.id ? { ...p, previewUrl: correctedPreviewUrl, status: 'complete', analysis: dummyAnalysis, layout } : p));
            } 
            // --- FOOD MODE LOGIC ---
            else {
                const analysis = await analyzeFoodImage(base64Data, mimeType, geminiApiKey, geminiApiUrl);
                if (!analysis.isFood) {
                    setImages(prev => prev.map(p => p.id === imgData.id ? { ...p, status: 'not-food', error: 'Not recognized as food' } : p));
                    return;
                }

                const layout = getInitialLayout(img.width, img.height, analysis, {
                    defaultLabelStyle, defaultTitleScale, defaultCardScale, defaultLabelScale, defaultTitlePos, defaultCardPos
                });
                
                setImages(prev => prev.map(p => p.id === imgData.id ? { ...p, previewUrl: correctedPreviewUrl, status: 'complete', analysis, layout } : p));
            }

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
  
  const handleStepChange = (e: React.ChangeEvent<HTMLSelectElement>, id: string) => {
      e.stopPropagation();
      const step = parseInt(e.target.value);
      setImages(prev => prev.map(img => img.id === id ? { ...img, viralStep: step } : img));
  };

  const selectedImage = images.find(img => img.id === selectedImageId);
  const selectedLayout = selectedImage?.layout;
  const selectedAnalysis = selectedImage?.analysis;
  
  // -- CANVAS RENDERING --
  useEffect(() => {
    if (selectedImage?.status === 'complete' && selectedAnalysis && selectedLayout && canvasRef.current) {
        const img = new Image();
        img.src = selectedImage.previewUrl;
        img.onload = () => {
            const canvas = canvasRef.current;
            if(!canvas) return;
            canvas.width = img.width;
            canvas.height = img.height;
            setOriginalImageMeta({ w: img.width, h: img.height });
            
            const ctx = canvas.getContext('2d');
            if (ctx) {
                const regions = drawScene(ctx, img, selectedAnalysis, selectedLayout);
                setHitRegions(regions);
            }
        };
    }
  }, [selectedImage?.previewUrl, selectedLayout, selectedAnalysis, selectedImage?.status]);


  const handleDragStart = (e: React.MouseEvent, type: 'card' | 'title' | 'label' | 'caption', id: number | string) => {
    e.preventDefault(); e.stopPropagation();
    if (!selectedLayout || !originalImageMeta || !editorContainerRef) return;
    
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const containerRect = editorContainerRef.getBoundingClientRect();
    const elLeft = rect.left - containerRect.left;
    const elTop = rect.top - containerRect.top;
    const mouseX = e.clientX - containerRect.left;
    const mouseY = e.clientY - containerRect.top;
    
    setDragTarget({ type, id });
    setDragOffset({ x: mouseX - elLeft, y: mouseY - elTop });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragTarget || !selectedImage || !editorContainerRef || !dragOffset) return;
    const rect = editorContainerRef.getBoundingClientRect();
    
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const newElX = mouseX - dragOffset.x;
    const newElY = mouseY - dragOffset.y;
    
    let xPct = newElX / rect.width;
    let yPct = newElY / rect.height;

    setImages(prev => prev.map(img => {
      if (img.id !== selectedImage.id || !img.layout) return img;
      const newLayout = { ...img.layout };
      
      if (dragTarget.type === 'card') {
          newLayout.card = { ...newLayout.card, x: xPct, y: yPct };
      }
      else if (dragTarget.type === 'title') {
          const region = hitRegions.find(r => r.type === 'title');
          if (region) {
              const pctW = region.w / rect.width;
              newLayout.mealType = { ...newLayout.mealType, x: xPct + pctW/2, y: yPct };
          }
      }
      else if (dragTarget.type === 'caption') {
          const region = hitRegions.find(r => r.type === 'caption');
          if (region) {
              const pctW = region.w / rect.width;
              // Caption is drawn centered, so x is center
              if (newLayout.caption) newLayout.caption = { ...newLayout.caption, x: xPct + pctW/2, y: yPct + (region.h / rect.height) };
          }
      }
      else if (dragTarget.type === 'label' && dragTarget.id !== undefined) {
         const region = hitRegions.find(r => r.id === dragTarget.id);
         if (region) {
            const pctW = region.w / rect.width;
            const pctH = region.h / rect.height;
            newLayout.labels = newLayout.labels.map(l => l.id === dragTarget.id ? { ...l, x: xPct + pctW/2, y: yPct + pctH/2 } : l);
         }
      }
      return { ...img, layout: newLayout };
    }));
  };

  const handleScaleChange = (type: 'card' | 'title' | 'caption', value: number) => {
    if (!selectedImage?.layout) return;
    setImages(prev => prev.map(img => {
      if (img.id !== selectedImage.id || !img.layout) return img;
      const newLayout = { ...img.layout };
      if (type === 'card') newLayout.card = { ...newLayout.card, scale: value };
      else if (type === 'title') newLayout.mealType = { ...newLayout.mealType, scale: value };
      else if (type === 'caption' && newLayout.caption) newLayout.caption = { ...newLayout.caption, scale: value };
      return { ...img, layout: newLayout };
    }));
  };

  const handleVisibilityToggle = (type: 'card' | 'title' | 'caption', isVisible: boolean) => {
    if (!selectedImage?.layout) return;
    setImages(prev => prev.map(img => {
      if (img.id !== selectedImage.id || !img.layout) return img;
      const newLayout = { ...img.layout };
      if (type === 'card') newLayout.card = { ...newLayout.card, visible: isVisible };
      else if (type === 'title') newLayout.mealType = { ...newLayout.mealType, visible: isVisible };
      else if (type === 'caption' && newLayout.caption) newLayout.caption = { ...newLayout.caption, visible: isVisible };
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

  const handleStyleCycle = (id: number) => {
    if (!selectedImage?.layout) return;
    const styles: LabelStyle[] = ['default', 'pill', 'text'];
    setImages(prev => prev.map(img => {
      if (img.id !== selectedImage.id || !img.layout) return img;
      const newLayout = { ...img.layout };
      newLayout.labels = newLayout.labels.map(l => {
        if (l.id === id) {
          const currentIdx = styles.indexOf(l.style);
          const nextStyle = styles[(currentIdx + 1) % styles.length];
          return { ...l, style: nextStyle };
        }
        return l;
      });
      return { ...img, layout: newLayout };
    }));
  };

  const handleTextEdit = (type: 'title' | 'label' | 'caption', id?: number | string) => {
    if (!selectedImage?.layout) return;
    let currentText = "";
    if (type === 'title') currentText = selectedImage.layout.mealType.text || "";
    if (type === 'caption') currentText = selectedImage.layout.caption?.text || "";
    if (type === 'label' && id !== undefined) { const l = selectedImage.layout.labels.find(l => l.id === id); if (l) currentText = l.text || ""; }
    const newText = prompt("Edit text:", currentText);
    if (newText !== null && newText !== currentText) {
       setImages(prev => prev.map(img => {
        if (img.id !== selectedImage.id || !img.layout) return img;
        const newLayout = { ...img.layout };
        if (type === 'title') newLayout.mealType = { ...newLayout.mealType, text: newText };
        else if (type === 'caption' && newLayout.caption) newLayout.caption = { ...newLayout.caption, text: newText };
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

  const handleSaveCurrentAsDefault = () => {
    if (!selectedImage || !selectedImage.layout) return;
    const l = selectedImage.layout;

    setDefaultTitleScale(l.mealType.scale);
    setDefaultCardScale(l.card.scale);
    
    const newTitlePos = { x: parseFloat((l.mealType.x * 100).toFixed(1)), y: parseFloat((l.mealType.y * 100).toFixed(1)) };
    const newCardPos = { x: parseFloat((l.card.x * 100).toFixed(1)), y: parseFloat((l.card.y * 100).toFixed(1)) };
    
    setDefaultTitlePos(newTitlePos);
    setDefaultCardPos(newCardPos);

    if (l.labels.length > 0) {
        setDefaultLabelScale(l.labels[0].scale);
        setDefaultLabelStyle(l.labels[0].style);
    }

    localStorage.setItem('aical_default_title_scale', String(l.mealType.scale));
    localStorage.setItem('aical_default_card_scale', String(l.card.scale));
    localStorage.setItem('aical_default_title_pos', JSON.stringify(newTitlePos));
    localStorage.setItem('aical_default_card_pos', JSON.stringify(newCardPos));
    
    if (l.labels.length > 0) {
        localStorage.setItem('aical_default_label_scale', String(l.labels[0].scale));
        localStorage.setItem('aical_default_label_style', l.labels[0].style);
    }
    
    alert("✅ Defaults Updated!");
  };

  if (!isAuthenticated) {
    // ... (Login Screen - Same as before)
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4 font-sans text-gray-800">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-sm w-full text-center border border-gray-100">
          <div className="bg-black p-4 rounded-2xl inline-flex mb-6 text-white shadow-lg">
            <Utensils size={32} />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Restricted Access</h1>
          <p className="text-gray-500 mb-8 text-sm">Please enter the security password to continue.</p>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="relative group">
              <Key className={`absolute left-3 top-3 transition-colors ${authError ? 'text-red-400' : 'text-gray-400 group-focus-within:text-black'}`} size={20} />
              <input type="password" value={passwordInput} onChange={(e) => { setPasswordInput(e.target.value); setAuthError(false); }} className={`w-full pl-10 pr-4 py-3 border rounded-xl outline-none transition-all ${authError ? 'border-red-300 bg-red-50 focus:border-red-500' : 'border-gray-200 focus:border-black focus:ring-4 focus:ring-gray-100'}`} placeholder="Password" autoFocus />
            </div>
            {authError && <div className="flex items-center justify-center gap-2 text-red-500 text-sm font-medium animate-in fade-in slide-in-from-top-1"><AlertCircle size={16} /><span>Incorrect password</span></div>}
            <button type="submit" className="w-full bg-black text-white py-3 rounded-xl font-semibold hover:bg-gray-800 transition-all shadow-md hover:shadow-xl active:scale-95">Enter AI Cal</button>
          </form>
          <p className="mt-8 text-xs text-gray-400">Protected Area</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 font-sans flex flex-col h-screen overflow-hidden" onMouseUp={() => setDragTarget(null)} onMouseMove={handleMouseMove}>
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shrink-0 z-20">
        <div className="flex items-center gap-2">
            <div className="bg-black p-2 rounded-lg text-white"><Utensils size={24} /></div>
            <h1 className="text-xl font-bold tracking-tight text-gray-900">AI Cal</h1>
            
            {/* Mode Toggle */}
            <div className="ml-8 flex bg-gray-100 p-1 rounded-lg">
                <button onClick={() => setMode('food')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${mode === 'food' ? 'bg-white shadow-sm text-black' : 'text-gray-500 hover:text-gray-900'}`}>
                    <Utensils size={14}/> Food Mode
                </button>
                <button onClick={() => setMode('viral')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${mode === 'viral' ? 'bg-white shadow-sm text-purple-600' : 'text-gray-500 hover:text-gray-900'}`}>
                    <Zap size={14}/> Viral Story Mode
                </button>
            </div>
        </div>
        <div className="flex items-center gap-4">
           {images.length > 0 && <button onClick={processImages} disabled={isProcessing || !images.some(i => i.status === 'idle')} className={`flex items-center gap-2 px-5 py-2.5 rounded-full font-medium transition-all ${isProcessing || !images.some(i => i.status === 'idle') ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-black text-white hover:bg-gray-800 shadow-lg hover:shadow-xl'}`}>{isProcessing ? <Loader2 className="animate-spin" size={18} /> : (mode === 'viral' ? <Zap size={18} /> : <Camera size={18} />)}{isProcessing ? 'Processing...' : (mode === 'viral' ? 'Generate Viral Captions' : 'Process Batch')}</button>}
        </div>
      </header>
      <main className="flex-1 flex overflow-hidden">
        <div className="w-1/3 min-w-[350px] max-w-[450px] bg-white border-r border-gray-200 flex flex-col z-10">
          <div className="p-4 shrink-0 space-y-3">
            <div {...getRootProps()} className={`border-2 border-dashed rounded-xl p-4 flex items-center gap-4 cursor-pointer transition-all group ${isDragActive ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-gray-400 hover:bg-gray-50'}`}>
              <input {...getInputProps()} />
              <div className={`p-3 rounded-full shrink-0 transition-colors ${isDragActive ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500 group-hover:bg-white group-hover:text-black shadow-sm'}`}>
                <Upload size={20} />
              </div>
              <div className="text-left">
                <p className={`font-semibold text-sm ${isDragActive ? 'text-green-700' : 'text-gray-900'}`}>Click or drop images</p>
                <p className={`text-xs ${isDragActive ? 'text-green-600' : 'text-gray-400'}`}>JPG, PNG supported</p>
              </div>
            </div>
            
            <div className="flex gap-2">
                <button onClick={handleDriveImport} disabled={isDriveLoading} className="flex-1 bg-white border border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50 font-medium py-2 px-3 rounded-lg flex items-center justify-center gap-2 transition-all shadow-sm text-sm h-10">
                    {isDriveLoading ? <Loader2 className="animate-spin" size={16} /> : <Cloud size={16} className="text-blue-600" />}
                    <span>Google Drive</span>
                </button>
                <button onClick={() => setShowDriveSettings(true)} className="bg-white border border-gray-200 text-gray-500 hover:text-gray-900 hover:border-gray-300 hover:bg-gray-50 w-10 h-10 flex items-center justify-center rounded-lg shadow-sm transition-all" title="Settings">
                    <Settings size={18} />
                </button>
                <button onClick={() => setShowHelp(true)} className="bg-white border border-gray-200 text-gray-500 hover:text-gray-900 hover:border-gray-300 hover:bg-gray-50 w-10 h-10 flex items-center justify-center rounded-lg shadow-sm transition-all" title="Usage Guide">
                    <BookOpen size={18} />
                </button>
            </div>
          </div>
          <div className="flex flex-col px-4 py-3 border-b border-gray-100 bg-gray-50/50 gap-3">
            <div className="flex justify-between items-center"><span className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Queue ({images.length})</span><button onClick={toggleSelectAll} className="text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors" disabled={images.length === 0}>{batchSelection.size === images.length && images.length > 0 ? 'Deselect All' : 'Select All'}</button></div>
            
             <div className="flex items-center justify-between bg-white border border-gray-200 p-2 rounded-lg cursor-pointer hover:border-gray-300 transition-colors" onClick={() => setAutoCrop(!autoCrop)}>
                <div className="flex items-center gap-2 text-sm text-gray-700">
                    <Crop size={16} className={autoCrop ? "text-pink-500" : "text-gray-400"} />
                    <span className={autoCrop ? "font-medium text-gray-900" : "text-gray-500"}>Crop to TikTok (9:16)</span>
                </div>
                <div className={`w-8 h-4 rounded-full relative transition-colors ${autoCrop ? 'bg-pink-500' : 'bg-gray-300'}`}>
                    <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all shadow-sm`} style={{left: autoCrop ? 'calc(100% - 14px)' : '2px'}}></div>
                </div>
            </div>

            {batchSelection.size === 4 && (
                <button onClick={() => setShowCollageModal(true)} className="w-full flex items-center justify-center gap-2 bg-purple-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors shadow-sm animate-in slide-in-from-top-2">
                    <LayoutGrid size={16} /> Create 2x2 Collage
                </button>
            )}

            {batchSelection.size > 0 && <div className="flex flex-col gap-2 animate-in slide-in-from-top-2 duration-200"><div className="flex items-center gap-2"><Tag size={14} className="text-gray-400" /><input type="text" value={exportTag} onChange={(e) => setExportTag(e.target.value)} className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:border-black focus:ring-1 focus:ring-black outline-none" placeholder="Style Tag" /></div><button onClick={handleBatchSaveToDrive} disabled={isUploading} className="w-full flex items-center justify-center gap-2 bg-black text-white py-2 rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors shadow-sm">{isUploading ? <Loader2 className="animate-spin" size={14}/> : <CloudUpload size={14} />}Save {batchSelection.size} to Drive</button></div>}
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
            {images.length === 0 && <div className="h-full flex flex-col items-center justify-center text-gray-400 opacity-50"><ImageIcon size={48} className="mb-4" /><p>No images uploaded yet</p></div>}
            {images.map((img) => (
              <div key={img.id} onClick={() => setSelectedImageId(img.id)} className={`relative group flex flex-col gap-2 p-3 rounded-xl border transition-all cursor-pointer ${selectedImageId === img.id ? 'border-green-500 bg-green-50/30 ring-1 ring-green-500' : 'border-gray-200 hover:border-gray-300 bg-white'}`}>
                <div className="flex items-center gap-3">
                    <div onClick={(e) => { e.stopPropagation(); toggleSelection(img.id); }} className="cursor-pointer text-gray-300 hover:text-black transition-colors">{batchSelection.has(img.id) ? <CheckSquare size={20} className="text-black" /> : <Square size={20} />}</div>
                    <div className="w-16 h-16 shrink-0 rounded-lg overflow-hidden bg-gray-100 relative">
                      <img src={img.previewUrl} alt="preview" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                        {img.status === 'analyzing' && <Loader2 className="animate-spin text-white" size={16} />}
                        {img.status === 'complete' && !img.analysis?.hasExistingText && <CheckCircle2 className="text-green-400 bg-white rounded-full" size={16} />}
                        {img.status === 'complete' && img.analysis?.hasExistingText && <TypeIcon className="text-yellow-500 bg-white rounded-full p-0.5" size={16} />}
                        {img.status === 'error' && <AlertCircle className="text-red-400 bg-white rounded-full" size={16} />}
                        {img.status === 'not-food' && <X className="text-orange-400 bg-white rounded-full" size={16} />}
                      </div>
                      {img.driveFileId && <div className="absolute top-0 right-0 bg-blue-500 text-white p-0.5 rounded-bl-lg" title="Imported from Drive"><Cloud size={10} /></div>}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{img.file.name}</p>
                        <p className={`text-xs mt-0.5 capitalize flex items-center gap-1 ${img.status === 'error' ? 'text-red-500 font-medium' : 'text-gray-500'}`}>{img.status.replace('-', ' ')}{img.status === 'complete' && img.analysis?.hasExistingText && <span className="text-yellow-600 font-medium flex items-center gap-0.5"><AlertTriangle size={10}/> Text Found</span>}</p>
                    </div>
                    <button onClick={(e) => removeImage(e, img.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"><X size={16} /></button>
                </div>
                {/* Viral Step Selector */}
                {mode === 'viral' && (
                    <div className="flex items-center gap-2 mt-1 border-t border-gray-100 pt-2">
                        <ListOrdered size={14} className="text-purple-500"/>
                        <select 
                            value={img.viralStep || 1} 
                            onChange={(e) => handleStepChange(e, img.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="text-xs border border-gray-200 rounded px-2 py-1 bg-gray-50 hover:bg-white focus:ring-1 focus:ring-purple-500 outline-none w-full"
                        >
                            {VIRAL_FORMULAS.map(f => (
                                <option key={f.step} value={f.step}>Step {f.step}: {f.title}</option>
                            ))}
                        </select>
                    </div>
                )}
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
                  {/* MAIN CANVAS PREVIEW CONTAINER */}
                  <div className="relative shadow-2xl rounded-lg overflow-hidden bg-white select-none inline-flex" style={{ maxWidth: '100%' }} ref={setEditorContainerRef} >
                     <canvas ref={canvasRef} className="block w-full h-auto pointer-events-none" style={{maxHeight: '60vh'}} />
                     {selectedImage.status === 'complete' && originalImageMeta && (
                         <div className="absolute inset-0 z-10 w-full h-full">
                             {hitRegions.map(region => (
                                 <div
                                     key={region.id}
                                     onMouseDown={(e) => handleDragStart(e, region.type, region.id)}
                                     onDoubleClick={(e) => { 
                                         e.stopPropagation(); 
                                         if (region.type === 'title' || region.type === 'label' || region.type === 'caption') {
                                             handleTextEdit(region.type, region.id); 
                                         }
                                     }}
                                     className="absolute cursor-move group hover:bg-blue-500/10 transition-colors border border-transparent hover:border-blue-400"
                                     style={{
                                         left: `${(region.x / originalImageMeta.w) * 100}%`,
                                         top: `${(region.y / originalImageMeta.h) * 100}%`,
                                         width: `${(region.w / originalImageMeta.w) * 100}%`,
                                         height: `${(region.h / originalImageMeta.h) * 100}%`,
                                     }}
                                     title={`Double click to edit`}
                                 >
                                    {region.type === 'label' && (
                                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-white shadow-md rounded-lg flex items-center p-1 gap-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-auto">
                                             <button onClick={(e) => { e.stopPropagation(); handleStyleCycle(region.id as number); }} className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-all"><Tag size={14} /></button>
                                             <div className="w-px h-3 bg-gray-200"></div>
                                             <button onClick={(e) => { e.stopPropagation(); handleDeleteLabel(region.id as number); }} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-all"><Trash2 size={14} /></button>
                                        </div>
                                    )}
                                 </div>
                             ))}
                         </div>
                     )}
                    {selectedImage.status === 'analyzing' && <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 backdrop-blur-sm z-50"><Loader2 className="animate-spin text-white mb-2" size={48} /><p className="text-white font-medium">Analysing content...</p></div>}
                  </div>
                </div>

                {selectedImage.status === 'complete' && selectedImage.layout && (
                  <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2 text-gray-500"><SlidersHorizontal size={16} /><h4 className="text-xs font-semibold uppercase tracking-wider">Editor Controls</h4></div>
                        <button onClick={handleSaveCurrentAsDefault} className="text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 hover:text-blue-800 px-2 py-1 rounded transition-colors flex items-center gap-1" title="Save current positions and sizes as defaults"><Sparkles size={12}/> Set as Default</button>
                    </div>
                    
                    {/* Different Controls based on Mode */}
                    {mode === 'viral' ? (
                         <div className="space-y-4">
                              <h5 className="font-medium text-sm text-gray-900 border-b pb-2">Viral Caption</h5>
                              {selectedImage.layout.caption?.visible ? (
                                <div className="flex items-center gap-4">
                                     <div className="flex-1 space-y-2">
                                         <label className="text-xs font-medium text-gray-600">Caption Text (Double click preview to edit)</label>
                                         <textarea 
                                            value={selectedImage.layout.caption?.text || ''} 
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                setImages(prev => prev.map(img => {
                                                    if(img.id !== selectedImage.id || !img.layout) return img;
                                                    const newLayout = {...img.layout};
                                                    if(newLayout.caption) newLayout.caption.text = val;
                                                    return {...img, layout: newLayout};
                                                }))
                                            }}
                                            className="w-full text-sm p-2 border border-gray-200 rounded-md h-24"
                                         />
                                     </div>
                                     <div className="w-48 space-y-4">
                                        <div className="flex flex-col gap-1">
                                            <div className="flex justify-between text-xs font-medium text-gray-600"><span>Size</span><span>{Math.round(selectedImage.layout.caption.scale * 100)}%</span></div>
                                            <input type="range" min="0" max="5" step="0.1" value={selectedImage.layout.caption.scale} onChange={(e) => handleScaleChange('caption', parseFloat(e.target.value))} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-600" />
                                        </div>
                                     </div>
                                </div>
                              ) : (
                                  <button onClick={() => handleVisibilityToggle('caption', true)} className="text-blue-600 text-sm">Show Caption</button>
                              )}
                         </div>
                    ) : (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                          <div className="space-y-6">
                              <h5 className="font-medium text-sm text-gray-900 border-b pb-2">Main Elements</h5>
                              <div className="flex items-center gap-2">
                                 {selectedImage.layout.mealType.visible ? (
                                    <>
                                      <div className="flex-1 flex flex-col gap-1">
                                          <div className="flex justify-between text-xs font-medium text-gray-600"><span>Meal Title Size</span><span>{Math.round(selectedImage.layout.mealType.scale * 100)}%</span></div>
                                          <input type="range" min="0" max="20" step="0.1" value={selectedImage.layout.mealType.scale} onChange={(e) => handleScaleChange('title', parseFloat(e.target.value))} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-black" />
                                      </div>
                                      <button onClick={() => handleVisibilityToggle('title', false)} className="p-2 bg-gray-100 hover:bg-red-50 text-gray-500 hover:text-red-500 rounded-lg transition-colors mt-4" title="Hide Title"><Trash2 size={16}/></button>
                                    </>
                                 ) : (
                                    <div className="flex-1 flex items-center justify-between bg-gray-50 p-3 rounded-lg border border-gray-200 border-dashed">
                                        <span className="text-sm text-gray-400 italic">Meal Title Hidden</span>
                                        <button onClick={() => handleVisibilityToggle('title', true)} className="flex items-center gap-1.5 text-xs font-medium bg-white border border-gray-200 px-3 py-1.5 rounded-md hover:text-blue-600 hover:border-blue-200 transition-colors"><Plus size={14}/> Restore</button>
                                    </div>
                                 )}
                              </div>
                              <div className="flex items-center gap-2">
                                  {selectedImage.layout.card.visible ? (
                                    <>
                                      <div className="flex-1 flex flex-col gap-1">
                                          <div className="flex justify-between text-xs font-medium text-gray-600"><span>Nutrition Card Size</span><span>{Math.round(selectedImage.layout.card.scale * 100)}%</span></div>
                                          <input type="range" min="0" max="20" step="0.1" value={selectedImage.layout.card.scale} onChange={(e) => handleScaleChange('card', parseFloat(e.target.value))} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-black" />
                                      </div>
                                      <button onClick={() => handleVisibilityToggle('card', false)} className="p-2 bg-gray-100 hover:bg-red-50 text-gray-500 hover:text-red-500 rounded-lg transition-colors mt-4" title="Hide Card"><Trash2 size={16}/></button>
                                    </>
                                  ) : (
                                    <div className="flex-1 flex items-center justify-between bg-gray-50 p-3 rounded-lg border border-gray-200 border-dashed">
                                        <span className="text-sm text-gray-400 italic">Nutrition Card Hidden</span>
                                        <button onClick={() => handleVisibilityToggle('card', true)} className="flex items-center gap-1.5 text-xs font-medium bg-white border border-gray-200 px-3 py-1.5 rounded-md hover:text-blue-600 hover:border-blue-200 transition-colors"><Plus size={14}/> Restore</button>
                                    </div>
                                  )}
                              </div>
                          </div>
                          <div>
                              <h5 className="font-medium text-sm text-gray-900 border-b pb-2 mb-4">Detected Food Labels</h5>
                              <div className="space-y-3 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                                  {selectedImage.layout.labels.map(label => (
                                      <div key={label.id} className="flex items-center gap-3 bg-gray-50 p-2 rounded-lg border border-gray-100 hover:border-gray-300 transition-colors">
                                          <span className="text-sm font-medium w-32 truncate text-gray-700 cursor-help" title={label.text}>{label.text}</span>
                                          <div className="flex-1 flex flex-col justify-center"><input type="range" min="0" max="20" step="0.1" value={label.scale} onChange={(e) => handleLabelScaleChange(label.id, parseFloat(e.target.value))} className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600" /></div>
                                          <div className="flex items-center gap-1">
                                             <button onClick={() => handleStyleCycle(label.id)} className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-all" title="Toggle Style">
                                                {label.style === 'default' && <LinkIcon size={16} />}
                                                {label.style === 'pill' && <Tag size={16} />}
                                                {label.style === 'text' && <TypeIcon size={16} />}
                                             </button>
                                             <button onClick={() => handleDeleteLabel(label.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-all"><Trash2 size={16} /></button>
                                          </div>
                                      </div>
                                  ))}
                              </div>
                          </div>
                        </div>
                    )}
                  </div>
                )}

                <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                  <div>
                    <h3 className="font-semibold text-gray-900">{selectedImage.analysis?.summary || selectedImage.file.name}</h3>
                    {selectedImage.analysis && mode === 'food' && <p className="text-sm text-gray-500">{selectedImage.analysis.items.length} items detected • {selectedImage.analysis.nutrition.calories} kcal</p>}
                    {mode === 'viral' && <p className="text-sm text-gray-500 text-purple-600 font-medium">Step {selectedImage.viralStep}: {VIRAL_FORMULAS.find(f=>f.step === selectedImage.viralStep)?.title}</p>}
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
      
      {/* Collage Modal (Same as existing) */}
      {showCollageModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-5xl w-full p-0 overflow-hidden flex flex-col md:flex-row max-h-[90vh]">
                <div className="w-full md:w-1/3 p-6 border-r border-gray-100 bg-gray-50 overflow-y-auto">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-xl font-bold flex items-center gap-2"><LayoutGrid className="text-purple-600"/> Collage</h2>
                        <button onClick={() => setShowCollageModal(false)} className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-200"><X size={20}/></button>
                    </div>
                    <div className="space-y-6">
                        <div>
                             <label className="block text-sm font-semibold text-gray-700 mb-2">Output Size</label>
                             <div className="grid grid-cols-2 gap-2 mb-3">
                                 <button onClick={() => setCollageConfig({...collageConfig, width: 2160, height: 2160})} className={`text-xs py-2 rounded border ${collageConfig.width === 2160 && collageConfig.height === 2160 ? 'bg-purple-100 border-purple-300 text-purple-700' : 'bg-white border-gray-200 text-gray-600'}`}>Square (2K)</button>
                                 <button onClick={() => setCollageConfig({...collageConfig, width: 1080, height: 1920})} className={`text-xs py-2 rounded border ${collageConfig.width === 1080 && collageConfig.height === 1920 ? 'bg-purple-100 border-purple-300 text-purple-700' : 'bg-white border-gray-200 text-gray-600'}`}>Story (9:16)</button>
                                 <button onClick={() => setCollageConfig({...collageConfig, width: 1080, height: 1350})} className={`text-xs py-2 rounded border ${collageConfig.width === 1080 && collageConfig.height === 1350 ? 'bg-purple-100 border-purple-300 text-purple-700' : 'bg-white border-gray-200 text-gray-600'}`}>Portrait (4:5)</button>
                                 <button onClick={() => setCollageConfig({...collageConfig, width: 3840, height: 2160})} className={`text-xs py-2 rounded border ${collageConfig.width === 3840 && collageConfig.height === 2160 ? 'bg-purple-100 border-purple-300 text-purple-700' : 'bg-white border-gray-200 text-gray-600'}`}>Landscape (4K)</button>
                             </div>
                             <div className="flex gap-2">
                                 <div><label className="text-xs text-gray-500">Width</label><input type="number" value={collageConfig.width} onChange={(e) => setCollageConfig({...collageConfig, width: parseInt(e.target.value) || 1000})} className="w-full px-3 py-2 border rounded-md text-sm" /></div>
                                 <div><label className="text-xs text-gray-500">Height</label><input type="number" value={collageConfig.height} onChange={(e) => setCollageConfig({...collageConfig, height: parseInt(e.target.value) || 1000})} className="w-full px-3 py-2 border rounded-md text-sm" /></div>
                             </div>
                        </div>
                        <div>
                             <div className="flex justify-between mb-1"><label className="text-sm font-semibold text-gray-700">Padding</label><span className="text-xs text-gray-500">{collageConfig.padding}px</span></div>
                             <input type="range" min="0" max="200" value={collageConfig.padding} onChange={(e) => setCollageConfig({...collageConfig, padding: parseInt(e.target.value)})} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-600"/>
                        </div>
                         <div>
                             <label className="text-sm font-semibold text-gray-700 mb-2 block">Background Color</label>
                             <div className="flex gap-2">
                                 <button onClick={() => setCollageConfig({...collageConfig, color: '#ffffff'})} className={`w-8 h-8 rounded-full border shadow-sm ${collageConfig.color === '#ffffff' ? 'ring-2 ring-purple-500' : ''}`} style={{background: '#fff'}}></button>
                                 <button onClick={() => setCollageConfig({...collageConfig, color: '#000000'})} className={`w-8 h-8 rounded-full border shadow-sm ${collageConfig.color === '#000000' ? 'ring-2 ring-purple-500' : ''}`} style={{background: '#000'}}></button>
                                 <button onClick={() => setCollageConfig({...collageConfig, color: '#f3f4f6'})} className={`w-8 h-8 rounded-full border shadow-sm ${collageConfig.color === '#f3f4f6' ? 'ring-2 ring-purple-500' : ''}`} style={{background: '#f3f4f6'}}></button>
                                 <input type="color" value={collageConfig.color} onChange={(e) => setCollageConfig({...collageConfig, color: e.target.value})} className="w-8 h-8 p-0 border-0 rounded-full overflow-hidden cursor-pointer" />
                             </div>
                        </div>
                    </div>

                    <div className="mt-8 space-y-3">
                        <button onClick={handleDownloadCollage} disabled={!collagePreviewUrl} className="w-full flex items-center justify-center gap-2 bg-black text-white py-3 rounded-xl font-medium hover:bg-gray-800 transition-colors">
                            <Download size={18}/> Download Image
                        </button>
                        <button onClick={handleSaveCollageToDrive} disabled={!collagePreviewUrl || isUploading} className="w-full flex items-center justify-center gap-2 bg-white border border-gray-300 text-gray-700 py-3 rounded-xl font-medium hover:bg-gray-50 transition-colors">
                            {isUploading ? <Loader2 className="animate-spin" size={18}/> : <CloudUpload size={18}/>} Save to Drive
                        </button>
                    </div>
                </div>
                <div className="w-full md:w-2/3 bg-gray-200 flex items-center justify-center p-8 relative">
                    <div className="absolute inset-0 pattern-grid opacity-10 pointer-events-none"></div>
                    {isGeneratingCollage ? (
                        <div className="flex flex-col items-center gap-3 bg-white/80 p-6 rounded-xl backdrop-blur-sm shadow-lg">
                            <Loader2 className="animate-spin text-purple-600" size={32}/>
                            <span className="font-medium text-gray-600">Generating Preview...</span>
                        </div>
                    ) : collagePreviewUrl ? (
                        <img src={collagePreviewUrl} className="max-w-full max-h-[70vh] shadow-2xl rounded-sm object-contain bg-white" alt="Collage Preview"/>
                    ) : (
                        <span className="text-gray-400">Preview not available</span>
                    )}
                </div>
            </div>
        </div>
      )}

      {showDriveSettings && (
        // ... (Settings Modal - Keeping existing settings logic)
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-6xl w-full p-6 animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6"><h2 className="text-xl font-bold text-gray-900 flex items-center gap-2"><Settings size={24} className="text-gray-500" />Settings</h2><button onClick={() => setShowDriveSettings(false)} className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100 transition-colors"><X size={20} /></button></div>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-6">
                <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-gray-900 border-b pb-2 flex items-center gap-2"><Sparkles size={16} className="text-purple-600"/>Gemini AI Configuration</h3>
                    <div className="space-y-4">
                      <div><label className="block text-sm font-medium text-gray-700 mb-1">Gemini API Key</label><input type="password" value={geminiApiKey} onChange={(e) => setGeminiApiKey(e.target.value)} placeholder="AIza..." className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-sm font-mono" /></div>
                      <div><label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">Gemini API Base URL</label><div className="relative"><Globe className="absolute left-3 top-2.5 text-gray-400" size={16} /><input type="text" value={geminiApiUrl} onChange={(e) => setGeminiApiUrl(e.target.value)} placeholder="https://..." className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-sm font-mono" /></div></div>
                    </div>
                </div>
                
                {/* ... (Existing appearance settings) ... */}
                <div className="space-y-3 pt-2">
                     <h3 className="text-sm font-semibold text-gray-900 border-b pb-2 flex items-center gap-2"><Palette size={16} className="text-teal-600"/>Appearance Defaults</h3>
                     <div className="space-y-4 bg-gray-50 p-4 rounded-lg border border-gray-100">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Default Label Style</label>
                            <div className="flex gap-2">
                                <button onClick={() => setDefaultLabelStyle('default')} className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all flex items-center justify-center gap-2 ${defaultLabelStyle === 'default' ? 'bg-white border-2 border-teal-500 text-teal-700 shadow-sm' : 'bg-gray-100 border border-transparent text-gray-500 hover:bg-gray-200'}`}>
                                    <LinkIcon size={14}/> Default
                                </button>
                                <button onClick={() => setDefaultLabelStyle('pill')} className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all flex items-center justify-center gap-2 ${defaultLabelStyle === 'pill' ? 'bg-white border-2 border-teal-500 text-teal-700 shadow-sm' : 'bg-gray-100 border border-transparent text-gray-500 hover:bg-gray-200'}`}>
                                    <Tag size={14}/> Pill
                                </button>
                                <button onClick={() => setDefaultLabelStyle('text')} className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all flex items-center justify-center gap-2 ${defaultLabelStyle === 'text' ? 'bg-white border-2 border-teal-500 text-teal-700 shadow-sm' : 'bg-gray-100 border border-transparent text-gray-500 hover:bg-gray-200'}`}>
                                    <TypeIcon size={14}/> Text
                                </button>
                            </div>
                        </div>
                        <div className="space-y-3">
                            <div className="flex flex-col gap-1">
                                <div className="flex justify-between text-xs font-medium text-gray-600"><span>Default Title Size</span><span>{defaultTitleScale}</span></div>
                                <input type="range" min="0" max="20" step="0.1" value={defaultTitleScale} onChange={(e) => setDefaultTitleScale(parseFloat(e.target.value))} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-teal-600" />
                            </div>
                            <div className="flex flex-col gap-1">
                                <div className="flex justify-between text-xs font-medium text-gray-600"><span>Default Card Size</span><span>{defaultCardScale}</span></div>
                                <input type="range" min="0" max="20" step="0.1" value={defaultCardScale} onChange={(e) => setDefaultCardScale(parseFloat(e.target.value))} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-teal-600" />
                            </div>
                            <div className="flex flex-col gap-1">
                                <div className="flex justify-between text-xs font-medium text-gray-600"><span>Default Label Size</span><span>{defaultLabelScale}</span></div>
                                <input type="range" min="0" max="20" step="0.1" value={defaultLabelScale} onChange={(e) => setDefaultLabelScale(parseFloat(e.target.value))} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-teal-600" />
                            </div>
                        </div>
                     </div>
                </div>

                <div className="space-y-3 pt-2">
                     <h3 className="text-sm font-semibold text-gray-900 border-b pb-2 flex items-center gap-2"><Cloud size={16} className="text-blue-600"/>Google Drive Integration</h3>
                     <div className="flex items-center justify-between p-3 bg-orange-50 border border-orange-100 rounded-lg">
                        <div className="flex items-center gap-2 text-orange-800 text-xs font-medium"><Trash size={14} /> <span>Move original to Trash after saving</span></div>
                        <input type="checkbox" checked={deleteAfterSave} onChange={(e) => setDeleteAfterSave(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500" />
                     </div>
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">OAuth 2.0 Client ID</label><input type="text" value={googleClientId} onChange={(e) => setGoogleClientId(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-mono" /></div>
                    <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                        <label className="block text-xs font-semibold text-gray-500 uppercase mb-2">Authorized Origin</label>
                        <div className="flex gap-2"><div className="flex-1 bg-white border border-gray-200 px-3 py-2 rounded text-sm font-mono truncate text-gray-600">{window.location.origin}</div><button onClick={copyOrigin} className="bg-white border border-gray-200 hover:bg-gray-50 text-gray-600 px-3 rounded flex items-center justify-center transition-colors">{copied ? <Check size={16} className="text-green-500"/> : <Copy size={16}/>}</button></div>
                    </div>
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Google Picker API Key</label><input type="password" value={googleApiKey} onChange={(e) => setGoogleApiKey(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-mono" /></div>
                    
                    <div className="flex justify-end pt-2">
                        <button onClick={handleResetAuth} className="text-red-500 text-xs font-medium hover:text-red-700 flex items-center gap-1 hover:bg-red-50 px-2 py-1 rounded transition-colors" title="Force re-login next time"><RotateCcw size={12}/> Reset Access</button>
                    </div>
                </div>
              </div>
              <div className="lg:col-span-1">
                <div className="sticky top-0 space-y-3">
                   <h3 className="text-sm font-semibold text-gray-900 border-b pb-2 flex items-center gap-2"><Smartphone size={16} className="text-gray-600"/>Live Preview</h3>
                   <div className="bg-gray-900 rounded-[2.5rem] p-3 shadow-2xl border-4 border-gray-800 mx-auto max-w-[320px]">
                      <div className="bg-white rounded-[2rem] overflow-hidden relative w-full aspect-[9/16] bg-gray-50">
                         <canvas ref={settingsCanvasRef} className="w-full h-full object-contain"/>
                      </div>
                   </div>
                   <p className="text-xs text-center text-gray-500">Previewing with 9:16 layout</p>
                </div>
              </div>
            </div>

            <div className="mt-8 flex justify-end"><button onClick={saveSettings} className="bg-black text-white px-5 py-2 rounded-lg hover:bg-gray-800 transition-colors font-medium">Save & Close</button></div>
          </div>
        </div>
      )}
      
      {showHelp && (
        // ... (Help Modal - keeping existing)
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full p-8 animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <BookOpen size={24} className="text-blue-600" /> AI Cal Guide
              </h2>
              <button onClick={() => setShowHelp(false)} className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100 transition-colors">
                <X size={24} />
              </button>
            </div>
            {/* ... Help content ... */}
            <div className="prose prose-sm prose-gray max-w-none space-y-6 text-gray-600">
                <p>Welcome to AI Cal. Switch between modes in the header.</p>
                <p><strong>Food Mode:</strong> Analyzes nutrition and creates calorie cards.</p>
                <p><strong>Viral Story Mode:</strong> Upload 6 images. Assign them Step 1-6 using the dropdowns in the sidebar. Click "Generate Viral Captions" to automatically create story-based content using the 6-part viral formula.</p>
            </div>
            <div className="mt-8 pt-6 border-t border-gray-100 flex justify-end">
                <button onClick={() => setShowHelp(false)} className="bg-gray-100 text-gray-700 px-6 py-2.5 rounded-xl hover:bg-gray-200 transition-colors font-medium">Close</button>
            </div>
          </div>
        </div>
      )}
      <style>{`.pattern-grid { background-image: radial-gradient(#000 1px, transparent 1px); background-size: 20px 20px; }`}</style>
    </div>
  );
}

export default App;
