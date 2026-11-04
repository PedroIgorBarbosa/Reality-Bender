import { Route, Routes } from 'react-router-dom';
import { ControlPage } from './routes/ControlPage';
import { NotFoundPage } from './routes/NotFoundPage';
import { StagePage } from './routes/StagePage';

export function App() {
  return (
    <Routes>
      <Route path="/stage" element={<StagePage />} />
      <Route path="/control" element={<ControlPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
