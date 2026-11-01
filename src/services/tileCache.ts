import L from 'leaflet';

/**
 * Provedor de tiles oficial do Google Maps Roadmap (lyrs=m).
 * Renderização em alta definição, ruas nítidas, nomes de bairros e vias completos,
 * com renderização síncrona imediata e suporte a cache automático do navegador (Service Worker / PWA).
 */

export const GOOGLE_MAPS_TILE_URL = 'https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}';
export const OSM_URL = GOOGLE_MAPS_TILE_URL;

export const PRIMARY_TILE_CONFIG = {
  url: GOOGLE_MAPS_TILE_URL,
  attribution: '&copy; Google Maps',
  maxZoom: 20,
  subdomains: ['0', '1', '2', '3']
};

export const FALLBACK_TILE_CONFIG = PRIMARY_TILE_CONFIG;

/**
 * Subclasse de TileLayer com renderização síncrona imediata para evitar telas cinzas
 * e com tolerância a falhas para tentar servidores espelho do Google Maps em caso de oscilação de rede.
 */
export class CachedTileLayer extends L.TileLayer {
  createTile(coords: L.Coords, done: L.DoneCallback): HTMLElement {
    const tile = document.createElement('img');

    // Handler de sucesso nativo do Leaflet
    L.DomEvent.on(tile, 'load', L.Util.bind((this as any)._tileOnLoad, this, done, tile));

    // Em caso de falha em um espelho, tenta o espelho mt1 do Google Maps
    L.DomEvent.on(tile, 'error', () => {
      if (!tile.dataset.retried) {
        tile.dataset.retried = 'true';
        tile.src = `https://mt1.google.com/vt/lyrs=m&x=${coords.x}&y=${coords.y}&z=${coords.z}`;
      } else {
        (this as any)._tileOnError(done, tile);
      }
    });

    if (this.options.crossOrigin || this.options.crossOrigin === '') {
      tile.crossOrigin = this.options.crossOrigin === true ? '' : this.options.crossOrigin;
    }

    tile.alt = '';
    tile.setAttribute('role', 'presentation');

    // Atribuição SÍNCRONA imediata: o Leaflet precisa que tile.src seja definido de imediato
    // para montar o grid perfeitamente sem atrasos nem lacunas cinzas
    tile.src = this.getTileUrl(coords);

    return tile;
  }
}

// Export para compatibilidade com outros componentes
export const tileCache = {
  async getCachedCount(): Promise<number> {
    return 0;
  },
  async clearTileCache(): Promise<void> {}
};
