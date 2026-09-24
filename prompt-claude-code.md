# Petjada: joc de rutes a peu amb realitat augmentada geogràfica (PWA)

El nom de l'app és **Petjada**. Vull que construeixis un MVP funcional d'un joc per a mòbil, com a PWA. L'usuari tria una ruta a peu, la camina, veu objectes col·locats en punts reals del recorregut i els captura quan s'hi apropa. Així acumula punts. No és un clon de Pokémon Go: els objectes estan ancorats a llocs geogràfics concrets i s'han d'anar a buscar físicament.

Treballa per fases (a sota). Al final de cada fase, deixa-ho funcionant i explica breument què has fet i com provar-ho.

## Stack

- **Monorepo** amb `apps/web` (PWA) i `apps/api` (backend), TypeScript a tot arreu.
- **Frontend:** Vite + TypeScript, Mapbox GL JS (v3) amb edificis 3D, Three.js per a la capa custom quan calgui. PWA amb service worker i manifest. Sense framework pesat: vanilla TS o un framework lleuger.
- **Backend:** NestJS + PostgreSQL amb PostGIS, amb TypeORM o Prisma (el que encaixi millor amb PostGIS) i migracions.
- **Docker Compose** per a Postgres/PostGIS + API en local.
- **Autenticació:** vegeu la secció "Login".
- El token de Mapbox va en variable d'entorn (`VITE_MAPBOX_TOKEN`).

## Model de dades (PostGIS)

```
routes        (id, name, description, geom LineString 4326, length_m, round_trip bool, created_at)
route_objects (id, route_id, geom Point 4326, type, image_url, points int, leg 'anada'|'tornada',
               title, story_text, story_image_url, collection_id nullable)
collections   (id, name, description, zone Polygon 4326, cover_image_url, bonus_points int)
user_routes   (id, user_id, route_id, status 'in_progress'|'completed', started_at, completed_at, track LineString)
user_captures (id, user_id, object_id, captured_at, lat, lon, accuracy)  UNIQUE(user_id, object_id)
users         (id, email, password_hash, total_points, role 'player'|'editor'|'admin')
```

- Índexs GiST a totes les geometries.
- Un objecte capturat per un usuari no li torna a sortir mai (constraint UNIQUE + filtre `NOT EXISTS` a les consultes).
- `routes.created_by` (usuari creador) i `routes.is_public` bool.
- Sense seed de rutes fixes: les rutes es creen des de l'app a partir de la ubicació de l'usuari (vegeu "Crear rutes"). El seed només crea un usuari de prova.

## Funcionalitat

### 1. Pantalla inicial: rutes
- Llistat de rutes disponibles amb nom, descripció, longitud i si és anada i tornada.
- Marca les rutes ja completades i els objectes pendents de cada una.
- En triar una ruta, es veu dibuixada al mapa 3D abans de començar.

### 1b. Crear rutes (botó "Crear ruta")
Dues maneres, sempre a partir de la ubicació actual:

- **Automàtica:** l'usuari tria la longitud aproximada (1, 3, 5 km) i si és anada i tornada. Es genera una ruta a peu que comença on és l'usuari, fent servir la Mapbox Directions API amb perfil `walking`, perquè passi per carrers i camins transitables.
- **Manual:** l'usuari toca punts al mapa i la ruta s'ajusta als camins amb Directions (`walking`). Pot desfer punts i veure la longitud en temps real.

En tots dos casos:
- Nom i descripció editables (en la creació automàtica, se'n proposa un per defecte).
- Els objectes es col·loquen automàticament al llarg de la ruta amb `ST_LineInterpolatePoint`, un cada N metres (configurable, ~200–300 m) i repartits entre anada i tornada. Sempre queden sobre el camí, mai dins d'un edifici. En mode manual, l'usuari pot moure'ls o afegir-ne tocant el mapa.
- Punts per objecte segons la distància des de l'inici (més lluny, més punts).
- Opció de fer la ruta pública perquè la vegin altres usuaris propers, o deixar-la privada.
- El llistat inicial mostra les rutes pròpies i les públiques dins d'un radi (p. ex. 10 km) de la ubicació actual.

### 2. Seguiment GPS durant la ruta
- `watchPosition` amb `enableHighAccuracy: true`, `maximumAge: 0`.
- Filtre de posició: descartar lectures amb `accuracy` dolenta i salts impossibles (velocitat > 3 m/s caminant), i fer una mitjana ponderada (pes 1/accuracy²) sobre una finestra de lectures recents. Si la precisió no és suficient, mostra "millorant senyal…".
- **Rastre de petjades:** icones de peu al mapa, orientades segons el heading entre punts, fetes amb els punts ja filtrats.
- Wake Lock API perquè la pantalla no s'apagui durant la ruta.
- Estalvi de bateria: reduir la freqüència quan l'usuari està quiet (detectat amb `DeviceMotionEvent`).
- El track es desa al servidor periòdicament (`user_routes.track`).

### 3. Objectes
- Són **billboards**: imatges WebP amb transparència que sempre miren la càmera.
- **Moviment de flotació:** pugen i baixen suaument (sinus, ~3 s de període, amplitud petita) amb fase aleatòria per objecte perquè no vagin sincronitzats.
- **Ombra el·líptica** al terra que s'encongeix quan l'objecte puja.
- Visibles a l'horitzó dins d'un rang (~150–200 m). Més enllà, no es mostren.
- Els objectes del tram de tornada només apareixen quan l'usuari arriba al punt final de l'anada.
- Precarregar totes les imatges de la ruta en començar-la.
- Primer ho implementes amb markers HTML + animació CSS. Deixa preparada la possibilitat de passar a sprites de Three.js en un custom layer.

### 4. Captura
- Quan l'usuari és dins del radi de captura (~15–20 m, configurable) i la precisió és bona, l'objecte es pot tocar per agafar-lo.
- Animació curta de captura (escala + fade).
- **Validació al servidor:** `ST_DWithin` entre la posició enviada i l'objecte, que l'usuari tingui la ruta activa, que l'`accuracy` sigui acceptable i que la velocitat des de l'última captura sigui coherent. Si falla, retorna un error clar.

### 4b. Contingut lligat al lloc
L'objectiu és que els objectes tinguin sentit en aquell punt concret: història, patrimoni, natura, curiositats locals.
- Cada objecte pot tenir contingut propi: títol, text breu (màxim ~500 caràcters) i imatge.
- En capturar-lo, s'obre una **fitxa** amb aquest contingut. Les fitxes queden guardades en un **àlbum** personal ("les meves troballes"), consultable fora de la ruta.
- Els objectes col·locats automàticament sense contingut mostren una fitxa genèrica (nom de la ruta, distància recorreguda).
- En crear una ruta manualment, l'usuari pot afegir contingut a cada objecte.

### 4c. Col·leccions per zona
- Una col·lecció agrupa objectes d'una zona geogràfica (p. ex. "Les 12 peces del Segrià"). Pot incloure objectes de diverses rutes.
- A l'àlbum, cada col·lecció mostra el progrés (7/12) i les peces que falten es veuen com a silueta, sense revelar-ne el contingut.
- En completar una col·lecció, l'usuari rep `bonus_points` i una insígnia.
- Les col·leccions i les rutes amb contingut oficial les creen usuaris amb rol `editor` o `admin` (pensat per a ajuntaments, oficines de turisme o museus). Els editors tenen una pantalla senzilla per crear la col·lecció, dibuixar la zona, assignar-hi objectes i escriure les fitxes.
- Les rutes d'editors es marquen com a "oficials" al llistat.

### 5. Punts i finalització
- Cada objecte té el seu valor de punts.
- La ruta es considera completada quan l'usuari n'ha cobert ~90% (track dins d'un buffer de 20 m de la ruta, calculat amb PostGIS), encara que no hagi capturat tots els objectes.
- En completar-la, bonus proporcional a `length_m`.
- Les rutes completades queden desades i es mostren com a fetes.

### 6. Mode càmera (AR geogràfica)
No s'ha de fer servir WebXR. La tècnica és aquesta:
- `<video>` amb la càmera posterior (`getUserMedia`, `facingMode: 'environment'`) com a fons.
- A sobre, el canvas de Mapbox **transparent**: estil sense capa de fons ni terreny visible. Només es veuen els objectes.
- La càmera del mapa se sincronitza amb el mòbil: posició GPS filtrada, bearing des de la brúixola, pitch des de `DeviceOrientationEvent` (beta) i altura d'ulls ~1,6 m. Fes servir `map.setFreeCameraOptions()`.
- El FOV del mapa s'ha d'ajustar al de la càmera del mòbil (valor configurable, per defecte ~65° vertical).
- Filtre passa-baix al heading i al pitch.
- Opcional (fase posterior): edificis 3D com a oclusors invisibles (`colorWrite: false`) perquè tapin els objectes que hi queden darrere.

**Flux d'alineació (màquina d'estats):**
- `MOVING`: rotació del mòbil > ~30°/s (magnitud de `rotationRate`). S'amaguen els objectes i es mostra un **símbol 3D** amb el missatge "Quan el símbol estigui alineat, veuràs l'objecte".
- `ALIGNING`: mòbil quiet però no apuntant a l'objecte. El símbol (fletxa o anella) indica cap on girar segons l'error de heading i pitch.
- `LOCKED`: error < 8° mantingut durant ~400 ms. El símbol es centra, canvia de color i es transforma en l'objecte amb un fade-in. Histèresi: se surt de LOCKED amb error > 15°.
- A iOS: el permís de `DeviceOrientationEvent.requestPermission()` es demana amb un botó (gest d'usuari). Si `webkitCompassAccuracy` > 20°, mostra "Mou el mòbil fent un 8 per calibrar la brúixola".

## Login

L'objectiu és la mínima fricció: que es pugui començar a jugar en segons.

- **Mode convidat:** en obrir l'app per primer cop, es crea un usuari anònim automàticament (token desat al dispositiu) i es pot jugar de seguida. Un avís suau proposa crear compte per no perdre el progrés.
- **Crear compte / entrar** només amb:
  - **Enllaç màgic per email:** sense contrasenya. S'envia un enllaç d'un sol ús que caduca en 15 minuts. El mateix correu inclou també un **codi de 6 xifres** per entrar-lo a l'app: a iOS, l'enllaç s'obre a Safari i no a la PWA instal·lada (que té un emmagatzematge separat), i sense el codi la sessió quedaria al navegador. Límit d'intents per al codi.
- En passar de convidat a compte, tot el progrés (rutes, captures, punts, àlbum) es **fusiona** amb el compte. Si el compte ja existia, se sumen les dades sense duplicar captures.
- **Tokens:** access token JWT curt (15 min) i refresh token rotatiu en cookie `httpOnly`, `Secure`, `SameSite=Lax`. Revocació de refresh tokens al logout.
- **Perfil:** nom visible (àlies) i avatar opcional, per a futures classificacions. L'email no es mostra mai a altres usuaris.
- Esborrar el compte i totes les dades des del perfil (RGPD).
- Rate limiting als endpoints d'auth.
- Taula `users`: `email` nullable (convidats), `display_name`, `is_guest`. Taules `refresh_tokens` i `login_tokens` (hash de l'enllaç i del codi, caducitat, intents, usat).
- Les credencials SMTP van a `.env`.

## Identitat visual: logo i cover

Crea la identitat de **Petjada**:

- **Logo** en SVG: una petjada de peu estilitzada combinada amb un pin de localització, o una petjada que brilla com un objecte trobat. Ha de ser simple, llegible a 48 px i sense text. Paleta pròpia: un to verd o turquesa de natura i un accent càlid (groc o taronja) per als objectes. Defineix els colors com a tokens CSS i fes-los servir a tota l'app.
- **Icones PWA** generades a partir del SVG (amb `sharp` o similar, via script): 192×192, 512×512, versió `maskable` amb marge de seguretat, `apple-touch-icon` 180×180 i favicon.
- **Manifest:** `name: "Petjada"`, `short_name: "Petjada"`, `theme_color` i `background_color` de la paleta, `display: standalone`, `orientation: portrait`.
- **Cover / imatge de compartir** 1200×630 (Open Graph) en SVG i PNG: logo, nom "Petjada" i un eslògan curt en català (p. ex. "Camina. Troba. Suma."), amb un fons que suggereixi un mapa o una ruta.
- **Splash screen** per a iOS (`apple-touch-startup-image`) amb el logo centrat.
- Tots els fitxers generats a `apps/web/public/`, i l'script de generació a `scripts/` perquè es puguin regenerar si canvia el logo.

## Fases

1. Estructura del monorepo, Docker Compose, API NestJS amb PostGIS, migracions, seed i login (convidat i enllaç màgic amb codi). Logo, icones, manifest i cover.
2. Endpoints: crear ruta (automàtica i manual, amb col·locació d'objectes), llistat de rutes properes amb estat per usuari, iniciar ruta, desar track, objectes pendents propers, captura amb validació, finalitzar ruta.
3. PWA: pantalla de rutes, pantalla de crear ruta, mapa 3D amb Mapbox, ruta dibuixada, seguiment GPS filtrat, petjades, Wake Lock.
4. Objectes billboard amb flotació i ombra, radi de captura, animació, punts. Fitxes de contingut, àlbum de troballes i col·leccions amb progrés.
5. Mode càmera amb mapa transparent, sincronització de càmera i màquina d'estats d'alineació.
6. Mode de proves: simulació de GPS amb un track pregravat o clicant al mapa, per poder provar-ho des de l'escriptori sense caminar.
7. Rols `editor`/`admin`: pantalla per crear col·leccions, zones, rutes oficials i fitxes de contingut.

## Criteris
- Codi net i tipat. Configuració per variables d'entorn (radi de captura, rang de visibilitat, FOV, llindars).
- Tota la validació de punts al servidor. El client no es considera fiable.
- Mòbil primer: UI pensada per a una mà, botons grans, funcionant tant a Android (Chrome) com a iOS (Safari).
- Un README amb com arrencar-ho en local i com provar-ho al mòbil (HTTPS local, necessari per a càmera i sensors).
