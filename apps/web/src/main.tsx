import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntApp, ConfigProvider } from 'antd';
import uzUZ from 'antd/locale/uz_UZ';
import ruRU from 'antd/locale/ru_RU';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import 'dayjs/locale/uz-latn';
import { theme } from './theme';
import { I18nProvider, useI18n } from './lib/i18n';
import { AuthProvider } from './lib/auth';
import { App } from './App';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: true,
      retry: (count, err: any) => err?.response?.status >= 500 && count < 2,
    },
  },
});

function Themed() {
  const { lang } = useI18n();
  dayjs.locale(lang === 'ru' ? 'ru' : 'uz-latn');
  return (
    <ConfigProvider theme={theme} locale={lang === 'ru' ? ruRU : uzUZ}>
      <AntApp>
        <AuthProvider>
          <App />
        </AuthProvider>
      </AntApp>
    </ConfigProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <QueryClientProvider client={queryClient}>
        <I18nProvider>
          <Themed />
        </I18nProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
