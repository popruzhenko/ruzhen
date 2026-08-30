import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/global.scss';
import { App } from './App';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { ToastProvider } from './components/ui/Toast/ToastProvider';

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <QueryClientProvider client={new QueryClient()}>
            <ToastProvider position="bottom">
                <BrowserRouter>
                    <App />
                </BrowserRouter>
            </ToastProvider>
        </QueryClientProvider>
    </StrictMode>,
);
