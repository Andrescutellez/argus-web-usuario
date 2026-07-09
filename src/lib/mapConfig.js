/**
 * @file mapConfig.js
 * @brief Configuración central del mapa MapLibre GL para Argus Web.
 *
 * ESTILOS ARGUS:
 *   "Argus Día" y "Argus Noche" son estilos propios basados en la paleta de Waze.
 *   Se construyen en runtime: se descarga el style.json base y se le aplican
 *   los colores Argus antes de pasárselo a MapLibre.
 *
 * TILES:
 *   CUSTOM_TILES_URL = null → CartoDB (gratis, z14+, Colombia completa)
 *   CUSTOM_TILES_URL = 'pmtiles://...' → tiles propios en R2 (cuando estén z14)
 *
 * COORDENADAS: MapLibre usa [lng, lat]. Leaflet usaba [lat, lng].
 */

export const CUSTOM_TILES_URL = null
// Para activar tiles propios cuando estén disponibles en z14:
// export const CUSTOM_TILES_URL = 'pmtiles://https://pub-95243a477bad409c93dc82302c944db1.r2.dev/colombia.pmtiles'

export const COLOMBIA_CENTER = [-74.0721, 4.711]
export const DEFAULT_ZOOM    = 12

// ─── Estilo satélite (ESRI, sin auth) ────────────────────────────────────────

export const SATELLITE_STYLE = {
  version: 8,
  sources: {
    esri: {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      attribution: '© Esri, Maxar, Earthstar Geographics',
      maxzoom: 19,
    },
  },
  layers: [{ id: 'esri-satellite', type: 'raster', source: 'esri' }],
}

// ─── Paletas de color inspiradas en Waze ─────────────────────────────────────

/** Waze día: fondo crema cálido, verdes vivos, azul agua fresco. */
const PALETTE_DAY = {
  background:  '#F0EDE4',   // fondo crema Waze
  park:        '#BCE874',   // verde lima vivo — parques
  wood:        '#96D45A',   // verde bosque más profundo
  grass:       '#C8ED88',   // verde claro — prado/césped
  scrub:       '#B4E068',   // matorral
  wetland:     '#A8D890',   // humedal
  water:       '#9CC8F0',   // azul cielo agua
  waterway:    '#78AADE',   // ríos/quebradas
  beach:       '#F5E9C0',   // arena/playa
  residential: '#ECEAE2',   // zona residencial
  building:    '#E2DBD2',   // edificios
  commercial:  '#EDE8DC',   // zona comercial
  industrial:  '#E8E0D0',   // zona industrial
  cemetery:    '#CCDCB8',   // cementerio
  hospital:    '#F0DDD8',   // hospital/salud
}

/** Waze noche: navy profundo, verdes oscuros visibles, teal agua, calles slate. */
const PALETTE_NIGHT = {
  background:  '#1A2636',   // navy profundo Waze
  park:        '#1C4A2C',   // verde parque — visible sin brillar
  wood:        '#163C22',   // bosque oscuro
  grass:       '#1E4E2E',   // prado oscuro
  scrub:       '#1A4828',
  wetland:     '#1A4430',
  water:       '#18384E',   // teal oscuro agua
  waterway:    '#143448',   // ríos noche
  beach:       '#2A2A1A',
  residential: '#1E2C3C',   // zonas residenciales
  building:    '#1E2E3E',   // edificios azulados
  commercial:  '#1C2A3A',
  industrial:  '#1A2836',
  cemetery:    '#1A3028',
  hospital:    '#222838',
  // Calles — slate oscuro escalonado (sin esto quedan blancas sobre el base Bright)
  road:          '#253344',  // calles menores
  road_major:    '#2E3F52',  // vías principales/secundarias
  road_motorway: '#2A3C26',  // autopistas — tono oliva oscuro estilo Waze noche
  road_casing:   '#141F2A',  // borde exterior de calles (casing)
  // Etiquetas — texto claro sobre fondo oscuro
  label:         '#7AACBF',  // azul claro apagado — legible sin enceguecer
  label_halo:    '#1A2636',  // halo = mismo que background para contraste limpio
}

// ─── Motor de aplicación de paleta ───────────────────────────────────────────

/**
 * Aplica una paleta de colores sobre un style.json de MapLibre.
 *
 * Reglas de sobrescritura:
 *  - fill / line / fill-extrusion: solo toca propiedades que ya son strings simples
 *    (no expresiones) para no romper efectos de zoom o filtros existentes.
 *  - symbol (etiquetas): fuerza text-color y text-halo-color si la paleta trae `label`,
 *    incluso sobre expresiones — necesario en noche para que el texto sea claro.
 *
 * Identifica capas por keywords en el ID: funciona con Bright y derivados.
 */
function applyPalette(style, palette) {
  const s = JSON.parse(JSON.stringify(style)) // deep copy, no mutar el original

  s.layers.forEach(layer => {
    const id   = layer.id.toLowerCase()
    const type = layer.type
    const p    = layer.paint
    if (!p) return

    // Fuerza el color si la paleta lo define — sin importar si la capa lo tenía antes.
    // Necesario porque Bright no define fill-color en paint de muchos layers (usa default),
    // y también porque reemplazar expresiones con un string plano es válido en MapLibre.
    const set = (prop, color) => {
      if (color != null) layer.paint[prop] = color
    }

    // Fondo del mapa
    if (type === 'background') {
      set('background-color', palette.background)
      return
    }

    if (type === 'fill') {
      if (id.match(/\bpark\b|garden|plaza|pitch|sport|leisure/))
        set('fill-color', palette.park)
      else if (id.match(/wood|forest|nature_reserve/))
        set('fill-color', palette.wood)
      else if (id.match(/grass|meadow|farmland|orchard/))
        set('fill-color', palette.grass)
      else if (id.match(/scrub|heath/))
        set('fill-color', palette.scrub)
      else if (id.match(/wetland|marsh/))
        set('fill-color', palette.wetland)
      else if (id.match(/\bwater\b/) && !id.includes('way') && !id.includes('name'))
        set('fill-color', palette.water)
      else if (id.match(/beach|sand/))
        set('fill-color', palette.beach)
      else if (id.match(/residential|suburb|quarter/))
        set('fill-color', palette.residential)
      else if (id.match(/building/) && !id.match(/roof|top|outline/))
        set('fill-color', palette.building)
      else if (id.match(/commercial|retail/))
        set('fill-color', palette.commercial)
      else if (id.match(/industrial/))
        set('fill-color', palette.industrial)
      else if (id.match(/cemetery|grave/))
        set('fill-color', palette.cemetery)
      else if (id.match(/hospital|medical|health/))
        set('fill-color', palette.hospital)
      else if (id.match(/school|college|university|education|kindergarten|civic/))
        set('fill-color', palette.building)
    }

    if (type === 'line') {
      if (id.match(/waterway|river|stream|canal|ditch/)) {
        set('line-color', palette.waterway)
      } else if (id.match(/road|street|motorway|trunk|tunnel|bridge/)) {
        if (id.match(/case|casing/)) {
          set('line-color', palette.road_casing)
        } else if (id.match(/motorway|trunk/)) {
          set('line-color', palette.road_motorway)
        } else if (id.match(/major|primary|secondary/)) {
          set('line-color', palette.road_major)
        } else {
          set('line-color', palette.road)
        }
      }
    }

    // Edificios 3D (fill-extrusion) — oscurecer en noche si existen en el base style
    if (type === 'fill-extrusion' && palette.building) {
      if (p['fill-extrusion-color'] != null)
        layer.paint['fill-extrusion-color'] = palette.building
    }

    // Etiquetas — forzar texto claro en noche (override incluso expresiones MapLibre)
    // Solo se aplica cuando la paleta trae `label` (PALETTE_NIGHT lo tiene, PALETTE_DAY no)
    if (type === 'symbol' && palette.label) {
      layer.paint['text-color']      = palette.label
      layer.paint['text-halo-color'] = palette.label_halo
    }
  })

  // Segunda pasada: edificios por source-layer (más fiable que buscar por ID)
  // También cubre landuse educativo (colegios, universidades) que aparece en source-layer "landuse"
  if (palette.building) {
    s.layers.forEach(layer => {
      const sl  = layer['source-layer']
      const lid = (layer.id ?? '').toLowerCase()
      const isBuilding = sl === 'building' || sl === 'building_part'
      const isEduLanduse = sl === 'landuse' &&
        lid.match(/school|college|university|education|kindergarten|civic/)
      if (!isBuilding && !isEduLanduse) return
      if (!layer.paint) layer.paint = {}
      if (layer.type === 'fill') {
        layer.paint['fill-color']         = palette.building
        layer.paint['fill-outline-color'] = palette.building
      }
      if (layer.type === 'fill-extrusion') {
        layer.paint['fill-extrusion-color'] = palette.building
      }
    })
  }

  // Tercera pasada: calles por source-layer (OpenMapTiles siempre usa "transportation")
  if (palette.road) {
    s.layers.forEach(layer => {
      if (layer['source-layer'] !== 'transportation') return
      if (layer.type !== 'line') return
      if (!layer.paint) layer.paint = {}
      const lid = layer.id.toLowerCase()
      if (lid.match(/case|casing/)) {
        layer.paint['line-color'] = palette.road_casing
      } else if (lid.match(/motorway|trunk/)) {
        layer.paint['line-color'] = palette.road_motorway
      } else if (lid.match(/primary|secondary|major/)) {
        layer.paint['line-color'] = palette.road_major
      } else {
        layer.paint['line-color'] = palette.road
      }
    })
  }

  return s
}

// ─── Constructores de estilo ──────────────────────────────────────────────────

/**
 * Descarga un style.json base y le aplica una paleta de colores Argus.
 * `paletteObj` debe ser PALETTE_DAY o PALETTE_NIGHT — nunca un string.
 */
export async function buildArgusStyle(baseUrl, paletteObj) {
  const resp  = await fetch(baseUrl)
  const style = await resp.json()

  if (CUSTOM_TILES_URL) {
    for (const [key, source] of Object.entries(style.sources)) {
      if (source.type === 'vector') {
        style.sources[key] = { type: 'vector', url: CUSTOM_TILES_URL }
        break
      }
    }
  }

  return applyPalette(style, paletteObj)
}

// ─── Catálogo de estilos ──────────────────────────────────────────────────────
//
// palette: 'day' | 'night' | undefined
//   - 'day'   → buildArgusStyle con PALETTE_DAY
//   - 'night' → buildArgusStyle con PALETTE_NIGHT
//   - undefined → buildPmtilesStyle (solo redirige tiles si CUSTOM_TILES_URL activo)
//   - url: null → SATELLITE_STYLE

export const MAP_STYLES = [
  {
    id:      'sistema',
    label:   'Sistema',
    icon:    '⚙️',
    url:     null,          // se resuelve en runtime según OS dark/light
    sistema: true,
  },
  {
    id:      'argus-day',
    label:   'Argus Día',
    icon:    '☀️',
    url:     'https://tiles.openfreemap.org/styles/bright',
    palette: PALETTE_DAY,
  },
  {
    id:      'argus-night',
    label:   'Argus Noche',
    icon:    '🌙',
    url:     'https://tiles.openfreemap.org/styles/bright',  // mismo base que día — sin 3D, calles simples
    palette: PALETTE_NIGHT,
  },
  {
    id:    'satellite',
    label: 'Satélite',
    icon:  '🛰️',
    url:   null,
  },
]

export const DEFAULT_STYLE = MAP_STYLES[0]  // Sistema
