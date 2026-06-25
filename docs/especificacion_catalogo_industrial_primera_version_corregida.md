# Especificacion Tecnica - Catalogo Industrial Todo Huincha

**Version:** 2.0.0
**Estado:** Version corregida y alineada con la fuente de verdad
**Encoding:** UTF-8 (sin BOM)
**Fecha:** 2026-06-24

---

## Tabla de contenido

1. Aclaracion fundamental
2. Tipos de item del catalogo
3. Estructura general del JSON
4. Politica de generacion PDF
5. Gestion de imagenes y assets
6. Regla de fallback de imagen principal
7. Modelo PostgreSQL - DDL completo
8. Campos principales en catalog_items
9. Maquinaria
10. Servicios
11. API REST
12. Patron de consumo schema-first
13. Frontend - componentes
14. Arquitectura limpia y casos de uso
15. Proceso de extraccion de datos y validacion de cobertura
16. Sincronizacion entre .md, schema y JSON

Anexo A: Glosario
Anexo B: Cambios respecto a la version 1

---

## 1. Aclaracion fundamental

### 1.1 Sobre los PDFs del desarrollador

Los PDFs que el desarrollador tiene hoy (catalogos de marca, fichas tecnicas impresas, etc.) son inputs de trabajo, NO parte del sistema.

Reglas:

- El sistema NO almacena PDFs del desarrollador.
- El sistema NO referencia PDFs en su modelo de datos.
- El sistema NO expone campos para "subir PDF".
- Los PDFs del desarrollador se procesan UNA SOLA VEZ para extraer datos al JSON.
- El JSON es la unica fuente de verdad.

### 1.2 Sobre los PDFs que el sistema genera

El sistema genera PDFs desde el JSON. Esos PDFs son OUTPUTS para el cliente final.

Outputs soportados:

- Catalogo PDF completo
- Ficha tecnica PDF de maquinaria
- Ficha PDF de servicio
- Tarjeta PDF de producto simple
- Seccion PDF por categoria

### 1.3 Regla de oro

```
datos estructurados + imagenes -> generador PDF -> PDFs para el cliente
```

NO se permite:

```
producto -> tiene un PDF adjunto como ficha tecnica final
```

---

## 2. Tipos de item del catalogo

### 2.1 Tipos soportados

| Codigo | Nombre | Stock fisico | Ficha tecnica | Compatibilidades | Capacidades de servicio |
|--------|--------|--------------|---------------|------------------|--------------------------|
| simple_product | Producto simple | si | no | no | no |
| spare_part | Repuesto | si | no | si | no |
| machinery | Maquinaria | si | si | no | no |
| service | Servicio | no | no | no | si |

### 2.2 Flags de capabilities

Los flags `requires_physical_stock`, `allows_technical_sheet`, `allows_compatibility`, `allows_service_capabilities` estan definidos en el `item_type_dictionary` del JSON (ver `catalogo_productos_schema_validacion_corregido.json`, definicion `itemTypeDefinition`).

Si se agrega un nuevo tipo de item, se debe:

1. Agregar entrada al `item_type_dictionary`.
2. Validar que el schema acepte el nuevo enum value en `item_type`.
3. Definir perfil especifico si el tipo lo requiere (como `machinery_profile`, `spare_part_profile`, `service_profile`).
4. Definir template de PDF correspondiente en `catalog_generation.output_types`.

---

## 3. Estructura general del JSON

### 3.1 Top-level

```json
{
  "schema_version": "1.0.0",
  "catalog": {},
  "catalog_assets": {},
  "catalog_generation": {},
  "asset_strategy": {},
  "dictionary_version": {},
  "dictionaries": {},
  "families": [],
  "items": [],
  "service_catalog": []
}
```

### 3.2 Bloque catalog

Contiene metadata y totales del catalogo:

```json
{
  "catalog_id": "th-industrial-catalog",
  "catalog_name": "Catalogo de productos",
  "catalog_slug": "catalogo-de-productos",
  "default_currency": "CLP",
  "source_file": "CODIGOS_TH.xlsx",
  "generated_at": "ISO-8601 timestamp",
  "totals": {
    "categories": 22,
    "products": 687,
    "families": 666,
    "zero_price_products": 21,
    "item_types": {
      "service": 33,
      "simple_product": 525,
      "spare_part": 98,
      "machinery": 31
    },
    "technical_sheets": 14,
    "items_with_main_image_slot": 31,
    "items_with_generated_pdf_output": 687
  }
}
```

`source_file` referencia UNICAMENTE el archivo Excel de origen. NO se listan PDFs en este campo.

### 3.3 Bloque asset_strategy

Define como se resuelven imagenes y assets:

```json
{
  "asset_strategy": {
    "description": "Reglas de resolucion de imagen principal para PDF y frontend.",
    "pdf_main_image_resolution_order": [
      "item.assets.main_image",
      "family.assets.main_image",
      "category_dictionary[category_code].assets.banner",
      "catalog_assets.placeholder_image"
    ],
    "main_image_rule": {
      "asset_role": "main_image",
      "is_primary": true,
      "sort_order": 1
    },
    "recommended_formats": ["webp", "jpg", "png"],
    "fallback_policy": {
      "on_pending_upload": "use_next_in_chain",
      "on_missing": "use_placeholder",
      "on_error": "log_and_use_placeholder"
    }
  }
}
```

### 3.4 Bloque dictionaries

Cuatro diccionarios independientes, cada uno como objeto indexado por codigo:

```json
{
  "dictionary_version": {
    "version": "1.0.0",
    "hash_sha256": "..."
  },
  "dictionaries": {
    "category_dictionary": {},
    "attribute_dictionary": {},
    "item_type_dictionary": {},
    "subtype_dictionary": {}
  }
}
```

- `category_dictionary`: indexado por `category_code`.
- `attribute_dictionary`: indexado por path de atributo (`pricing.sale_amount`, etc.).
- `item_type_dictionary`: indexado por `item_type` enum value.
- `subtype_dictionary`: NUEVO en v2. Indexado por `item_subtype_code`. Taxonomia controlada de subtipos.

### 3.5 Bloque families

Array de familias. Una familia agrupa variantes que comparten nombre normalizado:

```json
{
  "id": "uuid",
  "family_key": "recalque-30-vaciado-recalque-igualado-rect-front",
  "display_name": "RECALQUE 30 (VACIADO / RECALQUE / IGUALADO / RECT FRONT)",
  "category_code": "RECALQUE",
  "category_label": "Recalque",
  "variant_count": 3,
  "variant_skus": ["LA1071", "I1071", "C1071"],
  "price_min": 300.0,
  "price_max": 300.0,
  "assets": {
    "main_image": null,
    "gallery": [],
    "suggested_storage_folder": "catalog/families/.../images/"
  }
}
```

Reglas:

- `family_key` se genera normalizando el `display_name` a slug.
- `variant_skus` referencia SKUs que viven en `items[]`.
- Cada item tiene `family_id` (UUID) y `family_key` (string) apuntando a su familia.

### 3.6 Bloque items

Array de items. Cada item tiene `item_type` y, segun el tipo, un perfil especifico:

- `item_type == "machinery"` -> requiere `machinery_profile`
- `item_type == "spare_part"` -> requiere `spare_part_profile`
- `item_type == "service"` -> requiere `service_profile`
- `item_type == "simple_product"` -> no requiere perfil especifico

Shape basico:

```json
{
  "id": "uuid",
  "sku": "LA1071",
  "name": "RECALQUE 30 ...",
  "display_name": "RECALQUE 30 ...",
  "slug": "la1071-recalque-30-...",
  "family_key": "recalque-30-...",
  "family_id": "uuid",
  "variant_prefix": "LA",
  "entity_class": "servicio_afilado",
  "category_code": "RECALQUE",
  "category_label": "Recalque",
  "category_group": "servicios",
  "item_type": "service",
  "item_subtype_code": "recalque",
  "technical_profile_level": "standard",
  "pricing": {
    "sale_amount": 300.0,
    "currency": "CLP",
    "formatted": "CLP 300,00",
    "is_price_available": true,
    "price_observations": []
  },
  "status": {
    "is_active": true,
    "is_price_zero": false,
    "is_catalog_visible": true
  },
  "source": {
    "catalog_file": "CODIGOS_TH.xlsx",
    "sheet_name": "RECALQUE",
    "sheet_slug": "recalque"
  },
  "search": {
    "normalized_name": "recalque 30 vaciado recalque igualado rect front",
    "tokens": ["recalque", "30", "vaciado", "igualado", "rect", "front"],
    "ai_semantic_context": "..."
  },
  "specifications": {
    "brand": null,
    "materials": [],
    "measurements_raw": [],
    "quoted_inches": []
  },
  "profiles": {},
  "service_profile": {},
  "assets": {},
  "generated_outputs": {}
}
```

`category_group` agrupa categorias en el sidebar. Valores actuales: `servicios`, `materiales`, `maquinaria`, `sierras`, `consumibles`, `cuchillos`.

### 3.7 Bloque service_catalog

Array SEPARADO de `items[]`. Contiene los 10 servicios macro (Troquelado, Soldadura MIG, etc.):

```json
{
  "service_code": "SERV-TROQUELADO",
  "service_name": "Troquelado",
  "item_type": "service",
  "item_subtype_code": "troquelado",
  "service_group": "servicios_industriales",
  "pricing_mode": "quoted",
  "requires_diagnosis": true,
  "is_schedulable": true,
  "capabilities": [
    {
      "capability_code": "work_range",
      "label": "Rango de trabajo",
      "min_value": 32,
      "max_value": 260,
      "unit": "mm",
      "applies_to": null,
      "notes": null
    }
  ]
}
```

Diferencia con `items[]`:

- `items[]` con `item_type: service`: SKUs concretos con precio fijo (ej. RECALQUE 30 a CLP 300).
- `service_catalog[]`: servicios macro cotizables con rangos (ej. Troquelado 32-260 mm).

### 3.8 Bloque catalog_assets

Assets globales del catalogo:

```json
{
  "catalog_assets": {
    "logo": { "asset_role": "brand_logo" },
    "cover_image": { "asset_role": "catalog_cover" },
    "pdf_background": { "asset_role": "pdf_background" },
    "placeholder_image": { "asset_role": "placeholder" }
  }
}
```

`logo`, `cover_image` y `placeholder_image` son required. `pdf_background` es opcional.

### 3.9 Bloque catalog_generation

Define que PDFs genera el sistema:

```json
{
  "catalog_generation": {
    "description": "El sistema genera PDFs desde el JSON para los clientes.",
    "output_types": {
      "full_catalog_pdf": {
        "enabled": true,
        "output_storage_key": "generated/catalog/catalogo-completo.pdf",
        "source": "generated_from_json_data"
      },
      "machinery_technical_sheet_pdf": {
        "enabled": true,
        "output_storage_key_pattern": "generated/catalog/machinery/{sku}/ficha-tecnica.pdf",
        "source": "generated_from_json_data"
      },
      "service_sheet_pdf": {
        "enabled": true,
        "output_storage_key_pattern": "generated/catalog/services/{service_code}/ficha-servicio.pdf",
        "source": "generated_from_json_data"
      },
      "simple_product_card_pdf": {
        "enabled": true,
        "output_storage_key_pattern": "generated/catalog/products/{sku}/tarjeta.pdf",
        "source": "generated_from_json_data"
      },
      "category_catalog_pdf": {
        "enabled": true,
        "output_storage_key_pattern": "generated/catalog/categories/{category_code}/catalogo-categoria.pdf",
        "source": "generated_from_json_data"
      }
    }
  }
}
```

NO existe `reference_pdf_policy` ni `not_modeled_as_product_documents` en este modelo. Esos conceptos eran de la version 1 y se eliminaron: no hay PDFs de referencia en el sistema.

---

## 4. Politica de generacion PDF

### 4.1 Outputs que el sistema produce

5 tipos de PDF. Cada uno con su template, ruta de storage y fuente:

| output_type | template_key | ruta pattern | uso |
|-------------|--------------|--------------|-----|
| full_catalog_pdf | catalog_full | generated/catalog/catalogo-completo.pdf | catalogo completo descargable |
| machinery_technical_sheet_pdf | machinery_technical_sheet | generated/catalog/machinery/{sku}/ficha-tecnica.pdf | ficha tecnica por maquinaria |
| service_sheet_pdf | service_sheet | generated/catalog/services/{service_code}/ficha-servicio.pdf | ficha por servicio macro |
| simple_product_card_pdf | simple_catalog_card | generated/catalog/products/{sku}/tarjeta.pdf | tarjeta de producto simple |
| category_catalog_pdf | category_catalog | generated/catalog/categories/{category_code}/catalogo-categoria.pdf | catalogo por categoria |

### 4.2 Datos que alimentan cada PDF

Para todos los outputs la fuente es `generated_from_json_data`. Datos que el renderer consume:

- `item.name`, `item.sku`, `item.pricing`, `item.status`
- `item.specifications`
- `item.assets.main_image` (con fallback chain)
- `item.machinery_profile.features[]` y `machinery_profile.specification_groups[]` (solo machinery)
- `item.machinery_profile.weight_kg`, `length_mm`, `width_mm`, `height_mm` (solo machinery)
- `item.spare_part_profile.compatibilities[]` (solo spare_part)
- `service_profile.capabilities[]` (solo service_macro)
- `family.display_name`, `family.variant_skus[]`
- `category_dictionary[category_code].label`
- `catalog_assets.logo`, `catalog_assets.cover_image`, `catalog_assets.pdf_background`, `catalog_assets.placeholder_image`

### 4.3 Lo que el sistema NO hace

- NO almacena PDFs del desarrollador.
- NO referencia PDFs subidos.
- NO expone endpoints para upload de PDFs.
- NO genera PDFs a partir de PDFs. Siempre desde el JSON.

---

## 5. Gestion de imagenes y assets

### 5.1 Assets globales del catalogo

En `catalog_assets`:

- `logo`: logo institucional, `asset_role: brand_logo`.
- `cover_image`: portada del PDF generado, `asset_role: catalog_cover`.
- `pdf_background`: fondo visual de paginas PDF, `asset_role: pdf_background` (opcional).
- `placeholder_image`: imagen por defecto cuando un item no tiene foto, `asset_role: placeholder`.

### 5.2 Assets por item

Cada item en `items[]` puede tener:

- `assets.main_image`: objeto asset o `null`. Si es null, se aplica el fallback chain.
- `assets.gallery`: array de objetos asset.
- `assets.suggested_storage_folder`: ruta sugerida para subir.
- `assets.pdf_image_fallback_order`: array con el orden de fallback. Debe coincidir con `asset_strategy.pdf_main_image_resolution_order`.

### 5.3 Assets por familia

Cada familia en `families[]` puede tener:

- `assets.main_image`: imagen representativa de la familia.
- `assets.gallery`: array de imagenes secundarias.

### 5.4 Assets por categoria

Cada entrada en `category_dictionary` puede tener:

- `assets.banner`: imagen de banner para la categoria.
- `assets.background`: fondo opcional.

### 5.5 Enum asset_role

Todos los assets deben declarar `asset_role`. Valores permitidos:

- `main_image`: imagen principal de un item o familia.
- `gallery_image`: imagen secundaria de un item o familia.
- `catalog_cover`: portada del catalogo PDF.
- `category_banner`: banner de categoria.
- `brand_logo`: logo institucional.
- `pdf_background`: fondo de paginas PDF.
- `placeholder`: imagen por defecto.
- `decorative`: imagen decorativa sin rol semantico.

### 5.6 Enum asset_type

Valores permitidos:

- `image`
- `logo`
- `banner`
- `background`
- `placeholder`
- `other`

### 5.7 Enum source_status

Estado del asset:

- `pending_upload`: el archivo aun no se subio.
- `uploaded`: archivo disponible localmente.
- `external_url`: asset servido desde URL externa.
- `missing`: archivo no disponible. Debe usarse fallback.

### 5.8 Shape de un asset

```json
{
  "asset_id": "item-2208I-main-image",
  "asset_type": "image",
  "asset_role": "main_image",
  "url": null,
  "storage_key": "catalog/products/2208I/images/main.webp",
  "file_name": null,
  "alt_text": "Imagen principal de CEPILLADORA DOBLE SIDE WOOD PLANER",
  "caption": "CEPILLADORA DOBLE SIDE WOOD PLANER",
  "sort_order": 1,
  "is_primary": true,
  "source_status": "pending_upload",
  "metadata": {}
}
```

---

## 6. Regla de fallback de imagen principal

Orden de resolucion (de mayor a menor prioridad):

1. `item.assets.main_image` (si no es null y `source_status != missing`)
2. `family.assets.main_image` (mismas condiciones)
3. `category_dictionary[category_code].assets.banner`
4. `catalog_assets.placeholder_image`

Reglas de aplicacion:

- Si el asset esta en `pending_upload`, se considera como ausente y se salta al siguiente.
- Si el asset esta en `missing`, idem.
- Si `url` es null pero `storage_key` existe, el renderer resuelve el `storage_key`.
- Si todos los niveles fallan, se usa `catalog_assets.placeholder_image`.

---

## 7. Modelo PostgreSQL - DDL completo

### 7.1 Schema

```sql
CREATE SCHEMA IF NOT EXISTS catalog;
```

### 7.2 Tabla catalogs

```sql
CREATE TABLE catalog.catalogs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(80) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    default_currency CHAR(3) NOT NULL DEFAULT 'CLP',
    source_file VARCHAR(255) NOT NULL,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    schema_version VARCHAR(20) NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_catalogs_slug ON catalog.catalogs(slug);
```

### 7.3 Tabla categories

```sql
CREATE TABLE catalog.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    catalog_id UUID NOT NULL REFERENCES catalog.catalogs(id) ON DELETE CASCADE,
    category_code VARCHAR(80) NOT NULL,
    label VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL,
    category_group VARCHAR(80) NOT NULL,
    entity_class_default VARCHAR(80) NOT NULL,
    products_count INTEGER NOT NULL DEFAULT 0,
    assets JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_category_code UNIQUE (catalog_id, category_code)
);

CREATE INDEX idx_categories_group ON catalog.categories(category_group);
CREATE INDEX idx_categories_slug ON catalog.categories(slug);
```

### 7.4 Tabla product_families

```sql
CREATE TABLE catalog.product_families (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    catalog_id UUID NOT NULL REFERENCES catalog.catalogs(id) ON DELETE CASCADE,
    family_key VARCHAR(255) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    category_code VARCHAR(80) NOT NULL REFERENCES catalog.categories(category_code),
    category_label VARCHAR(255) NOT NULL,
    variant_count INTEGER NOT NULL DEFAULT 0,
    variant_skus TEXT[] NOT NULL DEFAULT '{}',
    price_min NUMERIC(14, 2),
    price_max NUMERIC(14, 2),
    assets JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_family_key UNIQUE (catalog_id, family_key)
);

CREATE INDEX idx_families_category ON catalog.product_families(category_code);
```

### 7.5 Tabla catalog_items

```sql
CREATE TABLE catalog.catalog_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    catalog_id UUID NOT NULL REFERENCES catalog.catalogs(id) ON DELETE CASCADE,
    family_id UUID REFERENCES catalog.product_families(id) ON DELETE SET NULL,

    sku VARCHAR(80) NOT NULL,
    name VARCHAR(255) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    slug VARCHAR(260) NOT NULL,

    item_type VARCHAR(40) NOT NULL,
    item_subtype_code VARCHAR(80),
    technical_profile_level VARCHAR(20) NOT NULL DEFAULT 'basic',

    entity_class VARCHAR(80) NOT NULL,
    category_code VARCHAR(80) NOT NULL REFERENCES catalog.categories(category_code),

    sale_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
    currency CHAR(3) NOT NULL DEFAULT 'CLP',

    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_price_zero BOOLEAN NOT NULL DEFAULT FALSE,
    is_catalog_visible BOOLEAN NOT NULL DEFAULT TRUE,

    specifications JSONB NOT NULL DEFAULT '{}'::jsonb,
    search_index JSONB NOT NULL DEFAULT '{}'::jsonb,

    source_file VARCHAR(255),
    source_sheet_name VARCHAR(120),
    source_row_number INTEGER,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_catalog_item_sku UNIQUE (catalog_id, sku),
    CONSTRAINT chk_item_type CHECK (
        item_type IN ('simple_product', 'spare_part', 'machinery', 'service')
    ),
    CONSTRAINT chk_profile_level CHECK (
        technical_profile_level IN ('basic', 'standard', 'extended')
    )
);

CREATE INDEX idx_items_family ON catalog.catalog_items(family_id);
CREATE INDEX idx_items_category ON catalog.catalog_items(category_code);
CREATE INDEX idx_items_type ON catalog.catalog_items(item_type);
CREATE INDEX idx_items_subtype ON catalog.catalog_items(item_subtype_code);
CREATE INDEX idx_items_active ON catalog.catalog_items(is_active);
```

### 7.6 Tabla machinery_profiles

```sql
CREATE TABLE catalog.machinery_profiles (
    item_id UUID PRIMARY KEY REFERENCES catalog.catalog_items(id) ON DELETE CASCADE,

    model VARCHAR(120),
    brand VARCHAR(120),
    manufacturer VARCHAR(120),

    short_description TEXT,
    long_description TEXT,

    use_case TEXT,
    recommended_for TEXT,

    weight_kg NUMERIC(10, 3),
    length_mm NUMERIC(10, 2),
    width_mm NUMERIC(10, 2),
    height_mm NUMERIC(10, 2),

    technical_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
    features JSONB NOT NULL DEFAULT '[]'::jsonb,
    specification_groups JSONB NOT NULL DEFAULT '[]'::jsonb,
    raw_specification_lines JSONB NOT NULL DEFAULT '[]'::jsonb,
    price_observations JSONB NOT NULL DEFAULT '[]'::jsonb,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_machinery_brand ON catalog.machinery_profiles(brand);
CREATE INDEX idx_machinery_model ON catalog.machinery_profiles(model);
```

### 7.7 Tabla spare_part_profiles

```sql
CREATE TABLE catalog.spare_part_profiles (
    item_id UUID PRIMARY KEY REFERENCES catalog.catalog_items(id) ON DELETE CASCADE,

    part_type VARCHAR(80),
    brand VARCHAR(120),
    manufacturer_reference VARCHAR(120),
    material VARCHAR(120),

    notes TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_spare_part_brand ON catalog.spare_part_profiles(brand);
CREATE INDEX idx_spare_part_type ON catalog.spare_part_profiles(part_type);
```

### 7.8 Tabla item_compatibilities

Relacion N:N entre repuestos y las maquinas o familias con las que son compatibles:

```sql
CREATE TABLE catalog.item_compatibilities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    spare_part_item_id UUID NOT NULL REFERENCES catalog.catalog_items(id) ON DELETE CASCADE,

    target_kind VARCHAR(20) NOT NULL,
    target_item_id UUID REFERENCES catalog.catalog_items(id) ON DELETE CASCADE,
    target_family_id UUID REFERENCES catalog.product_families(id) ON DELETE CASCADE,

    notes TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_target_kind CHECK (
        target_kind IN ('item', 'family')
    ),
    CONSTRAINT chk_target_set CHECK (
        (target_kind = 'item' AND target_item_id IS NOT NULL)
        OR (target_kind = 'family' AND target_family_id IS NOT NULL)
    )
);

CREATE INDEX idx_compat_spare_part ON catalog.item_compatibilities(spare_part_item_id);
CREATE INDEX idx_compat_target_item ON catalog.item_compatibilities(target_item_id);
CREATE INDEX idx_compat_target_family ON catalog.item_compatibilities(target_family_id);
```

### 7.9 Tabla service_profiles

Perfil de servicio cuando el item es de tipo `service`:

```sql
CREATE TABLE catalog.service_profiles (
    item_id UUID PRIMARY KEY REFERENCES catalog.catalog_items(id) ON DELETE CASCADE,

    service_code VARCHAR(80) NOT NULL,
    service_name VARCHAR(255) NOT NULL,
    service_group VARCHAR(80),
    pricing_mode VARCHAR(20) NOT NULL,
    requires_diagnosis BOOLEAN NOT NULL DEFAULT FALSE,
    is_schedulable BOOLEAN NOT NULL DEFAULT TRUE,

    capabilities JSONB NOT NULL DEFAULT '[]'::jsonb,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_service_code UNIQUE (service_code),
    CONSTRAINT chk_pricing_mode CHECK (
        pricing_mode IN ('fixed', 'range', 'quoted', 'by_measure', 'by_hour')
    )
);

CREATE INDEX idx_service_pricing_mode ON catalog.service_profiles(pricing_mode);
```

### 7.10 Tabla service_catalog

Servicios macro, separados de items:

```sql
CREATE TABLE catalog.service_catalog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    service_code VARCHAR(80) NOT NULL UNIQUE,
    service_name VARCHAR(255) NOT NULL,
    item_subtype_code VARCHAR(80),
    service_group VARCHAR(80),
    pricing_mode VARCHAR(20) NOT NULL,
    requires_diagnosis BOOLEAN NOT NULL DEFAULT FALSE,
    is_schedulable BOOLEAN NOT NULL DEFAULT TRUE,

    capabilities JSONB NOT NULL DEFAULT '[]'::jsonb,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_service_pricing_mode CHECK (
        pricing_mode IN ('fixed', 'range', 'quoted', 'by_measure', 'by_hour')
    )
);

CREATE INDEX idx_service_catalog_group ON catalog.service_catalog(service_group);
```

### 7.11 Tabla catalog_assets

```sql
CREATE TABLE catalog.catalog_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    catalog_id UUID NOT NULL REFERENCES catalog.catalogs(id) ON DELETE CASCADE,

    asset_type VARCHAR(40) NOT NULL,
    asset_role VARCHAR(60) NOT NULL,

    url TEXT,
    storage_key TEXT,
    file_name VARCHAR(255),

    alt_text VARCHAR(255),
    caption TEXT,

    sort_order INTEGER NOT NULL DEFAULT 0,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    source_status VARCHAR(40) NOT NULL DEFAULT 'pending_upload',

    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_asset_type CHECK (
        asset_type IN ('image', 'logo', 'banner', 'background', 'placeholder', 'other')
    ),
    CONSTRAINT chk_asset_role CHECK (
        asset_role IN ('main_image', 'gallery_image', 'catalog_cover', 'category_banner',
                       'brand_logo', 'pdf_background', 'placeholder', 'decorative')
    ),
    CONSTRAINT chk_source_status CHECK (
        source_status IN ('pending_upload', 'uploaded', 'external_url', 'missing')
    )
);

CREATE INDEX idx_assets_catalog ON catalog.catalog_assets(catalog_id);
CREATE INDEX idx_assets_role ON catalog.catalog_assets(asset_role);
```

### 7.12 Tabla item_assets

```sql
CREATE TABLE catalog.item_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    item_id UUID REFERENCES catalog.catalog_items(id) ON DELETE CASCADE,
    family_id UUID REFERENCES catalog.product_families(id) ON DELETE CASCADE,
    category_code VARCHAR(80) REFERENCES catalog.categories(category_code),

    asset_type VARCHAR(40) NOT NULL,
    asset_role VARCHAR(60) NOT NULL,

    url TEXT,
    storage_key TEXT,
    file_name VARCHAR(255),

    alt_text VARCHAR(255),
    caption TEXT,

    sort_order INTEGER NOT NULL DEFAULT 0,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    source_status VARCHAR(40) NOT NULL DEFAULT 'pending_upload',

    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_item_asset_owner CHECK (
        item_id IS NOT NULL OR family_id IS NOT NULL OR category_code IS NOT NULL
    )
);

CREATE INDEX idx_item_assets_item ON catalog.item_assets(item_id);
CREATE INDEX idx_item_assets_family ON catalog.item_assets(family_id);
```

### 7.13 Tabla generated_outputs

```sql
CREATE TABLE catalog.generated_outputs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    catalog_id UUID NOT NULL REFERENCES catalog.catalogs(id) ON DELETE CASCADE,
    item_id UUID REFERENCES catalog.catalog_items(id) ON DELETE CASCADE,
    service_code VARCHAR(80),

    output_type VARCHAR(60) NOT NULL,
    template_key VARCHAR(120) NOT NULL,

    output_storage_key TEXT NOT NULL,
    output_url TEXT,

    source_hash_sha256 VARCHAR(64),
    status VARCHAR(40) NOT NULL DEFAULT 'not_generated',

    generated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

    CONSTRAINT chk_output_type CHECK (
        output_type IN (
            'full_catalog_pdf',
            'category_catalog_pdf',
            'machinery_technical_sheet_pdf',
            'service_sheet_pdf',
            'simple_product_card_pdf'
        )
    ),
    CONSTRAINT chk_status CHECK (
        status IN ('not_generated', 'generated', 'failed')
    )
);

CREATE INDEX idx_outputs_catalog ON catalog.generated_outputs(catalog_id);
CREATE INDEX idx_outputs_item ON catalog.generated_outputs(item_id);
CREATE INDEX idx_outputs_status ON catalog.generated_outputs(status);
```

### 7.14 Tabla subtype_dictionary

Taxonomia controlada para `item_subtype_code` y `entity_class`:

```sql
CREATE TABLE catalog.subtype_dictionary (
    code VARCHAR(80) PRIMARY KEY,
    label VARCHAR(255) NOT NULL,
    description TEXT,
    item_type VARCHAR(40) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_subtype_item_type CHECK (
        item_type IN ('simple_product', 'spare_part', 'machinery', 'service')
    )
);

CREATE INDEX idx_subtype_item_type ON catalog.subtype_dictionary(item_type);
```

---

## 8. Campos principales en catalog_items

Mapeo JSON -> SQL:

| Campo JSON | Campo SQL | Notas |
|------------|-----------|-------|
| id | id | UUID, generado |
| sku | sku | UNIQUE por catalog |
| name | name | nombre interno |
| display_name | display_name | nombre publico |
| slug | slug | URL-safe |
| family_key, family_id | family_id (FK) | FK a product_families |
| item_type | item_type | CHECK con 4 valores |
| item_subtype_code | item_subtype_code | FK logica a subtype_dictionary |
| technical_profile_level | technical_profile_level | basic / standard / extended |
| entity_class | entity_class | string libre (deprecado, ver seccion 15) |
| category_code | category_code | FK a categories |
| pricing.sale_amount | sale_amount | NUMERIC(14,2) |
| pricing.currency | currency | CHAR(3), default CLP |
| status.is_active | is_active | BOOLEAN |
| status.is_price_zero | is_price_zero | BOOLEAN |
| status.is_catalog_visible | is_catalog_visible | BOOLEAN |
| specifications | specifications | JSONB libre |
| search | search_index | JSONB con tokens y semantic context |
| source.catalog_file | source_file | nombre del Excel origen |
| source.sheet_name | source_sheet_name | nombre de la hoja |
| source.row_number | source_row_number | fila del Excel (opcional) |

---

## 9. Maquinaria

### 9.1 Identificacion

`item_type == "machinery"` requiere `machinery_profile` no nulo.

### 9.2 Datos que alimentan la ficha tecnica PDF

- `sku`, `name`, `model`
- `pricing` (con `price_observations[]` si hay diferencia entre Excel y PDF)
- `assets.main_image` (con fallback)
- `machinery_profile.features[]`: bullets de caracteristicas comerciales
- `machinery_profile.specification_groups[]`: grupos de specs tecnicas
- `machinery_profile.weight_kg`, `length_mm`, `width_mm`, `height_mm`: dimensiones fisicas
- `machinery_profile.brand`, `manufacturer`

### 9.3 specification_groups shape

```json
[
  {
    "group_code": "motor",
    "label": "Motor",
    "description": null,
    "values": [
      {
        "label": "Especificacion",
        "value_text": "2.5 HP (1800 W)",
        "value_number": null,
        "unit": null,
        "raw": "2.5 HP (1800 W)"
      }
    ]
  }
]
```

`value_text` para texto libre, `value_number` para magnitudes, `unit` para la unidad, `raw` para el valor original sin normalizar.

### 9.4 technical_profile_level

| nivel | uso |
|-------|-----|
| basic | sin ficha tecnica extendida (placeholder) |
| standard | ficha con specs basicas |
| extended | ficha completa con features, specs agrupadas, dimensiones |

`machinery_profile.specification_groups` debe estar NO VACIO si `technical_profile_level == "extended"`.

---

## 10. Servicios

### 10.1 Dos naturalezas distintas

| Naturaleza | Ubicacion | pricing_mode | tiene precio? |
|------------|-----------|--------------|----------------|
| Servicio macro | service_catalog[] | quoted (siempre) | no |
| Servicio item | items[] con item_type: service | fixed (tipicamente) | si |

### 10.2 Servicios macro (service_catalog)

Los 10 servicios industriales que la empresa ofrece:

| service_code | service_name | pricing_mode | rango principal |
|--------------|--------------|--------------|-----------------|
| SERV-TROQUELADO | Troquelado | quoted | 32 a 260 mm |
| SERV-SOLDADURA-MIG | Soldadura Mig | quoted | 32 a 320 mm |
| SERV-SOLDADURA-FUSION | Soldadura Fusion | quoted | 5 a 210 mm |
| SERV-TENSIONADO-CNC | Tensionado Cnc | quoted | sierras huinchas |
| SERV-RECALQUE | Recalque | quoted | 70 a 320 mm |
| SERV-ESTELITADO | Estelitado | quoted | 30 a 320 mm |
| SERV-RECTIFICADO-LATERAL | Rectificado Lateral | quoted | servicio tecnico |
| SERV-RECTIFICADO-FRONTAL | Rectificado Frontal | quoted | servicio tecnico |
| SERV-MECANIZADOS | Mecanizados | quoted | sierras circulares |
| SERV-CAPACITACIONES | Capacitaciones | quoted | servicio formativo |

`requires_diagnosis == true` para todos los macro servicios (excepto `SERV-CAPACITACIONES`).
`is_schedulable == true` para todos.

### 10.3 Servicios item (items[])

Son SKUs concretos con precio fijo:

- `service_code` igual al SKU.
- `pricing_mode: fixed`.
- `pricing.sale_amount` con el valor numerico.
- `capabilities: []` vacio por ahora (no aplican rangos a un SKU fijo).

### 10.4 pricing_mode enum

- `fixed`: precio fijo visible.
- `range`: precio en un rango (min/max).
- `quoted`: a cotizar (no tiene precio visible).
- `by_measure`: precio por medida (ej. por mm o por pulgada).
- `by_hour`: precio por hora.

---

## 11. API REST

### 11.1 Endpoints de lectura

```
GET    /api/catalogs/{slug}/schema
GET    /api/catalogs/{slug}/catalog.json
GET    /api/catalogs/{slug}/items
GET    /api/catalogs/{slug}/items/{sku}
GET    /api/catalogs/{slug}/families
GET    /api/catalogs/{slug}/families/{family_key}
GET    /api/catalogs/{slug}/categories
GET    /api/catalogs/{slug}/categories/{category_code}
GET    /api/catalogs/{slug}/machinery
GET    /api/catalogs/{slug}/services
GET    /api/catalogs/{slug}/dictionary
```

### 11.2 Endpoints de generacion PDF

```
POST   /api/catalogs/{slug}/generate/full-catalog-pdf
POST   /api/catalogs/{slug}/generate/category-catalog-pdf
POST   /api/catalogs/{slug}/generate/machinery-technical-sheet-pdf
POST   /api/catalogs/{slug}/generate/service-sheet-pdf
POST   /api/catalogs/{slug}/generate/simple-product-card-pdf
```

El endpoint recibe el tipo de output en el path. Esto evita la ambiguedad de la version 1 donde `/generate/technical-sheet-pdf` no distinguia entre machinery y otros.

### 11.3 Headers de cache

Todas las respuestas GET incluyen:

- `ETag`: hash del contenido (sha256).
- `Cache-Control: public, max-age=300` (5 minutos).
- `Last-Modified`: timestamp del `catalog.generated_at`.
- `X-Schema-Version`: version del schema.

### 11.4 Respuestas de error

```json
{
  "error": "schema_mismatch",
  "message": "Catalog data does not match schema",
  "schema_version": "1.0.0",
  "details": []
}
```

Codigos HTTP:

- 200 OK: respuesta exitosa.
- 304 Not Modified: ETag match.
- 400 Bad Request: parametros invalidos.
- 404 Not Found: SKU o familia no existe.
- 409 Conflict: schema desactualizado en cliente (forzar refresh).
- 500 Internal Server Error: error del servidor.

---

## 12. Patron de consumo schema-first

### 12.1 Principio

El cliente siempre pide primero el schema, lo cachea localmente, y valida contra el antes de procesar cualquier respuesta de datos.

### 12.2 Flujo

```
1. Cliente pide /api/catalogs/{slug}/schema
2. Servidor devuelve el JSON Schema con headers Cache-Control
3. Cliente guarda schema en localStorage con TTL
4. Cliente pide /api/catalogs/{slug}/catalog.json
5. Servidor devuelve el JSON completo
6. Cliente valida el JSON contra el schema cacheado
7. Si valida, usa los datos
8. Si NO valida, intenta refresh del schema y re-valida
9. Si sigue sin validar, error y aviso al usuario
```

### 12.3 Implementacion cliente (TypeScript)

```typescript
const SCHEMA_KEY = (slug: string) => `catalog:schema:${slug}`;
const CATALOG_KEY = (slug: string) => `catalog:data:${slug}`;
const SCHEMA_TTL_MS = 24 * 60 * 60 * 1000; // 24 horas

async function getSchema(slug: string): Promise<JSONSchema> {
  const cached = localStorage.getItem(SCHEMA_KEY(slug));
  const cachedAt = localStorage.getItem(`${SCHEMA_KEY(slug)}:ts`);
  const age = cachedAt ? Date.now() - Number(cachedAt) : Infinity;

  if (cached && age < SCHEMA_TTL_MS) {
    return JSON.parse(cached);
  }

  const res = await fetch(`/api/catalogs/${slug}/schema.json`);
  const schema = await res.json();

  localStorage.setItem(SCHEMA_KEY(slug), JSON.stringify(schema));
  localStorage.setItem(`${SCHEMA_KEY(slug)}:ts`, String(Date.now()));

  return schema;
}

async function getCatalog(slug: string): Promise<Catalog> {
  const schema = await getSchema(slug);
  const res = await fetch(`/api/catalogs/${slug}/catalog.json`);
  const data = await res.json();

  if (!validateAgainstSchema(schema, data)) {
    throw new Error('Schema mismatch - refresh and retry');
  }

  localStorage.setItem(CATALOG_KEY(slug), JSON.stringify(data));
  return data;
}
```

### 12.4 Versionado

Si el schema cambia de version, los caches locales deben invalidarse:

- El servidor envia header `X-Schema-Version`.
- El cliente compara con la version cacheada.
- Si difieren, refresca schema y datos.

---

## 13. Frontend - componentes

### 13.1 Componentes por capa

```
CatalogPage
  Header
  CategoryGroupSidebar
  SearchInput
  ProductGrid (o FamilyGrid)
    SimpleProductCard
    SparePartCard
    MachineryCard
    ServiceItemCard
  PdfDownloadButton

ProductDetailPage
  AssetImage (con fallback chain)
  SpecsTable (maquinaria)
  CapabilitiesList (servicios)
  CompatibilitiesList (repuestos)
  PriceBadge (con estado "A cotizar")
  VariantPicker (cuando hay family)

ServiceMacroPage
  ServiceMacroCard
  CapabilitiesList
  QuoteRequestForm
```

### 13.2 Componentes compartidos

- `AssetImage`: resuelve imagen con fallback chain.
- `PriceBadge`: muestra precio o "A cotizar" segun `is_price_available`.
- `ItemTypeChip`: badge visual del tipo de item (color por tipo).
- `CategoryGroupChip`: badge del grupo de categoria.
- `SpecsTable`: renderiza `specification_groups` como tabla.
- `CapabilitiesList`: renderiza `service_profile.capabilities` con rangos.
- `CompatibilitiesList`: lista de maquinas/familias compatibles (repuestos).

---

## 14. Arquitectura limpia y casos de uso

### 14.1 Capas backend

```
Domain
Application
Infrastructure
WebApi
Contracts
```

### 14.2 Casos de uso principales

```
ImportCatalogFromSpreadsheetUseCase
ExtractDataFromReferencePdfUseCase    (procesa PDFs del desarrollador UNA vez)
BuildCatalogJsonUseCase               (consolida Excel + PDFs en JSON)
ValidateCatalogJsonUseCase            (contra schema)
ResolveItemAssetUseCase               (fallback chain)
GetItemBySkuUseCase
ListItemsByCategoryUseCase
ListItemsByFamilyUseCase
ListCompatibleSparePartsUseCase
GetServiceCapabilitiesUseCase
SearchCatalogUseCase
GenerateFullCatalogPdfUseCase
GenerateMachineryTechnicalSheetPdfUseCase
GenerateServiceSheetPdfUseCase
GenerateSimpleProductCardPdfUseCase
GenerateCategoryCatalogPdfUseCase
```

### 14.3 Casos de uso NO incluidos

- NO existe `UploadReferencePdfUseCase`. Los PDFs del desarrollador se procesan UNA vez y luego se descartan.
- NO existe `AttachPdfToItemUseCase`. No hay PDFs asociados al item.

---

## 15. Proceso de extraccion de datos y validacion de cobertura

### 15.1 Principio

El JSON se construye a partir de DOS fuentes:

1. `CODIGOS_TH.xlsx`: precios base, SKUs, categorias, nombres.
2. PDFs de referencia del desarrollador: modelos, specs tecnicas, imagenes, dimensiones.

Ninguna fuente es autoritativa por si sola. El JSON se construye consolidando ambas.

### 15.2 Pipeline de extraccion

```
Excel (CODIGOS_TH.xlsx) ----+
                           +---> ExtractDataFromReferencePdfUseCase ---> ValidateCatalogJsonUseCase ---> JSON consolidado
PDFs de referencia --------+
```

### 15.3 Reglas de consolidacion

- Match por SKU entre Excel y PDFs.
- Si el SKU esta en Excel pero no en PDFs: el item se crea con datos del Excel, `technical_profile_level: basic`, `specification_groups: []`.
- Si el SKU esta en PDFs pero no en Excel: ALERTA. El SKU deberia estar en Excel. Se omite hasta resolver.
- Si el SKU esta en ambos: se complementan campos. El Excel manda en: precio, categoria, nombre. El PDF manda en: model, specs, dimensiones, imagenes.
- NO se duplica informacion. Si el Excel tiene `brand: "SERRA"` y el PDF tambien, queda una sola vez.

### 15.4 Scripts de validacion de cobertura

Tres scripts que garantizan que el JSON refleja todo. Se ejecutan en CI y de manera manual antes de cada release.

#### validate-coverage-from-excel.mjs

Lee `CODIGOS_TH.xlsx` y `catalogo_productos_robusto_completo_corregido.json`. Reporta:

- SKUs del Excel que faltan en el JSON.
- SKUs del JSON que no estan en el Excel.
- Diferencias de precio para SKUs en ambos.

#### validate-coverage-from-pdfs.mjs

Lee los PDFs de referencia del desarrollador (directorio `docs/_developer_pdfs/` o el que se indique) y el JSON. Extrae texto de los PDFs, identifica SKUs y campos, reporta:

- SKUs en PDFs que faltan en el JSON.
- Campos tecnicos en PDFs que faltan en el item correspondiente del JSON.

#### sync-from-sources.mjs

Toma Excel + PDFs y produce un JSON completo y validado. Internamente:

1. Parsea el Excel.
2. Para cada PDF, extrae texto y datos tecnicos.
3. Matchea por SKU.
4. Aplica las reglas de consolidacion (15.3).
5. Valida contra el schema.
6. Escribe el JSON final.

### 15.5 Outputs esperados

```
$ node scripts/validate-coverage-from-excel.mjs
SKUs en Excel: 687
SKUs en JSON: 687
SKUs faltantes en JSON: 0
SKUs faltantes en Excel: 0
Diferencias de precio: 0
OK: cobertura completa.

$ node scripts/validate-coverage-from-pdfs.mjs --pdf-dir=./docs/_developer_pdfs/
PDFs procesados: 14
SKUs en PDFs: 14
SKUs en JSON: 14
Campos tecnicos faltantes: 0
OK: cobertura completa.
```

Si hay faltantes, el script imprime la lista exacta y el proceso se considera FALLIDO hasta resolver.

---

## 16. Sincronizacion entre .md, schema y JSON

### 16.1 Archivos

- `especificacion_catalogo_industrial_primera_version_corregida.md`: fuente documental.
- `catalogo_productos_schema_validacion_corregido.json`: contrato tecnico (JSON Schema 2020-12).
- `catalogo_productos_robusto_completo_corregido.json`: datos del catalogo.

### 16.2 Reglas de coherencia

- Toda propiedad en el JSON debe estar definida en el schema.
- Toda regla de validacion en el schema debe estar documentada en el .md.
- Cuando se cambia el schema, se actualiza el .md en la misma operacion.
- Cuando se cambia el .md, se regenera el JSON y se valida contra el schema.

### 16.3 Versionado

Los tres archivos comparten `schema_version`. Cualquier cambio incompatible de shape bumpea la version minor.

### 16.4 Encoding

Todos los archivos en UTF-8 sin BOM. Markdown con numeracion simple (1., 2., 3.), sin caracteres fuera del ASCII extendido seguro, sin emojis.

---

## Anexo A: Glosario

- **SKU**: Stock Keeping Unit, codigo unico del item.
- **Variante**: SKU dentro de una familia que comparte nombre normalizado pero distinto prefijo.
- **Familia**: agrupacion logica de variantes por nombre normalizado.
- **Servicio macro**: servicio cotizable con rangos (Troquelado, Soldadura, etc.).
- **Servicio item**: SKU de servicio con precio fijo.
- **Ficha tecnica**: PDF generado para maquinaria con specs extendidas.
- **Tarjeta de producto**: PDF generado para producto simple.

## Anexo B: Cambios respecto a la version 1

- Eliminado: `reference_documents[]`.
- Eliminado: `machinery_profile.technical_documents[]`.
- Eliminado: `catalog.reference_pdf_policy`.
- Eliminado: `catalog.source_files[]` (lista de PDFs).
- Eliminado: concepto de PDFs adjuntos al sistema.
- Agregado: `subtype_dictionary` para taxonomia controlada.
- Agregado: `service_catalog` separado de `items[]`.
- Agregado: `item_compatibilities` con DDL.
- Agregado: `product_families` con DDL.
- Agregado: `machinery_profiles.weight_kg`, `length_mm`, `width_mm`, `height_mm` tipados.
- Agregado: `asset_strategy` en el top-level.
- Agregado: patron de consumo schema-first con localStorage.
- Agregado: scripts de validacion de cobertura Excel + PDFs.
- Refactorizado: API con endpoints explicitos por output_type.
- Refactorizado: seccion 3 incluye `asset_strategy` y `service_catalog`.
- Refactorizado: seccion 10 desdobla servicios macro vs servicios item.
- Refactorizado: seccion 7 incluye 14 tablas (antes 3) con DDL completo.

---

**Encoding:** UTF-8 sin BOM.
**Caracteres permitidos:** ASCII + acentos + tabla Latin-1. Sin emojis, sin caracteres de control, sin glifos fuera del rango seguro.
**Version de la especificacion:** 2.0.0
