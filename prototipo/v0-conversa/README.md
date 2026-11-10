# Finde, protótipo v0 (conversa)

> Feito em 09/11/2026 na tese do concierge de experiências em geral, anterior ao recorte em festas para 28 a 35 anos. O fluxo de resultado com porquê, ajuste por frase e link para o grupo serve de casca para o v1; a base de 75 experiências e a entrada por conversa ficam para trás. Ver `docs/conceito.md` na raiz.

O concierge que fecha o programa do fim de semana do grupo. A pessoa conversa, recebe três opções com o porquê de cada uma, manda um link para os amigos, eles votam e o programa fecha. Protótipo da entrega final de E&I (MBM, Insper); o contrato completo está em `CONTRATO.md`.

## Rodar

Node 24, sem dependência nenhuma e sem build.

```
node servidor.js
```

Abre em `http://localhost:8760`. Variáveis:

- `FINDE_PORTA`: porta (padrão 8760).
- `FINDE_DADOS`: a base curada (padrão `dados/experiencias.json`). Se o arquivo não existir ou não abrir, o servidor usa `teste/fixture.json` e avisa no log. Linhas inválidas são ignoradas, uma por uma, com aviso. A base é relida quando o arquivo muda.
- `FINDE_VAR`: onde ficam os planos (padrão `var/`, arquivo `planos.json`).

Para mostrar no celular na mesma rede, abra `http://<ip-do-computador>:8760`.

## Testar

```
node --test teste/
```

Cobre o motor (filtros duros, tipos diferentes, patrocinado, afrouxamento com aviso, determinismo, trocar), o `entender` com frases reais e a API de verdade num servidor em porta efêmera (planos, votos, fechamento com empate, nome com HTML, corpo grande, id inexistente, path traversal, base ausente).

## Onde está cada coisa

- `servidor.js`: estáticos, API, páginas de plano, cabeçalhos de segurança.
- `nucleo/motor.js`: escolhe as três opções. Puro e determinístico.
- `nucleo/entender.js`: texto livre para critérios, por regras. É o ponto de troca por um modelo de linguagem.
- `nucleo/planos.js`: criar, ler, votar, fechar; grava `planos.json` de forma atômica.
- `publico/`: a conversa (`index.html`, `app.js`) e a página do plano (`plano.html`, `plano.js`), com um CSS só.

## O que fica de fora

Conta, login, pagamento, mapa, reserva, Trend Score e painel B2B. Os lugares da base não foram conferidos um a um: a tela nunca afirma horário nem preço exato, só faixa por pessoa. O patrocinado é fictício e diz isso no nome. Os planos vivem num arquivo JSON, bom para a demonstração e não para muita gente ao mesmo tempo.
