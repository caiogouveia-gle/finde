"""Leitor de páginas do motor do Finde (KTD15).

Lê do stdin um JSON { "urls": [...], "modo": "simples"|"dinamico", "timeoutMs": 30000,
"pausaMs": 1500, "semRecursos": false, "esperar": null } e escreve uma linha JSON por URL:
{ url, final, status, titulo, texto, jsonld, links, dados, meta, erro? }. `meta` traz as imagens que a
própria página anuncia (og:image com largura e altura, twitter:image). `links` são os endereços absolutos
da página; `dados` é o JSON da resposta, quando a URL devolve JSON, o __NEXT_DATA__ da página ou, nos
sites Next com app router (Sympla), { "rsc": [ { data: [...] } ] }: as listas "response.data" que o servidor
embute no HTML (self.__next_f.push). E-mail e telefone são tirados de `dados` antes de sair.
Uma URL que falha não derruba as outras. Sem login, sem cookies, sem prints.

Como cada modo abre a página:
  simples  -> Fetcher.get do Scrapling 0.5.1 (curl_cffi, sem navegador), sem imitar navegador: sem
              `impersonate`, sem os cabeçalhos "reais" gerados e sem o Referer do Google que o
              `stealthy_headers` põe; só o User-Agent do projeto.
  dinamico -> Playwright puro (o Chromium sem os patches antidetecção do patchright, que é o que o
              StealthyFetcher usa), com o User-Agent do projeto, esperando a rede assentar;
              `semRecursos` não baixa imagem, fonte nem estilo; `esperar` é um seletor CSS que a
              página precisa mostrar (script[type="application/ld+json"] na Ingresse, que monta o
              evento depois). O binário é o do Playwright; se a revisão dele não está instalada (uma
              máquina que só tem o do patchright, de antes de 24/11), serve o de outra revisão.
  O HTML de cada um vira um Response do Scrapling, para a leitura ser a mesma.

Bloqueio é recusa (D14 do plano de 24/11/2026): não há modo furtivo, imitação de navegador, proxy,
solução de Cloudflare nem nova tentativa. Quem pede o modo "furtivo" recebe o erro de volta. 403, 429
e 503 ficam no `status`, e quem chama encerra a leitura daquela página.
"""
import glob
import json
import os
import re
import sys
import time
from urllib.parse import urljoin

LIMITE_TEXTO = 20000
# Quem lê se identifica (D14): o projeto, sem se passar por navegador de gente.
AGENTE = "FindeMotor/0.3 (prova academica; +https://finde-app.fly.dev)"


def jsonld(resp):
    saida = []
    for bruto in resp.css('script[type="application/ld+json"]::text').getall():
        try:
            valor = json.loads(bruto)
        except (ValueError, TypeError):
            continue
        saida.extend(valor if isinstance(valor, list) else [valor])
    return [o for o in saida if isinstance(o, dict)]


def texto_visivel(resp):
    # Tira script, style e afins da árvore antes de pedir o texto.
    for no in resp.css("script, style, noscript, template, svg"):
        no.drop() if hasattr(no, "drop") else None
    corpo = resp.css("body")
    fonte = corpo[0] if corpo else resp
    partes = fonte.get_all_text(separator="\n", strip=True, ignore_tags=("script", "style", "noscript", "template", "svg"))
    return str(partes)[:LIMITE_TEXTO]


def links(resp, base):
    vistos = []
    for href in resp.css("a::attr(href)").getall():
        if not href or href.startswith(("#", "mailto:", "tel:", "javascript:")):
            continue
        u = urljoin(base, href)
        if u not in vistos:
            vistos.append(u)
    return vistos[:500]


PESSOAIS = {"email", "e-mail", "phone", "telefone", "cpf"}


def sem_pessoais(o):
    if isinstance(o, dict):
        return {k: sem_pessoais(v) for k, v in o.items() if str(k).lower() not in PESSOAIS}
    if isinstance(o, list):
        return [sem_pessoais(v) for v in o]
    return o


def rsc(corpo):
    # O HTML de um app router leva o que o servidor montou em self.__next_f.push([1,"..."]).
    pedacos = []
    for p in re.findall(r'self\.__next_f\.push\(\[1,"(.*?)"\]\)</script>', corpo, re.S):
        try:
            pedacos.append(json.loads('"' + p + '"'))
        except ValueError:
            continue
    texto = "".join(pedacos)
    dec = json.JSONDecoder()
    saida = []
    for m in re.finditer(r'"response":', texto):
        try:
            o, _ = dec.raw_decode(texto[m.end():])
        except ValueError:
            continue
        if isinstance(o, dict) and isinstance(o.get("data"), list):
            saida.append({"data": o["data"]})
    return {"rsc": saida} if saida else None


def dados(resp):
    corpo = getattr(resp, "body", b"") or b""
    if isinstance(corpo, (bytes, bytearray)):
        corpo = corpo.decode("utf-8", "ignore")
    if corpo.lstrip()[:1] in ("{", "["):
        try:
            return sem_pessoais(json.loads(corpo))
        except ValueError:
            pass
    nd = resp.css('script#__NEXT_DATA__::text').get()
    if nd:
        try:
            return sem_pessoais(json.loads(nd))
        except ValueError:
            return None
    if "__next_f.push" in corpo:
        return sem_pessoais(rsc(corpo))
    return None


def meta(resp):
    def conteudo(seletor):
        v = resp.css(seletor + "::attr(content)").get()
        return v.strip() if isinstance(v, str) and v.strip() else None

    def numero(v):
        return int(v) if isinstance(v, str) and v.isdigit() else None

    return {
        "ogImage": conteudo('meta[property="og:image"]'),
        "ogImageWidth": numero(conteudo('meta[property="og:image:width"]')),
        "ogImageHeight": numero(conteudo('meta[property="og:image:height"]')),
        "twitterImage": conteudo('meta[name="twitter:image"]'),
    }


RECURSOS_PESADOS = ("image", "media", "font", "stylesheet")


def chromium_instalado(p):
    """O Chromium que o Playwright espera ou, se a revisão dele não está instalada, o de outra
    revisão na mesma pasta (a máquina que só tem o Chromium do patchright, instalado antes)."""
    esperado = p.chromium.executable_path
    if os.path.exists(esperado):
        return esperado
    m = re.search(r"chromium-(\d+)", esperado)
    if not m:
        return None
    base = esperado[: m.start()]
    for pasta in sorted(glob.glob(os.path.join(base, "chromium-[0-9]*")), key=lambda x: int(re.sub(r"\D", "", os.path.basename(x)) or 0), reverse=True):
        candidato = esperado.replace(m.group(0), os.path.basename(pasta), 1)
        if os.path.exists(candidato):
            return candidato
    return None


def abrir_no_navegador(url, timeout_ms, sem_recursos=False, esperar=None):
    from playwright.sync_api import sync_playwright
    from scrapling.engines.toolbelt.custom import Response

    with sync_playwright() as p:
        navegador = p.chromium.launch(headless=True, executable_path=chromium_instalado(p), args=["--mute-audio"])
        try:
            contexto = navegador.new_context(user_agent=AGENTE, locale="pt-BR")
            pagina = contexto.new_page()
            if sem_recursos:
                pagina.route("**/*", lambda r: r.abort() if r.request.resource_type in RECURSOS_PESADOS else r.continue_())
            resposta = pagina.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
            if resposta and resposta.status >= 400:
                # Recusa (403/429/503...) volta com o status, sem esperar a página
                # assentar nem o seletor: senão vira TimeoutError com status 0.
                return Response(url=pagina.url, content=pagina.content(), status=resposta.status, reason="",
                                cookies={}, headers={}, request_headers={})
            try:
                pagina.wait_for_load_state("networkidle", timeout=timeout_ms)
            except Exception:  # noqa: BLE001 - página que nunca assenta: lê o que há
                pass
            if esperar:
                pagina.wait_for_selector(esperar, state="attached", timeout=timeout_ms)
            html = pagina.content()
            return Response(url=pagina.url, content=html, status=resposta.status if resposta else 0, reason="",
                            cookies={}, headers={}, request_headers={})
        finally:
            navegador.close()


def abrir(url, modo, timeout_ms, sem_recursos=False, esperar=None):
    if modo == "simples":
        from scrapling.fetchers import Fetcher
        return Fetcher.get(url, timeout=max(1, timeout_ms // 1000), follow_redirects=True,
                           stealthy_headers=False, impersonate=None, headers={"User-Agent": AGENTE})
    return abrir_no_navegador(url, timeout_ms, sem_recursos, esperar)


def ler(url, modo, timeout_ms, sem_recursos=False, esperar=None):
    resp = abrir(url, modo, timeout_ms, sem_recursos, esperar)
    # O JSON-LD, os links e os dados saem antes de o texto mexer na árvore.
    ld = jsonld(resp)
    final = str(getattr(resp, "url", url))
    lk = links(resp, final)
    dd = dados(resp)
    mt = meta(resp)
    titulo = resp.css("title::text").get() or resp.css('meta[property="og:title"]::attr(content)').get() or resp.css("h1::text").get()
    return {
        "url": url,
        "final": final,
        "status": resp.status,
        "titulo": (titulo or "").strip(),
        "texto": texto_visivel(resp),
        "jsonld": ld,
        "links": lk,
        "dados": dd,
        "meta": mt,
    }


MODOS = ("simples", "dinamico")


def main():
    pedido = json.load(sys.stdin)
    modo = pedido.get("modo") or "dinamico"
    timeout_ms = int(pedido.get("timeoutMs") or 30000)
    pausa = max(0, int(pedido.get("pausaMs") or 0)) / 1000
    sem_recursos = bool(pedido.get("semRecursos"))
    esperar = pedido.get("esperar") if isinstance(pedido.get("esperar"), str) else None
    for i, url in enumerate(pedido.get("urls") or []):
        if i and pausa:
            time.sleep(pausa)  # educação com o site: um pedido por vez, com pausa
        try:
            if modo not in MODOS:
                raise ValueError(f"modo {modo!r} recusado: bloqueio é recusa, o leitor não contorna")
            linha = ler(url, modo, timeout_ms, sem_recursos, esperar)
        except Exception as e:  # noqa: BLE001 - uma URL ruim não derruba as outras
            linha = {"url": url, "final": url, "status": 0, "titulo": "", "texto": "", "jsonld": [], "links": [], "dados": None, "meta": None, "erro": f"{type(e).__name__}: {e}"[:300]}
        sys.stdout.write(json.dumps(linha, ensure_ascii=False) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
