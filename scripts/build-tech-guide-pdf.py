"""Gera o PDF do guia tecnico das tecnologias do projeto (docs/).

Requer a dependencia externa `reportlab` (nao esta no package.json; e Python).
Instale com: pip install -r scripts/requirements.txt
Usa fontes do Windows (C:/Windows/Fonts); em outros SOs, ajuste register_fonts.
"""

from __future__ import annotations

import json
import re
import subprocess
import textwrap
from datetime import datetime
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    Image,
    KeepTogether,
    ListFlowable,
    ListItem,
    PageBreak,
    PageTemplate,
    Paragraph,
    Preformatted,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "TSZR15-guia-tecnologias-projeto.pdf"

PAGE_WIDTH, PAGE_HEIGHT = letter
MARGIN_X = 0.72 * inch
MARGIN_TOP = 0.78 * inch
MARGIN_BOTTOM = 0.66 * inch
CONTENT_WIDTH = PAGE_WIDTH - (MARGIN_X * 2)

INK = colors.HexColor("#17202A")
MUTED = colors.HexColor("#566573")
ACCENT = colors.HexColor("#A51D2D")
ACCENT_DARK = colors.HexColor("#64111D")
GOLD = colors.HexColor("#D0A83E")
BLUE = colors.HexColor("#246B8F")
GREEN = colors.HexColor("#2E7D61")
PAPER = colors.HexColor("#F7F6F2")
SOFT_RED = colors.HexColor("#FCECEF")
SOFT_BLUE = colors.HexColor("#EAF4F8")
SOFT_GREEN = colors.HexColor("#EAF6F1")
CODE_BG = colors.HexColor("#111827")
CODE_FG = colors.HexColor("#F3F4F6")
GRID = colors.HexColor("#DAD7CE")

BODY_FONT = "Arial"
BOLD_FONT = "Arial-Bold"
ITALIC_FONT = "Arial-Italic"
MONO_FONT = "Consolas"
MONO_BOLD_FONT = "Consolas-Bold"


def register_fonts():
    font_files = {
        BODY_FONT: Path("C:/Windows/Fonts/arial.ttf"),
        BOLD_FONT: Path("C:/Windows/Fonts/arialbd.ttf"),
        ITALIC_FONT: Path("C:/Windows/Fonts/ariali.ttf"),
        MONO_FONT: Path("C:/Windows/Fonts/consola.ttf"),
        MONO_BOLD_FONT: Path("C:/Windows/Fonts/consolab.ttf"),
    }
    for name, path in font_files.items():
        if path.exists() and name not in pdfmetrics.getRegisteredFontNames():
            pdfmetrics.registerFont(TTFont(name, str(path)))


def repo_text(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def repo_lines(path: str) -> list[str]:
    return repo_text(path).splitlines()


def git_value(args: list[str], fallback: str = "nao identificado") -> str:
    try:
        return subprocess.check_output(
            ["git", *args],
            cwd=ROOT,
            stderr=subprocess.DEVNULL,
            text=True,
            encoding="utf-8",
        ).strip()
    except Exception:
        return fallback


def snippet(path: str, start: int, end: int) -> str:
    lines = repo_lines(path)
    selected = lines[start - 1 : end]
    return "\n".join(f"{idx:>4} | {line}" for idx, line in enumerate(selected, start))


def snippet_after(path: str, marker: str, count: int, before: int = 0) -> str:
    lines = repo_lines(path)
    index = next((idx for idx, line in enumerate(lines) if marker in line), None)
    if index is None:
        return f"// marcador nao encontrado em {path}: {marker}"
    start = max(index - before, 0)
    end = min(index + count, len(lines))
    return "\n".join(f"{idx:>4} | {line}" for idx, line in enumerate(lines[start:end], start + 1))


def table_names() -> list[str]:
    names: list[str] = []
    for sql_path in sorted((ROOT / "supabase" / "migrations").glob("*.sql")):
        text = sql_path.read_text(encoding="utf-8")
        for match in re.finditer(r"create table if not exists\s+([a-z_]+\.[a-z_]+)", text, re.I):
            names.append(match.group(1))
    return sorted(set(names))


def package_versions() -> list[tuple[str, str, str]]:
    package = json.loads(repo_text("package.json"))
    deps = package.get("dependencies", {})
    dev_deps = package.get("devDependencies", {})
    rows: list[tuple[str, str, str]] = []
    for name, version in deps.items():
        rows.append((name, version, "runtime"))
    for name, version in dev_deps.items():
        rows.append((name, version, "dev/tooling"))
    return rows


def escape(text: str) -> str:
    return (
        str(text)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("\n", "<br/>")
    )


def wrapped_code(text: str, width: int = 94) -> str:
    wrapped: list[str] = []
    for line in text.splitlines():
        expanded = line.replace("\t", "  ")
        if len(expanded) <= width:
            wrapped.append(expanded)
            continue
        indent = re.match(r"^\s*", expanded).group(0)
        wrapper = textwrap.TextWrapper(
            width=width,
            subsequent_indent=f"{indent}    ",
            break_long_words=False,
            break_on_hyphens=False,
        )
        wrapped.extend(wrapper.wrap(expanded) or [""])
    return "\n".join(wrapped)


def para(text: str, style: ParagraphStyle):
    return Paragraph(escape(text), style)


def bullet_list(items: list[str], styles) -> ListFlowable:
    return ListFlowable(
        [ListItem(para(item, styles["Body"]), leftIndent=0) for item in items],
        bulletType="bullet",
        leftIndent=15,
        bulletFontName=BODY_FONT,
        bulletFontSize=8,
    )


def compact_list(items: list[str], styles) -> ListFlowable:
    return ListFlowable(
        [ListItem(para(item, styles["Small"]), leftIndent=0) for item in items],
        bulletType="bullet",
        leftIndent=12,
        bulletFontName=BODY_FONT,
        bulletFontSize=7,
    )


def code_block(title: str, code: str, styles, caption: str | None = None):
    parts = [
        Paragraph(escape(title), styles["CodeTitle"]),
        Preformatted(wrapped_code(code), styles["CodeBlock"]),
    ]
    if caption:
        parts.append(Paragraph(escape(caption), styles["CodeCaption"]))
    return KeepTogether(
        [
            Table(
                [[parts]],
                colWidths=[CONTENT_WIDTH],
                style=[
                    ("BACKGROUND", (0, 0), (-1, -1), CODE_BG),
                    ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#0B1220")),
                    ("LEFTPADDING", (0, 0), (-1, -1), 10),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                    ("TOPPADDING", (0, 0), (-1, -1), 8),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                ],
            ),
            Spacer(1, 8),
        ]
    )


def callout(label: str, text: str, styles, fill=SOFT_BLUE, border=BLUE):
    content = [
        Paragraph(f"<b>{escape(label)}</b>", styles["CalloutLabel"]),
        Paragraph(escape(text), styles["CalloutText"]),
    ]
    return Table(
        [[content]],
        colWidths=[CONTENT_WIDTH],
        style=[
            ("BACKGROUND", (0, 0), (-1, -1), fill),
            ("BOX", (0, 0), (-1, -1), 0.7, border),
            ("LEFTPADDING", (0, 0), (-1, -1), 10),
            ("RIGHTPADDING", (0, 0), (-1, -1), 10),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ],
    )


def data_table(headers: list[str], rows: list[list[str]], styles, widths=None):
    widths = widths or [CONTENT_WIDTH / len(headers)] * len(headers)
    data = [[Paragraph(f"<b>{escape(header)}</b>", styles["TableHeader"]) for header in headers]]
    for row in rows:
        data.append([Paragraph(escape(cell), styles["TableCell"]) for cell in row])
    table = Table(data, colWidths=widths, repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), ACCENT_DARK),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("GRID", (0, 0), (-1, -1), 0.4, GRID),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("BACKGROUND", (0, 1), (-1, -1), colors.white),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, PAPER]),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    return table


def styles():
    sheet = getSampleStyleSheet()
    sheet.add(
        ParagraphStyle(
            name="CoverTitle",
            parent=sheet["Title"],
            fontName=BOLD_FONT,
            fontSize=30,
            leading=34,
            alignment=TA_LEFT,
            textColor=INK,
            spaceAfter=10,
        )
    )
    sheet.add(
        ParagraphStyle(
            name="CoverSubtitle",
            parent=sheet["Normal"],
            fontName=BODY_FONT,
            fontSize=12.5,
            leading=17,
            textColor=MUTED,
            spaceAfter=16,
        )
    )
    sheet.add(
        ParagraphStyle(
            name="H1",
            parent=sheet["Heading1"],
            fontName=BOLD_FONT,
            fontSize=19,
            leading=23,
            textColor=ACCENT_DARK,
            spaceBefore=12,
            spaceAfter=8,
        )
    )
    sheet.add(
        ParagraphStyle(
            name="H2",
            parent=sheet["Heading2"],
            fontName=BOLD_FONT,
            fontSize=13.5,
            leading=17,
            textColor=INK,
            spaceBefore=10,
            spaceAfter=5,
        )
    )
    sheet.add(
        ParagraphStyle(
            name="H3",
            parent=sheet["Heading3"],
            fontName=BOLD_FONT,
            fontSize=11.2,
            leading=14,
            textColor=BLUE,
            spaceBefore=8,
            spaceAfter=4,
        )
    )
    sheet.add(
        ParagraphStyle(
            name="Body",
            parent=sheet["BodyText"],
            fontName=BODY_FONT,
            fontSize=9.4,
            leading=13.2,
            textColor=INK,
            spaceAfter=6,
        )
    )
    sheet.add(
        ParagraphStyle(
            name="Small",
            parent=sheet["BodyText"],
            fontName=BODY_FONT,
            fontSize=8,
            leading=10.5,
            textColor=INK,
            spaceAfter=4,
        )
    )
    sheet.add(
        ParagraphStyle(
            name="Tiny",
            parent=sheet["BodyText"],
            fontName=BODY_FONT,
            fontSize=7,
            leading=9,
            textColor=MUTED,
        )
    )
    sheet.add(
        ParagraphStyle(
            name="CodeBlock",
            parent=sheet["Code"],
            fontName=MONO_FONT,
            fontSize=6.45,
            leading=7.65,
            textColor=CODE_FG,
            backColor=CODE_BG,
        )
    )
    sheet.add(
        ParagraphStyle(
            name="CodeTitle",
            parent=sheet["BodyText"],
            fontName=BOLD_FONT,
            fontSize=8.2,
            leading=10,
            textColor=colors.HexColor("#FDE68A"),
            spaceAfter=5,
        )
    )
    sheet.add(
        ParagraphStyle(
            name="CodeCaption",
            parent=sheet["BodyText"],
            fontName=BODY_FONT,
            fontSize=7.2,
            leading=9,
            textColor=colors.HexColor("#CBD5E1"),
            spaceBefore=5,
        )
    )
    sheet.add(
        ParagraphStyle(
            name="CalloutLabel",
            parent=sheet["BodyText"],
            fontName=BOLD_FONT,
            fontSize=8.4,
            leading=10.2,
            textColor=INK,
            spaceAfter=2,
        )
    )
    sheet.add(
        ParagraphStyle(
            name="CalloutText",
            parent=sheet["BodyText"],
            fontName=BODY_FONT,
            fontSize=8.7,
            leading=11.4,
            textColor=INK,
        )
    )
    sheet.add(
        ParagraphStyle(
            name="TableHeader",
            parent=sheet["BodyText"],
            fontName=BOLD_FONT,
            fontSize=7.5,
            leading=9.4,
            textColor=colors.white,
        )
    )
    sheet.add(
        ParagraphStyle(
            name="TableCell",
            parent=sheet["BodyText"],
            fontName=BODY_FONT,
            fontSize=7.2,
            leading=9.2,
            textColor=INK,
        )
    )
    sheet.add(
        ParagraphStyle(
            name="CenterSmall",
            parent=sheet["BodyText"],
            fontName=BODY_FONT,
            fontSize=7.5,
            leading=9,
            alignment=TA_CENTER,
            textColor=MUTED,
        )
    )
    return sheet


def draw_footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(GRID)
    canvas.setLineWidth(0.5)
    canvas.line(MARGIN_X, 0.48 * inch, PAGE_WIDTH - MARGIN_X, 0.48 * inch)
    canvas.setFont(BODY_FONT, 7.2)
    canvas.setFillColor(MUTED)
    canvas.drawString(MARGIN_X, 0.34 * inch, "TSZR15 - Guia tecnico das tecnologias do projeto")
    canvas.drawRightString(PAGE_WIDTH - MARGIN_X, 0.34 * inch, f"Pagina {doc.page}")
    canvas.restoreState()


def build_cover(story, s):
    logo = ROOT / "public" / "brand" / "logo-tszr15-store.png"
    if logo.exists():
        img = Image(str(logo), width=1.15 * inch, height=1.15 * inch)
        story.append(img)
        story.append(Spacer(1, 18))

    story.append(Paragraph("Guia tecnico das tecnologias do projeto", s["CoverTitle"]))
    story.append(
        Paragraph(
            "Como cada tecnologia aparece na TSZR15, como elas se conectam e quais estruturas de codigo e banco sustentam a loja.",
            s["CoverSubtitle"],
        )
    )

    package = json.loads(repo_text("package.json"))
    branch = git_value(["branch", "--show-current"])
    commit = git_value(["rev-parse", "--short", "HEAD"])
    generated_at = datetime.now().strftime("%d/%m/%Y %H:%M")
    meta = [
        ["Projeto", package.get("name", "TSZR15")],
        ["Versao do app", package.get("version", "0.1.0")],
        ["Branch", branch],
        ["Commit base", commit],
        ["Gerado em", generated_at],
        ["Fonte", "Arquivos locais do repositorio, package.json e supabase/migrations"],
    ]
    story.append(
        data_table(
            ["Campo", "Valor"],
            meta,
            s,
            widths=[1.45 * inch, CONTENT_WIDTH - 1.45 * inch],
        )
    )
    story.append(Spacer(1, 18))
    story.append(
        callout(
            "Escopo",
            "Este PDF documenta as tecnologias que aparecem no codigo atual. Integracoes listadas em docs/APIS-NECESSARIAS.md entram em uma secao separada como tecnologias planejadas, nao como recursos ja implementados.",
            s,
            fill=SOFT_GREEN,
            border=GREEN,
        )
    )
    story.append(PageBreak())


def add_intro(story, s):
    story.append(Paragraph("1. Visao geral", s["H1"]))
    story.append(
        para(
            "A TSZR15 e uma loja de pecas e acessorios para Yamaha R15. O frontend e feito em Next.js e React; o backend fica distribuido entre rotas API, Server Actions, proxy de sessao e funcoes RPC no Supabase/Postgres. O fechamento comercial atual usa WhatsApp Business por link wa.me com mensagem montada pelo backend.",
            s["Body"],
        )
    )
    story.append(
        code_block(
            "Estrutura principal do repositorio",
            """app/
  page.js, catalogo/page.js, produto/[slug]/page.js
  api/catalog/route.js, api/checkout/whatsapp/route.js
  auth/actions.js, admin/actions.js, conta/actions.js
src/
  catalog/       dados, validacao e leitura do catalogo
  components/    componentes React da vitrine, carrinho, formularios e admin
  checkout/      totais, cupom, pedido, mensagem WhatsApp
  lib/supabase/  clientes browser/server/service_role
  admin/         sessao admin, pedidos, catalogo, analytics
  tracking/      visao publica de rastreio
supabase/migrations/
  tabelas, RLS, storage buckets e RPCs do banco
tests/
  node:test para catalogo, checkout, rate limit, auth e utilitarios
scripts/
  validacao e sincronizacao do catalogo""",
            s,
            "O codigo segue uma separacao por responsabilidade: app/ roteia a experiencia; src/ contem dominio e componentes; supabase/ define persistencia.",
        )
    )
    story.append(
        code_block(
            "Fluxo resumido de compra",
            """Cliente abre catalogo
  -> Next.js Server Component busca catalogo publicado no Supabase
  -> React Client Component filtra, escolhe produto e salva carrinho no localStorage
  -> Carrinho envia POST /api/checkout/whatsapp
  -> rota API valida itens contra o catalogo confiavel do servidor
  -> backend calcula total/cupom/frete e chama RPC create_checkout_order
  -> Supabase grava orders, order_items, payments e audit_logs
  -> API retorna whatsappUrl
  -> navegador abre https://wa.me/<numero>?text=<mensagem>""",
            s,
        )
    )

    inventory_rows = [
        ["Next.js App Router", "app/, app/api, middleware.js", "Rotas, Server Components, API routes, revalidacao e proxy de sessao."],
        ["React 19", "src/components", "Estado local, eventos, carrosseis, busca, carrinho e formularios."],
        ["Supabase SSR/JS", "src/lib/supabase", "Auth, queries, RPC, storage e service_role no servidor."],
        ["Postgres + RLS + PL/pgSQL", "supabase/migrations", "Modelo relacional, politicas de acesso, triggers e funcoes transacionais."],
        ["WhatsApp wa.me", "src/checkout/whatsapp.js", "Gera URL de atendimento com mensagem codificada."],
        ["ViaCEP", "src/customer/cep-lookup.js", "Preenche endereco a partir do CEP."],
        ["Pino", "src/lib/logger.js", "Logs estruturados com redacao de dados sensiveis."],
        ["Vercel Speed Insights", "app/layout.js", "Metrica de performance no layout raiz."],
        ["Node test runner", "tests/*.mjs", "Testes sem framework extra usando node:test."],
        ["ESLint + Prettier", "eslint.config.mjs, package.json", "Padrao de qualidade e formatacao."],
        ["GitHub Actions + Gitleaks", ".github/workflows", "Varredura de secrets em push/PR."],
    ]
    story.append(Paragraph("Inventario das tecnologias em uso", s["H2"]))
    story.append(
        data_table(
            ["Tecnologia", "Onde fica", "Funcao no projeto"],
            inventory_rows,
            s,
            widths=[1.48 * inch, 1.72 * inch, CONTENT_WIDTH - 3.2 * inch],
        )
    )

    story.append(Paragraph("Dependencias declaradas", s["H2"]))
    dep_rows = [[name, version, kind] for name, version, kind in package_versions()]
    story.append(
        data_table(
            ["Pacote", "Versao em package.json", "Tipo"],
            dep_rows,
            s,
            widths=[2.65 * inch, 1.55 * inch, CONTENT_WIDTH - 4.2 * inch],
        )
    )
    story.append(
        para(
            "As versoes acima vem de package.json, que e a fonte de verdade do projeto. O diretorio node_modules local pode estar inconsistente em maquinas de desenvolvimento e nao deve ser usado como inventario tecnico.",
            s["Small"],
        )
    )
    story.append(PageBreak())


def add_next_react(story, s):
    story.append(Paragraph("2. Next.js App Router", s["H1"]))
    story.append(
        para(
            "Next.js organiza a aplicacao por arquivos dentro de app/. Cada pasta vira uma rota. Arquivos page.js renderizam paginas; route.js implementam endpoints; loading.js define estado de carregamento; layout.js envolve todas as paginas.",
            s["Body"],
        )
    )
    story.append(code_block("app/layout.js - layout raiz e Speed Insights", snippet("app/layout.js", 1, 24), s))
    story.append(
        para(
            "O layout raiz configura idioma, metadados, bridge de autenticacao, overlay de navegacao e o componente SpeedInsights da Vercel. Isso faz com que toda rota compartilhe a mesma base visual e de comportamento.",
            s["Body"],
        )
    )
    story.append(code_block("app/page.js - Server Component com revalidacao", snippet("app/page.js", 1, 15), s))
    story.append(
        para(
            "A home e async, roda no servidor e usa revalidate = 3600 para cache incremental. A pagina busca produtos publicados, monta o menu e entrega os dados prontos ao componente cliente CatalogHub.",
            s["Body"],
        )
    )
    story.append(code_block("app/api/catalog/route.js - API route estatica", snippet("app/api/catalog/route.js", 1, 16), s))
    story.append(
        para(
            "API routes do App Router exportam funcoes HTTP como GET e POST. Aqui o catalogo publico vira JSON, com dynamic = force-static e revalidate = 3600 para evitar consulta desnecessaria a cada request.",
            s["Body"],
        )
    )
    story.append(Paragraph("Rotas importantes", s["H2"]))
    story.append(
        data_table(
            ["Rota", "Arquivo", "Papel"],
            [
                ["/", "app/page.js", "Vitrine principal com catalogo e busca."],
                ["/catalogo", "app/catalogo/page.js", "Entrada dedicada para produtos."],
                ["/produto/[slug]", "app/produto/[slug]/page.js", "Detalhe do produto, imagens, avaliacoes e relacionados."],
                ["/pedido", "app/pedido/page.js", "Carrinho e checkout."],
                ["/conta", "app/conta/page.js + actions.js", "Perfil, enderecos, pedidos e avaliacoes."],
                ["/admin", "app/admin/page.js + actions.js", "Operacao interna, catalogo, cupons, pedidos e moderacao."],
                ["/rastreio", "app/rastreio/page.js", "Consulta publica por pedido e contato."],
                ["/api/checkout/whatsapp", "app/api/checkout/whatsapp/route.js", "Valida e persiste pedido, devolve URL do WhatsApp."],
            ],
            s,
            widths=[1.35 * inch, 2.05 * inch, CONTENT_WIDTH - 3.4 * inch],
        )
    )

    story.append(Paragraph("3. React no cliente", s["H1"]))
    story.append(
        para(
            "Componentes que precisam de estado, eventos do navegador, localStorage ou chamadas fetch no browser usam a diretiva 'use client'. O servidor entrega dados iniciais; React controla interacao fina da vitrine e do checkout.",
            s["Body"],
        )
    )
    story.append(
        code_block(
            "src/components/catalog/catalog-hub.js - busca, categoria ativa e rendering",
            snippet_after("src/components/catalog/catalog-hub.js", "export function CatalogHub", 45),
            s,
            "useDeferredValue reduz pressao da busca; startTransition evita travar a UI ao trocar filtros.",
        )
    )
    story.append(
        code_block(
            "src/components/catalog/cart-checkout.js - estados do carrinho",
            snippet_after("src/components/catalog/cart-checkout.js", "const [cartItems", 34, before=2),
            s,
            "O checkout controla carrinho, cupom, frete, consentimento, CEP e status de envio no estado React.",
        )
    )
    story.append(
        code_block(
            "src/components/catalog/catalog-shared.js - localStorage do carrinho",
            snippet_after("src/components/catalog/catalog-shared.js", "export function readStoredCart", 35),
            s,
            "O carrinho fica no browser e dispara um evento customizado para atualizar badges sem recarregar a pagina.",
        )
    )
    story.append(
        callout(
            "Regra pratica",
            "Se o codigo usa cookies(), headers(), Supabase service_role ou acesso sensivel, ele fica no servidor. Se usa localStorage, window, eventos e inputs interativos, ele fica em componente cliente.",
            s,
            fill=SOFT_BLUE,
            border=BLUE,
        )
    )
    story.append(PageBreak())


def add_supabase(story, s):
    story.append(Paragraph("4. Supabase: Auth, dados e storage", s["H1"]))
    story.append(
        para(
            "Supabase aparece como a plataforma de banco, autenticacao, storage e RPC. O projeto separa tres clientes: browser, server SSR com cookies e service_role para operacoes administrativas ou de convidado no servidor.",
            s["Body"],
        )
    )
    story.append(code_block("src/lib/supabase/config.js - leitura de envs e preview", snippet("src/lib/supabase/config.js", 1, 54), s))
    story.append(code_block("src/lib/supabase/server.js - cliente SSR com cookies", snippet("src/lib/supabase/server.js", 1, 27), s))
    story.append(code_block("src/lib/supabase/client.js - cliente do navegador", snippet("src/lib/supabase/client.js", 1, 14), s))
    story.append(code_block("src/lib/supabase/admin.js - service_role somente no servidor", snippet("src/lib/supabase/admin.js", 1, 22), s))
    story.append(
        para(
            "O cliente service_role importa 'server-only'. Isso evita que codigo privilegiado seja empacotado para o navegador. Quando a chave nao existe, as funcoes retornam null e o app reduz funcionalidade em vez de expor segredo.",
            s["Body"],
        )
    )
    story.append(
        code_block(
            "middleware.js - refresh de sessao e protecao de /admin",
            snippet_after("middleware.js", "export async function middleware", 47),
            s,
            "O proxy atualiza cookies de sessao Supabase fora de /api e aplica headers no-store/noindex para area administrativa.",
        )
    )

    story.append(Paragraph("Banco Postgres, RLS e RPC", s["H2"]))
    db_rows = []
    all_tables = table_names()
    groups = [
        ("Cliente", ["public.customer_profiles", "public.customer_addresses", "public.assisted_purchase_consents"]),
        ("Pedido", ["public.orders", "public.order_items", "public.payments", "public.audit_logs"]),
        ("Operacao", ["public.supplier_purchases", "public.supplier_tracking_events", "public.support_threads"]),
        ("Catalogo", ["public.catalog_categories", "public.catalog_products", "public.catalog_product_categories", "public.catalog_product_costs", "public.catalog_coupons"]),
        ("Avaliacoes", ["public.order_item_reviews", "public.order_review_photos"]),
        ("Seguranca", ["private.api_rate_limits"]),
    ]
    for group, names in groups:
        present = [name for name in names if name in all_tables]
        db_rows.append([group, ", ".join(present), "Definido em supabase/migrations"])
    story.append(
        data_table(
            ["Area", "Tabelas", "Origem"],
            db_rows,
            s,
            widths=[1.0 * inch, CONTENT_WIDTH - 2.45 * inch, 1.45 * inch],
        )
    )
    story.append(code_block("catalog_products - tabela de catalogo publicada", snippet("supabase/migrations/20260521_catalog_products.sql", 11, 35), s))
    story.append(
        code_block(
            "orders - pedido com status, snapshots e canal de atendimento",
            snippet_after("supabase/migrations/20260520_customer_accounts.sql", "create table if not exists public.orders", 42),
            s,
        )
    )
    story.append(
        code_block(
            "create_checkout_order - RPC transacional do checkout",
            snippet_after("supabase/migrations/20260520_customer_accounts.sql", "create or replace function public.create_checkout_order", 45),
            s,
            "A API chama esta funcao para gravar pedido, itens, pagamento e auditoria dentro do banco.",
        )
    )
    story.append(
        callout(
            "RLS",
            "As migrations habilitam Row Level Security nas tabelas publicas. Cliente autenticado so ve/insere seus proprios perfis, enderecos, pedidos e avaliacoes. Dados internos de fornecedor e custos ficam para service_role/admin.",
            s,
            fill=SOFT_GREEN,
            border=GREEN,
        )
    )
    story.append(
        code_block(
            "Storage buckets de imagens",
            snippet_after("supabase/migrations/20260530134705_admin_pricing_coupons_storage.sql", "insert into storage.buckets", 28),
            s,
            "O projeto usa buckets publicos/controlados para imagens de produtos e fotos de avaliacoes.",
        )
    )
    story.append(PageBreak())


def add_domain_flows(story, s):
    story.append(Paragraph("5. Catalogo e vitrine", s["H1"]))
    story.append(
        para(
            "O catalogo nasce no Supabase, mas a aplicacao converte linhas SQL em objetos de dominio JavaScript. Antes de chegar ao cliente, metadados internos como custo, margem e origem de compra sao removidos.",
            s["Body"],
        )
    )
    story.append(code_block("src/catalog/supabase-catalog-core.js - leitura do catalogo publicado", snippet("src/catalog/supabase-catalog-core.js", 1, 34), s))
    story.append(code_block("src/catalog/index.js - remocao de metadados internos", snippet("src/catalog/index.js", 16, 32), s))
    story.append(
        code_block(
            "src/admin/catalog-admin.js - produto criado pelo admin",
            snippet_after("src/admin/catalog-admin.js", "function collectProductPayload", 50),
            s,
            "O admin cria/edita produtos, custos, variacoes, categorias e URLs de imagens; depois revalida as rotas estaticas.",
        )
    )

    story.append(Paragraph("6. Checkout, WhatsApp e pedidos", s["H1"]))
    story.append(
        para(
            "O checkout e desenhado para nao confiar no navegador. O cliente envia o carrinho, mas o backend recarrega o catalogo, valida produtos/variacoes, recalcula precos e so entao monta o pedido e a mensagem.",
            s["Body"],
        )
    )
    story.append(
        code_block(
            "app/api/checkout/whatsapp/route.js - ponto de entrada do checkout",
            snippet_after("app/api/checkout/whatsapp/route.js", "export async function POST", 67),
            s,
            "A rota aplica rate limit, parseia JSON, pega telefone da loja, cria cliente Supabase e monta o draft do pedido.",
        )
    )
    story.append(
        code_block(
            "src/checkout/order-backend.js - persistencia via RPC",
            snippet_after("src/checkout/order-backend.js", "export async function persistCheckoutOrder", 38),
            s,
        )
    )
    story.append(
        code_block(
            "src/checkout/whatsapp.js - mensagem e URL wa.me",
            snippet_after("src/checkout/whatsapp.js", "export function buildWhatsAppCheckoutUrl", 12),
            s,
            "encodeURIComponent evita quebrar a URL com quebras de linha, acentos e simbolos monetarios.",
        )
    )
    story.append(
        code_block(
            "src/components/catalog/cart-checkout.js - envio pelo browser",
            snippet_after("src/components/catalog/cart-checkout.js", "async function submitCheckout", 50),
            s,
            "Depois que a API responde, o browser limpa o carrinho e abre o WhatsApp em nova aba.",
        )
    )

    story.append(Paragraph("7. Cupons, rate limit e logs", s["H1"]))
    story.append(
        para(
            "Cupons e checkout usam protecoes de abuso. O identificador de rate limit e hasheado antes de ir ao banco, e em producao o sistema falha fechado se o Supabase de rate limit estiver indisponivel.",
            s["Body"],
        )
    )
    story.append(code_block("src/checkout/coupons.js - normalizacao e regras do cupom", snippet("src/checkout/coupons.js", 1, 67), s))
    story.append(code_block("src/lib/rate-limit.js - perfis de limitacao", snippet("src/lib/rate-limit.js", 3, 31), s))
    story.append(code_block("supabase/migrations/...api_rate_limits.sql - tabela privada e RPC", snippet("supabase/migrations/20260601003626_api_rate_limits.sql", 1, 38), s))
    story.append(code_block("src/lib/logger.js - redacao de dados sensiveis", snippet("src/lib/logger.js", 1, 58), s))
    story.append(PageBreak())


def add_auth_admin_tracking(story, s):
    story.append(Paragraph("8. Autenticacao, conta e admin", s["H1"]))
    story.append(
        para(
            "A autenticacao de cliente usa Supabase Auth. A area admin nao usa conta Supabase normal: ela usa um token TSZR15_ADMIN_TOKEN, valida por hash em tempo constante e cria um cookie assinado com HMAC.",
            s["Body"],
        )
    )
    story.append(code_block("app/auth/actions.js - Server Actions de login/cadastro", snippet_after("app/auth/actions.js", "export async function signInAction", 62), s))
    story.append(code_block("src/admin/admin-session.js - cookie admin assinado", snippet("src/admin/admin-session.js", 1, 54), s))
    story.append(code_block("app/admin/actions.js - Server Action administrativa", snippet("app/admin/actions.js", 1, 54), s))
    story.append(
        callout(
            "Por que Server Actions?",
            "Formularios de conta e admin podem chamar funcoes do servidor diretamente. Isso permite validar sessao, checar origem, atualizar Supabase e chamar revalidatePath sem expor chaves ao navegador.",
            s,
            fill=SOFT_RED,
            border=ACCENT,
        )
    )

    story.append(Paragraph("9. Rastreio e avaliacoes", s["H1"]))
    story.append(
        para(
            "Rastreio publico e avaliacoes usam dados internos, mas filtram a exposicao. O cliente consulta por numero do pedido e contato; fotos de avaliacao ficam no Storage e sao servidas por URLs assinadas quando necessario.",
            s["Body"],
        )
    )
    story.append(code_block("src/tracking/order-tracking.js - consulta segura do rastreio", snippet_after("src/tracking/order-tracking.js", "export async function findPublicOrderTracking", 62), s))
    story.append(code_block("src/reviews/order-reviews.js - upload e assinatura de fotos", snippet_after("src/reviews/order-reviews.js", "async function uploadReviewPhotos", 58), s))
    story.append(code_block("app/rastreio/page.js - pagina publica de consulta", snippet_after("app/rastreio/page.js", "export default async function TrackingPage", 55), s))
    story.append(PageBreak())


def add_frontend_tooling(story, s):
    story.append(Paragraph("10. Estilo, assets e APIs do navegador", s["H1"]))
    story.append(
        para(
            "A camada visual usa CSS global em app/globals.css, CSS Module pontual para componente de senha, imagens em public/brand e URLs de Storage Supabase para assets remotos.",
            s["Body"],
        )
    )
    story.append(
        data_table(
            ["Recurso", "Arquivo", "Uso"],
            [
                ["CSS global", "app/globals.css", "Layout da loja, botoes, cards, admin, rastreio, carrinho e responsividade."],
                ["CSS Module", "src/components/form/password-input.module.css", "Escopo local do input de senha."],
                ["public assets", "public/brand/*.png", "Logo e imagens de marca versionadas no repo."],
                ["Supabase Storage", "heroBoardSrc e buckets product-images/review-photos", "Imagens que podem vir do painel/admin ou do bucket publico."],
                ["Web APIs", "localStorage, fetch, AbortController, window.open", "Carrinho, chamadas internas, consulta de CEP e abertura do WhatsApp."],
                ["Intl", "Intl.NumberFormat, Intl.DateTimeFormat", "Moeda e datas em pt-BR."],
            ],
            s,
            widths=[1.35 * inch, 2.15 * inch, CONTENT_WIDTH - 3.5 * inch],
        )
    )
    story.append(code_block("src/customer/cep-lookup.js - ViaCEP e AbortController", snippet("src/customer/cep-lookup.js", 1, 66), s))
    story.append(
        para(
            "O ViaCEP nao exige chave. O projeto monta a URL apenas quando o CEP tem 8 digitos, normaliza a resposta e deixa o componente cliente abortar requests antigos quando o usuario altera o campo rapidamente.",
            s["Body"],
        )
    )

    story.append(Paragraph("11. Scripts, testes e qualidade", s["H1"]))
    story.append(
        para(
            "O projeto usa scripts npm simples para desenvolvimento, build, lint, formatacao, testes e sincronizacao de catalogo. Os testes usam node:test e assert/strict, sem dependencia extra de test runner.",
            s["Body"],
        )
    )
    story.append(code_block("package.json - scripts principais", snippet_after("package.json", '"scripts"', 16), s))
    story.append(code_block("scripts/validate-catalog.mjs - validacao local do catalogo", snippet("scripts/validate-catalog.mjs", 1, 14), s))
    story.append(code_block("scripts/sync-supabase-catalog.mjs - seed/upsert do Supabase", snippet_after("scripts/sync-supabase-catalog.mjs", "async function main", 52), s))
    story.append(code_block("tests/rate-limit.test.mjs - exemplo de teste node:test", snippet("tests/rate-limit.test.mjs", 1, 44), s))
    story.append(code_block("eslint.config.mjs - lint JavaScript/JSX", snippet("eslint.config.mjs", 1, 39), s))
    story.append(code_block(".github/workflows/secret-scan.yml - Gitleaks no CI", snippet(".github/workflows/secret-scan.yml", 1, 33), s))
    story.append(PageBreak())


def add_config_and_planned(story, s):
    story.append(Paragraph("12. Configuracao e deploy", s["H1"]))
    story.append(
        para(
            "A configuracao do projeto e feita por variaveis de ambiente. O arquivo .env.example mostra nomes esperados sem segredos reais. O deploy de producao roda em Cloudflare Workers via OpenNext (@opennextjs/cloudflare): npm run deploy faz o build (opennextjs-cloudflare build) e publica o worker; wrangler.jsonc define o worker, os assets estaticos e os bindings de KV (cache incremental), D1 (tag cache) e Durable Object (fila de revalidacao). O codigo ainda detecta Vercel Preview: prefere credenciais de Supabase Preview quando VERCEL_ENV=preview ou SUPABASE_RUNTIME_TARGET=preview.",
            s["Body"],
        )
    )
    story.append(code_block(".env.example - variaveis usadas pelo app", snippet(".env.example", 1, 27), s))
    story.append(
        data_table(
            ["Grupo", "Variaveis", "Papel"],
            [
                ["WhatsApp", "NEXT_PUBLIC_WHATSAPP_BUSINESS_NUMBER, WHATSAPP_BUSINESS_NUMBER", "Numero usado na URL wa.me."],
                ["Supabase publico", "NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "Auth e leituras publicas/autenticadas."],
                ["Supabase servidor", "SUPABASE_SERVICE_ROLE_KEY, SUPABASE_SECRET_KEY", "Pedidos de convidado, admin, storage, cupons e rastreio."],
                ["Preview", "NEXT_PUBLIC_SUPABASE_PREVIEW_URL, SUPABASE_PREVIEW_SERVICE_ROLE_KEY", "Projeto isolado para preview/teste."],
                ["Admin", "TSZR15_ADMIN_TOKEN", "Senha/token do painel interno."],
                ["Site", "NEXT_PUBLIC_SITE_URL, SITE_URL, VERCEL_URL", "Origem segura para reset de senha e callbacks."],
            ],
            s,
            widths=[1.05 * inch, 2.55 * inch, CONTENT_WIDTH - 3.6 * inch],
        )
    )

    story.append(Paragraph("13. Tecnologias planejadas ou documentadas para evolucao", s["H1"]))
    story.append(
        para(
            "docs/APIS-NECESSARIAS.md lista integracoes para evoluir o MVP. Elas nao devem ser confundidas com features ja implementadas no codigo atual.",
            s["Body"],
        )
    )
    planned_rows = [
        ["Mercado Pago", "Pagamento Pix/link/cartao e webhooks de confirmacao.", "Planejado"],
        ["WhatsApp Cloud API", "Mensagens oficiais, webhooks e templates.", "Planejado"],
        ["Shopee Open Platform", "Automacao futura somente se o fluxo for permitido oficialmente.", "Planejado"],
        ["AliExpress/DSers", "Fornecedor ou integrador homologado para compra assistida.", "Planejado"],
        ["Correios/Melhor Envio", "Frete, prazo, etiquetas ou rastreio quando houver estoque proprio.", "Opcional"],
        ["Resend", "Email transacional para comprovantes e atualizacoes.", "Planejado"],
        ["Nota fiscal/ERP", "Explicitamente fora do escopo planejado atual.", "Fora do escopo"],
    ]
    story.append(
        data_table(
            ["Tecnologia", "Possivel uso", "Status"],
            planned_rows,
            s,
            widths=[1.55 * inch, CONTENT_WIDTH - 2.55 * inch, 1.0 * inch],
        )
    )
    story.append(code_block("docs/APIS-NECESSARIAS.md - ordem recomendada", snippet_after("docs/APIS-NECESSARIAS.md", "## Ordem recomendada", 11), s))

    story.append(Paragraph("14. Roteiro de estudo do projeto", s["H1"]))
    study_steps = [
        "Comece em README.md para entender produto, rotas e variaveis.",
        "Leia package.json para ver stack e scripts executaveis.",
        "Abra app/layout.js, app/page.js e app/api/checkout/whatsapp/route.js para entender o App Router.",
        "Siga src/catalog e src/components/catalog para entender vitrine, busca, produto e carrinho.",
        "Siga src/checkout para entender totais, cupom, validacao e mensagem WhatsApp.",
        "Leia src/lib/supabase e supabase/migrations para entender dados, Auth, RLS, RPC e Storage.",
        "Leia src/admin e app/admin/actions.js para entender o backoffice e revalidacao.",
        "Rode npm run validate e npm test quando as dependencias estiverem instaladas corretamente.",
    ]
    story.append(bullet_list(study_steps, s))
    story.append(
        callout(
            "Checklist mental",
            "Pergunte sempre: este dado vem do cliente ou do servidor? Ele pode ir para o browser? Ele depende de service_role? A resposta define se o codigo deve ficar em componente cliente, Server Action, API route, proxy ou RPC SQL.",
            s,
            fill=SOFT_BLUE,
            border=BLUE,
        )
    )


def build_pdf():
    register_fonts()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    s = styles()
    story = []
    build_cover(story, s)
    add_intro(story, s)
    add_next_react(story, s)
    add_supabase(story, s)
    add_domain_flows(story, s)
    add_auth_admin_tracking(story, s)
    add_frontend_tooling(story, s)
    add_config_and_planned(story, s)

    doc = BaseDocTemplate(
        str(OUT),
        pagesize=letter,
        leftMargin=MARGIN_X,
        rightMargin=MARGIN_X,
        topMargin=MARGIN_TOP,
        bottomMargin=MARGIN_BOTTOM,
        title="TSZR15 - Guia tecnico das tecnologias do projeto",
        author="Codex",
        subject="Tecnologias usadas no projeto TSZR15",
    )
    frame = Frame(
        MARGIN_X,
        MARGIN_BOTTOM,
        CONTENT_WIDTH,
        PAGE_HEIGHT - MARGIN_TOP - MARGIN_BOTTOM,
        id="normal",
    )
    doc.addPageTemplates([PageTemplate(id="pages", frames=[frame], onPage=draw_footer)])
    doc.build(story)
    return OUT


if __name__ == "__main__":
    output = build_pdf()
    print(output)
