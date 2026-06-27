// scripts/inject-category-assets.mjs
// Inject category descriptions + banner/background URLs into the main catalog JSON
// WITHOUT modifying the schema. Also populates catalog_assets cover images.
//
// Reads descriptions from a hardcoded map (sourced from docs/INVENTARIO_CATEGORIAS.md).
// Reads SVG paths written by scripts/generate-category-svgs.mjs.
//
// Run: node scripts/inject-category-assets.mjs

import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import Ajv from 'ajv/dist/2020.js';

const ROOT = process.cwd();
const CATALOG_PATH = join(ROOT, 'docs', 'catalogo_productos_robusto_completo_corregido.json');
const SCHEMA_PATH = join(ROOT, 'docs', 'catalogo_productos_schema_validacion_corregido.json');
const BACKUP_PATH = join(ROOT, 'docs', 'catalogo_productos_robusto_completo_corregido.json.bak');

// Hardcoded map: code -> { slug, description }
// Slug is the JSON category_dictionary[*].slug field (authoritative).
// Descriptions are copied verbatim from docs/INVENTARIO_CATEGORIAS.md.
const CATEGORY_DATA = {
  'RECALQUE': {
    description:
      'Servicios de mantenimiento y reparacion de sierras de cinta. El recalque es la operacion de deformar los dientes de la sierra (en frio o calor) para abrir (set) o cerrar (spring) el corte. Servicios complementarios: vaciado (limpieza), igualado (nivelado de altura de dientes), rectificado frontal (de caras de diente). Se cobra por ancho de sierra y tipo de servicio.',
  },
  'TENSIONADO': {
    description:
      'Servicio de tensionado de sierras de cinta en distintos anchos (3" a 12"). Consiste en aplicar la tension correcta a la hoja para evitar que se trabe, se rompa o corte fuera de linea. Operacion critica antes de cada turno de trabajo.',
  },
  'SOLDADURA': {
    description:
      'Servicio de soldadura de sierras huincha por el metodo de fusion (soldadura autogena oxiacetilenica / TIG). Une los extremos de la cinta para formar un loop continuo. Servicio por ancho de cinta, con preparacion de biseles y esmerilado post-soldadura para garantizar la resistencia de la union.',
  },
  'ACERO.UDD': {
    description:
      'Flejes de acero Uddeholm para sierras de cinta de precision. Uddeholm (Suecia) es lider mundial en aceros para herramientas y sierras. Sus flejes pasan por tratamiento termico de templado y revenido que les da combinacion optima de dureza y flexibilidad. Lineas especificas para corte de madera (Sierras Cinta) y metal (hojas bimetalicas).',
  },
  'ACERO.KAPF.': {
    description:
      'Flejes de acero Kapfenberg C75 para fabricacion de sierras de cinta y herramientas de corte. El acero C75 es un acero al alto carbono templado y revenido, con buena resistencia al desgaste y tenacidad. Marca Kapfenberg, fabricante austriaco de aceros especiales para sierras. Se vende en dimensiones estandar (ancho x espesor) para distintos pasos de diente y tipos de corte.',
  },
  'TRABADO': {
    description:
      'Cintas de sierra huincha soldadas y terminadas, marca Simonds y PreSharp, en distintos pasos de diente (TPI) y anchos para corte de madera, metales y materiales especiales. La marca "RS PRO" indica linea industrial reforzada. Se entregan en bobinas o tramos soldados listos para instalacion en sierras de banda.',
  },
  'C.ABRASIVOS': {
    description:
      'Barras y piezas abrasivas para rectificado, perfilado y afilado de herramientas de corte. Incluye barras de rectificado (HSS), barras perfiladas (acero 55AC para dar forma a cuchillas), muelas y puntas montadas. Aplicaciones en mantenimiento de sierras, fresas y herramientas de corte industrial.',
  },
  'C.ARMSTRONG': {
    description:
      'Repuestos originales Armstrong para maquinas de mantenimiento de sierras de cinta. Incluyen cabezales de swage (embutido), valvulas de aire, cabezales de shaper (perfilado), cabezas de diamante y tornillos de carburo. El swage es el proceso de forja en frio que da forma a los dientes de la sierra para abrir o cerrar el corte; el shaper da perfil a la punta del diente. Marca Armstrong, fabricante estadounidense de herramental para sierras de cinta.',
  },
  'C.SIMONDS': {
    description:
      'Dientes de repuesto y medialunas Simonds para sierras circulares y de cinta. Simonds es fabricante estadounidense historico de herramientas de corte para madera y metal (fundada 1832). Los dientes vienen en distintas medidas (1-1/2 a 3 pulgadas) y geometrias segun el tipo de sierra y material a cortar. Referencia a normas AISI y dimensiones en fracciones de pulgada.',
  },
  'S.CIRCULARES': {
    description:
      'Discos de sierra circular para corte de madera, metal y materiales compuestos. Producidos en aceros rapidos (HSS) y carburo de tungsteno, con distintos diametros, numero de dientes y geometrias segun el material a trabajar. Aplicaciones en carpinteria industrial, aserraderos, fabricacion de muebles y corte de metales ferrosos y no ferrosos.',
  },
  'CUCH.AST.': {
    description:
      'Cuchillos contraastilladores (contracuchillas) para maquinas astilladoras de madera en aserraderos y plantas de chips. Marcas Kapfenberg Economico y Simonds. Trabajan en par con el cuchillo principal para producir astillas de tamano uniforme. Fabricados en acero al alto carbono templado, con dimensiones estandarizadas por modelo de maquina (Morbark 48, Morbark 58, Fulghum 66, etc.).',
  },
  'CUCH.CONS.': {
    description:
      'Consumibles y repuestos para cuchillos de maquinas de carpinteria y aserraderos. Esparragos para prensas (sujetar cuchillos al cabezal), insertos astilladores (cuchillas de carburo para astilladoras), metal blanco Babbitt (aleacion anti-friccion para asiento de cuchillos en cepilladoras y machihembradoras).',
  },
  'CUCH.ESTRIADOS': {
    description:
      'Cuchillos estriados (corrugados) para cepilladoras de madera. La estria o corrugado en el filo crea pequenas ranuras en la madera que evitan el deslizamiento de la pieza durante el cepillado, mejorando la seguridad y el agarre. Distintos tamanos para maquinas estandar y de gran formato.',
  },
  'CUCH.LISOS': {
    description:
      'Cuchillos lisos (sin estrias) para cepilladoras, regruesadoras y machihembradoras de madera. Acero rapido (HSS) o acero al carbono Kapfenberg Economico. El filo liso produce un acabado fino en la madera; los lisos de HSS tienen mayor duracion entre afilados.',
  },
  'CUCH.POLINEROS': {
    description:
      'Cuchillos para polineras (maquinas que fabrican palos y redondos de madera a partir de bloques). Marca Kadur, fabricante brasileno de cuchillos industriales. Geometria especifica para descortezar y dar forma cilindrica.',
  },
  'INST.MED.ACC.': {
    description:
      'Instrumentos de medicion de precision y accesorios para taller. Pies de metro (calibres Vernier), micrometros, comparadores de cuadrante, reglas y clips de alineacion para sierras de cinta (Lenox). Marca Insize fabricante de instrumentos de metrologia con buena relacion precio-calidad.',
  },
  'MAQUINAS': {
    description:
      'Maquinaria industrial para aserraderos y carpinteria: afiladoras automaticas de sierras de cinta y circulares, bancos de sierra, cepilladoras, lijadoras, trozadoras, escuadradoras, tupis y tensionadores. Marcas Warrior, Maggi, Castor Kinetic y Champion. Equipos de servicio pesado para produccion continua.',
  },
  'HERR.IND.ALIM.': {
    description:
      'Rejillas y elementos de corte y proceso en acero inoxidable para la industria alimentaria (mataderos, frigorificos, procesamiento de carne). Marca Enterprise, fabricante estadounidense lider en equipamiento para la industria carnica. Las rejillas WH CBG son para lineas de corte y procesamiento con tamanos de paso variables segun la aplicacion.',
  },
  'S.ALIMENTO': {
    description:
      'Sierras de cinta Kapfenberg para corte en la industria alimentaria (carne, hueso, pescado). Acero inoxidable apto para contacto con alimentos. Paso de diente grueso (3-4 TPI) para corte eficiente de materiales blandos con hueso.',
  },
  'S.BIMETAL': {
    description:
      'Cintas de sierra bimetalica para corte de metales y maderas duras. Fabricadas con dientes de acero rapido (M42 o M51) soldados por electron-beam a un cuerpo de acero aleado flexible. Ofrecen mayor durabilidad y velocidad de corte que las cintas de acero al carbono. Usos principales: corte de tubos, perfiles, aceros inoxidables, hierros fundidos y aleaciones duras.',
  },
  'S.CARPINTERAS': {
    description:
      'Sierras de cinta Kapfenberg para corte de madera en carpinteria. Anchos chicos (6") y pasos finos (4-6 TPI) para cortes curvos y de detalle. Acero al carbono templado para maderas blandas y duras.',
  },
  'SERVICIOS': {
    description:
      'Categoria placeholder reservada para servicios generales adicionales (capacitacion, instalacion, asesoria tecnica).',
  },
};

// Asset paths
const COVER_PATHS = {
  cover1: '/catalog/cover-1.png',
  cover2: '/catalog/cover-2.png',
  backCover: '/catalog/back-cover.png',
  placeholder: '/catalog/placeholder.svg',
  logo: '/logo-todohuincha.svg',
};

async function main() {
  // Backup
  await copyFile(CATALOG_PATH, BACKUP_PATH);
  console.log(`Backed up to ${BACKUP_PATH}`);

  const catalog = JSON.parse(await readFile(CATALOG_PATH, 'utf8'));
  const schema = JSON.parse(await readFile(SCHEMA_PATH, 'utf8'));

  let catInjected = 0;
  let descInjected = 0;
  let bannerInjected = 0;
  let bgInjected = 0;
  const missing = [];

  // 1. Inject category descriptions + banner/background URLs
  for (const [code, cat] of Object.entries(catalog.dictionaries.category_dictionary)) {
    const data = CATEGORY_DATA[code];
    if (!data) {
      missing.push(code);
      continue;
    }
    if (!cat.assets) cat.assets = {};

    // description (top-level on category dictionary)
    if (!cat.description) {
      cat.description = data.description;
      descInjected++;
    }

    // banner
    if (!cat.assets.banner) {
      cat.assets.banner = {
        asset_id: `category-${cat.slug}-banner`,
        asset_type: 'image',
        asset_role: 'category_banner',
        url: `/categories/${cat.slug}/banner.svg`,
        storage_key: `catalog/categories/${cat.slug}/banner.svg`,
        file_name: 'banner.svg',
        alt_text: `Banner categoria ${cat.label}`,
        caption: `Banner para seccion ${cat.label}`,
        sort_order: 1,
        is_primary: false,
        source_status: 'generated',
        metadata: { category_code: code },
      };
      bannerInjected++;
    } else if (!cat.assets.banner.url) {
      cat.assets.banner.url = `/categories/${cat.slug}/banner.svg`;
      bannerInjected++;
    }

    // background
    if (!cat.assets.background) {
      cat.assets.background = {
        asset_id: `category-${cat.slug}-background`,
        asset_type: 'image',
        asset_role: 'pdf_background',
        url: `/categories/${cat.slug}/background.svg`,
        storage_key: `catalog/categories/${cat.slug}/background.svg`,
        file_name: 'background.svg',
        alt_text: `Fondo categoria ${cat.label}`,
        caption: `Fondo visual para seccion ${cat.label}`,
        sort_order: 2,
        is_primary: false,
        source_status: 'generated',
        metadata: { category_code: code },
      };
      bgInjected++;
    } else if (!cat.assets.background.url) {
      cat.assets.background.url = `/categories/${cat.slug}/background.svg`;
      bgInjected++;
    }

    catInjected++;
  }

  // 2. Inject catalog_assets cover images
  if (!catalog.dictionaries.catalog_assets) {
    catalog.dictionaries.catalog_assets = {};
  }
  const ca = catalog.dictionaries.catalog_assets;

  const setAsset = (key, asset) => {
    if (!ca[key]) {
      ca[key] = asset;
    } else if (!ca[key].url) {
      ca[key].url = asset.url;
    }
  };

  setAsset('cover_image_1', {
    asset_id: 'catalog-cover-1',
    asset_type: 'image',
    asset_role: 'catalog_cover',
    url: COVER_PATHS.cover1,
    storage_key: 'catalog/covers/cover-1.png',
    file_name: 'cover-1.png',
    alt_text: 'Portada del catalogo (pagina 1)',
    caption: 'Foto del local Comercializadora Todo Huincha',
    sort_order: 1,
    is_primary: true,
    source_status: 'provided',
  });

  setAsset('cover_image_2', {
    asset_id: 'catalog-cover-2',
    asset_type: 'image',
    asset_role: 'catalog_cover',
    url: COVER_PATHS.cover2,
    storage_key: 'catalog/covers/cover-2.png',
    file_name: 'cover-2.png',
    alt_text: 'Portada del catalogo (pagina 2)',
    caption: 'Pagina de presentacion del catalogo',
    sort_order: 2,
    is_primary: false,
    source_status: 'provided',
  });

  setAsset('back_cover', {
    asset_id: 'catalog-back-cover',
    asset_type: 'image',
    asset_role: 'catalog_back_cover',
    url: COVER_PATHS.backCover,
    storage_key: 'catalog/covers/back-cover.png',
    file_name: 'back-cover.png',
    alt_text: 'Contraportada del catalogo',
    caption: 'Contacto y redes sociales',
    sort_order: 1,
    is_primary: false,
    source_status: 'provided',
  });

  setAsset('logo', {
    asset_id: 'catalog-logo',
    asset_type: 'image',
    asset_role: 'brand_logo',
    url: COVER_PATHS.logo,
    storage_key: 'brand/logo-todohuincha.svg',
    file_name: 'logo-todohuincha.svg',
    alt_text: 'Logo Todo Huincha',
    caption: 'Logo institucional',
    sort_order: 0,
    is_primary: true,
    source_status: 'provided',
  });

  setAsset('placeholder_image', {
    asset_id: 'catalog-placeholder',
    asset_type: 'image',
    asset_role: 'placeholder',
    url: '/catalog/placeholder.svg',
    storage_key: 'catalog/placeholder.svg',
    file_name: 'placeholder.svg',
    alt_text: 'Imagen no disponible',
    caption: 'Logo TODO HUINCHA como placeholder',
    sort_order: 99,
    is_primary: false,
    source_status: 'generated',
  });

  // 3. Write updated catalog
  await writeFile(CATALOG_PATH, JSON.stringify(catalog, null, 2));
  console.log(`Updated ${CATALOG_PATH}`);

  // 4. Validate with AJV
  console.log('\nValidating updated catalog against schema...');
  const ajv = new Ajv({ strict: false, allErrors: false });
  const validate = ajv.compile(schema);
  const valid = validate(catalog);
  if (valid) {
    console.log('AJV: PASS - updated catalog is valid against schema');
  } else {
    console.log(`AJV: FAIL - ${validate.errors?.length ?? 0} errors`);
    for (const e of (validate.errors ?? []).slice(0, 20)) {
      console.log(`  ${e.instancePath}: ${e.message}`);
    }
    process.exit(1);
  }

  console.log('\n=== INJECTION REPORT ===');
  console.log(`Categories processed: ${catInjected}`);
  console.log(`Descriptions injected: ${descInjected}`);
  console.log(`Banner URLs injected: ${bannerInjected}`);
  console.log(`Background URLs injected: ${bgInjected}`);
  console.log(`Cover assets injected: cover_image_1, cover_image_2, back_cover, logo, placeholder_image`);
  if (missing.length > 0) {
    console.log(`\nMissing descriptions for: ${missing.join(', ')}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});