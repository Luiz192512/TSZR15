update public.catalog_products
set variations = array['Carbono', 'Azul', 'Vermelho', 'Preto']::text[]
where id = 'bico-de-pato';

update public.catalog_products
set variations = array['Prata', 'Azul', 'Fume', 'Transparente', 'Preto']::text[]
where id = 'bolha-esportiva';

update public.catalog_products
set variations = array['Prata', 'Vermelho', 'Azul', 'Preto']::text[]
where id = 'protetor-de-manopla';
