import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { parsePostalCode, parseQuoteResponse, quoteRequestBody } from "../../_shared/shipping-model.ts";

Deno.test("CEP aceita só 8 números, com ou sem hífen e ponto", () => {
  assertEquals(parsePostalCode("30140071"), "30140071");
  assertEquals(parsePostalCode(" 30140-071 "), "30140071");
  assertEquals(parsePostalCode("30.140-071"), "30140071");
  for (const value of ["3014007", "301400711", "3014a071", "", "30140 071 1"]) {
    assertEquals(parsePostalCode(value), null, value);
  }
});

Deno.test("regra de embalagem: cotação por produtos com dados unitários e valor segurado", () => {
  const body = quoteRequestBody("01001000", "30140071", [
    { id: "p1", price: 79.9, weightKg: 0.4, widthCm: 20, heightCm: 3, lengthCm: 28, quantity: 2 },
  ]);
  assertEquals(body, {
    from: { postal_code: "01001000" },
    to: { postal_code: "30140071" },
    products: [{ id: "p1", width: 20, height: 3, length: 28, weight: 0.4, insurance_value: 79.9, quantity: 2 }],
    options: { receipt: false, own_hand: false },
  });
});

Deno.test("resposta: só serviços sem erro, do mais barato ao mais caro", () => {
  const services = parseQuoteResponse([
    { id: 2, name: "SEDEX", price: "46.23", custom_price: "46.23", delivery_time: 4, custom_delivery_time: 4, company: { name: "Correios" } },
    { id: 3, name: ".Package", error: "Transportadora não atende este trecho.", company: { name: "Jadlog" } },
    { id: 1, name: "PAC", price: "37.79", custom_price: "35.5", delivery_time: 9, custom_delivery_time: 10, company: { name: "Correios" } },
    { id: 17, name: "Mini Envios", price: "23.44", company: { name: "Correios" } },
  ]);
  assertEquals(services, [
    { service: "Correios Mini Envios", price: 23.44, days: null },
    { service: "Correios PAC", price: 35.5, days: 10 },
    { service: "Correios SEDEX", price: 46.23, days: 4 },
  ]);
});

Deno.test("resposta sem serviços dá lista vazia; formato inesperado é erro", () => {
  assertEquals(parseQuoteResponse([{ name: "PAC", error: "CEP inválido" }]), []);
  assertThrows(() => parseQuoteResponse({ message: "Unauthenticated." }));
});
