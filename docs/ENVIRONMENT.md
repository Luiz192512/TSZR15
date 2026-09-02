# Variáveis de ambiente de produção

| Variável | Uso | Obrigatória para |
| --- | --- | --- |
| `REVALIDATE_SECRET` | Bearer secret de `POST /api/revalidate` | webhook Supabase de catálogo/estoque |
| `RESEND_API_KEY` | API key do Resend | e-mail de confirmação |
| `RESEND_FROM_EMAIL` | remetente em domínio verificado no Resend | e-mail de confirmação |
| `SENTRY_DSN` | DSN do Sentry para servidor | monitoramento server-side |
| `NEXT_PUBLIC_SENTRY_DSN` | DSN público do Sentry para navegador | monitoramento client-side |

Sem as variáveis de Resend ou Sentry, o checkout continua funcionando e as integrações ficam desativadas de forma segura.

## Colunas internas expostas ao cliente

As policies de RLS filtram linha, não coluna. Se um `GRANT` amplo voltar a
existir em uma tabela operacional que tenha policy de `SELECT` para
`authenticated`, o cliente volta a conseguir ler colunas internas do próprio
pedido — custo por item, notas internas, operador designado.

Para auditar, rode no SQL Editor do projeto:

```sql
SELECT cp.table_name, count(*) AS colunas_expostas
FROM information_schema.column_privileges cp
WHERE cp.table_schema = 'public'
  AND cp.grantee IN ('anon', 'authenticated')
  AND cp.privilege_type = 'SELECT'
  AND cp.table_name IN (
    'orders', 'order_items', 'payments', 'supplier_purchases',
    'supplier_tracking_events', 'audit_logs', 'support_threads'
  )
GROUP BY cp.table_name
ORDER BY cp.table_name;
```

O resultado esperado é **vazio**. Qualquer linha significa regressão: o app lê
essas tabelas por service role e não precisa desse acesso.
