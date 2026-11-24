"""Leitor de páginas do motor do Finde (KTD15).

Lê do stdin um JSON { "urls": [...], "modo": "simples"|"dinamico"|"furtivo", "timeoutMs": 30000,
"pausaMs": 1500, "proxy": null } e escreve uma linha JSON por URL:
{ url, final, status, titulo, texto, jsonld, links, dados, erro? }. `links` são os endereços absolutos
da página; `dados` é o JSON da resposta, quando a URL devolve JSON, o __NEXT_DATA__ da página ou, nos
sites Next com app router (Sympla), { "rsc": [ { data: [...] } ] }: as listas "response.data" que o servidor
embute no HTML (self.__next_f.push). E-mail e telefone são tirados de `dados` antes de sair.
Uma URL que falha não derruba as outras. Sem login, sem cookies, sem prints.

API do Scrapling 0.5.1 (não existe mais DynamicFetcher):
  simples  -> Fetcher.get (curl_cffi, sem navegador)
  dinamico -> StealthyFetcher.fetch com network_idle=True (Chromium via patchright)
  furtivo  -> o mesmo, com solve_cloudflare, hide_canvas e block_webrtc
"""
import json
import re
import sys
import time
from urllib.parse import urljoin

LIMITE_TEXTO = 20000


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


def abrir(url, modo, timeout_ms, proxy=None):
    extra = {"proxy": proxy} if proxy else {}
    if modo == "simples":
        from scrapling.fetchers import Fetcher
        return Fetcher.get(url, timeout=max(1, timeout_ms // 1000), follow_redirects=True, **extra)
    from scrapling.fetchers import StealthyFetcher
    opcoes = dict(headless=True, network_idle=True, timeout=timeout_ms, disable_resources=False, google_search=False)
    if modo == "furtivo":
        opcoes.update(solve_cloudflare=True, hide_canvas=True, block_webrtc=True)
    return StealthyFetcher.fetch(url, **opcoes, **extra)


def ler(url, modo, timeout_ms, proxy=None):
    resp = abrir(url, modo, timeout_ms, proxy)
    # O JSON-LD, os links e os dados saem antes de o texto mexer na árvore.
    ld = jsonld(resp)
    final = str(getattr(resp, "url", url))
    lk = links(resp, final)
    dd = dados(resp)
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
    }


def main():
    pedido = json.load(sys.stdin)
    modo = pedido.get("modo") or "dinamico"
    if modo not in ("simples", "dinamico", "furtivo"):
        modo = "dinamico"
    timeout_ms = int(pedido.get("timeoutMs") or 30000)
    pausa = max(0, int(pedido.get("pausaMs") or 0)) / 1000
    proxy = pedido.get("proxy") or None
    for i, url in enumerate(pedido.get("urls") or []):
        if i and pausa:
            time.sleep(pausa)  # educação com o site: um pedido por vez, com pausa
        try:
            linha = ler(url, modo, timeout_ms, proxy)
        except Exception as e:  # noqa: BLE001 - uma URL ruim não derruba as outras
            linha = {"url": url, "final": url, "status": 0, "titulo": "", "texto": "", "jsonld": [], "links": [], "dados": None, "erro": (f"{type(e).__name__}: {e}".replace(proxy, "[proxy]") if proxy else f"{type(e).__name__}: {e}")[:300]}
        sys.stdout.write(json.dumps(linha, ensure_ascii=False) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
