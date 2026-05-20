# Planejamento Geral TSZR15

## Decisão de Escopo

O MVP deve priorizar uma loja funcional, rastreável e financeiramente controlável antes de investir em configurador 3D. O configurador 3D pode continuar como protótipo técnico, mas sai do caminho crítico por custo de modelagem, manutenção de assets e complexidade de renderização.

Prioridade atual:

1. Vitrine R15 com catálogo confiável.
2. Cadastro do cliente com dados suficientes para entrega e emissão fiscal.
3. Carrinho, cálculo de frete, resumo de compra e fechamento do pedido.
4. Pedido rastreável com status claro para o cliente.
5. Dashboard financeiro e operacional para admin.
6. Avaliação de produto e suporte pós-venda.
7. Configurador 3D apenas se houver orçamento e retorno claro.

## Perfis de Usuário

### Cliente

- Navega pelo catálogo.
- Cria cadastro ou compra com cadastro rápido.
- Cadastra endereço de entrega.
- Calcula frete antes de finalizar.
- Confere resumo de compra.
- Paga o pedido.
- Acompanha pedido, prazo e código de rastreio.
- Avalia produtos comprados.
- Abre solicitações de suporte.

### Admin

- Gerencia produtos, categorias, estoque e fornecedores.
- Acompanha pedidos, pagamentos, margens e taxas.
- Atualiza rastreios e status de envio.
- Responde suporte.
- Modera avaliações.
- Exporta dados para emissão fiscal, contabilidade e conciliação.

## Módulos Obrigatórios do MVP

### 1. Cadastro de Cliente

Dados mínimos:

- nome completo ou razão social;
- CPF ou CNPJ;
- inscrição estadual quando aplicável;
- email;
- telefone e WhatsApp;
- data de nascimento opcional para antifraude e marketing;
- aceite de termos, política de privacidade e consentimentos necessários;
- endereço completo de entrega e cobrança.

O cadastro deve suportar compra nacional e preparação de pedido em marketplace externo, como AliExpress ou Shopee. Por isso, o endereço precisa ser padronizado e exportável.

### 2. Endereço e Frete

Campos de endereço:

- destinatário;
- CPF ou CNPJ do destinatário quando necessário;
- telefone;
- CEP;
- logradouro;
- número;
- complemento;
- bairro;
- cidade;
- UF;
- país;
- ponto de referência opcional.

Regras de frete:

- calcular frete antes do pagamento;
- permitir frete pago integral pelo cliente;
- permitir frete grátis por regra comercial, como valor mínimo, campanha ou produto específico;
- registrar método de entrega, prazo estimado, valor cobrado e custo real quando disponível;
- guardar snapshot do endereço usado no pedido, mesmo se o cliente alterar o cadastro depois.

### 3. Checkout e Resumo de Compra

Antes de finalizar, o cliente deve ver:

- produtos, variações e quantidades;
- preço unitário;
- subtotal;
- desconto;
- frete;
- prazo estimado;
- endereço de entrega;
- forma de pagamento;
- total final;
- aviso de que dados fiscais e endereço serão usados para emissão e envio.

O pedido só deve ser criado como confirmado após retorno aprovado do gateway de pagamento.

### 4. Pedidos e Rastreio

O pedido deve ter status internos:

- aguardando pagamento;
- pago;
- separando;
- enviado ao fornecedor;
- postado;
- em trânsito;
- saiu para entrega;
- entregue;
- cancelado;
- reembolsado;
- problema no envio.

Estratégia de rastreio:

- MVP: exibir código de rastreio, transportadora, link externo e previsão manual ou estimada.
- Etapa 2: consultar API de transportadora quando houver credenciais e contrato.
- Etapa 3: atualizar eventos automaticamente e notificar por email ou WhatsApp.

Para importados ou compra assistida em marketplace, guardar também:

- marketplace de origem;
- número do pedido no fornecedor;
- vendedor;
- custo do produto;
- custo de frete do fornecedor;
- moeda;
- data estimada de despacho;
- código de rastreio internacional e nacional quando houver.

### 5. Dashboard Financeiro Admin

Indicadores essenciais:

- faturamento bruto;
- pedidos pagos;
- pedidos cancelados;
- ticket médio;
- custo de produto;
- custo de frete;
- taxas de pagamento;
- margem bruta estimada;
- lucro estimado por pedido;
- produtos mais vendidos;
- pedidos aguardando ação;
- valores a receber;
- reembolsos e chargebacks.

Filtros:

- período;
- status do pedido;
- método de pagamento;
- categoria;
- fornecedor;
- marketplace de origem.

Exportações:

- CSV ou XLSX para contabilidade;
- relatório de pedidos;
- relatório de margem;
- dados necessários para emissão fiscal.

### 6. Fiscal e Nota

O sistema deve coletar os dados necessários, mas a emissão fiscal deve ser tratada como integração separada com emissor fiscal, ERP ou contador.

Dados que o sistema deve preparar:

- identificação do cliente, CPF, CNPJ ou identificação estrangeira quando aplicável;
- endereço completo do destinatário;
- itens do pedido;
- quantidade;
- valor unitário;
- desconto;
- frete;
- total;
- SKU interno;
- origem do produto;
- NCM, CEST, CFOP e dados tributários quando definidos pela contabilidade;
- chave da nota, número, série, XML e DANFE após emissão.

Não assumir regra tributária no código sem validação contábil. O sistema deve guardar os campos e permitir integração, não decidir sozinho a tributação.

### 7. Avaliação de Produto

Regras:

- apenas compradores podem avaliar;
- avaliação vinculada a pedido entregue;
- nota de 1 a 5;
- comentário opcional;
- mídia opcional em etapa futura;
- moderação admin antes de publicação quando necessário;
- resposta pública da loja em etapa futura.

### 8. Suporte

Canal mínimo:

- formulário de contato;
- suporte vinculado a pedido;
- email e WhatsApp registrados;
- motivo do atendimento;
- anexos em etapa futura;
- histórico de mensagens;
- status aberto, em análise, respondido, resolvido e encerrado.

Motivos iniciais:

- dúvida sobre produto;
- problema no pagamento;
- alteração de endereço;
- rastreio;
- atraso;
- troca ou devolução;
- garantia;
- nota fiscal.

## Roadmap de Implementação

### Fase 1: Loja vendável

- Manter catálogo R15 curado.
- Adicionar preço, imagem, disponibilidade e fornecedor aos produtos.
- Criar carrinho.
- Criar cadastro de cliente.
- Criar cadastro de endereço.
- Criar cálculo de frete.
- Criar resumo de compra.

### Fase 2: Pedido e operação

- Criar modelo de pedido.
- Integrar gateway de pagamento.
- Criar status de pedido.
- Criar painel admin básico.
- Criar registro manual de rastreio.
- Criar emails transacionais mínimos.

### Fase 3: Fiscal, suporte e confiança

- Preparar exportação fiscal.
- Integrar emissor fiscal ou ERP.
- Criar suporte vinculado a pedido.
- Criar avaliação de produto.
- Criar relatórios financeiros.

### Fase 4: Automação

- Integração de rastreio com transportadora.
- Notificações automáticas.
- Conciliação financeira.
- Importação de fornecedor e marketplace.
- Regras avançadas de frete grátis.

### Fase 5: Experiência avançada opcional

- Retomar configurador 3D apenas se houver orçamento.
- Substituir geometria base por modelos GLB reais.
- Medir impacto em conversão antes de expandir.

## Revisão do Catálogo R15 baseada na SandimR15, sem Vestuário

### Resumo

- Em `28/04/2026`, a [home](https://sandimr15.store/), [Suporte & Sliders](https://sandimr15.store/collections/suporte-sliders), [Estética](https://sandimr15.store/collections/estetica), [Escapamentos](https://sandimr15.store/collections/escapamentos), [Adesivagem](https://sandimr15.store/collections/adesivos), [Manutenção](https://sandimr15.store/collections/manutencao) e [Todos os produtos](https://sandimr15.store/collections/all) mostram uma base de catálogo boa para o projeto.
- O projeto deve usar as categorias visíveis `Suporte & Sliders`, `Estética`, `Escapamentos`, `Adesivagem` e `Manutenção`.
- `Vestuário` sai completamente do escopo: não entra no menu, não entra no catálogo importado e não participa da regra de negócio.

### Mapa de Categorias

- `Suporte & Sliders`: `Kit Suporte + Slider`, `Somente Suporte para Slider`, `Slider Escapamento`, `Slider de Balança`, `Slider Esportivo em Alumínio (Somente Slider)`.
- `Escapamentos`: `Escapamento SC Project Completo`, `Ponteira SC Project`, `Filtro de AR Esportivo`.
- `Manutenção`: `Cavalete Completo`, `Luz de Placa Original`, `Kit Desengraxante + Lubrificante`, `Escova de Limpeza Corrente`, `Óleo Yamalube 10w40`, `Kit Completo Manutenção`, `Kit Pastilhas Diafrag`, `Kit Pastilhas Embu's`, `Kit Relação`, `Filtro de Óleo`, `Kit Chave Allen 16 em 1`, `Kit Reparo Pneu`.
- `Adesivagem`: `Adesivo Capacete Holográfico`, `RR Adesivo Frontal`, `GP Racing Holográfico`, `Garras Adesivos Frontal`, `Hayabusa Adesivos Japonês`, `Speed Hunters Adesivos Japonês`, `Friso e Logotipo Refletivo Roda`, `Frisos Refletivo Roda`, `Película PPF Kit Full`, `Protetor de Tanque Completo`, `Protetor de Tanque Lateral Emborrachado`, `Protetor de Tanque Importado`, `Adesivo Completo AllBlack`, `Camaleão Monster MotoGP`, `Custom Red Bull MotoGP`, `Design Exclusivo`, `Fiat MotoGP`, `Line Roxa`, `Monster Eneos`, `Monster Energy MotoGP`, `Monster MotoGP`, `Monster Savage`, `Monster Savage Cinza`, `Monster Vermelho`, `Movestar MotoGP`, `Racing X`, `Red Bull MotoGP`, `Shark`, `Venom`, `Yamalube`.
- `Estética`: `Bolha Esportiva`, `Carenagem Frontal Aerodinâmica`, `Frente R6`, `Carenagem Entrada de AR`, `Carenagem Inferior Moto GP`, `Spoiler Frontal Depletor`, `Spoilers Aerodinâmicos Laterais`, `Asa Lateral Aerodinâmica`, `Garras de Aranha`, `Eliminador de Rabeta`, `Kit Eliminador de Rabeta + Pisca`, `Monoposto`, `Farol LED DRL Predator Eye`, `Lanterna Colmeia`, `Lanterna Neon Rainbow`, `Lanterna Seta Tripla`, `LED DRL Traseiro`, `LED RGB DRL`, `Pisca Led Embutido`, `Pisca Led Esportivo`, `Pisca Embutido na Carenagem`, `Retrovisor Asa`, `Retrovisor ZX10`, `Retrovisor Melhor Campo de Visão`, `Kit Manete/Manopla/Pesinho`, `KIT Manete & Manopla`, `Pesinho Guidão`, `Suporte para Celular Quad Lock`, `Suporte para Celular com Carregador`, `Suporte para Garupa`, `Tampa da Bengala`, `Tampa do Óleo`, `Tampa do Tanque`, `Tampão do Pinhão`, `Capas do Retrovisor`, `Capas do Garfo`, `Protetor de Mesa`, `Película de proteção do painel`, `Protetor de Manete`, `Protetor de Radiador Aço`, `Protetor de Radiador Alumínio`, `Protetor de Coroa`, `Protetor de Corrente`, `Protetor Reservatório Traseiro`, `Protetor Sensor ABS`, `Trava Antifurto`, `Estabilizador de Direção`.
- Regra de vitrine: `Estética` continua como coleção agregadora comercial, mas internamente não substitui a classificação técnica.

### Mudanças de Implementação

- Adotar exatamente os rótulos de menu `Suporte & Sliders`, `Estética`, `Escapamentos`, `Adesivagem`, `Manutenção`.
- Criar `familia_tecnica` separada para regra de compatibilidade e futura renderização: `aero_front`, `iluminacao`, `retrovisor`, `controles`, `slider`, `protecao`, `escapamento`, `adesivo_full`, `adesivo_detalhe`, `tanque`, `cockpit`, `manutencao`.
- Cada SKU passa a ter os campos `storefrontCategoryIds[]`, `productFamily`, `renderSlot`, `bikeModelScope`, `is3DEligible`, `compatibilityRules`, `supplierSource`.
- Produtos cruzados não devem virar SKUs duplicados. Exemplo: `Filtro de AR Esportivo` pode aparecer em `Escapamentos` e `Manutenção`; `Protetor de Tanque` pode aparecer em `Adesivagem` e `Estética`.
- Produtos sem slot visual continuam vendáveis. Exemplos: `óleo`, `pastilhas`, `filtro de óleo`, `kit reparo`, `cavalete`, `kit chave`.
- Qualquer item de `vestuário` deve ser ignorado no importador e não pode ser publicado.

### Testes de Aceitação

- Todo SKU R15 importado deve ter ao menos `1 categoria_vitrine` e `1 familia_tecnica`.
- Um mesmo SKU deve poder aparecer em várias categorias de vitrine sem duplicar inventário, preço, mídia ou fornecedor.
- O menu da loja deve seguir exatamente os cinco nomes definidos acima.
- Produtos `R3`, `SBM 250s` e `Vestuário` não devem aparecer no catálogo R15.
- Filtros por `categoria_vitrine` devem replicar a navegação comercial; filtros por `familia_tecnica` devem servir busca, compatibilidade e automações futuras.

## Referências Externas

- Portal NF-e, Manual de Orientação ao Contribuinte MOC 7.0 NF-e/NFC-e: https://www.nfe.fazenda.gov.br/portal/listaConteudo.aspx?AspxAutoDetectCookieSupport=1&tipoConteudo=ndIjl+iEFdE%3D
- Portal NF-e, leiaute com identificação e endereço do destinatário: https://www.nfe.fazenda.gov.br/portal/exibirArquivo.aspx?conteudo=nebWFce4X9o%3D
- Correios, Guia de Endereçamento: https://www.correios.com.br/enviar/precisa-de-ajuda/como-enderecar-suas-encomendas
- Correios, API Prazo: https://www.correios.com.br/atendimento/developers/manuais/manual-api-prazo
- Correios, API Rastro e restrição por contrato: https://www.correios.com.br/central-de-informacoes/boletim-aos-clientes/correios-aprimoram-ciberseguranca-para-rastreamento-de-pacotes
