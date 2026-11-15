import { assertEquals } from "jsr:@std/assert@1";
import {
  HANDOFF_OPTION_ID,
  INACTIVITY_LIMIT_MS,
  isInactive,
  transition,
} from "../../_shared/state-machine.ts";

Deno.test("qualquer mensagem no menu principal reapresenta o menu", () => {
  const result = transition("MAIN_MENU", {}, { kind: "text", text: "oi" });
  assertEquals(result, { state: "MAIN_MENU", context: {}, actions: [{ type: "send_main_menu" }] });
});

Deno.test("botão de atendimento no menu inicia a transferência", () => {
  const result = transition("MAIN_MENU", {}, {
    kind: "reply",
    id: HANDOFF_OPTION_ID,
    title: "Falar c/ responsável",
  });
  assertEquals(result.actions, [{ type: "start_handoff" }]);
  assertEquals(result.state, "MAIN_MENU");
});

Deno.test("resposta em texto '1' é a alternativa ao botão", () => {
  const result = transition("MAIN_MENU", {}, { kind: "text", text: " 1 " });
  assertEquals(result.actions, [{ type: "start_handoff" }]);
});

Deno.test("resposta de botão desconhecida reapresenta o menu", () => {
  const result = transition("MAIN_MENU", {}, { kind: "reply", id: "outro", title: "Outro" });
  assertEquals(result.actions, [{ type: "send_main_menu" }]);
});

Deno.test("mensagem não suportada (áudio, imagem) reapresenta o menu", () => {
  const result = transition("MAIN_MENU", {}, { kind: "unsupported" });
  assertEquals(result.actions, [{ type: "send_main_menu" }]);
});

Deno.test("estado ainda sem fluxo volta ao menu e limpa o contexto", () => {
  const result = transition("CART_REVIEW", { cart: [{ product_id: "x", quantity: 1 }] }, {
    kind: "text",
    text: "1",
  });
  assertEquals(result, { state: "MAIN_MENU", context: {}, actions: [{ type: "send_main_menu" }] });
});

Deno.test("isInactive respeita o limite de 24 horas", () => {
  const now = new Date("2026-11-15T12:00:00Z");
  const justInside = new Date(now.getTime() - INACTIVITY_LIMIT_MS + 1000);
  const justOutside = new Date(now.getTime() - INACTIVITY_LIMIT_MS - 1000);
  assertEquals(isInactive(justInside.toISOString(), now), false);
  assertEquals(isInactive(justOutside.toISOString(), now), true);
});
