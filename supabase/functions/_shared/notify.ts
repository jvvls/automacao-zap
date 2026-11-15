// Aviso à responsável por WhatsApp no número OWNER_WHATSAPP_NUMBER.
// Fora da janela de 24 horas a Meta recusa texto livre e exige template
// aprovado (Fase 4). Até lá, uma recusa só fica no log: o aviso não pode
// impedir o atendimento ao cliente.
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
