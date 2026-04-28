# Custos mensais do site - 2026-04-28

## Escopo

- Inclui custo operacional mensal do site em producao.
- Nao inclui desenvolvimento, design, custo do produto, frete, imposto da empresa ou chargeback.

## Stack orcada

- Dominio .com.br em Registro.br.
- App Next.js em Vercel Pro.
- Banco em Neon Launch.
- Assets em Cloudflare R2.
- Pagamentos via Mercado Pago.
- Email transacional em Resend e caixa corporativa em Google Workspace.

## Leitura rapida

- A maior parte do custo fixo fica em hospedagem, banco e email corporativo.
- Em operacao real, as taxas do Mercado Pago tendem a ser o maior custo mensal variavel do site.
- Dominio e storage ficam relativamente pequenos perto de pagamentos.
- SaaS internacionais pagos em cartao brasileiro podem gerar IOF; a planilha modela isso separadamente.

## Arquivos

- `docs/site-monthly-costs-2026-04-28.xlsx`
- `docs/site-monthly-costs-2026-04-28.md`

## Fontes principais

- https://registro.br/
- https://porkbun.com/products/domains
- https://vercel.com/pricing
- https://neon.com/pricing
- https://developers.cloudflare.com/r2/pricing/
- https://resend.com/pricing
- https://workspace.google.com/pricing
- https://uptimerobot.com/pricing/
- https://www.mercadopago.com.br/blog/quanto-custa-vender-on-line-com-mercado-pago
- https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoMoedaPeriodo
- https://www.gov.br/fazenda/pt-br/central-de-conteudo/publicacoes/apresentacoes/2025/Maio/iof-maio-2025.pdf/%40%40download/file
