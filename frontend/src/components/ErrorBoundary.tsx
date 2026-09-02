import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

/**
 * The last line of defence between a thrown render and a white screen.
 *
 * React unmounts the entire tree when a render throws and nothing catches it.
 * With no boundary anywhere, that meant a blank page — no message, no reload
 * affordance, nothing to say what happened. `useDevice` reading an unavailable
 * `localStorage` was exactly that failure, and it took the whole app down; the
 * specific bug is fixed, but the class of bug is not, and a demo is the worst
 * possible place to discover the next one.
 *
 * Deliberately dependency-free. It does not use the shared primitives, the API
 * client, the router or any hook: a boundary that can itself throw is not a
 * boundary. Only the colour tokens are used, and those are plain CSS variables
 * that resolve even if every module above failed to load.
 *
 * It shows the error rather than a friendly nothing. The person in front of
 * this screen is a developer or a presenter, and "Something went wrong" would
 * cost them the one piece of information worth having.
 */

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Kept on the console as well as on screen: the component stack is far more
    // useful than the message alone, and it is too long to render.
    console.error('Unhandled render error:', error, info.componentStack);
  }

  private reload = () => {
    window.location.reload();
  };

  private dismiss = () => {
    // Clearing the error re-renders the children. Worth offering: a transient
    // failure in one panel should not require losing the whole session.
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        role="alert"
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '32px',
          background: 'var(--bg, #F7F8FC)',
          color: 'var(--text, #191C21)',
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        }}
      >
        <div style={{ maxWidth: '640px', width: '100%' }}>
          <h1
            style={{
              fontSize: '24px',
              fontWeight: 600,
              margin: '0 0 8px',
              color: 'var(--heading, #0B3B75)',
            }}
          >
            This screen failed to render
          </h1>
          <p
            style={{
              fontSize: '14px',
              lineHeight: 1.6,
              margin: '0 0 16px',
              color: 'var(--text-muted, #424752)',
            }}
          >
            The rest of the application is unaffected. Reloading restores it; the
            error below is what actually went wrong.
          </p>

          <pre
            style={{
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: '12px',
              lineHeight: 1.5,
              padding: '12px',
              margin: '0 0 16px',
              overflowX: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              borderRadius: '10px',
              border: '1px solid var(--danger-border, #E8A9A4)',
              background: 'var(--danger-bg, #FFDAD6)',
              color: 'var(--danger, #BA1A1A)',
            }}
          >
            {error.name}: {error.message}
          </pre>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={this.reload}
              style={{
                fontSize: '16px',
                fontWeight: 600,
                padding: '12px 20px',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                background: 'var(--accent, #0056B3)',
                color: 'var(--accent-text, #FFFFFF)',
              }}
            >
              Reload
            </button>
            <button
              onClick={this.dismiss}
              style={{
                fontSize: '16px',
                fontWeight: 600,
                padding: '12px 20px',
                borderRadius: '8px',
                cursor: 'pointer',
                background: 'transparent',
                border: '1px solid var(--accent, #0056B3)',
                color: 'var(--accent, #0056B3)',
              }}
            >
              Try again without reloading
            </button>
          </div>
        </div>
      </div>
    );
  }
}
