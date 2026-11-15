// Aviso à responsável por WhatsApp no número OWNER_WHATSAPP_NUMBER.
// Fora da janela de 24 horas a Meta recusa texto livre e exige template
// aprovado. Sem template: o aviso que vale é o do painel (contadores de
// pedidos novos e atendimentos), e uma recusa aqui só fica no log, porque o
// aviso não pode impedir o atendimento ao cliente.
import { sendMessage, textMessage, type WhatsAppConfig } from "./whatsapp.ts";

export async function notifyOwner(config: WhatsAppConfig, ownerPhone: string, text: string): Promise<boolean> {
  try {
    await sendMessage(config, textMessage(ownerPhone, text));
    return true;
  } catch (error) {
    console.error("notify: falha ao avisar a responsável", error instanceof Error ? error.message : error);
    return false;
  }
}
