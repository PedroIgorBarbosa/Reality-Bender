import type { ConnectionState } from '../../shared/types/connection-state';

const names: Record<ConnectionState['phase'], string> = {
  IDLE: 'Conexão ainda não iniciada',
  CONNECTING: 'Conectando ao servidor',
  ONLINE: 'Servidor conectado',
  RECONNECTING: 'Tentando reconectar ao servidor',
  OFFLINE: 'Servidor desconectado',
  ERROR: 'Erro de conexão',
};

export function ConnectionStatus({ state }: { state: ConnectionState }) {
  const isError = state.phase === 'ERROR';
  return (
    <div
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      className={'connection-state connection-state--' + state.phase.toLowerCase()}
      data-phase={state.phase}
    >
      <span className="status-orb" aria-hidden="true" />
      <div>
        <strong>{names[state.phase]}</strong>
        {state.phase === 'ONLINE' && <small>Protocolo de sinalização v{state.protocolVersion} verificado. Nenhuma sessão está ativa.</small>}
        {state.phase === 'ERROR' && <small>{state.message}</small>}
        {state.phase === 'OFFLINE' && <small>{state.reason}</small>}
        {state.phase === 'RECONNECTING' && <small>Tentativa {state.attempt} de reconexão</small>}
      </div>
    </div>
  );
}
