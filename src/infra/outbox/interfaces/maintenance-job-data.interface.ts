/**
 * Payload dos jobs de manutenção. Deliberadamente vazio: o que cada job faz é
 * decidido pelo NOME do job (QUEUE.JOBS.*), não por dados — as varreduras não
 * recebem parâmetros, lêem o estado atual do banco e são idempotentes.
 *
 * O campo opcional existe para o diagnóstico: saber qual agendador emitiu o job
 * quando ele aparece em log ou no painel do BullMQ.
 */
export interface IMaintenanceJobData {
  schedulerId?: string
}
