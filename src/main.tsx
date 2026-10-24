import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import Site from './Site';
import './styles.css';
import './site.css';

class AppErrorBoundary extends React.Component<React.PropsWithChildren, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Cutline crashed while rendering.', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return <main className="startup-error" role="alert">
        <div className="startup-error-mark">C</div>
        <h1>Cutline hit an error</h1>
        <p>The app could not finish rendering. The error details below can help identify the problem instead of leaving a blank page.</p>
        <pre>{this.state.error.message}</pre>
        <button onClick={() => window.location.reload()}>Reload Cutline</button>
      </main>;
    }
    return this.props.children;
  }
}

function CutlineRouter() {
  const [isEditor, setIsEditor] = useState(() => window.location.hash === '#/editor');

  useEffect(() => {
    const syncRoute = () => setIsEditor(window.location.hash === '#/editor');
    window.addEventListener('hashchange', syncRoute);
    return () => window.removeEventListener('hashchange', syncRoute);
  }, []);

  return isEditor ? <App /> : <Site />;
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  document.body.innerHTML = '<main style="font:14px system-ui;padding:32px;color:#eee;background:#17191c;min-height:100vh"><h1>Cutline failed to start</h1><p>The root element was not found. Check index.html.</p></main>';
} else {
  createRoot(rootElement).render(
    <React.StrictMode><AppErrorBoundary><CutlineRouter /></AppErrorBoundary></React.StrictMode>,
  );
}
