
import { useState } from 'react';

export function useAuth() {
    const [isAuthenticated, setIsAuthenticated] = useState(() => {
        return localStorage.getItem('aical_is_authenticated') === 'true';
    });
    const [authError, setAuthError] = useState(false);

    const login = (password: string) => {
        if (password === 'aical999') {
            setIsAuthenticated(true);
            localStorage.setItem('aical_is_authenticated', 'true');
            setAuthError(false);
            return true;
        } else {
            setAuthError(true);
            return false;
        }
    };

    const logout = () => {
        setIsAuthenticated(false);
        localStorage.removeItem('aical_is_authenticated');
    };

    return {
        isAuthenticated,
        authError,
        login,
        logout,
        setAuthError // Exposed if needed to clear error on typing
    };
}
