
import React, { useState } from 'react';
import { Mail, Lock, User, ArrowRight, Eye, EyeOff, AlertCircle, Loader2, Code2 } from 'lucide-react';
import { db } from '../services/db';
import { UserProfile } from '../types';

interface AuthScreenProps {
  onLoginSuccess: (profile: UserProfile) => void;
}

const AuthScreen: React.FC<AuthScreenProps> = ({ onLoginSuccess }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Form State
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!email.trim() || !password) {
        setError('Заполните все поля');
        return;
    }

    if (!isLogin && !name.trim()) {
        setError('Введите ваше имя');
        return;
    }

    setIsLoading(true);

    try {
        let profile: UserProfile;
        const cleanEmail = email.trim();
        
        if (isLogin) {
            profile = await db.login(cleanEmail, password);
        } else {
            profile = await db.register(name.trim(), cleanEmail, password);
        }
        
        // Successful login/register will switch screens, so we don't set loading to false here
        // to avoid "update on unmounted component" warning.
        onLoginSuccess(profile);
    } catch (err: any) {
        console.error("Auth error:", err);
        setError(err.message || 'Произошла ошибка. Попробуйте еще раз.');
        setIsLoading(false); // Only stop loading if there was an error
    }
  };

  const handleDevLogin = () => {
      const profile = db.loginAsDev();
      onLoginSuccess(profile);
  };

  const toggleMode = () => {
      setIsLogin(!isLogin);
      setError('');
      setPassword('');
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex flex-col items-center justify-center p-4 transition-colors duration-200">
      <div className="w-full max-w-md bg-white dark:bg-slate-800 rounded-2xl shadow-xl overflow-hidden animate-modal">
        
        {/* Header */}
        <div className="px-8 pt-8 pb-6 text-center">
          <h1 className="text-3xl font-bold text-slate-800 dark:text-white mb-2 tracking-tight">ZenChat</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            {isLogin ? 'Добро пожаловать обратно' : 'Создайте аккаунт для общения'}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-8 pb-8 space-y-5">
          
          {error && (
              <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-xl text-sm flex items-center gap-2 animate-in slide-in-from-top-2">
                  <AlertCircle size={18} />
                  {error}
              </div>
          )}

          {!isLogin && (
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
            <label className="text-xs font-semibold text-gray-500 uppercase ml-1">Email</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Mail size={18} className="text-gray-400" />
              </div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl text-slate-800 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                placeholder="name@example.com"
                required
                disabled={isLoading}
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-500 uppercase ml-1">Пароль</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock size={18} className="text-gray-400" />
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
            <span>{isLogin ? 'Войти' : 'Зарегистрироваться'}</span>
          </button>

          <div className="text-center pt-2">
            <button
              type="button"
              onClick={toggleMode}
              disabled={isLoading}
              className="text-sm text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 transition-colors font-medium"
            >
              {isLogin ? 'Нет аккаунта? Создать' : 'Уже есть аккаунт? Войти'}
            </button>
          </div>

        </form>

        <div className="bg-gray-50 dark:bg-slate-900/50 p-4 border-t border-gray-100 dark:border-slate-700">
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
