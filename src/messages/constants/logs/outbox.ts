export const OUTBOX_LOGS = {
  // outbox-signal
  SIGNAL_PUBLISH_FAILED:
    'Não foi possível publicar sinal de nova outbox. O cron job continuará funcionando como fallback.',
  SIGNAL_PROCESSING_ERROR: 'Erro ao processar sinal de Outbox',
  UNEXPECTED_CHANNEL: 'Mensagem recebida em canal inesperado. Ignorando.',
  LISTENER_REMOVED: 'Listener anterior de OutboxSignal removido com sucesso',
  SUBSCRIBE_ERROR: '❌ Erro ao subscrever ao canal de OutboxSignal',
  PUBLISHER_CONNECTED: '✅ Redis publisher conectado ao outbox-signal',
  PUBLISHER_ERROR: '❌ Redis publisher error no outbox-signal',
  PUBLISHER_CLOSED: '⚠️ Redis publisher connection fechada para outbox-signal',
  SUBSCRIBER_CONNECTED: '✅ Redis subscriber conectado para outbox-signal',
  SUBSCRIBER_ERROR: '❌ Redis subscriber error no outbox-signal',
  SUBSCRIBER_CLOSED: '⚠️ Redis subscriber connection fechada para outbox-signal',
  // outbox-cron
  CRON_START: '⏰ Cron de meia-noite: iniciando varredura de segurança da Outbox...',
  PHASE1_DONE: '✅ Fase 1 (recuperação SENDING): concluída.',
  PHASE1_ERROR: '❌ Fase 1 (recuperação SENDING): erro inesperado.',
  PHASE2_DONE: '✅ Fase 2 (eventos PENDING): concluída.',
  PHASE2_ERROR: '❌ Fase 2 (eventos PENDING): erro inesperado.',
  SCAN_DONE: '✅ Varredura de segurança da Outbox concluída.',
  SCHEDULER_CONFIGURED: '🗓️ Agendador da Outbox configurado para 00:00 diariamente.',
  // outbox-processor
  SKIPPED_ANOTHER_RUNNING: 'processEvents: Processamento ignorado. Outra instância já está rodando.',
  PENDING_FETCH_ERROR: '❌ Erro de Infra ao buscar eventos pendentes.',
  STUCK_FETCH_ERROR: '❌ Erro de Infra ao buscar eventos travados na Outbox.',
  STATUS_UPDATE_FAILED: '❌ Falha ao atualizar status para SENDING. Evento permanece em PENDING.',
  REVERT_FATAL: '🚨 FATAL: Falha ao reverter status para PENDING. Inconsistência na DB.',
  DISPATCH_REVERTED: '❌ Falha no dispatch, revertido para PENDING',
  CRITICAL_LOOP_ERROR: '❌ Erro crítico inesperado no loop principal de processEvents',
  CRITICAL_RECOVERY_ERROR: '❌ Erro crítico inesperado no recoverStuckSendingEvents',
} as const
