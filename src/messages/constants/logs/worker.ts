export const WORKER_LOGS = {
  BATCH_ALREADY_SENT: 'Lote já enviado anteriormente. Limpando DB e abortando duplicata.',
  BULLMQ_NETWORK_GLITCH: 'Falha de rede interna do BullMQ após processamento. Ignorando.',
  GENERIC_WORKER_FAILURE: 'Falha genérica não mapeada no worker',
  MAIL_QUEUE_ERROR: 'Erro na MailQueue (Producer)',
  OUTBOX_REVERTED_AFTER_FINAL_FAILURE:
    'Job falhou definitivamente no BullMQ. Evento revertido para PENDING para nova tentativa de despacho.',
  OUTBOX_REVERT_AFTER_FINAL_FAILURE_ERROR:
    'Falha ao reverter evento para PENDING após falha definitiva do job (linha possivelmente já removida).',
  FAILURE_HANDLER_ERROR: 'Erro inesperado no tratamento de falha de job do worker.',
  EXPIRED_JOB_SKIPPED: 'Job com evento expirado: e-mail não será enviado; removendo a linha da Outbox.',
  PARTIAL_BATCH_FAILURE: 'Falha parcial no lote de e-mails — alguns foram enviados; o lote será re-tentado.',
} as const
