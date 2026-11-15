// Reprocessamento manual de mensagens recebidas (seção 11.3): reexecuta as
// `failed` e as presas em `received`. Função administrativa: só aceita a
// credencial de serviço, nunca a chave pública do painel.
import { depsFromEnv, findReprocessable, processInboundMessage } from "../_shared/inbound.ts";
import { requireEnv } from "../_shared/supabase.ts";

function sameSecret(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];
  return diff === 0;
}

function isUuidList(value: unknown): value is string[] {
  return Array.isArray(value) &&
    value.every((id) => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id));
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

    const token = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
    if (!sameSecret(token, requireEnv("SUPABASE_SERVICE_ROLE_KEY"))) {
      return new Response("unauthorized", { status: 401 });
    }

    // Corpo opcional: {"ids": [...]} reprocessa só essas; sem ids, a seleção
    // automática de findReprocessable.
    const raw = await req.text();
    let ids: string[] | undefined;
    if (raw.trim()) {
      let body: unknown;
      try {
        body = JSON.parse(raw);
      } catch {
        return new Response("invalid json", { status: 400 });
      }
      const requested = (body as { ids?: unknown } | null)?.ids;
      if (requested !== undefined && !isUuidList(requested)) {
        return new Response("ids must be a list of uuids", { status: 400 });
      }
      ids = requested;
    }

    const deps = depsFromEnv();
    const targets = ids ?? await findReprocessable(deps.db, new Date());

    // Em sequência, como no webhook, para manter a ordem das respostas.
    const results: { id: string; status: string }[] = [];
    for (const id of targets) {
      try {
        results.push({ id, status: await processInboundMessage(deps, id) });
      } catch (error) {
        console.error("reprocess: erro sem registro", { inboundId: id, error: String(error) });
        results.push({ id, status: "error" });
      }
    }
    return Response.json({ results });
  } catch (error) {
    console.error("reprocess-inbound: erro", String(error));
    return new Response("internal error", { status: 500 });
  }
});
