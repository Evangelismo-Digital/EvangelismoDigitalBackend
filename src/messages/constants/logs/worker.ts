export const WORKER_LOGS = {
  BATCH_ALREADY_SENT: '⚠️ Lote já enviado anteriormente. Limpando DB e abortando duplicata.',
  BULLMQ_NETWORK_GLITCH: '⚠️ Falha de rede interna do BullMQ após processamento. Ignorando.',
  GENERIC_WORKER_FAILURE: '❌ Falha genérica não mapeada no worker',
  MAIL_QUEUE_ERROR: '❌ Erro na MailQueue (Producer)',
} as const
