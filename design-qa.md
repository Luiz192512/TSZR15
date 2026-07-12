# Design QA — cadastro de variações

## Evidências comparadas

- Referência: `C:/Users/forti/Documents/TSZR15/.codex-remote-attachments/019f53c0-b7ac-7c33-af22-8bb1779fe8ec/9c5ea7d1-edda-483e-a745-35b6867cb004/1-Photo-1.jpg`
- Implementação desktop: `C:/Users/forti/AppData/Local/Temp/tszr15-variation-single-field/desktop.png`
- Implementação mobile: `C:/Users/forti/AppData/Local/Temp/tszr15-variation-single-field/mobile.png`
- Comparação conjunta: `C:/Users/forti/AppData/Local/Temp/tszr15-variation-single-field/reference-vs-implementation.png`

## Resultado

- Os campos separados “Variações” e “Estoque por variação” foram substituídos por um único textarea “Variações e estoque”.
- Cada linha usa o formato `Variação=quantidade`; vazio depois de `=` representa “sob consulta” e `0` representa esgotado.
- O produto Ponteira estilo SC carregou `Padrão=` no campo unificado.
- O campo único foi verificado nos viewports desktop de 1280 × 720 e mobile de 390 × 844.
- Não há overflow horizontal no viewport mobile e não houve erro de console originado pela aplicação local.
- Nenhum problema visual P0, P1 ou P2 permaneceu após a comparação.

final result: passed
