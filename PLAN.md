# Revisão do Catálogo R15 baseada na SandimR15, sem Vestuário

## Resumo
- Em `28/04/2026`, a [home](https://sandimr15.store/), [Suporte & Sliders](https://sandimr15.store/collections/suporte-sliders), [Estética](https://sandimr15.store/collections/estetica), [Escapamentos](https://sandimr15.store/collections/escapamentos), [Adesivagem](https://sandimr15.store/collections/adesivos), [Manutenção](https://sandimr15.store/collections/manutencao) e [Todos os produtos](https://sandimr15.store/collections/all) mostram uma base de catálogo boa para o projeto.
- O projeto deve usar as categorias visíveis `Suporte & Sliders`, `Estética`, `Escapamentos`, `Adesivagem` e `Manutenção`.
- `Vestuário` sai completamente do escopo: não entra no menu, não entra no catálogo importado e não participa da regra de negócio.

## Mapa de Categorias
- `Suporte & Sliders`: `Kit Suporte + Slider`, `Somente Suporte para Slider`, `Slider Escapamento`, `Slider de Balança`, `Slider Esportivo em Alumínio (Somente Slider)`.
- `Escapamentos`: `Escapamento SC Project Completo`, `Ponteira SC Project`, `Filtro de AR Esportivo`.
- `Manutenção`: `Cavalete Completo`, `Luz de Placa Original`, `Kit Desengraxante + Lubrificante`, `Escova de Limpeza Corrente`, `Óleo Yamalube 10w40`, `Kit Completo Manutenção`, `Kit Pastilhas Diafrag`, `Kit Pastilhas Embu's`, `Kit Relação`, `Filtro de Óleo`, `Kit Chave Allen 16 em 1`, `Kit Reparo Pneu`.
- `Adesivagem`: `Adesivo Capacete Holográfico`, `RR Adesivo Frontal`, `GP Racing Holográfico`, `Garras Adesivos Frontal`, `Hayabusa Adesivos Japonês`, `Speed Hunters Adesivos Japonês`, `Friso e Logotipo Refletivo Roda`, `Frisos Refletivo Roda`, `Película PPF Kit Full`, `Protetor de Tanque Completo`, `Protetor de Tanque Lateral Emborrachado`, `Protetor de Tanque Importado`, `Adesivo Completo AllBlack`, `Camaleão Monster MotoGP`, `Custom Red Bull MotoGP`, `Design Exclusivo`, `Fiat MotoGP`, `Line Roxa`, `Monster Eneos`, `Monster Energy MotoGP`, `Monster MotoGP`, `Monster Savage`, `Monster Savage Cinza`, `Monster Vermelho`, `Movestar MotoGP`, `Racing X`, `Red Bull MotoGP`, `Shark`, `Venom`, `Yamalube`.
- `Estética`: `Bolha Esportiva`, `Carenagem Frontal Aerodinâmica`, `Frente R6`, `Carenagem Entrada de AR`, `Carenagem Inferior Moto GP`, `Spoiler Frontal Depletor`, `Spoilers Aerodinâmicos Laterais`, `Asa Lateral Aerodinâmica`, `Garras de Aranha`, `Eliminador de Rabeta`, `Kit Eliminador de Rabeta + Pisca`, `Monoposto`, `Farol LED DRL Predator Eye`, `Lanterna Colmeia`, `Lanterna Neon Rainbow`, `Lanterna Seta Tripla`, `LED DRL Traseiro`, `LED RGB DRL`, `Pisca Led Embutido`, `Pisca Led Esportivo`, `Pisca Embutido na Carenagem`, `Retrovisor Asa`, `Retrovisor ZX10`, `Retrovisor Melhor Campo de Visão`, `Kit Manete/Manopla/Pesinho`, `KIT Manete & Manopla`, `Pesinho Guidão`, `Suporte para Celular Quad Lock`, `Suporte para Celular com Carregador`, `Suporte para Garupa`, `Tampa da Bengala`, `Tampa do Óleo`, `Tampa do Tanque`, `Tampão do Pinhão`, `Capas do Retrovisor`, `Capas do Garfo`, `Protetor de Mesa`, `Película de proteção do painel`, `Protetor de Manete`, `Protetor de Radiador Aço`, `Protetor de Radiador Alumínio`, `Protetor de Coroa`, `Protetor de Corrente`, `Protetor Reservatório Traseiro`, `Protetor Sensor ABS`, `Trava Antifurto`, `Estabilizador de Direção`.
- Regra de vitrine: `Estética` continua como coleção agregadora comercial, mas internamente não substitui a classificação técnica.

## Mudanças de Implementação
- Adotar exatamente os rótulos de menu `Suporte & Sliders`, `Estética`, `Escapamentos`, `Adesivagem`, `Manutenção`.
- Criar `familia_tecnica` separada para regra de compatibilidade e render 3D: `aero_front`, `iluminacao`, `retrovisor`, `controles`, `slider`, `protecao`, `escapamento`, `adesivo_full`, `adesivo_detalhe`, `tanque`, `cockpit`, `manutencao`.
- Cada SKU passa a ter os campos `storefrontCategoryIds[]`, `productFamily`, `renderSlot`, `bikeModelScope`, `is3DEligible`, `compatibilityRules`, `supplierSource`.
- Produtos cruzados não devem virar SKUs duplicados. Exemplo: `Filtro de AR Esportivo` pode aparecer em `Escapamentos` e `Manutenção`; `Protetor de Tanque` pode aparecer em `Adesivagem` e `Estética`.
- Slots 3D do MVP devem refletir o catálogo observado: `bolha`, `frente/carenagem`, `asa lateral`, `entrada de ar`, `retrovisor`, `manete/manopla/pesinho`, `pisca dianteiro`, `farol`, `lanterna traseira`, `rabeta/eliminador`, `monoposto`, `escapamento`, `protetor radiador`, `protetor tanque`, `tampa tanque`, `tampa óleo`, `tampão pinhão`, `suporte celular`, `suporte garupa`, `slider`, `adesivagem completa`.
- Produtos sem slot 3D continuam vendáveis, mas ficam fora do configurador. Exemplos: `óleo`, `pastilhas`, `filtro de óleo`, `kit reparo`, `cavalete`, `kit chave`.
- Qualquer item de `vestuário` deve ser ignorado no importador e não pode ser publicado.

## Testes de Aceitação
- Todo SKU R15 importado deve ter ao menos `1 categoria_vitrine` e `1 familia_tecnica`.
- Um mesmo SKU deve poder aparecer em várias categorias de vitrine sem duplicar inventário, preço, mídia ou fornecedor.
- O menu da loja deve seguir exatamente os cinco nomes definidos acima.
- O configurador 3D deve expor apenas famílias com `renderSlot` e bloquear itens sem correspondência visual.
- Produtos `R3`, `SBM 250s` e `Vestuário` não devem aparecer no catálogo R15.
- Filtros por `categoria_vitrine` devem replicar a navegação comercial; filtros por `familia_tecnica` devem servir busca, compatibilidade e 3D.

## Premissas e Defaults
- O catálogo da SandimR15 muda com frequência; o projeto deve suportar entrada e saída de SKUs sem mudança estrutural.
- Itens observados fora do menu principal, como `Estabilizador de Direção`, `Película de proteção do painel` e `Carenagem Inferior Moto GP`, entram no projeto e recebem a categoria visível mais próxima, sem criar novo menu no MVP.
- `Acessórios R3`, `SBM 250s` e todo `Vestuário` ficam fora do escopo inicial.
