
import { useState, useEffect, useRef, useCallback } from 'react';
import { ProcessedImage } from '../types';

const DEFAULT_GOOGLE_CLIENT_ID = "959444237240-lca07hnf1qclkj3o93o1k3kuo65bkqr7.apps.googleusercontent.com";
const DEFAULT_API_KEY = process.env.API_KEY || "";
const GOOGLE_SCOPES = 'https://www.googleapis.com/auth/drive';

export interface DriveSettings {
    clientId: string;
    apiKey: string;
}

export function useGoogleDrive() {
    const [clientId, setClientId] = useState(DEFAULT_GOOGLE_CLIENT_ID);
    const [apiKey, setApiKey] = useState(DEFAULT_API_KEY);
    const [accessToken, setAccessToken] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [forceAuthPrompt, setForceAuthPrompt] = useState(false);

    const tokenClientRef = useRef<any>(null);
    const onAuthSuccessRef = useRef<((token: string) => void) | null>(null);

    // Load settings on mount
    useEffect(() => {
        const storedId = localStorage.getItem('aical_google_client_id');
        const storedKey = localStorage.getItem('aical_google_api_key');
        if (storedId) setClientId(storedId);
        if (storedKey) setApiKey(storedKey);
    }, []);

    const updateSettings = (newClientId: string, newApiKey: string) => {
        setClientId(newClientId);
        setApiKey(newApiKey);
        localStorage.setItem('aical_google_client_id', newClientId);
        localStorage.setItem('aical_google_api_key', newApiKey);
    };

    const resetAuth = () => {
        const google = (window as any).google;
        if (accessToken && google) {
            try {
                google.accounts.oauth2.revoke(accessToken, () => {
                    console.log('Access token revoked');
                });
            } catch (e) { console.error("Revoke error", e); }
        }
        setAccessToken(null);
        tokenClientRef.current = null;
        setForceAuthPrompt(true);
    };

    const requestAuth = (callback: (token: string) => void) => {
        if (!clientId) return; // Should handle UI feedback elsewhere
        try {
            const google = (window as any).google;
            if (!google) {
                alert("Google Scripts not yet loaded. Please refresh.");
                setIsLoading(false);
                return;
            }

            if (!tokenClientRef.current || forceAuthPrompt) {
                tokenClientRef.current = google.accounts.oauth2.initTokenClient({
                    client_id: clientId,
                    scope: GOOGLE_SCOPES,
                    callback: (resp: any) => {
                        if (resp.error !== undefined) {
                            setIsLoading(false);
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
            setIsLoading(false);
            setIsUploading(false);
        }
    };

    const openPicker = useCallback((onImagesSelected: (images: ProcessedImage[]) => void) => {
        const handlePicker = (token: string) => {
            try {
                const google = (window as any).google;
                const gapi = (window as any).gapi;

                const showPicker = () => {
                    const pickerCallback = async (data: any) => {
                        if (data.action === google.picker.Action.PICKED) {
                            const docs = data.docs;
                            const newImages: ProcessedImage[] = [];
                            for (const doc of docs) {
                                try {
                                    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${doc.id}?alt=media`, {
                                        headers: { Authorization: `Bearer ${token}` },
                                    });
                                    if (!response.ok) throw new Error("Failed to download file");
                                    const blob = await response.blob();
                                    const file = new File([blob], doc.name, { type: doc.mimeType });
                                    newImages.push({
                                        id: Math.random().toString(36).substr(2, 9),
                                        file,
                                        previewUrl: URL.createObjectURL(file),
                                        status: 'idle',
                                        driveFileId: doc.id
                                    });
                                } catch (e) { console.error(e) }
                            }
                            if (newImages.length > 0) onImagesSelected(newImages);
                        }
                        setIsLoading(false);
                    };

                    const view = new google.picker.DocsView()
                        .setIncludeFolders(true)
                        .setMimeTypes("image/png,image/jpeg,image/jpg")
                        .setSelectFolderEnabled(false);

                    const appId = clientId.split('-')[0];

                    const picker = new google.picker.PickerBuilder()
                        .setDeveloperKey(apiKey)
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
                setIsLoading(false);
            }
        };

        if (accessToken) {
            handlePicker(accessToken);
        } else {
            setIsLoading(true);
            requestAuth(handlePicker);
        }
    }, [apiKey, clientId, accessToken]);

    const openFolderPicker = useCallback((onFolderSelected: (folderId: string, token: string) => void) => {
        const handleFolderPicker = (token: string) => {
            const google = (window as any).google;
            const gapi = (window as any).gapi;

            const showFolderPicker = () => {
                const view = new google.picker.DocsView(google.picker.ViewId.FOLDERS)
                    .setSelectFolderEnabled(true)
                    .setIncludeFolders(true)
                    .setMimeTypes('application/vnd.google-apps.folder');

                const appId = clientId.split('-')[0];

                const picker = new google.picker.PickerBuilder()
                    .setDeveloperKey(apiKey)
                    .setAppId(appId)
                    .setOAuthToken(token)
                    .addView(view)
                    .setCallback((data: any) => {
                        if (data.action === google.picker.Action.PICKED) {
                            const doc = data.docs[0];
                            if (doc) onFolderSelected(doc.id, token);
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
        };

        if (accessToken) {
            handleFolderPicker(accessToken);
        } else {
            requestAuth(handleFolderPicker);
        }
    }, [apiKey, clientId, accessToken]);

    const deleteFile = async (fileId: string, token: string): Promise<{ success: boolean, error?: string }> => {
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
                return { success: false, error: `Error ${response.status}: ${errText}` };
            }
            return { success: true };
        } catch (e: any) {
            return { success: false, error: e.message };
        }
    };

    const uploadFile = async (blob: Blob, metadata: any, token: string) => {
        const formData = new FormData();
        formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        formData.append('file', blob);

        const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });
        if (!response.ok) throw new Error('Upload failed');
        return response.json();
    };

    return {
        clientId,
        apiKey,
        accessToken,
        isLoading,
        isUploading,
        setIsUploading, // exposed to allow external logic to set loading state
        updateSettings,
        resetAuth,
        openPicker,
        openFolderPicker,
        uploadFile,
        deleteFile,
        DEFAULT_GOOGLE_CLIENT_ID,
        DEFAULT_API_KEY
    };
}
