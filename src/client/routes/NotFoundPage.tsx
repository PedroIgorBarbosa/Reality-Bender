import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <main className="fatal-page">
      <p className="eyebrow">REALITY BENDER / 404</p>
      <h1>Página não encontrada.</h1>
      <p>Esta rota não faz parte da aplicação.</p>
      <Link className="primary-link" to="/stage">Abrir tela de apresentação</Link>
    </main>
  );
}
