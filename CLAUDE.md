# Petjada

PWA de rutes a peu amb realitat augmentada geogràfica. L'usuari crea o tria una ruta, la camina, i veu objectes (billboards) ancorats a punts reals del recorregut. Quan s'hi apropa, els captura i suma punts.

Respon sempre en català.

## Stack

- Monorepo amb pnpm workspaces: `apps/web` (PWA) i `apps/api` (backend).
- **Web:** Vite + TypeScript, Mapbox GL JS v3 (edificis 3D), Three.js només per a custom layers.
- **API:** NestJS + PostgreSQL/PostGIS, amb migracions.
- **Local:** Docker Compose per a la base de dades i l'API.

## Estructura

```
apps/web/src/
  map/        # Mapbox, capes, càmera, edificis
  gps/        # watchPosition, filtre de posició, petjades
  ar/         # vídeo de càmera, sincronització, màquina d'estats d'alineació
  objects/    # billboards, flotació, ombra, captura
  routes/     # llistat, creació (auto/manual), detall
  sim/        # simulació de GPS per provar des de l'escriptori
apps/web/public/  # icones, manifest, cover, splash
apps/api/src/
  routes/ objects/ captures/ users/ auth/
scripts/      # generació d'icones i cover a partir del SVG del logo
```

## Ordres

```bash
pnpm install
docker compose up -d        # PostGIS + API
pnpm --filter api migrate   # migracions
pnpm --filter api seed      # usuaris de prova (admin i editor, sense contrasenya)
pnpm dev:api                # API a http://localhost:3000/api (o via Docker)
pnpm dev:web                # PWA (HTTPS local, necessari per a càmera i sensors)
DEV_HTTP=1 pnpm dev:web     # PWA per HTTP, només per provar a l'escriptori amb simulació
pnpm test
pnpm lint && pnpm typecheck
pnpm icons                  # regenera icones, cover, splash i objectes des dels SVG
```

El contracte HTTP (tipus DTO i llista d'endpoints) és a `packages/shared/src/index.ts`; es recompila amb `pnpm --filter @petjada/shared build` (el `postinstall` ja ho fa). En dev sense SMTP, el codi de login surt al log de l'API.

Actualitza aquesta secció si canvien les ordres.

## Regles del domini

- **El client no es considera fiable.** Tota la validació de captures, punts i finalització de rutes es fa al servidor: distància amb `ST_DWithin`, `accuracy`, ruta activa i coherència de velocitat.
- Un objecte capturat no torna a sortir mai a aquell usuari: constraint `UNIQUE(user_id, object_id)` i filtre `NOT EXISTS` a les consultes.
- Geometries en SRID 4326. Per a distàncies en metres, cast a `geography`. Índexs GiST a totes les geometries.
- Els objectes es col·loquen sempre sobre la línia de la ruta (`ST_LineInterpolatePoint`), mai dins d'edificis.
- Ruta completada = ~90% del recorregut cobert (buffer de 20 m), no cal haver capturat tots els objectes.
- El valor de l'app és el contingut real lligat al lloc (història, patrimoni, natura), no la fantasia. Els objectes poden tenir una fitxa (títol, text, imatge) que es desa a l'àlbum de l'usuari en capturar-los.
- Col·leccions per zona: les peces no trobades es mostren com a silueta i mai se'n revela el contingut abans de capturar-les.
- Rols: `player`, `editor` (institucions: crea col·leccions, rutes oficials i fitxes) i `admin`. Els permisos es comproven sempre a l'API.
- Login: es pot jugar com a convidat des del primer segon. En crear compte (només enllaç màgic per email + codi de 6 xifres, sense contrasenyes ni OAuth), el progrés del convidat es fusiona sense duplicar captures. Refresh token en cookie `httpOnly`, mai a `localStorage`.

## Regles tècniques

- **No fer servir WebXR.** L'AR és un `<video>` de càmera amb el mapa de Mapbox transparent a sobre, sincronitzat amb el GPS, la brúixola i l'orientació del mòbil.
- Heading i pitch sempre amb filtre passa-baix. La posició sempre filtrada: descartar per `accuracy` i per salts impossibles, i mitjana ponderada 1/accuracy².
- Els objectes són billboards WebP amb alfa. No fer servir models 3D si no es demana explícitament.
- Els permisos de sensors a iOS (`DeviceOrientationEvent.requestPermission`) es demanen sempre des d'un gest de l'usuari.
- Cuidar la bateria: Wake Lock només durant la ruta, reduir la freqüència del GPS quan l'usuari és quiet, obrir la càmera només a prop dels objectes.
- Tots els llindars (radi de captura, rang de visibilitat, FOV, graus d'alineació, velocitat màxima) són configurables per variables d'entorn, mai valors màgics al codi.
- Els secrets i el token de Mapbox van a `.env`. No es commitegen mai; manté actualitzat `.env.example`.

## Convencions

- TypeScript `strict`. No fer servir `any` sense justificació.
- Codi i identificadors en anglès. Textos de la UI en català, centralitzats en un fitxer de traduccions.
- Mòbil primer: UI per a una mà i botons grans. Provar a Android (Chrome) i iOS (Safari).
- Quan una funcionalitat depèn del GPS, ha de funcionar també amb el mode de simulació (`sim/`).
- Abans de donar una tasca per acabada: `pnpm lint`, `pnpm typecheck` i `pnpm test` han de passar.
