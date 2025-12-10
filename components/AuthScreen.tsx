
import React, { useState, useEffect } from 'react';
import { Mail, Lock, User, ArrowRight, Eye, EyeOff, AlertCircle, Loader2, Code2, AlertTriangle, KeyRound } from 'lucide-react';
import { db } from '../services/db';
import { UserProfile } from '../types';

interface AuthScreenProps {
  onLoginSuccess: (profile: UserProfile) => void;
}

const AuthScreen: React.FC<AuthScreenProps> = ({ onLoginSuccess }) => {
  const [view, setView] = useState<'login' | 'register' | 'reset'>('login'); // Reverted to login as default
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Form State
  const [name, setName] = useState('');
  const [loginIdentifier, setLoginIdentifier] = useState(''); 
  const [password, setPassword] = useState(''); 

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!loginIdentifier.trim() || !password) {
        setError('Заполните все поля');
        return;
    }

    if (view === 'register' && !name.trim()) {
        setError('Введите ваше имя');
        return;
    }

    setIsLoading(true);

    try {
        let profile: UserProfile;
        const cleanLoginIdentifier = loginIdentifier.trim();
        
        if (view === 'login') {
            profile = await db.login(cleanLoginIdentifier, password);
        } else if (view === 'register') {
            profile = await db.register(name.trim(), cleanLoginIdentifier, password);
        } else {
            // Reset
            profile = await db.resetPassword(cleanLoginIdentifier, password);
        }
        
        onLoginSuccess(profile);
    } catch (err: any) {
        console.error("Auth error:", err);
        setError(err.message || 'Произошла ошибка. Попробуйте еще раз.');
        setIsLoading(false);
    }
  };

  const handleDevLogin = () => {
      const profile = db.loginAsDev();
      onLoginSuccess(profile);
  };

  const handleHardReset = () => {
      if (confirm("Вы уверены? Это удалит все данные с этого устройства (но они останутся на сервере).")) {
          db.clearAllData();
      }
  };

  const getTitle = () => {
      switch(view) {
          case 'login': return 'Добро пожаловать обратно';
          case 'register': return 'Создайте аккаунт';
          case 'reset': return 'Сброс пароля'; 
      }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex flex-col items-center justify-center p-4 transition-colors duration-200">
      <div className="w-full max-w-md bg-white dark:bg-slate-800 rounded-2xl shadow-xl overflow-hidden animate-modal flex flex-col">
        
        {/* Header */}
        <div className="px-8 pt-8 pb-6 text-center">
          <h1 className="text-3xl font-bold text-slate-800 dark:text-white mb-2 tracking-tight">ZenChat</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            {getTitle()}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-8 pb-8 space-y-5 flex-1">
          
          {error && (
              <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-xl text-sm flex items-center gap-2 animate-in slide-in-from-top-2">
                  <AlertCircle size={18} />
                  {error}
              </div>
          )}

          {view === 'reset' && (
              <div className="bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 p-3 rounded-xl text-xs flex items-start gap-2">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                  <span>Внимание: Это принудительно установит новый пароль для указанного Email или юзернейма. Используйте только если не можете войти.</span>
              </div>
          )}

          {view === 'register' && (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-500 uppercase ml-1">Имя</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User size={18} className="text-gray-400" />
                </div>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl text-slate-800 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  placeholder="Ваше имя"
                  disabled={isLoading}
                />
              </div>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-500 uppercase ml-1">Email или имя пользователя</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Mail size={18} className="text-gray-400" />
              </div>
              <input
                type="text" 
                value={loginIdentifier}
                onChange={(e) => setLoginIdentifier(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl text-slate-800 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                placeholder="Email или имя пользователя" 
                required
                disabled={isLoading}
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-500 uppercase ml-1">
                {view === 'reset' ? 'Новый пароль' : 'Пароль'}
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                {view === 'reset' ? <KeyRound size={18} className="text-gray-400" /> : <Lock size={18} className="text-gray-400" />}
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-12 py-3 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl text-slate-800 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                placeholder="••••••••"
                required
                disabled={isLoading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                disabled={isLoading}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className={`w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3.5 rounded-xl shadow-lg shadow-blue-500/30 flex items-center justify-center gap-2 transform active:scale-[0.98] transition-all ${isLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
          >
            {isLoading ? <Loader2 size={20} className="animate-spin" /> : <ArrowRight size={20} />}
            <span>
                {view === 'login' ? 'Войти' : (view === 'reset' ? 'Сменить пароль и войти' : 'Зарегистрироваться')}
            </span>
          </button>

          <div className="flex justify-between pt-2">
            {view === 'login' ? (
                <>
                    <button type="button" onClick={() => { setView('reset'); setError(''); setLoginIdentifier(''); setPassword(''); }} className="text-sm text-gray-500 hover:text-blue-600 transition-colors">
                        Забыли пароль?
                    </button>
                    <button type="button" onClick={() => { setView('register'); setError(''); setLoginIdentifier(''); setPassword(''); setName(''); }} className="text-sm text-blue-600 hover:text-blue-700 font-medium transition-colors">
                        Создать аккаунт
                    </button>
                </>
            ) : (
                <button type="button" onClick={() => { setView('login'); setError(''); setLoginIdentifier(''); setPassword(''); setName(''); }} className="w-full text-center text-sm text-blue-600 hover:text-blue-700 font-medium transition-colors">
                    Вернуться ко входу
                </button>
            )}
          </div>

        </form>
        
        <div className="bg-gray-50 dark:bg-slate-900/50 p-4 border-t border-gray-100 dark:border-slate-700 flex flex-col gap-2">
            <button 
                type="button" 
                onClick={handleHardReset}
                className="w-full flex items-center justify-center gap-2 text-xs text-red-400 hover:text-red-500 transition-colors uppercase tracking-wider font-semibold"
            >
                Проблемы со входом? Сбросить данные
            </button>
            
            <button 
                type="button" 
                onClick={handleDevLogin}
                className="w-full flex items-center justify-center gap-2 text-xs text-gray-500 dark:text-gray-400 hover:text-slate-800 dark:hover:text-white transition-colors uppercase tracking-wider font-semibold"
            >
                <Code2 size={14} />
                Войти как разработчик (Skip)
            </button>
        </div>
      </div>
    </div>
  );
};

export default AuthScreen;