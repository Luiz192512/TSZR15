# Comparativo de Bancos Gerenciados - 2026-04-28

## Perfil considerado

- **Projeto:** Loja customizada de acessorios para Yamaha R15 em Next.js
- **Tipo de banco:** Relacional, compatível com PostgreSQL
- **Carga inicial esperada:** Baixa a moderada; MVP com catalogo, configuracoes salvas, pedidos e webhooks
- **Publico principal:** Brasil, com preferencia por regiao Sao Paulo quando existir
- **Prioridade:** Custo-beneficio, baixa operacao e backups nativos
- **Requisito tecnico:** Boa compatibilidade com serverless/Next.js e idealmente connection pooling
- **Nao e prioridade no MVP:** Data warehouse, multi-cloud, analiticos pesados e compliance enterprise
- **Escopo da comparacao:** Comparacao entre bancos gerenciados relacionais que fazem sentido para o projeto. Nao inclui servicos NoSQL, bancos edge baseados em SQLite, ou ofertas white-label equivalentes.

## Ranking resumido

1. **Neon** - score 95/100. Minha recomendacao principal para este projeto se quisermos banco em nuvem sem pagar stack extra.
2. **Supabase** - score 84/100. Se a ideia mudar para plataforma completa, e a alternativa mais forte ao Neon.
3. **Aiven for PostgreSQL** - score 81/100. Bom plano B com Brasil; perde pontos no custo real de producao comparado ao Neon.
4. **Railway PostgreSQL** - score 70/100. Para DB-only eu priorizaria Neon/Aiven antes; para stack toda na Railway faz sentido.
5. **Render Postgres** - score 67/100. Boa opcao simples, mas perde pontos para nosso publico brasileiro.

## Recomendacao objetiva

- **Primeira escolha:** Neon, se quisermos apenas o banco com o melhor custo-beneficio.
- **Segunda escolha:** Supabase, se quisermos ganhar auth/storage/API no mesmo fornecedor.
- **Plano B com Brasil:** Aiven, se quisermos um managed Postgres mais tradicional em Sao Paulo.

## Observacoes de metodologia

- Os valores foram coletados de fontes oficiais em 2026-04-28.
- Alguns provedores usam precificacao totalmente dinamica. Nesses casos, a planilha marca o calculo como estimativa e explica a base usada.
- O comparativo foca em bancos relacionais gerenciados que fazem sentido para este projeto. Nao inclui NoSQL, SQLite edge DBs ou ofertas equivalentes white-label.

## Fontes principais

- **Neon / Pricing:** https://neon.com/pricing
- **Neon / Regions:** https://neon.com/docs/conceptual-guides/regions
- **Supabase / Compute pricing:** https://supabase.com/docs/guides/platform/manage-your-usage/compute
- **Supabase / Regions:** https://supabase.com/docs/guides/platform/regions
- **Supabase / Backups:** https://supabase.com/docs/guides/platform/backups
- **Railway / Pricing:** https://railway.com/pricing
- **Railway / Regions:** https://docs.railway.com/reference/regions
- **Render / Pricing:** https://render.com/pricing
- **Render / Regions:** https://render.com/docs/regions
- **Render / Backups:** https://render.com/docs/postgresql-backups
- **Aiven / Pricing:** https://aiven.io/pricing
- **Aiven / Developer tier:** https://aiven.io/blog/new-developer-tier-for-aiven-for-postgres
- **Aiven / Regions:** https://aiven.io/docs/platform/reference/list_of_clouds
- **Aiven / Service pricing:** https://aiven.io/docs/platform/concepts/service-pricing
- **Aiven / Connection limits / pooling:** https://aiven.io/docs/products/postgresql/reference/pg-connection-limits
- **DigitalOcean / Managed DB pricing:** https://www.digitalocean.com/pricing/managed-databases
- **DigitalOcean / Managed DB docs:** https://docs.digitalocean.com/products/databases/index.html
- **AWS / RDS PostgreSQL pricing:** https://aws.amazon.com/rds/postgresql/pricing/
- **AWS / RDS regions:** https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.RegionsAndAvailabilityZones.html
- **Google Cloud / Cloud SQL pricing:** https://cloud.google.com/sql/pricing
- **Azure / Azure PostgreSQL pricing:** https://azure.microsoft.com/en-us/pricing/details/postgresql/flexible-server/
- **Azure / Azure PostgreSQL regions overview:** https://learn.microsoft.com/en-us/azure/postgresql/flexible-server/overview
