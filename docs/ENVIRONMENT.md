# Variáveis de ambiente de produção

| Variável | Uso | Obrigatória para |
| --- | --- | --- |
| `REVALIDATE_SECRET` | Bearer secret de `POST /api/revalidate` | webhook Supabase de catálogo/estoque |
| `RESEND_API_KEY` | API key do Resend | e-mail de confirmação |
| `RESEND_FROM_EMAIL` | remetente em domínio verificado no Resend | e-mail de confirmação |
| `SENTRY_DSN` | DSN do Sentry para servidor | monitoramento server-side |
| `NEXT_PUBLIC_SENTRY_DSN` | DSN público do Sentry para navegador | monitoramento client-side |

Sem as variáveis de Resend ou Sentry, o checkout continua funcionando e as integrações ficam desativadas de forma segura.
