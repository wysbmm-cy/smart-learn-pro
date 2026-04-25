import React, { useState } from 'react';
import { ArrowRight, Lock, Mail, ShieldCheck, Sparkles, User } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

const LoginView = ({ onNavigate }) => {
    const { login, register, continueAsGuest } = useAuth();
    const [mode, setMode] = useState('login');
    const [submitting, setSubmitting] = useState(false);
    const [form, setForm] = useState({
        email: '',
        password: '',
        confirmPassword: '',
        nickname: '',
    });

    const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

    const enterApp = () => onNavigate?.('dashboard');

    const handleGuest = () => {
        continueAsGuest();
        toast.success('已进入游客模式，本地学习数据会继续保留在当前设备。');
        enterApp();
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const email = form.email.trim();
        const password = form.password.trim();

        if (!email || !password) {
            toast.error('请填写邮箱和密码');
            return;
        }
        if (password.length < 8) {
            toast.error('密码至少需要 8 位');
            return;
        }
        if (mode === 'register' && password !== form.confirmPassword) {
            toast.error('两次输入的密码不一致');
            return;
        }

        setSubmitting(true);
        try {
            if (mode === 'login') {
                await login({ email, password });
                toast.success('登录成功');
            } else {
                await register({ email, password, nickname: form.nickname.trim() });
                toast.success('注册成功');
            }
            enterApp();
        } catch (error) {
            toast.error(error.message || '账号请求失败');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="h-full w-full overflow-y-auto flex items-center justify-center p-4 md:p-8">
            <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-6">
                <section className="rounded-3xl border border-phy-border bg-phy-glass p-6 md:p-8">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-phy-border text-xs text-phy-muted mb-5">
                        <Sparkles size={14} />
                        VerbaPath Account
                    </div>
                    <h1 className="text-2xl md:text-3xl font-extrabold text-phy-text leading-tight">
                        登录你的语脉账号
                    </h1>
                    <p className="mt-3 text-phy-muted text-sm md:text-base leading-relaxed">
                        第一版账号系统只负责身份登录。闪卡、笔记、写作记录仍保留在本地，后续再接入云同步。
                    </p>
                    <div className="mt-6 space-y-3 text-sm">
                        <div className="flex items-center gap-2 text-phy-text/90">
                            <ShieldCheck size={16} className="text-emerald-400" />
                            支持邮箱密码注册与登录
                        </div>
                        <div className="flex items-center gap-2 text-phy-text/90">
                            <ShieldCheck size={16} className="text-emerald-400" />
                            登录凭证使用 HttpOnly Cookie，前端无法直接读取
                        </div>
                        <div className="flex items-center gap-2 text-phy-text/90">
                            <ShieldCheck size={16} className="text-emerald-400" />
                            可以先用游客模式，不影响当前本地学习数据
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={handleGuest}
                        className="mt-8 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-phy-border text-phy-muted hover:bg-phy-bg transition-colors"
                    >
                        暂不登录，先进入软件
                        <ArrowRight size={15} />
                    </button>
                </section>

                <section className="rounded-3xl border border-phy-border bg-phy-glass p-6 md:p-8">
                    <div className="inline-flex rounded-xl bg-phy-bg border border-phy-border p-1 mb-6">
                        <button
                            type="button"
                            onClick={() => setMode('login')}
                            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${mode === 'login' ? 'bg-blue-600 text-white' : 'text-phy-muted hover:text-phy-text'}`}
                        >
                            登录
                        </button>
                        <button
                            type="button"
                            onClick={() => setMode('register')}
                            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${mode === 'register' ? 'bg-blue-600 text-white' : 'text-phy-muted hover:text-phy-text'}`}
                        >
                            注册
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {mode === 'register' && (
                            <label className="block">
                                <span className="text-xs font-semibold text-phy-muted">昵称（可选）</span>
                                <div className="mt-2 relative">
                                    <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-phy-muted" />
                                    <input
                                        type="text"
                                        value={form.nickname}
                                        onChange={(e) => update('nickname', e.target.value)}
                                        className="w-full pl-9 pr-3 py-3 rounded-xl border border-phy-border bg-phy-bg text-phy-text outline-none focus:ring-2 focus:ring-blue-500/25"
                                        placeholder="你的昵称"
                                    />
                                </div>
                            </label>
                        )}

                        <label className="block">
                            <span className="text-xs font-semibold text-phy-muted">邮箱</span>
                            <div className="mt-2 relative">
                                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-phy-muted" />
                                <input
                                    type="email"
                                    value={form.email}
                                    onChange={(e) => update('email', e.target.value)}
                                    className="w-full pl-9 pr-3 py-3 rounded-xl border border-phy-border bg-phy-bg text-phy-text outline-none focus:ring-2 focus:ring-blue-500/25"
                                    placeholder="name@example.com"
                                    autoComplete="email"
                                />
                            </div>
                        </label>

                        <label className="block">
                            <span className="text-xs font-semibold text-phy-muted">密码</span>
                            <div className="mt-2 relative">
                                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-phy-muted" />
                                <input
                                    type="password"
                                    value={form.password}
                                    onChange={(e) => update('password', e.target.value)}
                                    className="w-full pl-9 pr-3 py-3 rounded-xl border border-phy-border bg-phy-bg text-phy-text outline-none focus:ring-2 focus:ring-blue-500/25"
                                    placeholder="至少 8 位"
                                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                                />
                            </div>
                        </label>

                        {mode === 'register' && (
                            <label className="block">
                                <span className="text-xs font-semibold text-phy-muted">确认密码</span>
                                <div className="mt-2 relative">
                                    <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-phy-muted" />
                                    <input
                                        type="password"
                                        value={form.confirmPassword}
                                        onChange={(e) => update('confirmPassword', e.target.value)}
                                        className="w-full pl-9 pr-3 py-3 rounded-xl border border-phy-border bg-phy-bg text-phy-text outline-none focus:ring-2 focus:ring-blue-500/25"
                                        placeholder="再次输入密码"
                                        autoComplete="new-password"
                                    />
                                </div>
                            </label>
                        )}

                        <button
                            type="submit"
                            disabled={submitting}
                            className="w-full mt-2 py-3 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                        >
                            {submitting ? '处理中...' : mode === 'login' ? '登录' : '注册并登录'}
                        </button>
                    </form>
                </section>
            </div>
        </div>
    );
};

export default LoginView;
