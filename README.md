# TSZR15 Catalog Foundation

This repository now contains a first implementation of the Yamaha R15 catalog rules described in `PLAN.md`.

## What is included

- A storefront category model with the five approved menu labels:
  - `Suporte & Sliders`
  - `Estética`
  - `Escapamentos`
  - `Adesivagem`
  - `Manutenção`
- A curated R15 catalog with:
  - technical families
  - configurator render slots
  - supplier metadata
  - compatibility placeholders
- Import rules that automatically reject:
  - `Vestuário`
  - products tagged for other motorcycles such as `R3` and `SBM 250s`
  - products named after other bike models like `ZX10`
- Approved style-reference exceptions for the R15 catalog:
  - `Frente R6`
  - `Hayabusa Adesivos Japonês`
- A simple storefront preview in `index.html`
- Validation and tests for the catalog rules

## Commands

```bash
npm run validate
npm test
```

To open the preview locally:

```bash
npm start
```

Then open the local URL reported by `serve`.
