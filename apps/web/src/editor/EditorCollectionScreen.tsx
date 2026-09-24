import { afterMapReady } from '../map/create-map';
import { Badge, Box, Button, Field, Heading, HStack, Input, Text, Textarea, VStack } from '@chakra-ui/react';
import type mapboxgl from 'mapbox-gl';
import type { CollectionDetailDto, LngLat, PolygonGeometry, Position } from '@petjada/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { LuTrash2, LuUndo2 } from 'react-icons/lu';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { useIsEditor } from '../auth/use-session';
import { OverlayTopBar } from '../components/AppShell';
import { BottomPanel } from '../components/BottomSheet';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { MapView } from '../components/MapView';
import { ErrorView, LoadingView } from '../components/StatusViews';
import { toast } from '../components/ui/toaster';
import { t } from '../i18n/ca';
import { locate } from '../routes/location';
import { createObjectMarker } from '../routes/markers';
import { pointInPolygon } from './geometry';
import { drawZone } from './zone-layer';

export function EditorCollectionScreen() {
  const { id = 'nova' } = useParams();
  const navigate = useNavigate();
  const isEditor = useIsEditor();
  const isNew = id === 'nova';

  const [collection, setCollection] = useState<CollectionDetailDto | null>(null);
  const [center, setCenter] = useState<LngLat | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [vertexCount, setVertexCount] = useState(0);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [cover, setCover] = useState('');
  const [bonus, setBonus] = useState('50');
  const [saving, setSaving] = useState(false);
  const [assignInfo, setAssignInfo] = useState<string | null>(null);
  const [selectedCount, setSelectedCount] = useState(0);
  const [savingAssign, setSavingAssign] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const mapRef = useRef<mapboxgl.Map | null>(null);
  const vertices = useRef<Position[]>([]);
  const selected = useRef(new Set<string>());
  const objectMarkers = useRef<mapboxgl.Marker[]>([]);
  const collectionRef = useRef<CollectionDetailDto | null>(null);
  collectionRef.current = collection;

  useEffect(() => {
    (async () => {
      try {
        if (!isNew) {
          const c = await api.collections.get(id);
          setCollection(c);
          setName(c.name);
          setDescription(c.description);
          setCover(c.coverImageUrl ?? '');
          setBonus(String(c.bonusPoints));
          vertices.current = c.zone.coordinates[0].slice(0, -1);
          setVertexCount(vertices.current.length);
          selected.current = new Set(c.items.map((i) => i.objectId));
          setSelectedCount(selected.current.size);
          setCenter({ lon: vertices.current[0][0], lat: vertices.current[0][1] });
        } else {
          setCenter(await locate());
        }
      } catch {
        setLoadError(true);
      }
    })();
  }, [id, isNew]);

  const setVertices = useCallback((next: Position[]) => {
    vertices.current = next;
    setVertexCount(next.length);
    if (mapRef.current) void drawZone(mapRef.current, next);
  }, []);

  /** Mostra els objectes de les rutes pròpies dins de la zona com a marcadors seleccionables. */
  const loadObjectsInZone = useCallback(async () => {
    const map = mapRef.current;
    if (!map || !collectionRef.current || vertices.current.length < 3) return;
    for (const m of objectMarkers.current) m.remove();
    objectMarkers.current = [];
    const ring = [...vertices.current, vertices.current[0]];
    const routes = await api.routes.nearby({ lon: vertices.current[0][0], lat: vertices.current[0][1] });
    let count = 0;
    for (const summary of routes.filter((r) => r.isMine)) {
      const route = await api.routes.get(summary.id);
      for (const object of route.objects) {
        if (!pointInPolygon(object, ring)) continue;
        count++;
        const { marker, img } = createObjectMarker({
          imageUrl: object.imageUrl,
          alt: object.type,
          lon: object.lon,
          lat: object.lat,
          onClick: () => {
            if (selected.current.has(object.id)) selected.current.delete(object.id);
            else selected.current.add(object.id);
            img.classList.toggle('is-selected', selected.current.has(object.id));
            setSelectedCount(selected.current.size);
          },
        });
        img.classList.toggle('is-selected', selected.current.has(object.id));
        objectMarkers.current.push(marker.addTo(map));
      }
    }
    setAssignInfo(count === 0 ? t.editor.noRoutesInZone : null);
  }, []);

  const onMapReady = useCallback(
    (map: mapboxgl.Map) => {
      mapRef.current = map;
      afterMapReady(map, () => {
        void drawZone(map, vertices.current);
        if (!isNew) void loadObjectsInZone();
      });
      map.on('click', (e) => {
        if (objectMarkers.current.length > 0) return; // en mode assignació no s'editen vèrtexs
        setVertices([...vertices.current, [e.lngLat.lng, e.lngLat.lat]]);
      });
    },
    [isNew, loadObjectsInZone, setVertices],
  );

  const onDispose = useCallback(() => {
    for (const m of objectMarkers.current) m.remove();
    objectMarkers.current = [];
    mapRef.current = null;
  }, []);

  const polygon = (): PolygonGeometry => ({ type: 'Polygon', coordinates: [[...vertices.current, vertices.current[0]]] });

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) return toast(t.editor.nameRequired, 'error');
    if (vertices.current.length < 3) return toast(t.editor.zoneNeeded, 'error');
    setSaving(true);
    const body = { name: trimmed, description: description.trim(), zone: polygon(), coverImageUrl: cover.trim() || null, bonusPoints: Math.max(0, Number(bonus) || 0) };
    try {
      const saved = collection ? await api.collections.update(collection.id, body) : await api.collections.create(body);
      setCollection(saved);
      collectionRef.current = saved;
      toast(t.editor.saved, 'success');
      if (isNew) {
        navigate(`/editor/colleccions/${saved.id}`, { replace: true });
        return;
      }
      await loadObjectsInZone();
    } catch (e) {
      toast(e instanceof Error ? e.message : t.app.genericError, 'error');
    } finally {
      setSaving(false);
    }
  };

  const saveAssignment = async () => {
    if (!collection) return;
    setSavingAssign(true);
    try {
      setCollection(await api.collections.assignObjects(collection.id, { objectIds: [...selected.current] }));
      toast(t.editor.saved, 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : t.app.genericError, 'error');
    } finally {
      setSavingAssign(false);
    }
  };

  const remove = async () => {
    if (!collection) return;
    try {
      await api.collections.remove(collection.id);
      toast(t.editor.deleted, 'info');
      navigate('/editor');
    } catch (e) {
      toast(e instanceof Error ? e.message : t.app.genericError, 'error');
      setConfirmDelete(false);
    }
  };

  if (!isEditor) return <Navigate to="/rutes" replace />;

  return (
    <Box position="relative" h="100%" overflow="hidden">
      {center && <MapView center={center} zoom={13} onReady={onMapReady} onDispose={onDispose} />}
      <OverlayTopBar title={t.editor.title} onBack={() => navigate('/editor')} />
      <BottomPanel maxH="60%">
        {loadError && <ErrorView message={t.editor.locationNeeded} onRetry={() => navigate('/editor')} retryLabel={t.app.back} />}
        {!loadError && !center && <LoadingView />}
        {center && (
          <VStack align="stretch" gap="3">
            <Heading as="h2" size="md">
              {isNew ? t.editor.newCollection : t.editor.editCollection}
            </Heading>
            <HStack>
              <Button size="sm" variant="outline" colorPalette="brand" onClick={() => setVertices(vertices.current.slice(0, -1))} disabled={vertexCount === 0}>
                <LuUndo2 /> {t.editor.undoVertex}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setVertices([])} disabled={vertexCount === 0}>
                {t.editor.clearZone}
              </Button>
              <Text fontSize="xs" color="fg.muted">
                {vertexCount < 3 ? t.editor.zoneHint : t.create.points(vertexCount)}
              </Text>
            </HStack>
            <Field.Root required>
              <Field.Label>{t.editor.name}</Field.Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field.Root>
            <Field.Root>
              <Field.Label>{t.editor.description}</Field.Label>
              <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
            </Field.Root>
            <Field.Root>
              <Field.Label>{t.editor.coverImage}</Field.Label>
              <Input type="url" inputMode="url" placeholder="https://" value={cover} onChange={(e) => setCover(e.target.value)} />
            </Field.Root>
            <Field.Root>
              <Field.Label>{t.editor.bonusPoints}</Field.Label>
              <Input type="number" inputMode="numeric" min={0} step={10} value={bonus} onChange={(e) => setBonus(e.target.value)} />
            </Field.Root>
            <Button colorPalette="accent" size="lg" onClick={() => void save()} loading={saving}>
              {t.editor.saveCollection}
            </Button>
            {collection && (
              <VStack align="stretch" gap="2" pt="2" borderTopWidth="1px" borderColor="border">
                <Heading as="h3" size="sm">
                  {t.editor.assignTitle}
                </Heading>
                <Text fontSize="sm" color="fg.muted">
                  {t.editor.assignHint}
                </Text>
                <Badge variant="subtle" alignSelf="flex-start">
                  {assignInfo ?? t.editor.assigned(selectedCount)}
                </Badge>
                <Button colorPalette="brand" size="lg" onClick={() => void saveAssignment()} loading={savingAssign}>
                  {t.editor.assignSave}
                </Button>
                <Button variant="ghost" colorPalette="red" size="lg" onClick={() => setConfirmDelete(true)}>
                  <LuTrash2 /> {t.editor.deleteCollection}
                </Button>
              </VStack>
            )}
          </VStack>
        )}
      </BottomPanel>
      <ConfirmDialog open={confirmDelete} title={t.editor.deleteConfirm} confirmLabel={t.app.delete} danger onConfirm={() => void remove()} onCancel={() => setConfirmDelete(false)} />
    </Box>
  );
}
