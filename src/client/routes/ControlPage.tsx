import { Link, useLocation } from 'react-router-dom';
import { ConnectionStatus } from '../components/ConnectionStatus';
import { useSystemConnection } from '../hooks/use-system-connection';

export function ControlPage() {
  const { state, reconnect } = useSystemConnection();
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  const invitePresent = params.has('invite') || params.has('token');
  const disconnected = state.phase === 'OFFLINE' || state.phase === 'ERROR';

  return (
    <main className="app-shell control-shell">
      <header className="topbar">
        <Link className="brand" to="/stage"><span className="brand-symbol" aria-hidden="true">◇</span> REALITY <span>BENDER</span></Link>
        <span className="topbar-tag">CONTROL / 01</span>
      </header>
      <div className="control-content">
        <p className="eyebrow">INTERFACE MÓVEL · FUNDAÇÃO TÉCNICA</p>
        <h1>Controle móvel</h1>
        <p className="intro">O celular será a fonte de vídeo da apresentação. Nenhuma câmera é iniciada nesta etapa.</p>
        <ConnectionStatus state={state} />
        {disconnected && (
          <div className="recovery">
            <p>Verifique o servidor, a rede e as origens permitidas.</p>
            <button type="button" onClick={reconnect}>Reconectar servidor</button>
          </div>
        )}
        <section className="mobile-preview" aria-label="Área reservada para prévia da câmera">
          <span className="empty-icon" aria-hidden="true">◎</span>
          <h2>Câmera não iniciada</h2>
          <p>Prévia indisponível. Nenhuma permissão foi solicitada.</p>
        </section>
        <section className="control-section">
          <h2>Preparação</h2>
          <p>{invitePresent
            ? 'Convite recebido na URL. A validação do convite será implementada na issue #2.'
            : 'Abra esta página pelo QR Code quando o pareamento estiver disponível (issue #2).'}</p>
          <p>Na etapa de câmera, mantenha o rosto e as duas mãos enquadrados, com boa iluminação.</p>
          <p><strong>Estado da câmera:</strong> Ainda não implementada.</p>
        </section>
        <div className="control-actions" aria-label="Controles futuros">
          <button type="button" disabled>Iniciar câmera <small>Issue #3</small></button>
          <button type="button" disabled>Parar transmissão <small>Issue #3</small></button>
          <button type="button" disabled>Trocar efeito <small>Issue #6</small></button>
        </div>
        <Link className="text-link" to="/stage">Voltar à tela de apresentação</Link>
      </div>
    </main>
  );
}
