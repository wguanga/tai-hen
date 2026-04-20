import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  label?: string;
}

interface State {
  error: Error | null;
  info: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): State {
    return { error, info: null };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[ErrorBoundary:${this.props.label ?? 'root'}]`, error, info);
    this.setState({ error, info });
  }

  reset = (): void => this.setState({ error: null, info: null });

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className="h-full overflow-auto p-4 bg-red-50 dark:bg-red-900/20">
        <div className="max-w-2xl mx-auto">
          <div className="text-lg font-medium text-red-700 dark:text-red-300 mb-2">
            ⚠️ 渲染错误 {this.props.label ? `(${this.props.label})` : ''}
          </div>
          <div className="text-sm text-red-600 dark:text-red-200 mb-3">
            {this.state.error.message}
          </div>
          <details className="text-xs text-gray-600 dark:text-gray-300">
            <summary className="cursor-pointer hover:text-gray-900 dark:hover:text-gray-100">
              堆栈信息（点击展开）
            </summary>
            <pre className="mt-2 p-2 bg-white dark:bg-gray-800 rounded overflow-auto whitespace-pre-wrap">
              {this.state.error.stack}
              {this.state.info?.componentStack}
            </pre>
          </details>
          <button
            onClick={this.reset}
            className="mt-3 text-sm px-3 py-1 rounded bg-red-600 text-white hover:bg-red-700"
          >
            重试
          </button>
        </div>
      </div>
    );
  }
}
