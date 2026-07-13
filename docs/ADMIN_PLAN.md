# Plan del Admin Panel — Catálogo Industrial Todo Huincha

**Estado:** En construcción
**Target user:** Bodeguero / operador comercial. NO ingeniero de software.
**UX reference:** Crystal Reports (paradigma) → modernizado tipo Figma (visual).
**Versión actual:** v1 (este turno)

---

## Vision general

Editor visual drag & drop para configurar cómo se generan los PDFs del catálogo.
El usuario arrastra bloques (cover, banner, tabla, ficha técnica) desde una paleta
al canvas central, los reordena, configura sus propiedades, y previsualiza el PDF
generado en vivo.

**Reglas de oro:**
- SIMPLE antes que COMPLETO. Un bodeguero tiene que poder usarlo sin training.
- VISUAL antes que TEXTUAL. Si algo se puede mostrar con preview en vez de un input
  numérico, preferimos el preview.
- AUTOSAVE a localStorage cada N segundos. Save button explícito al final.
- PERSISTIR en `catalog_generation` DENTRO del JSON principal
  (`docs/catalogo_productos_robusto_completo_corregido.json`).
  NO crear archivos JSON nuevos. NO agregar keys top-level nuevas al JSON.
  Solo popular los bloques que el schema ya permite
  (catalog_generation, catalog_assets, asset_strategy, category_dictionary, families).

---

## V1 — Lo que entrego este turno

### Rutas admin
- `/admin` — dashboard con resumen (totales, última config, estado del JSON)
- `/admin/outputs` — listado de los 5 output_types con toggle enable/disable
- `/admin/outputs/full-catalog` — editor visual del layout del full catalog
  - cover_pages (drag & drop para reordenar)
  - sections (drag & drop desde paleta + reordenar)
  - rules (IF/THEN visual, agregar/quitar/editar)
- `/admin/categories` — editar description + banner de cada categoría
- `/admin/preview` — vista previa del PDF con la config actual

### Componentes v1
- `src/layouts/AdminLayout.astro` — sidebar de admin + header + slot
- `src/components/admin/PalettePanel.astro` — paleta izquierda (elementos arrastrables)
- `src/components/admin/CanvasPanel.astro` — canvas central (bandas verticales)
- `src/components/admin/PropertiesPanel.astro` — panel derecho contextual
- `src/components/admin/CoverPageBand.astro` — banda de cover en canvas
- `src/components/admin/SectionBand.astro` — banda de sección genérica
- `src/components/admin/RuleRow.astro` — fila IF/THEN editable
- `src/components/admin/DataFieldToken.astro` — token clickable de data field

### Libs v1
- `src/lib/admin-auth.ts` — interface `isAdmin()`, hoy siempre true, mañana valida
- `src/lib/admin-storage.ts` — read/write `catalog_generation` del JSON con AJV
- `src/lib/admin-rules-engine.ts` — evalúa las reglas IF/THEN (safe subset, NO eval)
- `src/lib/admin-pdf-renderer.ts` — renderiza el PDF usando la config del admin

### Storage
- JSON principal: `docs/catalogo_productos_robusto_completo_corregido.json`
  - Bloque `catalog_generation` (ya existe en schema, line 171)
  - Bloque `catalog_assets` (ya existe, popula cover/logo/placeholder)
  - `asset_strategy.pdf_main_image_resolution_order` (ya existe)
  - `dictionaries.category_dictionary[*].assets.{banner,background}.url` (ya existe)
- localStorage: `admin:draft:<output_type>` (autosave durante edición)
- localStorage: `admin:selected_element` (elemento seleccionado en el canvas)

### Contrato .NET/backend — tipografía de portada

- **Key persistida:** `catalog_generation.output_types.full_catalog_pdf.layout.cover_pages[].data.font_family`
- **Tipo:** `string`
- **Valores permitidos por la UI / fallback:**
  - `system-ui` — valor por defecto y fallback si el campo viene vacío o no soportado
  - `Arial, sans-serif`
  - `Georgia, serif`
  - `Manrope, system-ui, sans-serif`
  - `Geist, system-ui, sans-serif`
  - `IBM Plex Sans, system-ui, sans-serif`
- **Expectativa del renderer:** el renderer .NET debe leer este valor desde `cover_pages[].data.font_family` y aplicarlo como familia tipográfica de la portada. Si el valor no existe, viene vacío, o no está disponible en el entorno de render, debe caer a `system-ui` o a la familia equivalente configurada como default del renderer.
- **Compatibilidad de schema:** este campo vive dentro del objeto existente `cover_pages[].data`. No se agrega ninguna key nueva de primer nivel ni una propiedad sibling de `data`.

---

## V2+ — Features futuras (NO en este turno)

Anotadas por el usuario. NO implementar hasta que él lo pida explícitamente.

### Editor pixel-perfect de cada elemento
- Coordenadas X/Y absolutas en el canvas
- Resize libre (drag de esquinas)
- Snap a grid configurable
- Rotación de elementos (degrees)
- Z-index / capas
- **Justificación:** Figma hace esto, pero es meses de trabajo y no es necesario
  para que un bodeguero genere catálogos decentes. El v1 con bandas verticales
  + drag & drop cubre el 90% del valor.

### Multi-página con thumbnails
- Sidebar con thumbnails de cada página del PDF
- Click en thumbnail → navega a esa página en el canvas
- Reordenar páginas por drag & drop
- **Justificación:** Útil cuando el PDF es muy largo. Pero el v1 con vista
  secuencial de bandas funciona para catálogos de <100 páginas.

### Editor de assets (upload de archivos)
- Upload drag & drop de imágenes
- Crop, resize, optimize
- Asignar a category/cover/item
- **Justificación:** El usuario dijo "mejor con .NET después" — el upload de
  archivos binarios es mejor manejado por el backend .NET con storage dedicado
  (S3, Azure Blob, etc.), no por el frontend Astro estático.

### Drag & drop de data fields (no solo click)
- Arrastrar `{{item.sku}}` al elemento de texto seleccionado
- En v1 es click-to-insert (más simple)
- **Justificación:** Click es 90% del valor con 10% del código. Drag se agrega después.

### Per-element CSS overrides
- Color picker por texto
- Font family picker
- Size slider
- **Justificación:** Requiere un editor CSS inline por elemento. El v1 hereda
  los estilos del design system (naranja #fb4d08, slate #313E48, etc.).

### Undo/redo stack
- Ctrl+Z / Ctrl+Y
- Historial de cambios
- **Justificación:** Útil pero no crítico. El autosave a localStorage mitiga el riesgo.

---

## Schema del JSON (catalog_generation)

### Bloque existente en schema (line 171)
```json
{
  "catalog_generation": {
    "type": "object",
    "required": ["output_types"],
    "properties": {
      "description": { "type": "string" },
      "output_types": { "type": "object" }
    },
    "additionalProperties": true
  }
}
```

### Schema propuesto para output_types[*]
```json
{
  "output_types": {
    "full_catalog_pdf": {
      "enabled": true,
      "template_key": "catalog_full",
      "layout": {
        "cover_pages": [
          { "id": "cover_1", "source": "asset:cover_image_1", "enabled": true },
          { "id": "cover_2", "source": "asset:cover_image_2", "enabled": true }
        ],
        "sections": [
          {
            "id": "intro_title",
            "type": "fixed",
            "block": "title",
            "data": { "text": "Catálogo Industrial Todo Huincha 2026" }
          },
          {
            "id": "categories",
            "type": "variable",
            "block": "category_section",
            "source": "categories[*]",
            "template_rule": "show_compacto"
          },
          {
            "id": "back",
            "type": "fixed",
            "block": "back_cover"
          }
        ]
      },
      "rules": [
        {
          "id": "show_denso",
          "when": "item.machinery_profile && item.machinery_profile.specification_groups && item.machinery_profile.specification_groups.length >= 5",
          "then": { "block": "denso" }
        },
        {
          "id": "show_medio",
          "when": "item.machinery_profile && (item.machinery_profile.features && item.machinery_profile.features.length > 0 || item.machinery_profile.specification_groups && item.machinery_profile.specification_groups.length > 0)",
          "then": { "block": "medio" }
        },
        {
          "id": "show_compacto",
          "when": "true",
          "then": { "block": "compacto" }
        }
      ]
    }
  }
}
```

### Cover pages image-only preset
- **Key persistida:** `catalog_generation.output_types.full_catalog_pdf.layout.cover_pages[].data.render_mode`
- **Valor implementado para portadas sin texto:** `full_page_image`
- **Shape usado por el admin:** cada portada queda dentro de `layout.cover_pages[]`, con `source` y `data.background` apuntando a la misma ruta web-accesible. No se agregan keys de primer nivel.
- **Preset actual:** el botón `Usar portadas page_1/page_2` crea dos entradas:
  - `cover_pages[0]`: `source: "/admin/assets/page_1.png"`, `data.render_mode: "full_page_image"`
  - `cover_pages[1]`: `source: "/admin/assets/page_2.png"`, `data.render_mode: "full_page_image"`
- **Contrato renderer .NET:** si `data.render_mode === "full_page_image"`, renderizar la imagen como página completa/bleed y omitir cualquier título, subtítulo, año, chip, fecha o texto superpuesto. El contenido empieza después de todas las `cover_pages` habilitadas.
- **Rutas de imagen:** `/admin/assets/page_1.png` y `/admin/assets/page_2.png` son servidas desde `docs/page_1.png` y `docs/page_2.png` por una ruta Astro, sin duplicar binarios en `public/`.

### Rule DSL (subset seguro)
- `when` es una expresión que se evalúa por item con `item` como contexto
- Operadores permitidos:
  - Property access: `item.foo.bar`
  - Comparison: `=== !== == != < <= > >=`
  - Logical: `&& || !`
  - Truthy check: `item.foo` (truthy si no es null/undefined/0/'')
  - Ternary: `cond ? a : b`
- NO permitido (por seguridad):
  - Function calls: `item.foo()`
  - Property assignment: `item.foo = bar`
  - eval(), Function(), setTimeout(), etc.
- Parser implementado en `src/lib/admin-rules-engine.ts` SIN usar `eval()`

### Data fields disponibles (tokens para insertar en texto)
- `{{item.sku}}`
- `{{item.display_name}}`
- `{{item.category_label}}`
- `{{item.pricing.sale_amount}}` — formatea como CLP
- `{{item.pricing.currency}}`
- `{{item.pricing.formatted}}`
- `{{item.machinery_profile.brand}}`
- `{{item.machinery_profile.model}}`
- `{{item.machinery_profile.features | bullet}}` — convierte array en bullets
- `{{count}}` — contador dentro de iteración
- `{{now}}` — fecha actual
- `{{today}}` — fecha actual en español

---

## Convenciones del editor

### Drag & drop UX
- **Hover** sobre paleta: highlight del elemento
- **Drag start**: el elemento se semi-transparenta
- **Drag over canvas**: aparece indicador de posición (línea azul entre bandas)
- **Drag over otra banda**: highlight del slot destino
- **Drop**: inserta en la posición correcta, scroll automático si queda fuera de viewport

### Selección
- **Click en banda del canvas**: la banda se outline naranja, el panel derecho muestra sus propiedades
- **Click fuera**: deselecciona
- **Escape**: deselecciona
- **Delete/Backspace**: elimina la banda seleccionada (con confirmación si es cover o back)

### Autosave
- Cada cambio se persiste a localStorage inmediatamente
- Indicador de "guardado" vs "guardando..." en el header
- Save explícito al final con diff JSON antes de commit

### Preview
- Botón "Preview PDF" abre nueva pestaña con el PDF generado
- Si hay errores en la config (ej. cover sin source), muestra warning en preview
- Botón "Descargar PDF" en la pestaña de preview

---

## Tests y validación

- Unit tests para `admin-rules-engine.ts` (parser seguro)
- Unit tests para `admin-storage.ts` (AJV validation)
- Manual: usuario prueba el admin con su dev server
- Visual: comparar el PDF generado con el admin vs el anterior
