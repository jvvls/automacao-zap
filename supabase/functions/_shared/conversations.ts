// Cliente e conversa (seções 5.3 e 5.4): uma linha de conversa por cliente,
// atualizada com controle otimista por updated_at.
import type { Database } from "./database.types.ts";
import type { ConversationContext, ConversationState } from "./state-machine.ts";
import type { Db } from "./supabase.ts";

type ConversationRow = Database["public"]["Tables"]["conversations"]["Row"];
type ConversationUpdate = Database["public"]["Tables"]["conversations"]["Update"];

export interface Customer {
  id: string;
  name: string | null;
  phone: string;
}

export interface Conversation {
  id: string;
  currentState: ConversationState;
  context: ConversationContext;
  humanHandoff: boolean;
  lastInteractionAt: string;
  updatedAt: string;
}

const CONVERSATION_COLUMNS = "id, current_state, context, human_handoff, last_interaction_at, updated_at";

function toConversation(row: Pick<ConversationRow, "id" | "current_state" | "context" | "human_handoff" | "last_interaction_at" | "updated_at">): Conversation {
  return {
    id: row.id,
    // O CHECK da tabela garante que o valor é um dos estados da seção 8.
    currentState: row.current_state as ConversationState,
    context: (row.context ?? {}) as ConversationContext,
    humanHandoff: row.human_handoff,
    lastInteractionAt: row.last_interaction_at,
    updatedAt: row.updated_at,
  };
}

// O nome do perfil do WhatsApp só é gravado no primeiro contato.
export async function findOrCreateCustomer(db: Db, phone: string, name: string | null): Promise<Customer> {
  const { error: insertError } = await db
    .from("customers")
    .upsert({ phone, name: name?.slice(0, 150) ?? null }, { onConflict: "phone", ignoreDuplicates: true });
  if (insertError) throw insertError;

  const { data, error } = await db.from("customers").select("id, name, phone").eq("phone", phone).single();
  if (error) throw error;
  return data;
}

export async function findOrCreateConversation(db: Db, customerId: string): Promise<Conversation> {
  const { error: insertError } = await db
    .from("conversations")
    .upsert({ customer_id: customerId }, { onConflict: "customer_id", ignoreDuplicates: true });
  if (insertError) throw insertError;

  return loadConversation(db, customerId);
}

export async function loadConversation(db: Db, customerId: string): Promise<Conversation> {
  const { data, error } = await db
    .from("conversations")
    .select(CONVERSATION_COLUMNS)
    .eq("customer_id", customerId)
    .single();
  if (error) throw error;
  return toConversation(data);
}

// Grava só se ninguém alterou a conversa desde a leitura (updated_at igual).
// Devolve null em caso de conflito, para quem chamou reler e tentar de novo.
export async function saveConversation(
  db: Db,
  conversation: Conversation,
  changes: ConversationUpdate,
): Promise<Conversation | null> {
  const { data, error } = await db
    .from("conversations")
    .update(changes)
    .eq("id", conversation.id)
    .eq("updated_at", conversation.updatedAt)
    .select(CONVERSATION_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  return data && toConversation(data);
}
