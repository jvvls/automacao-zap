// Falha do Supabase (Fase 6): cliente apontado para uma porta fechada, sem
// precisar das funções servidas. Fica aqui, e não em unit/, porque importa o
// supabase-js pelo deno.json da função.
import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../_shared/database.types.ts";
import { type Deps, processInboundMessage, recordInbound } from "../../_shared/inbound.ts";

const CLOSED_PORT = "http://127.0.0.1:1";
const GRAPH_URL = "http://graph.invalid";

function downDeps(): Deps {
  return {
    db: createClient<Database>(CLOSED_PORT, "chave-qualquer", {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
    whatsapp: { accessToken: "token", phoneNumberId: "123", graphUrl: GRAPH_URL },
    ownerPhone: "5531999990000",
    shipping: null,
  };
}

// Conta as chamadas à Graph API; as do banco seguem para o fetch real e falham.
async function countingGraphCalls(fn: () => Promise<void>): Promise<number> {
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.startsWith(GRAPH_URL)) {
      calls++;
      return Promise.resolve(new Response("{}", { status: 200 }));
    }
    return realFetch(input, init);
  };
  try {
    await fn();
  } finally {
    globalThis.fetch = realFetch;
  }
  return calls;
}

Deno.test("banco fora do ar: o registro falha e o webhook responde 500 para a Meta reenviar", async () => {
  const message = {
    waMessageId: "wamid.supabase-down",
    phone: "5531988887777",
    payload: { message: { type: "text", text: { body: "oi" } }, contact: null },
  } as unknown as Parameters<typeof recordInbound>[1][number];
  await assertRejects(() => recordInbound(downDeps().db, [message]));
});

Deno.test("banco fora do ar: o processamento falha sem responder o cliente e a mensagem fica para o reprocessamento", async () => {
  const calls = await countingGraphCalls(async () => {
    await assertRejects(() => processInboundMessage(downDeps(), "00000000-0000-0000-0000-000000000000"));
  });
  assertEquals(calls, 0);
});
