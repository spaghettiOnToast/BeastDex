import { Component, type ReactNode } from "react";
import { Button } from "../ui/button";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

// Check if error is a chunk load failure (happens after new deployments)
function isChunkLoadError(error: Error): boolean {
  const message = error.message || '';
  return (
    message.includes('dynamically imported module') ||
    message.includes('Loading chunk') ||
    message.includes('ChunkLoadError') ||
    error.name === 'ChunkLoadError'
  );
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    // Auto-refresh on chunk load errors (stale deployment)
    if (isChunkLoadError(error)) {
      console.log('Chunk load error detected, refreshing page...');
      // Small delay to avoid refresh loops
      const lastRefresh = sessionStorage.getItem('chunk-error-refresh');
      const now = Date.now();
      if (!lastRefresh || now - parseInt(lastRefresh, 10) > 10000) {
        sessionStorage.setItem('chunk-error-refresh', String(now));
        window.location.reload();
      }
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const isChunkError = this.state.error && isChunkLoadError(this.state.error);

      return (
        <div className="flex flex-col items-center justify-center min-h-[200px] gap-4 p-6">
          <div className="text-center">
            <p className="text-red-400 text-lg mb-2">⚠️ Something went wrong</p>
            <p className="text-gray-400 text-sm mb-4">
              {isChunkError
                ? 'A new version is available. Please refresh the page.'
                : (this.state.error?.message || 'An unexpected error occurred')}
            </p>
          </div>
          <Button
            onClick={() => {
              if (isChunkError) {
                window.location.reload();
              } else {
                this.setState({ hasError: false, error: undefined });
              }
            }}
            className="bg-accent text-black hover:bg-accent/80"
          >
            {isChunkError ? 'Refresh Page' : 'Try Again'}
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}

// Hook-based error boundary for functional components
export function withErrorBoundary<T extends object>(
  WrappedComponent: React.ComponentType<T>,
  fallback?: ReactNode
) {
  return function WithErrorBoundaryComponent(props: T) {
    return (
      <ErrorBoundary fallback={fallback}>
        <WrappedComponent {...props} />
      </ErrorBoundary>
    );
  };
}

export default ErrorBoundary;