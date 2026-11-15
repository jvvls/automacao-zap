-- Produto não pode ter preço zero (decisão da Fase 2): base_price > 0.
-- Os snapshots em order_items continuam aceitando >= 0.
alter table public.products drop constraint products_base_price_check;
alter table public.products add constraint products_base_price_check check (base_price > 0);
