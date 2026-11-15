import { assertEquals } from "jsr:@std/assert@1";
import {
  addToCart,
  MAX_QUANTITY,
  parseQuantity,
  readCart,
  removeFromCart,
  setQuantity,
} from "../../_shared/cart.ts";

Deno.test("parseQuantity aceita só inteiros de 1 a 99", () => {
  assertEquals(parseQuantity(" 3 "), 3);
  assertEquals(parseQuantity("99"), 99);
  for (const value of ["0", "100", "-1", "1.5", "2,0", "dois", "", "1e2"]) {
    assertEquals(parseQuantity(value), null, value);
  }
});

Deno.test("adicionar produto já no carrinho soma, sem passar do limite", () => {
  const cart = addToCart([], "p1", 2);
  assertEquals(addToCart(cart, "p1", 3), [{ product_id: "p1", quantity: 5 }]);
  assertEquals(addToCart(cart, "p1", MAX_QUANTITY), [{ product_id: "p1", quantity: MAX_QUANTITY }]);
  assertEquals(addToCart(cart, "p2", 1), [{ product_id: "p1", quantity: 2 }, { product_id: "p2", quantity: 1 }]);
});

Deno.test("alterar quantidade e remover item", () => {
  const cart = [{ product_id: "p1", quantity: 2 }, { product_id: "p2", quantity: 1 }];
  assertEquals(setQuantity(cart, "p2", 4), [{ product_id: "p1", quantity: 2 }, { product_id: "p2", quantity: 4 }]);
  assertEquals(removeFromCart(cart, "p1"), [{ product_id: "p2", quantity: 1 }]);
});

Deno.test("readCart descarta linhas malformadas do contexto", () => {
  assertEquals(readCart({}), []);
  assertEquals(readCart({ cart: "x" }), []);
  assertEquals(
    readCart({ cart: [{ product_id: "p1", quantity: 1 }, { product_id: "p2", quantity: 0 }, { quantity: 2 }, null] }),
    [{ product_id: "p1", quantity: 1 }],
  );
});
