
import React, { useState } from 'react';
import { Utensils, Key, AlertCircle } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

interface AuthScreenProps {
    onLogin: (password: string) => boolean;
    authError: boolean;
    setAuthError: (error: boolean) => void;
}

export function AuthScreen({ onLogin, authError, setAuthError }: AuthScreenProps) {
    const [passwordInput, setPasswordInput] = useState("");

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onLogin(passwordInput);
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4 font-sans text-gray-800">
            <div className="bg-white p-8 rounded-2xl shadow-xl max-w-sm w-full text-center border border-gray-100">
                <div className="bg-black p-4 rounded-2xl inline-flex mb-6 text-white shadow-lg">
                    <Utensils size={32} />
                </div>
                <h1 className="text-2xl font-bold text-gray-900 mb-2">Restricted Access</h1>
                <p className="text-gray-500 mb-8 text-sm">Please enter the security password to continue.</p>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="relative group">
                        <Key className={`absolute left-3 top-3 transition-colors ${authError ? 'text-red-400' : 'text-gray-400 group-focus-within:text-black'}`} size={20} />
                        <input
                            type="password"
                            value={passwordInput}
                            onChange={(e) => { setPasswordInput(e.target.value); setAuthError(false); }}
                            className={`w-full pl-10 pr-4 py-3 border rounded-xl outline-none transition-all ${authError ? 'border-red-300 bg-red-50 focus:border-red-500' : 'border-gray-200 focus:border-black focus:ring-4 focus:ring-gray-100'}`}
                            placeholder="Password"
                            autoFocus
                        />
                    </div>
                    {authError && <div className="flex items-center justify-center gap-2 text-red-500 text-sm font-medium animate-in fade-in slide-in-from-top-1"><AlertCircle size={16} /><span>Incorrect password</span></div>}
                    <button type="submit" className="w-full bg-black text-white py-3 rounded-xl font-semibold hover:bg-gray-800 transition-all shadow-md hover:shadow-xl active:scale-95">Enter AI Cal</button>
                </form>
                <p className="mt-8 text-xs text-gray-400">Protected Area</p>
            </div>
        </div>
    );
}
