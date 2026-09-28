'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  fallback: ReactNode;
  /** When this value changes, the boundary resets and tries rendering again. */
  resetKey?: unknown;
  children: ReactNode;
}

interface State {
  hasError: boolean;
  prevResetKey: unknown;
}

/**
 * Contains render failures (e.g. unexpected element data) to one subtree
 * instead of taking down the whole editor.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, prevResetKey: props.resetKey };
  }

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey !== state.prevResetKey ? { hasError: false, prevResetKey: props.resetKey } : null;
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Render error contained by ErrorBoundary', error, info.componentStack);
  }

  override render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}
