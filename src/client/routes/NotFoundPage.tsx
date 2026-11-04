import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <main className="not-found-page" role="alert">
      <p className="eyebrow">404 · ROTA INEXISTENTE</p>
      <h1>Página não encontrada</h1>
      <p>Utilize uma das rotas oficiais do Reality Bender:</p>
      <div className="not-found-links">
        <Link to="/stage">Ir para o Palco (/stage)</Link>
        <Link to="/control">Ir para o Controle Móvel (/control)</Link>
      </div>
    </main>
  );
}
