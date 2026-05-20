# 📊 Planilha de Custos Mensais - TSZR15

**Data:** 28/04/2026 | **Moeda:** USD / BRL

---

## 🗂️ Resumo Executivo

| Categoria | Custo Mensal USD | Custo Mensal BRL | Observações |
|-----------|-----------------|-----------------|-------------|
| **Domínio** | $10-15 | R$50-75 | Anual, dividido por 12 meses |
| **Hospedagem** | $20-100 | R$100-500 | Varia conforme tráfego |
| **Banco de Dados** | $0-50 | R$0-250 | Depende do provedor |
| **CDN & Storage** | $5-30 | R$25-150 | Imagens, modelos 3D |
| **SSL & Segurança** | $0-15 | R$0-75 | Pode ser gratuito |
| **Pagamentos** | 2.5-3.5% do faturamento | 2.5-3.5% do faturamento | Taxa por transação |
| **Email Marketing** | $0-50 | R$0-250 | Conforme volume |
| **Analytics & Monitoring** | $0-30 | R$0-150 | Ferramentas de observação |
| **Backups & Disaster Recovery** | $5-20 | R$25-100 | Backup automático |
| **Manutenção & Suporte** | $100-300 | R$500-1500 | Dev, atualização, correções |
| **Outras Ferramentas** | $10-50 | R$50-250 | SEO, CRM, etc. |
| **TOTAL MÍNIMO** | **~$150/mês** | **~R$750/mês** | Startup enxuto |
| **TOTAL RECOMENDADO** | **~$250-400/mês** | **~R$1250-2000/mês** | Operação equilibrada |
| **TOTAL PREMIUM** | **~$600-900/mês** | **~R$3000-4500/mês** | Escala e performance |

---

## 📋 Detalhamento Completo

### 1️⃣ DOMÍNIO
| Item | USD/mês | BRL/mês | Provedor | Obs |
|------|---------|---------|----------|-----|
| **Domínio .COM (anual / 12)** | $1.25 | R$6.25 | Namecheap/GoDaddy | ~$15/ano |
| **Domínio .COM.BR (anual / 12)** | $0.83 | R$4.15 | Registro.br | ~R$40/ano |
| **WHOIS Privacy** | $1.50 | R$7.50 | Incluído em muitos | Proteção de dados |
| **DNS Gerenciado Premium** | $3 | R$15 | Cloudflare/Route53 | Pode ser gratuito |
| **TOTAL DOMÍNIO** | **$6-7** | **R$30-35** | - | - |

**💡 Dica:** Cloudflare oferece DNS gratuito com recursos robustos. Registro.br é mais barato para .COM.BR.

---

### 2️⃣ HOSPEDAGEM
| Item | USD/mês | BRL/mês | Provedor | Obs |
|------|---------|---------|----------|-----|
| **Vercel (Next.js otimizado)** | $20-100 | R$100-500 | Vercel | Pro: $20, Pro+ $150, Enterprise: custom |
| **Netlify** | $15-120 | R$75-600 | Netlify | Similar ao Vercel |
| **AWS (EC2 t3.small)** | $15-30 | R$75-150 | Amazon AWS | + Data transfer |
| **DigitalOcean (App Platform)** | $12-40 | R$60-200 | DigitalOcean | Simples e previsível |
| **Heroku** | $7-50 | R$35-250 | Heroku | Descontinuado parcialmente |
| **Hostinger VPS** | $10-20 | R$50-100 | Hostinger | Controle total, menor suporte |
| **RECOMENDAÇÃO** | **$20-50** | **R$100-250** | Vercel/DigitalOcean | Trade-off custo/facilidade |

**💡 Para iniciantes:** Vercel é ideal para Next.js (gratuito até certo ponto).
**💡 Para escala:** DigitalOcean App Platform ou AWS oferem melhor relação custo/performance.

---

### 3️⃣ BANCO DE DADOS
| Item | USD/mês | BRL/mês | Provedor | Obs |
|------|---------|---------|----------|-----|
| **Firebase Realtime (free tier)** | $0 | R$0 | Google Firebase | Até certa quota |
| **Firebase Firestore (paggo)** | $5-50 | R$25-250 | Google Firebase | Pay-as-you-go |
| **MongoDB Atlas (free tier)** | $0 | R$0 | MongoDB | Até 512MB |
| **MongoDB Atlas (shared)** | $9 | R$45 | MongoDB | Tier M0 |
| **MongoDB Atlas (dedicated M10)** | $57 | R$285 | MongoDB | Mais recursos |
| **PostgreSQL (Supabase)** | $0-25 | R$0-125 | Supabase | Free + paid tiers |
| **PlanetScale MySQL** | $10-100 | R$50-500 | PlanetScale | MySQL serverless |
| **Fauna** | $0-100 | R$0-500 | Fauna | Serverless GraphQL |
| **RECOMENDAÇÃO** | **$0-25** | **R$0-125** | MongoDB Atlas / Supabase | Depende da escala |

**💡 MVP:** Comece com Firebase ou MongoDB Atlas grátis.
**💡 Produção:** Supabase (PostgreSQL) ou PlanetScale oferecem bom custo/benefício.

---

### 4️⃣ CDN & STORAGE (Imagens, Modelos 3D, Assets)
| Item | USD/mês | BRL/mês | Provedor | Obs |
|------|---------|---------|----------|-----|
| **Cloudflare CDN (free)** | $0 | R$0 | Cloudflare | Cache + DDoS protection |
| **Cloudflare Pro** | $20 | R$100 | Cloudflare | Mais recursos |
| **AWS S3 Storage** | $0.023/GB | ~R$0.12/GB | AWS | Muito barato |
| **AWS S3 + CloudFront** | $0.085/GB + transfer | Variável | AWS | CDN integrada |
| **Google Cloud Storage** | $0.020/GB | ~R$0.10/GB | Google | Similar ao S3 |
| **Bunny CDN** | $0.01-0.03/GB | R$0.05-0.15/GB | Bunny | Mais barato que AWS |
| **Exemplo: 100GB/mês** | $1-3 | R$5-15 | - | Imagens + modelos 3D |
| **TOTAL RECOMENDADO** | **$5-30** | **R$25-150** | Cloudflare + AWS S3/Bunny | - |

**💡 Estrutura ótima:** Cloudflare (cache) + AWS S3/Bunny (origem)
**💡 Para modelos 3D:** GLB/GLTF é comprimido, usar CDN é essencial.

---

### 5️⃣ SSL & SEGURANÇA
| Item | USD/mês | BRL/mês | Provedor | Obs |
|------|---------|---------|----------|-----|
| **Let's Encrypt (SSL Gratuito)** | $0 | R$0 | Let's Encrypt | Auto-renovação |
| **Cloudflare SSL (incluído)** | $0 | R$0 | Cloudflare | Automático |
| **Certificado Premium** | $5-20 | R$25-100 | Various | Wildcard, EV |
| **WAF (Web Application Firewall)** | $0-20 | R$0-100 | Cloudflare/AWS | Proteção adicional |
| **TOTAL** | **$0-20** | **R$0-100** | - | Geralmente gratuito |

**💡 99% dos casos:** Let's Encrypt (gratuito) + Cloudflare é suficiente.

---

### 6️⃣ GATEWAY DE PAGAMENTO
| Item | % de Comissão | Fixo + % | Provedor | Obs |
|------|----------------|----------|----------|-----|
| **Stripe** | 2.9% + $0.30 | - | Stripe | Cartão de crédito |
| **Stripe (Pix - Brasil)** | 1.5% | - | Stripe | Mais barato |
| **PagSeguro** | 2.5% - 3.5% | + taxa fixa | PagSeguro | BR-centric |
| **Mercado Pago** | 2.5% - 4% | + taxa fixa | Mercado Pago | Muito usado no BR |
| **PayPal** | 3.5% + $0.30 | - | PayPal | Global |
| **Wirecard / Adyen** | Customizado | - | Enterprise | Pequeno volume paga mais |
| **Exemplo: R$5000/mês** | R$125-175 | - | Mercado Pago / Stripe Pix | ~2.5%-3.5% |

**💡 Recomendação para Brasil:**
- **Primária:** Stripe Pix (1.5%) + Mercado Pago (backup)
- **Secundária:** PagSeguro se não conseguir Stripe

---

### 7️⃣ EMAIL MARKETING & TRANSACIONAL
| Item | USD/mês | BRL/mês | Provedor | Obs |
|------|---------|---------|----------|-----|
| **SendGrid (free)** | $0 | R$0 | SendGrid | Até 100 emails/dia |
| **SendGrid (Pro)** | $30 | R$150 | SendGrid | Até 50k emails/mês |
| **Mailchimp (free)** | $0 | R$0 | Mailchimp | Até 500 contatos |
| **Mailchimp (Pro)** | $20 | R$100 | Mailchimp | Automação |
| **ConvertKit** | $25-125 | R$125-625 | ConvertKit | Creators |
| **RD Station (BR)** | $50-200 | R$250-1000 | RD Station | Marketing automation |
| **Brevo (ex-Sendinblue)** | $0-40 | R$0-200 | Brevo | French, mas bom |
| **RECOMENDAÇÃO** | **$0-30** | **R$0-150** | SendGrid Free + Mailchimp | Começar grátis |

**💡 MVP:** SendGrid Free (transacional) + Mailchimp Free (marketing)
**💡 Escala:** Migrar para Brevo ou RD Station quando precisar de automação avançada

---

### 8️⃣ ANALYTICS & MONITORING
| Item | USD/mês | BRL/mês | Provedor | Obs |
|------|---------|---------|----------|-----|
| **Google Analytics 4 (free)** | $0 | R$0 | Google | Suficiente para maioria |
| **Hotjar (free)** | $0 | R$0 | Hotjar | Heatmaps, recordings |
| **Hotjar (Pro)** | $99 | R$495 | Hotjar | Unlimited recordings |
| **Sentry (free)** | $0 | R$0 | Sentry | Error tracking |
| **Sentry (Pro)** | $29 | R$145 | Sentry | Mais eventos |
| **New Relic** | $0-70 | R$0-350 | New Relic | APM completo |
| **DataDog** | $15+ | R$75+ | DataDog | Observabilidade |
| **Vercel Analytics** | $0-150 | R$0-750 | Vercel | Se usar Vercel |
| **RECOMENDAÇÃO** | **$0-30** | **R$0-150** | Google Analytics + Sentry Free | Começar grátis |

**💡 MVP:** Google Analytics (free) + Sentry (free)
**💡 Premium:** Adicionar Hotjar ($99) para entender comportamento do usuário

---

### 9️⃣ BACKUPS & DISASTER RECOVERY
| Item | USD/mês | BRL/mês | Provedor | Obs |
|------|---------|---------|----------|-----|
| **Vercel Automatic Backups** | Incluído | Incluído | Vercel | Gerenciado |
| **AWS Backup** | $1-10 | R$5-50 | AWS | Automático |
| **Google Cloud Backup** | $0.05-5 | R$0.25-25 | Google | Automático |
| **Backblaze B2** | $6/TB | R$30/TB | Backblaze | Backup em nuvem |
| **Exemplo: 50GB** | $0.30 | R$1.50 | Backblaze B2 | Muito barato |
| **RECOMENDAÇÃO** | **$5-10** | **R$25-50** | Incluído em hospedagem | Geralmente grátis |

**💡 Maior parte das hospedagens inclui backups automáticos.**

---

### 🔟 MANUTENÇÃO, SUPORTE & DESENVOLVIMENTO
| Item | USD/mês | BRL/mês | Detalhes |
|------|---------|---------|----------|
| **Dev Freelancer (5h/semana)** | $100-250 | R$500-1250 | Manutenção, atualizações |
| **Dev Full-time (dedicado)** | $1500-3000 | R$7500-15000 | Equipe interna |
| **Agência (support retainer)** | $500-1500 | R$2500-7500 | Suporte + desenvolvimento |
| **Atualizações de dependências** | $50-100 | R$250-500 | Segurança, bugfixes |
| **Testes e QA** | $50-150 | R$250-750 | Validação |
| **RECOMENDAÇÃO** | **$100-300** | **R$500-1500** | Terceiro ou interno |

**💡 MVP:** 5-10h/semana com freelancer
**💡 Crescimento:** Equipe part-time dedicada

---

### 1️⃣1️⃣ FERRAMENTAS ADICIONAIS
| Item | USD/mês | BRL/mês | Provedor | Obs |
|------|---------|---------|----------|-----|
| **GitHub Pro (opcional)** | $4 | R$20 | GitHub | Controle de versão |
| **Figma (Professional)** | $12 | R$60 | Figma | Design |
| **SEO Tool (Semrush/Ahrefs)** | $0-200 | R$0-1000 | Various | Otimização |
| **CRM (Pipedrive/Hubspot)** | $15-120 | R$75-600 | Various | Gestão de leads |
| **Transactional SMS (Twilio)** | $1-50 | R$5-250 | Twilio | Notificações |
| **Chatbot (Intercom)** | $0-99 | R$0-495 | Intercom | Suporte |
| **Uptime Monitor (StatusCake)** | $0-10 | R$0-50 | Various | Monitoramento |
| **TOTAL** | **$10-50** | **R$50-250** | Conforme necessidade | - |

**💡 Comece sem estas, adicione conforme necessário.**

---

## 💰 CENÁRIOS DE CUSTO

### 📍 STARTUP ENXUTO (MVP)
```
Domínio              R$  30
Hospedagem (Vercel)  R$ 100
Banco Dados (Free)   R$   0
CDN (Cloudflare)     R$   0
SSL (Let's Encrypt)  R$   0
Pagamentos (2.5%)    R$  50
Email (Free)         R$   0
Analytics (Free)     R$   0
Backups              R$   0
Suporte Dev (10h)    R$ 500
────────────────────────────
TOTAL/MÊS:           R$ 680
TOTAL/ANO:           R$ 8.160
```

### 📊 OPERAÇÃO EQUILIBRADA
```
Domínio              R$   40
Hospedagem           R$  250
Banco Dados          R$  100
CDN + Storage        R$  150
SSL + Segurança      R$   50
Pagamentos (3%)      R$  150
Email (Pro)          R$  100
Analytics + Monitor  R$   50
Backups              R$   50
Suporte Dev (20h)    R$ 1.000
────────────────────────────
TOTAL/MÊS:           R$ 1.940
TOTAL/ANO:           R$ 23.280
```

### 🚀 OPERAÇÃO PREMIUM
```
Domínio              R$   50
Hospedagem           R$  500
Banco Dados (ded.)   R$  300
CDN + Storage        R$  300
SSL + WAF            R$  150
Pagamentos (2.8%)    R$  200
Email (Automação)    R$  250
Analytics + Monitor  R$  200
Backups + DR         R$  200
Suporte Dev (40h)    R$ 2.000
Ferramentas extras   R$  300
────────────────────────────
TOTAL/MÊS:           R$ 4.450
TOTAL/ANO:           R$ 53.400
```

---

## 🔍 ANÁLISE POR TIPO DE CUSTO

### Custos Fixos (Previsíveis)
- Domínio: R$ 30-50
- Hospedagem: R$ 100-500
- Banco de Dados: R$ 0-300
- SSL: R$ 0-50
- **TOTAL:** R$ 130-900

### Custos Variáveis (Crescem com tráfego/vendas)
- Pagamentos: 2.5-3.5% do faturamento
- Banda/Storage: Pode crescer
- Email Marketing: Conforme base de contatos
- **FÓRMULA:** Valor de vendas × 0.03 + custos fixos

### Custos de Pessoas
- Desenvolvimento: R$ 500-2000/mês (maior variável)
- Suporte: R$ 200-500/mês
- Marketing: R$ 0-1000/mês

---

## 📈 PROJEÇÃO DE RENTABILIDADE

Assumindo **venda média R$ 150 por pedido** e **margem bruta de 40%**:

| Pedidos/mês | Faturamento | Lucro Bruto | Custos Operacional | Lucro Líquido |
|------------|-------------|------------|-------------------|--------------|
| 10 | R$ 1.500 | R$ 600 | R$ 1.500 | -R$ 900 |
| 50 | R$ 7.500 | R$ 3.000 | R$ 1.500 | R$ 1.500 |
| 100 | R$ 15.000 | R$ 6.000 | R$ 1.900 | R$ 4.100 |
| 200 | R$ 30.000 | R$ 12.000 | R$ 2.500 | R$ 9.500 |

**Break-even:** ~40-50 pedidos/mês com custo enxuto

---

## ✅ CHECKLIST - O QUE VOCÊ PRECISA FAZER AGORA

- [ ] **Domínio:** Registrar em Namecheap ou Registro.br
- [ ] **Hosting:** Escolher entre Vercel (fácil) ou DigitalOcean (controle)
- [ ] **Banco de Dados:** Firebase/MongoDB Atlas ou Supabase (free tier)
- [ ] **CDN:** Configurar Cloudflare (gratuito, muito bom)
- [ ] **Pagamento:** Configurar Stripe + Mercado Pago
- [ ] **Email:** SendGrid (transacional) + Mailchimp (marketing)
- [ ] **SSL:** Let's Encrypt (automático)
- [ ] **Analytics:** Google Analytics 4 (grátis)
- [ ] **Backups:** Usar backup da hospedagem
- [ ] **Monitoramento:** Sentry (erro tracking grátis)

---

## 🎯 PRÓXIMAS ETAPAS

1. **Domínio de qualidade barato:**
   - R15 tema → `.COM` no Namecheap (~$1.25/mês = $15/ano)
   - Alternativas: `sandimr15.com`, `r15store.com`, `r15configurador.com.br`
   
2. **Otimização de custos:**
   - Começar com Vercel free (limite de uso)
   - Migrar para DigitalOcean App Platform quando crescer
   - Usar Cloudflare grátis sempre (não há razão para pagar)

3. **Próximas semanas:**
   - [ ] Revisar orçamento mensal
   - [ ] Apresentar ao time/investidores
   - [ ] Planejar escala conforme crescimento

---

**Última atualização:** 28/04/2026
**Responsável:** Análise de Custos TSZR15
