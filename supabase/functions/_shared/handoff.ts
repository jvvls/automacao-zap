// Atendimento humano (seção 4.4). A marcação de human_handoff é gravada junto
// com a transição da conversa; aqui ficam os campos e as mensagens.
import type { Customer } from "./conversations.ts";

export function handoffChanges(now: Date) {
  return { human_handoff: true, handoff_at: now.toISOString() };
}

export const HANDOFF_CONFIRMATION =
  "Certo! Avisei a responsável pela loja. Ela vai continuar a conversa com você por aqui assim que possível.";

export function ownerHandoffNotice(customer: Customer): string {
  const who = customer.name ? `${customer.name} (+${customer.phone})` : `+${customer.phone}`;
  return `Cliente pediu atendimento no WhatsApp da loja: ${who}. O bot está pausado nessa conversa até ser reativado no painel.`;
}
