export const OUTBOX_LOGS = {
  // outbox-signal
  SIGNAL_PUBLISH_FAILED:
    'Não foi possível publicar sinal de envio da nova outbox. O cron job continuará funcionando como fallback.',
  SIGNAL_PROCESSING_ERROR: 'Erro ao processar sinal de envio do Outbox',
  UNEXPECTED_CHANNEL: 'Mensagem recebida em canal inesperado. Ignorando.',
  LISTENER_REMOVED: 'Listener anterior de OutboxSignal removido com sucesso',
  SUBSCRIBE_ERROR: 'Erro ao se inscrever no canal de OutboxSignal',
  PUBLISHER_CONNECTED: 'Redis publisher conectado ao outbox-signal',
  PUBLISHER_ERROR: 'Erro no publicador Redis do outbox-signal',
  PUBLISHER_CLOSED: 'Conexão do publicador Redis fechada para outbox-signal',
  SUBSCRIBER_CONNECTED: 'Redis subscriber conectado para outbox-signal',
  SUBSCRIBER_ERROR: 'Erro no assinante Redis do outbox-signal',
  SUBSCRIBER_CLOSED: 'Conexão do assinante Redis fechada para outbox-signal',
  // outbox-cron
  CRON_START: 'Cron de meia-noite: iniciando varredura de segurança da Outbox...',
  PHASE1_DONE: 'Fase 1 (recuperação SENDING): concluída.',
  PHASE1_ERROR: 'Fase 1 (recuperação SENDING): erro inesperado.',
  PHASE2_DONE: 'Fase 2 (eventos PENDING): concluída.',
  PHASE2_ERROR: 'Fase 2 (eventos PENDING): erro inesperado.',
  SCAN_DONE: 'Varredura de segurança da Outbox concluída.',
  SCHEDULER_CONFIGURED:
    'Agendadores da Outbox configurados: varredura a cada 5 min, segurança à meia-noite e retenção às 03:00.',
  // outbox-processor
  SKIPPED_ANOTHER_RUNNING: 'processPendingEvents: Processamento ignorado. Outra instância já está rodando.',
  PENDING_FETCH_ERROR: 'Erro de Infra ao buscar eventos pendentes.',
  STUCK_FETCH_ERROR: 'Erro de Infra ao buscar eventos travados na Outbox.',
  STATUS_UPDATE_FAILED: 'Falha ao atualizar status para SENDING. Evento permanece em PENDING.',
  REVERT_FATAL: 'FATAL: Falha ao reverter status para PENDING. Inconsistência na DB.',
  DISPATCH_REVERTED: 'Falha no dispatch, revertido para PENDING',
  CRITICAL_LOOP_ERROR: 'Erro crítico inesperado no loop principal de processPendingEvents',
  CRITICAL_RECOVERY_ERROR: 'Erro crítico inesperado no processStuckSendingEvents',
  MARKED_FAILED: 'Evento excedeu o número máximo de tentativas de despacho e foi marcado como FAILED.',
  FAILED_MARK_ERROR: 'Falha ao marcar evento como FAILED no banco de dados.',
  EXPIRED_EVENT_DELETED: 'Evento expirado removido da Outbox sem despacho (link morto nunca é enviado).',
  EXPIRED_EVENT_DELETE_ERROR: 'Falha ao remover evento expirado da Outbox.',
  PENDING_RECIPIENTS_UNRESOLVED:
    'Destinatários pendentes não corresponderam a nenhum e-mail reconstruído; despachando o lote completo (at-least-once).',
  // outbox-maintenance
  EXPIRY_SWEEP_DELETED: 'Varredura de expiração: eventos expirados removidos da Outbox.',
  EXPIRY_SWEEP_ERROR: 'Erro na varredura de expiração da Outbox.',
  RETENTION_PURGED: 'Retenção: eventos antigos removidos da Outbox.',
  RETENTION_PURGED_NON_TERMINAL:
    'Retenção: eventos PENDING/SENDING antigos removidos da Outbox — investigar por que não foram processados.',
  RETENTION_ERROR: 'Erro na retenção da Outbox.',
  FIVE_MIN_SWEEP_PENDING_ERROR: 'Varredura de 5 min: erro inesperado ao processar eventos PENDING.',
  FIVE_MIN_SWEEP_EXPIRY_ERROR: 'Varredura de 5 min: erro inesperado na varredura de expiração.',
  RETENTION_CRON_ERROR: 'Cron de retenção: erro inesperado.',
} as const
