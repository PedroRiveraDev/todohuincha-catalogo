# Validacion AJV - parsed.json contra machineryProfile schema

Generado: 2026-06-27T02:50:08.109Z
Items validados: 17
PASS: 17 | FAIL: 0

## Resumen

| SKU | Title | Specs | Features | Warnings | AJV |
|---|---|---|---|---|---|
| 2194I | MAQUINA AFILADORA DE CUCHILLOS MF2510B | 17 | 0 | 1 | PASS |
| 2197I | AFILADORA DE SIERRAS HUINCHAS CBN TH100 | 6 | 0 | 1 | PASS |
| 2198I | CANTEADORA 12" WOOD JOINTER | 25 | 5 | 0 | PASS |
| 2199I | CEPILLADORA 20" PRODUCTION PLANER | 30 | 4 | 0 | PASS |
| 2200I | TUPI 1,5 HP SHAPER W. SLIDING TABLE - | 21 | 0 | 2 | PASS |
| 2201I | TUPI 3 HP PRODUCTION SHAPER - | 19 | 0 | 2 | PASS |
| 2204I | LIJADORA DE DISCO Y BANDA 6x9" | 24 | 6 | 0 | PASS |
| 2205I | LIJADORA DE BANDA OSCILANTE | 31 | 7 | 0 | PASS |
| 2206I | LIJADORA DE BANCO 26" VARIABLE SPEED DUAL DRUM SAN | 30 | 4 | 0 | PASS |
| 2207I | SIERRA HUINCHA 15 WOODWORKING BANDSAW - | 23 | 0 | 2 | PASS |
| 2208I | CEPILLADORA DOBLE SIDE WOOD PLANER | 32 | 5 | 0 | PASS |
| 2222I | CEPILLADORA 16x8” DELUXE PLANER | 28 | 7 | 0 | PASS |
| 2223I | LIJADORA 20"- 40" DRUM SANDER | 30 | 7 | 0 | PASS |
| 2280I | PERFILADORA MF223C | 11 | 0 | 1 | PASS |
| 2281I | MÁQUINA HOJAS TENSIONADOR DE SIERRAS HUINCHAS MR14 | 5 | 0 | 1 | PASS |
| 851 | MOTOR LIFAN BEN MOD AQ-2V80F-2DA 27HP | 15 | 0 | 1 | PASS |
| 852 | MOTOR LIFAN BEN MOD AQ-2V78F-2D 24HP | 16 | 0 | 1 | PASS |

## Fallos AJV (detalle)

_Ninguno. Todos los machinery_profile parseados son validos contra el schema._

## Recomendaciones para mejorar la extraccion

- Los 10 archivos en lote 1 (ERROR) requieren re-extraccion con un extractor mas robusto
- Los archivos del lote 3 (formato "nuevo") tienen texto concatenado del PDF original
  - El parser hace lo mejor posible pero algunos value_text tienen basura colgada
  - Recomendacion: re-procesar esos PDFs con PyMuPDF + layout=True para preservar columnas
- PILANA MADERAS SIERRAS (58 paginas, catalogo) requiere procesamiento especial