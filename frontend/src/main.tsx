import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App.tsx';
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
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
