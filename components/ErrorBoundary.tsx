
import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  private handleReset = () => {
    // Aggressively clear all data using native API to avoid dependency issues
    try {
        localStorage.clear();
        sessionStorage.clear();
        // Force reload without cache
        window.location.reload();
    } catch (e) {
        console.error("Failed to clear storage", e);
        window.location.href = '/';
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex flex-col items-center justify-center p-4 font-sans text-slate-800 dark:text-white">
          <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-xl max-w-md w-full text-center border border-gray-100 dark:border-slate-700">
            <div className="w-20 h-20 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertTriangle size={40} className="text-red-500" />
            </div>
            
            <h1 className="text-2xl font-bold mb-2">Что-то пошло не так</h1>
            <p className="text-gray-500 dark:text-gray-400 mb-6 text-sm">
              Приложение столкнулось с критической ошибкой.
            </p>

            <div className="bg-gray-100 dark:bg-slate-900 p-3 rounded-lg text-xs font-mono text-left mb-6 overflow-x-auto text-red-500 max-h-32">
              {this.state.error?.toString() || "Unknown Error"}
            </div>

            <button 
              onClick={this.handleReset}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-xl flex items-center justify-center gap-2 transition-colors shadow-lg shadow-blue-500/30"
            >
              <Trash2 size={18} />
              Сбросить данные и перезагрузить
            </button>
            
            <p className="mt-4 text-xs text-gray-400">
              Это действие очистит локальные настройки и кэш.
            </p>
          </div>
        </div>
      );
    }

    // Fixed a TypeScript error where 'this.props' was not recognized on the ErrorBoundary type.
    // The access to 'this.props.children' is standard in React class components;
    // this adjustment ensures robust type inference,
    // potentially resolving linter or TypeScript configuration ambiguities.
    const children = this.props.children;
    return children;
  }
}

export default ErrorBoundary;
