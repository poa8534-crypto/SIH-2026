import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ThemeProvider } from './hooks/useTheme';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchInterval: (query) => {
        const key = query.queryKey[0] as string;
        // 3-second refetchInterval on list queries.
        //
        // 'conflicts' and 'auditRecent' were missing, which meant Home's tiles
        // and review list ticked over after an ingest while Recent Activity and
        // Source Conflicts — the two panels that actually prove a write
        // happened — stayed frozen until the route remounted.
        return ['reviewQueue', 'schedule', 'jobs', 'conflicts', 'auditRecent'].includes(key)
          ? 3000
          : false;
      },
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <App />
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
