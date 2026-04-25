import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authApi } from '../services/authApi';

const AuthContext = createContext(null);
const GUEST_KEY = 'verbapath_guest_mode';

export const useAuth = () => {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
};

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isGuest, setIsGuest] = useState(() => localStorage.getItem(GUEST_KEY) === '1');

    const refreshMe = useCallback(async () => {
        setLoading(true);
        try {
            const data = await authApi.me();
            setUser(data?.user || null);
            if (data?.user) {
                localStorage.removeItem(GUEST_KEY);
                setIsGuest(false);
            }
        } catch (error) {
            setUser(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        refreshMe();
    }, [refreshMe]);

    const login = useCallback(async (payload) => {
        const data = await authApi.login(payload);
        setUser(data.user);
        localStorage.removeItem(GUEST_KEY);
        setIsGuest(false);
        return data.user;
    }, []);

    const register = useCallback(async (payload) => {
        const data = await authApi.register(payload);
        setUser(data.user);
        localStorage.removeItem(GUEST_KEY);
        setIsGuest(false);
        return data.user;
    }, []);

    const logout = useCallback(async () => {
        try {
            await authApi.logout();
        } finally {
            setUser(null);
            localStorage.removeItem(GUEST_KEY);
            setIsGuest(false);
        }
    }, []);

    const continueAsGuest = useCallback(() => {
        localStorage.setItem(GUEST_KEY, '1');
        setIsGuest(true);
        setUser(null);
    }, []);

    const value = useMemo(() => ({
        user,
        loading,
        isGuest,
        isAuthenticated: Boolean(user),
        canEnterApp: Boolean(user) || isGuest,
        login,
        register,
        logout,
        refreshMe,
        continueAsGuest,
    }), [user, loading, isGuest, login, register, logout, refreshMe, continueAsGuest]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
