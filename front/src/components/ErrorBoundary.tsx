import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Lumiere App Error caught by ErrorBoundary:', error, errorInfo);
    this.setState({ error, errorInfo });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleReset = () => {
    try {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    } catch {}
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full bg-[#0a0a0f] text-white flex flex-col items-center justify-center p-6 text-center select-none">
          <div className="max-w-md w-full bg-white/5 border border-white/10 rounded-2xl p-8 backdrop-blur-xl shadow-2xl flex flex-col items-center">
            <div className="w-16 h-16 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center mb-6">
              <AlertTriangle className="w-8 h-8" />
            </div>
            
            <h1 className="text-xl font-semibold mb-2">Произошла ошибка интерфейса</h1>
            <p className="text-sm text-white/60 mb-6">
              Приложение столкнулось с непредвиденной ошибкой. Попробуйте перезагрузить страницу.
            </p>

            {this.state.error && (
              <div className="w-full text-left bg-black/40 border border-white/10 rounded-xl p-3 mb-6 overflow-x-auto text-xs font-mono text-red-300 max-h-32">
                {this.state.error.toString()}
              </div>
            )}

            <div className="flex flex-col gap-3 w-full">
              <button
                onClick={this.handleReload}
                className="w-full py-3 px-4 rounded-xl bg-white/10 hover:bg-white/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 font-medium"
              >
                <RefreshCw className="w-4 h-4" />
                Перезагрузить приложение
              </button>

              <button
                onClick={this.handleReset}
                className="w-full py-2.5 px-4 rounded-xl text-white/40 hover:text-white/80 hover:bg-white/5 active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-xs"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Сбросить сессию и войти заново
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
