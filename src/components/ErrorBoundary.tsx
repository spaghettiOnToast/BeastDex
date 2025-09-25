import { Component, type ReactNode } from "react";
import { Button } from "./ui/button";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
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
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center min-h-[200px] gap-4 p-6">
          <div className="text-center">
            <p className="text-red-400 text-lg mb-2">⚠️ Something went wrong</p>
            <p className="text-gray-400 text-sm mb-4">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
          </div>
          <Button
            onClick={() => this.setState({ hasError: false, error: undefined })}
            className="bg-lsGreen text-black hover:bg-lsGreen/80"
          >
            Try Again
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