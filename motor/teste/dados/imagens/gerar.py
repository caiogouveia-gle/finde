"""Gera as fixtures pequenas de imagem (U16), a partir dos cartazes fictícios do protótipo.

Uso: uv run --offline --project ../../../coletores/paginas python gerar.py
Nenhuma imagem real de terceiro: os cartazes de origem são os do protótipo (fictícios).
"""
import os
from PIL import Image

AQUI = os.path.dirname(os.path.abspath(__file__))
CARTAZES = os.path.join(AQUI, "..", "..", "..", "..", "prototipo", "v1-festas", "publico", "cartazes")


def abrir(nome):
    return Image.open(os.path.join(CARTAZES, nome)).convert("RGB")


a = abrir("pulso.webp")
b = abrir("sala-de-estar.webp")
w = 540
a = a.resize((w, round(a.height * w / a.width)))
b = b.resize((w, round(b.height * w / b.width)))
a.save(os.path.join(AQUI, "cartaz-a.jpg"), quality=88)
b.save(os.path.join(AQUI, "cartaz-b.jpg"), quality=88)
# O mesmo cartaz recomprimido: q30 e metade do tamanho.
a.resize((a.width // 2, a.height // 2), Image.LANCZOS).save(os.path.join(AQUI, "cartaz-a-q30.jpg"), quality=30)
# O recorte 16:9 da parte do meio (banner de página de ingresso).
alt = round(a.width * 9 / 16)
topo = (a.height - alt) // 2
a.crop((0, topo, a.width, topo + alt)).save(os.path.join(AQUI, "cartaz-a-16x9.jpg"), quality=88)
# PNG pequeno com transparência.
Image.new("RGBA", (64, 64), (255, 0, 0, 0)).save(os.path.join(AQUI, "transparente.png"))
open(os.path.join(AQUI, "desenho.svg"), "w").write('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>\n')
open(os.path.join(AQUI, "pagina.html"), "w").write("<!doctype html><title>não é imagem</title><p>exemplo</p>\n")
