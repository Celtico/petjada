import { Box, Center, Text } from '@chakra-ui/react';
import type mapboxgl from 'mapbox-gl';
import { useEffect, useRef } from 'react';
import type { LngLat } from '@petjada/shared';
import { t } from '../i18n/ca';
import { createMap, hasMapboxToken } from '../map/create-map';

export interface MapViewProps {
  center: LngLat;
  zoom?: number;
  pitch?: number;
  bearing?: number;
  transparent?: boolean;
  interactive?: boolean;
  /** Es crida un cop, quan el mapa existeix (abans de `load`). */
  onReady: (map: mapboxgl.Map) => void;
  /** Neteja abans de destruir el mapa. */
  onDispose?: (map: mapboxgl.Map) => void;
}

/**
 * Contenidor del mapa de Mapbox. El mapa es crea un sol cop (els canvis de
 * `center`/`zoom` posteriors no el recreen: mou-lo amb `map.easeTo`).
 */
export function MapView(props: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !hasMapboxToken()) return;
    const p = propsRef.current;
    const map = createMap({
      container,
      center: p.center,
      zoom: p.zoom,
      pitch: p.pitch,
      bearing: p.bearing,
      transparent: p.transparent,
      interactive: p.interactive,
    });
    p.onReady(map);
    return () => {
      propsRef.current.onDispose?.(map);
      map.remove();
    };
  }, []);

  if (!hasMapboxToken()) {
    return (
      <Center position="absolute" inset="0" px="6" bg="bg">
        <Text color="fg.error" textAlign="center">
          {t.app.noMapboxToken}
        </Text>
      </Center>
    );
  }
  return <Box ref={containerRef} className="map" />;
}
