import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { ControlPage } from './routes/ControlPage';
import { NotFoundPage } from './routes/NotFoundPage';
import { StagePage } from './routes/StagePage';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/stage" replace />} />
      <Route path="/stage" element={<StagePage />} />
      <Route path="/control" element={<ControlPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export function App() {
  return (
    <AppErrorBoundary>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AppErrorBoundary>
  );
}
