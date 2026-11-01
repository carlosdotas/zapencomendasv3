import { useEffect, useRef } from 'react';
import { backNavigationService, BackHandlerFn } from '../services/backNavigationService';

/**
 * Hook para interceptar o botão Voltar do Android, gesto de voltar ou tecla Esc.
 * 
 * @param id Identificador único para a janela/ação
 * @param isActive Se a janela ou condição está aberta/ativa
 * @param onBack Callback acionado ao voltar. Pode retornar 'keep_open' para avançar/retroceder sub-etapas internas sem fechar o modal.
 * @param priority Prioridade na pilha (quanto maior, mais prioritário para fechar primeiro)
 */
export function useBackButton(
  id: string,
  isActive: boolean,
  onBack: BackHandlerFn,
  priority: number = 0
) {
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    if (!isActive) return;

    const handler: BackHandlerFn = () => {
      return onBackRef.current();
    };

    backNavigationService.push(id, handler, priority);

    return () => {
      backNavigationService.remove(id, true);
    };
  }, [id, isActive, priority]);
}
