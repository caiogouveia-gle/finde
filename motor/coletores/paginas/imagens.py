"""Worker de imagem do motor do Finde (KTD7 do plano de 24/11/2026, M33).

Lê do stdin um JSON { "caminhos": [...], "dirSaida": "..." } e escreve uma linha JSON por
caminho, na mesma ordem, como o ler.py:

  { caminho, sha, arquivo, miniatura, largura, altura, bytes, tipo, phash, dhash, picoMb }
  { caminho, erro }

Recodifica a peça em WebP 1080 (q80) e 480 (q75) sem EXIF nem perfil, grava em
<dirSaida>/<sha16>-1080.webp e <sha16>-480.webp e calcula o pHash (DCT 32 para 8) e o dHash
(9x8), 64 bits em hexadecimal, só com Pillow (sem numpy nem imagehash). `sha` é o SHA-256 do
WebP de 1080; o nome do arquivo usa os 16 primeiros caracteres. `largura` e `altura` são as do
WebP de 1080.

Limites (uma imagem por vez, um processo só depois do ler.py):
  - arquivo acima de 8 MB: recusado antes de abrir;
  - só JPEG, PNG, WebP e GIF, pelos bytes mágicos (SVG, HTML e o resto são recusados);
  - JPEG até 40 megapixels, aberto com draft para nunca carregar a resolução cheia;
    PNG, WebP e GIF até 16 megapixels;
  - GIF e WebP animados: só o primeiro quadro.
`picoMb` é o pico de memória do processo (ru_maxrss, em bytes no macOS e em KB no Linux).
"""
import hashlib
import json
import math
import os
import resource
import sys
from io import BytesIO

from PIL import Image, ImageOps

Image.MAX_IMAGE_PIXELS = 40_000_000

LIMITE_BYTES = 8 * 1024 * 1024
LIMITE_PX_JPEG = 40_000_000
LIMITE_PX_OUTROS = 16_000_000
LADOS = ((1080, 80), (480, 75))  # (largura máxima, qualidade); a altura cabe até o dobro da largura


def pico_mb():
    r = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return round((r if sys.platform == "darwin" else r * 1024) / (1024 * 1024), 1)


def formato(cabeca):
    if cabeca[:3] == b"\xff\xd8\xff":
        return "jpeg"
    if cabeca[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    if cabeca[:4] == b"RIFF" and cabeca[8:12] == b"WEBP":
        return "webp"
    if cabeca[:6] in (b"GIF87a", b"GIF89a"):
        return "gif"
    return None


def para_rgb(im):
    # Transparência vai para fundo branco: o cartaz é visto sobre a página clara ou escura do app.
    if im.mode in ("RGBA", "LA", "PA") or (im.mode == "P" and "transparency" in im.info):
        im = im.convert("RGBA")
        fundo = Image.new("RGB", im.size, (255, 255, 255))
        fundo.paste(im, mask=im.split()[3])
        return fundo
    return im.convert("RGB")


def cinza(im, w, h):
    return im.convert("L").resize((w, h), Image.LANCZOS)


def dct_baixa(valores, n, k):
    # Os k primeiros coeficientes da DCT-II de n pontos.
    return [
        sum(valores[i] * math.cos(math.pi * (i + 0.5) * u / n) for i in range(n))
        for u in range(k)
    ]


def phash(im):
    p = list(cinza(im, 32, 32).tobytes())
    linhas = [p[r * 32:(r + 1) * 32] for r in range(32)]
    por_linha = [dct_baixa(l, 32, 8) for l in linhas]  # 32 linhas x 8 coeficientes
    bloco = []
    for u in range(8):  # coluna u de cada linha, DCT na vertical
        coluna = [por_linha[r][u] for r in range(32)]
        bloco.append(dct_baixa(coluna, 32, 8))
    # bloco[u][v]: u = frequência horizontal, v = vertical
    todos = [bloco[u][v] for v in range(8) for u in range(8)]
    ordenados = sorted(todos)
    mediana = (ordenados[31] + ordenados[32]) / 2
    bits = 0
    for x in todos:
        bits = (bits << 1) | (1 if x > mediana else 0)
    return f"{bits:016x}"


def dhash(im):
    p = list(cinza(im, 9, 8).tobytes())
    bits = 0
    for r in range(8):
        for c in range(8):
            bits = (bits << 1) | (1 if p[r * 9 + c] > p[r * 9 + c + 1] else 0)
    return f"{bits:016x}"


def reduzir(im, largura_max):
    w, h = im.size
    escala = min(1.0, largura_max / w, (2 * largura_max) / h)
    if escala >= 1.0:
        return im
    novo = (max(1, round(w * escala)), max(1, round(h * escala)))
    return im.resize(novo, Image.LANCZOS, reducing_gap=2.0)


def processar(caminho, dir_saida):
    tamanho = os.path.getsize(caminho)
    if tamanho > LIMITE_BYTES:
        return {"caminho": caminho, "erro": f"arquivo de {tamanho // 1024} KB acima do limite de 8 MB"}
    if tamanho == 0:
        return {"caminho": caminho, "erro": "arquivo vazio"}
    with open(caminho, "rb") as f:
        tipo = formato(f.read(16))
    if tipo is None:
        return {"caminho": caminho, "erro": "formato não aceito (só JPEG, PNG, WebP e GIF)"}

    with Image.open(caminho) as im:
        if im.format and im.format.lower() != tipo:
            return {"caminho": caminho, "erro": "formato não confere com os bytes"}
        w, h = im.size
        limite = LIMITE_PX_JPEG if tipo == "jpeg" else LIMITE_PX_OUTROS
        if w <= 0 or h <= 0 or w * h > limite:
            return {"caminho": caminho, "erro": f"imagem de {w}x{h} acima de {limite // 1_000_000} megapixels"}
        if tipo == "jpeg":
            im.draft("RGB", (2160, 2160))
        im.load()
        # Cópias só quando precisam: a orientação e a conversão para RGB duplicam os pixels.
        peca = im
        if im.getexif().get(0x0112, 1) not in (0, 1):
            peca = ImageOps.exif_transpose(im)
        if not (peca.mode == "RGB" and "transparency" not in peca.info):
            peca = para_rgb(peca)
        grande = reduzir(peca, 1080)
        if grande is peca:
            grande = grande.copy()  # `peca` fecha junto com o arquivo
        ph = phash(grande)
        dh = dhash(grande)

    os.makedirs(dir_saida, exist_ok=True)
    saidas = {}
    for largura, qualidade in LADOS:
        peca = grande if largura == 1080 else reduzir(grande, largura)
        buf = BytesIO()
        # Sem exif, sem icc_profile: o WebP sai só com os pixels.
        peca.save(buf, "WEBP", quality=qualidade, method=4, exif=b"", icc_profile=None)
        saidas[largura] = (buf.getvalue(), peca.size)
    corpo, (lw, lh) = saidas[1080]
    sha = hashlib.sha256(corpo).hexdigest()
    s16 = sha[:16]
    nomes = {1080: f"{s16}-1080.webp", 480: f"{s16}-480.webp"}
    for largura, nome in nomes.items():
        destino = os.path.join(dir_saida, nome)
        parcial = destino + f".{os.getpid()}.parcial"
        with open(parcial, "wb") as f:
            f.write(saidas[largura][0])
        os.replace(parcial, destino)
    return {
        "caminho": caminho,
        "sha": sha,
        "arquivo": f"imagens/{nomes[1080]}",
        "miniatura": f"imagens/{nomes[480]}",
        "largura": lw,
        "altura": lh,
        "bytes": len(corpo),
        "tipo": tipo,
        "phash": ph,
        "dhash": dh,
        "picoMb": pico_mb(),
    }


def main():
    pedido = json.load(sys.stdin)
    dir_saida = pedido.get("dirSaida") or "."
    for caminho in pedido.get("caminhos") or []:
        try:
            linha = processar(caminho, dir_saida)
        except Exception as e:  # noqa: BLE001 - uma imagem ruim não derruba as outras
            linha = {"caminho": caminho, "erro": f"{type(e).__name__}: {e}"[:300]}
        sys.stdout.write(json.dumps(linha, ensure_ascii=False) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
