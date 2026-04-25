import React, { useState } from 'react';
import { Lock, Mail, User, ShieldCheck, ArrowRight, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';

const LoginView = ({ onNavigate }) => {
    const [mode, setMode] = useState('login');
    const [form, setForm] = useState({
        email: '',
        password: '',
        confirmPassword: '',
        nickname: '',
    });

    const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!form.email.trim() || !form.password.trim()) {
            toast.error('请先填写邮箱和密码');
            return;
        }
        if (mode === 'register' && form.password !== form.confirmPassword) {
            toast.error('两次密码不一致');
            return;
        }
        toast.success('登录系统前端已就绪，后续可接入后端认证');
    };

    return (
        <div className="h-full w-full flex items-center justify-center p-4 md:p-8">
            <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-6">
                <section className="rounded-3xl border border-phy-border bg-phy-glass p-6 md:p-8">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-phy-border text-xs text-phy-muted mb-5">
                        <Sparkles size={14} />
                        VerbaPath Account
                    </div>
                    <h1 className="text-2xl md:text-3xl font-extrabold text-phy-text leading-tight">
                        登录你的学习账号
                    </h1>
                    <p className="mt-3 text-phy-muted text-sm md:text-base">
                        当前是前端 UI 版本。你后续可接入手机号、邮箱验证码、第三方登录或你自己的账号系统。
                    </p>
                    <div className="mt-6 space-y-3 text-sm">
                        <div className="flex items-center gap-2 text-phy-text/90"><ShieldCheck size={16} className="text-emerald-400" /> 学习数据与账号体系解耦，迁移更容易</div>
                        <div className="flex items-center gap-2 text-phy-text/90"><ShieldCheck size={16} className="text-emerald-400" /> 可扩展多端同步（Web / 桌面 / 移动端）</div>
                        <div className="flex items-center gap-2 text-phy-text/90"><ShieldCheck size={16} className="text-emerald-400" /> 后续可加团队成员与权限管理</div>
                    </div>
                    <button
                        type="button"
                        onClick={() => onNavigate?.('dashboard')}
                        className="mt-8 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-phy-border text-phy-muted hover:bg-phy-bg transition-colors"
                    >
                        先进入软件
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
                                    />
                                </div>
                            </label>
                        )}

                        <button
                            type="submit"
                            className="w-full mt-2 py-3 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-500 transition-colors"
                        >
                            {mode === 'login' ? '登录（前端演示）' : '注册（前端演示）'}
                        </button>
                    </form>
                </section>
            </div>
        </div>
    );
};

export default LoginView;
