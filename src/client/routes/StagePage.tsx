import { Link } from 'react-router-dom';
import { ConnectionStatus } from '../components/ConnectionStatus';
import { useSystemConnection } from '../hooks/use-system-connection';

export function StagePage() {
  const { state, reconnect } = useSystemConnection();
  const disconnected = state.phase === 'OFFLINE' || state.phase === 'ERROR';

  return (
    <main className="app-shell stage-shell">
      <header className="topbar">
        <Link className="brand" to="/stage"><span className="brand-symbol" aria-hidden="true">◇</span> REALITY <span>BENDER</span></Link>
        <div className="topbar-right">
          <span className="topbar-tag">STAGE / 01</span>
          <Link className="text-link" to="/control">Ver controle móvel</Link>
        </div>
      </header>

      <div className="stage-layout">
        <div className="stage-heading">
          <p className="eyebrow">PROJEÇÃO · FUNDAÇÃO TÉCNICA</p>
          <h1>Tela de apresentação</h1>
          <p>A interface está preparada. A transmissão da câmera e os efeitos serão integrados nas próximas issues.</p>
        </div>

        <section className="projection-panel" aria-label="Área reservada para projeção">
          <div className="projection-content">
            <span className="empty-icon" aria-hidden="true">◇</span>
            <p className="eyebrow">AGUARDANDO IMPLEMENTAÇÃO</p>
            <h2>Vídeo ao vivo ainda indisponível</h2>
            <p>Esta área não exibe imagens artificiais. A captura WebRTC será adicionada na issue #3.</p>
          </div>
          <span className="projection-label">SEM FONTE DE VÍDEO</span>
        </section>

        <aside className="operations-panel">
          <div className="section-heading">
            <h2>Estado operacional</h2>
            <span>01 / FUNDAÇÃO</span>
          </div>
          <ConnectionStatus state={state} />
          {state.phase === 'ONLINE' && <p className="assistive-message">Servidor conectado; sessão de apresentação ainda não implementada.</p>}
          {disconnected && (
            <div className="recovery">
              <p>Verifique se <code>npm run dev</code> está ativo e se esta origem está autorizada no servidor.</p>
              <button type="button" onClick={reconnect}>Reconectar servidor</button>
            </div>
          )}
          <dl className="system-facts">
            <div><dt>Sessão de apresentação</dt><dd>Issue #2 · Não implementada</dd></div>
            <div><dt>Celular pareado</dt><dd>Não disponível nesta etapa</dd></div>
            <div><dt>Vídeo ao vivo</dt><dd>Não disponível nesta etapa</dd></div>
          </dl>
          <div className="section-heading section-heading--controls"><h2>Controles de apresentação</h2></div>
          <div className="planned-controls">
            <button type="button" disabled>Criar sessão / QR <span>Issue #2</span></button>
            <button type="button" disabled>Exibir vídeo / tela cheia <span>Issues #3–#4</span></button>
            <button type="button" disabled>Energia · Portal · Aura <span>Issues #6–#8</span></button>
          </div>
          <p className="panel-footer">Apenas a verificação técnica de comunicação está habilitada.</p>
        </aside>
      </div>
    </main>
  );
}
