import { afterMapReady } from '../map/create-map';
import { Badge, Box, Button, Field, HStack, Input, SegmentGroup, Switch, Text, Textarea, VStack } from '@chakra-ui/react';
import mapboxgl from 'mapbox-gl';
import {
  AUTO_ROUTE_LENGTHS_M,
  STORY_TEXT_MAX_LENGTH,
  objectImageUrl,
  type AutoRouteLengthM,
  type CreateRouteObjectInput,
  type LngLat,
  type PlacedObjectDto,
  type PreviewRouteResponse,
} from '@petjada/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { LuUndo2, LuTrash2 } from 'react-icons/lu';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { OverlayTopBar } from '../components/AppShell';
import { BottomPanel, SheetDialog } from '../components/BottomSheet';
import { MapView } from '../components/MapView';
import { ErrorView, LoadingView } from '../components/StatusViews';
import { toast } from '../components/ui/toaster';
import { t } from '../i18n/ca';
import { themeColor } from '../map/colors';
import { drawRoute, fitRoute } from '../map/route-layer';
import { locate } from './location';
import { createObjectMarker, createWaypointMarker } from './markers';

type Mode = 'auto' | 'manual';

interface DraftObject extends PlacedObjectDto {
  title: string | null;
  storyText: string | null;
  storyImageUrl: string | null;
  marker: mapboxgl.Marker;
  img: HTMLImageElement;
}

const PREVIEW_DEBOUNCE_MS = 600;
const LONG_PRESS_MS = 500;

/** Full per editar la fitxa d'un objecte proposat. */
function DraftContentSheet({
  draft,
  onSave,
  onRemove,
  onClose,
}: {
  draft: DraftObject | null;
  onSave: (content: { title: string | null; storyText: string | null; storyImageUrl: string | null }) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState('');
  const [story, setStory] = useState('');
  const [image, setImage] = useState('');
  useEffect(() => {
    setTitle(draft?.title ?? '');
    setStory(draft?.storyText ?? '');
    setImage(draft?.storyImageUrl ?? '');
  }, [draft]);
  return (
    <SheetDialog
      open={draft !== null}
      onClose={onClose}
      title={t.create.objectSheetTitle}
      primaryLabel={t.app.save}
      onPrimary={() => onSave({ title: title.trim() || null, storyText: story.trim() || null, storyImageUrl: image.trim() || null })}
    >
      <VStack align="stretch" gap="4">
        <Text color="fg.muted" fontSize="sm">
          {t.create.objectSheetHint}
        </Text>
        <Field.Root>
          <Field.Label>{t.create.objectTitle}</Field.Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field.Root>
        <Field.Root>
          <Field.Label>{t.create.objectStory}</Field.Label>
          <Textarea rows={4} maxLength={STORY_TEXT_MAX_LENGTH} value={story} onChange={(e) => setStory(e.target.value)} />
          <Field.HelperText>{t.create.charsLeft(STORY_TEXT_MAX_LENGTH - story.length)}</Field.HelperText>
        </Field.Root>
        <Field.Root>
          <Field.Label>{t.create.objectImage}</Field.Label>
          <Input type="url" inputMode="url" placeholder="https://" value={image} onChange={(e) => setImage(e.target.value)} />
        </Field.Root>
        <Button variant="ghost" colorPalette="red" size="lg" onClick={onRemove}>
          <LuTrash2 /> {t.create.removeObject}
        </Button>
      </VStack>
    </SheetDialog>
  );
}

export function CreateRouteScreen() {
  const navigate = useNavigate();
  const [origin, setOrigin] = useState<LngLat | null>(null);
  const [locationError, setLocationError] = useState(false);
  const [mode, setMode] = useState<Mode>('auto');
  const [roundTrip, setRoundTrip] = useState(true);
  const [targetLength, setTargetLength] = useState<AutoRouteLengthM>(AUTO_ROUTE_LENGTHS_M[1]);
  const [preview, setPreview] = useState<PreviewRouteResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [waypointCount, setWaypointCount] = useState(0);
  const [draftCount, setDraftCount] = useState(0);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [editing, setEditing] = useState<DraftObject | null>(null);

  const mapRef = useRef<mapboxgl.Map | null>(null);
  const modeRef = useRef<Mode>('auto');
  const previewRef = useRef<PreviewRouteResponse | null>(null);
  const waypoints = useRef<LngLat[]>([]);
  const waypointMarkers = useRef<mapboxgl.Marker[]>([]);
  const drafts = useRef<DraftObject[]>([]);
  const previewTimer = useRef<number | null>(null);
  const pressTimer = useRef<number | null>(null);
  const longPressed = useRef(false);
  const runPreviewRef = useRef<() => Promise<void>>(async () => undefined);

  modeRef.current = mode;
  previewRef.current = preview;

  useEffect(() => {
    locate()
      .then(setOrigin)
      .catch(() => setLocationError(true));
  }, []);

  const clearDrafts = useCallback(() => {
    for (const d of drafts.current) d.marker.remove();
    drafts.current = [];
    setDraftCount(0);
  }, []);

  const clearPreview = useCallback(() => {
    setPreview(null);
    previewRef.current = null;
    clearDrafts();
    if (mapRef.current) void drawRoute(mapRef.current, null);
    setError(null);
  }, [clearDrafts]);

  const clearWaypoints = useCallback(() => {
    waypoints.current = [];
    for (const m of waypointMarkers.current) m.remove();
    waypointMarkers.current = [];
    setWaypointCount(0);
  }, []);

  const createDraft = useCallback(
    (placed: PlacedObjectDto, content?: Partial<DraftObject>): DraftObject => {
      const map = mapRef.current!;
      const manual = modeRef.current === 'manual';
      let draftRef: DraftObject | null = null;
      const { marker, img } = createObjectMarker({
        imageUrl: objectImageUrl(placed.type),
        alt: placed.type,
        lon: placed.lon,
        lat: placed.lat,
        draggable: manual,
        onClick: manual ? () => setEditing(draftRef) : undefined,
      });
      marker.addTo(map);
      const draft: DraftObject = {
        ...placed,
        title: content?.title ?? null,
        storyText: content?.storyText ?? null,
        storyImageUrl: content?.storyImageUrl ?? null,
        marker,
        img,
      };
      draftRef = draft;
      marker.on('dragend', () => {
        const p = marker.getLngLat();
        draft.lon = p.lng;
        draft.lat = p.lat;
      });
      return draft;
    },
    [],
  );

  const runPreview = useCallback(async () => {
    const map = mapRef.current;
    if (!map || !origin) return;
    const currentMode = modeRef.current;
    if (currentMode === 'manual' && waypoints.current.length < 2) {
      setError(t.create.manualNeedsTwo);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api.routes.preview(
        currentMode === 'auto'
          ? { mode: 'auto', origin, targetLengthM: targetLength, roundTrip }
          : { mode: 'manual', waypoints: [...waypoints.current], roundTrip },
      );
      setPreview(res);
      previewRef.current = res;
      void drawRoute(map, res.geometry);
      fitRoute(map, res.geometry, 80);
      clearDrafts();
      drafts.current = res.objects.map((o) => createDraft(o));
      setDraftCount(drafts.current.length);
      setName((v) => v || res.suggestedName);
      setDescription((v) => v || res.suggestedDescription);
    } catch {
      setError(t.create.previewError);
    } finally {
      setBusy(false);
    }
  }, [origin, targetLength, roundTrip, clearDrafts, createDraft]);
  runPreviewRef.current = runPreview;

  const schedulePreview = useCallback(() => {
    if (previewTimer.current !== null) window.clearTimeout(previewTimer.current);
    if (waypoints.current.length < 2) return;
    previewTimer.current = window.setTimeout(() => void runPreviewRef.current(), PREVIEW_DEBOUNCE_MS);
  }, []);

  const addWaypoint = useCallback(
    (p: LngLat) => {
      const map = mapRef.current;
      if (!map) return;
      waypoints.current.push(p);
      waypointMarkers.current.push(createWaypointMarker(p.lon, p.lat, waypoints.current.length === 1).addTo(map));
      setWaypointCount(waypoints.current.length);
      schedulePreview();
    },
    [schedulePreview],
  );

  const removeLastWaypoint = useCallback(() => {
    waypoints.current.pop();
    waypointMarkers.current.pop()?.remove();
    setWaypointCount(waypoints.current.length);
    if (waypoints.current.length < 2) clearPreview();
    else schedulePreview();
  }, [clearPreview, schedulePreview]);

  const addDraftObject = useCallback(
    (p: LngLat) => {
      if (!previewRef.current) return;
      drafts.current.push(createDraft({ lon: p.lon, lat: p.lat, type: 'gla', leg: 'anada', points: 0, distanceFromStartM: 0 }));
      setDraftCount(drafts.current.length);
    },
    [createDraft],
  );

  const onMapReady = useCallback(
    (map: mapboxgl.Map) => {
      mapRef.current = map;
      afterMapReady(map, () => {
        if (origin) new mapboxgl.Marker({ color: themeColor('accent.500') }).setLngLat([origin.lon, origin.lat]).addTo(map);
      });
      const cancelPress = () => {
        if (pressTimer.current !== null) window.clearTimeout(pressTimer.current);
        pressTimer.current = null;
      };
      const startPress = (lngLat: mapboxgl.LngLat) => {
        cancelPress();
        if (modeRef.current !== 'manual' || !previewRef.current) return;
        pressTimer.current = window.setTimeout(() => {
          longPressed.current = true;
          addDraftObject({ lon: lngLat.lng, lat: lngLat.lat });
        }, LONG_PRESS_MS);
      };
      map.on('mousedown', (e) => startPress(e.lngLat));
      map.on('touchstart', (e) => startPress(e.lngLat));
      map.on('mouseup', cancelPress);
      map.on('touchend', cancelPress);
      map.on('dragstart', cancelPress);
      map.on('click', (e) => {
        if (modeRef.current !== 'manual' || longPressed.current) {
          longPressed.current = false;
          return;
        }
        addWaypoint({ lon: e.lngLat.lng, lat: e.lngLat.lat });
      });
    },
    [origin, addDraftObject, addWaypoint],
  );

  const onDispose = useCallback(() => {
    if (previewTimer.current !== null) window.clearTimeout(previewTimer.current);
    for (const d of drafts.current) d.marker.remove();
    for (const m of waypointMarkers.current) m.remove();
    mapRef.current = null;
  }, []);

  const changeMode = (next: Mode) => {
    setMode(next);
    modeRef.current = next;
    clearPreview();
    clearWaypoints();
  };

  const save = async () => {
    const current = previewRef.current;
    if (!current) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError(t.create.nameRequired);
      return;
    }
    setSaving(true);
    const objects: CreateRouteObjectInput[] | undefined =
      mode === 'manual'
        ? drafts.current.map((d) => ({ lon: d.lon, lat: d.lat, type: d.type, leg: d.leg, title: d.title, storyText: d.storyText, storyImageUrl: d.storyImageUrl }))
        : undefined;
    try {
      const created = await api.routes.create({ name: trimmed, description: description.trim(), isPublic, roundTrip, geometry: current.geometry, objects });
      navigate(`/rutes/${created.id}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : t.create.saveError, 'error');
      setSaving(false);
    }
  };

  const status = busy ? t.create.generating : mode === 'auto' ? t.create.autoHint : preview ? t.create.manualObjectsHint : t.create.manualHint;

  return (
    <Box position="relative" h="100%" overflow="hidden">
      {origin && <MapView center={origin} zoom={15.5} pitch={40} onReady={onMapReady} onDispose={onDispose} />}
      <OverlayTopBar title={t.create.title} onBack={() => navigate('/rutes')} />
      <BottomPanel maxH="60%">
        {locationError && <ErrorView message={t.create.locationNeeded} onRetry={() => navigate('/rutes')} retryLabel={t.app.back} />}
        {!locationError && !origin && <LoadingView label={t.routes.locating} />}
        {origin && (
          <VStack align="stretch" gap="3">
            <SegmentGroup.Root size="lg" value={mode} onValueChange={(e) => changeMode(e.value as Mode)}>
              <SegmentGroup.Indicator />
              <SegmentGroup.Items items={[{ value: 'auto', label: t.create.modeAuto }, { value: 'manual', label: t.create.modeManual }]} />
            </SegmentGroup.Root>
            <Text color="fg.muted" fontSize="sm">
              {status}
            </Text>
            {mode === 'auto' && (
              <>
                <SegmentGroup.Root size="md" value={String(targetLength)} onValueChange={(e) => setTargetLength(Number(e.value) as AutoRouteLengthM)}>
                  <SegmentGroup.Indicator />
                  <SegmentGroup.Items items={AUTO_ROUTE_LENGTHS_M.map((len) => ({ value: String(len), label: t.create.lengthKm(len / 1000) }))} />
                </SegmentGroup.Root>
                <Button colorPalette="brand" size="lg" onClick={() => void runPreview()} loading={busy}>
                  {preview ? t.create.regenerate : t.create.generate}
                </Button>
              </>
            )}
            {mode === 'manual' && (
              <HStack>
                <Button variant="outline" colorPalette="brand" size="lg" onClick={removeLastWaypoint} disabled={waypointCount === 0}>
                  <LuUndo2 /> {t.create.undo}
                </Button>
                <Button variant="ghost" size="lg" onClick={() => { clearWaypoints(); clearPreview(); }} disabled={waypointCount === 0}>
                  {t.create.clear}
                </Button>
                <Badge variant="subtle" size="lg">
                  {t.create.points(waypointCount)}
                </Badge>
              </HStack>
            )}
            <Switch.Root size="lg" checked={roundTrip} onCheckedChange={(e) => { setRoundTrip(e.checked); if (previewRef.current) window.setTimeout(() => void runPreviewRef.current(), 0); }}>
              <Switch.HiddenInput />
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
              <Switch.Label>{t.create.roundTrip}</Switch.Label>
            </Switch.Root>
            {error && (
              <Text color="fg.error" fontSize="sm">
                {error}
              </Text>
            )}
            {preview && (
              <VStack align="stretch" gap="3" pt="2" borderTopWidth="1px" borderColor="border">
                <HStack>
                  <Badge variant="subtle" size="lg">{t.create.length_m(t.units.distance(preview.lengthM))}</Badge>
                  <Badge colorPalette="accent" size="lg">{t.create.objectsCount(draftCount)}</Badge>
                </HStack>
                <Field.Root required>
                  <Field.Label>{t.create.name}</Field.Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
                </Field.Root>
                <Field.Root>
                  <Field.Label>{t.create.description}</Field.Label>
                  <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
                </Field.Root>
                <Switch.Root size="lg" checked={isPublic} onCheckedChange={(e) => setIsPublic(e.checked)}>
                  <Switch.HiddenInput />
                  <Switch.Control>
                    <Switch.Thumb />
                  </Switch.Control>
                  <Switch.Label>
                    {t.create.isPublic}
                    <Text as="span" display="block" fontSize="xs" color="fg.muted">
                      {t.create.isPublicHint}
                    </Text>
                  </Switch.Label>
                </Switch.Root>
                <Button colorPalette="accent" size="lg" onClick={() => void save()} loading={saving}>
                  {t.create.save}
                </Button>
              </VStack>
            )}
          </VStack>
        )}
      </BottomPanel>
      <DraftContentSheet
        draft={editing}
        onClose={() => setEditing(null)}
        onSave={(content) => {
          if (editing) {
            Object.assign(editing, content);
            editing.img.classList.toggle('has-content', Boolean(content.title || content.storyText));
          }
          setEditing(null);
        }}
        onRemove={() => {
          if (editing) {
            editing.marker.remove();
            drafts.current = drafts.current.filter((d) => d !== editing);
            setDraftCount(drafts.current.length);
          }
          setEditing(null);
        }}
      />
    </Box>
  );
}
