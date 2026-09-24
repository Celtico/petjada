import { Badge, Box, Field, Heading, HStack, Image, Input, Text, Textarea, VStack } from '@chakra-ui/react';
import { STORY_TEXT_MAX_LENGTH, type RouteDetailDto, type RouteObjectContentDto } from '@petjada/shared';
import { useCallback, useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { useIsEditor } from '../auth/use-session';
import { Page } from '../components/AppShell';
import { SheetDialog } from '../components/BottomSheet';
import { ErrorView, LoadingView } from '../components/StatusViews';
import { toast } from '../components/ui/toaster';
import { t } from '../i18n/ca';

function EditCardSheet({ object, onClose, onSaved }: { object: RouteObjectContentDto | null; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState('');
  const [story, setStory] = useState('');
  const [image, setImage] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setTitle(object?.title ?? '');
    setStory(object?.storyText ?? '');
    setImage(object?.storyImageUrl ?? '');
  }, [object]);

  const save = async () => {
    if (!object) return;
    setSaving(true);
    try {
      await api.objects.updateContent(object.id, { title: title.trim() || null, storyText: story.trim() || null, storyImageUrl: image.trim() || null });
      toast(t.create.objectSaved, 'success');
      onSaved();
    } catch (e) {
      toast(e instanceof Error ? e.message : t.app.genericError, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SheetDialog open={object !== null} onClose={onClose} title={t.create.objectSheetTitle} primaryLabel={t.app.save} onPrimary={() => void save()} primaryDisabled={saving}>
      {object && (
        <VStack align="stretch" gap="4">
          <Image src={object.imageUrl} alt={object.type} boxSize="24" objectFit="contain" mx="auto" />
          <Field.Root>
            <Field.Label>{t.create.objectTitle}</Field.Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field.Root>
          <Field.Root>
            <Field.Label>{t.create.objectStory}</Field.Label>
            <Textarea rows={5} maxLength={STORY_TEXT_MAX_LENGTH} value={story} onChange={(e) => setStory(e.target.value)} />
            <Field.HelperText>{t.create.charsLeft(STORY_TEXT_MAX_LENGTH - story.length)}</Field.HelperText>
          </Field.Root>
          <Field.Root>
            <Field.Label>{t.create.objectImage}</Field.Label>
            <Input type="url" inputMode="url" placeholder="https://" value={image} onChange={(e) => setImage(e.target.value)} />
          </Field.Root>
        </VStack>
      )}
    </SheetDialog>
  );
}

type State = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; route: RouteDetailDto; objects: RouteObjectContentDto[] };

export function EditorRouteCardsScreen() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const isEditor = useIsEditor();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [editing, setEditing] = useState<RouteObjectContentDto | null>(null);

  const load = useCallback(async () => {
    try {
      const [route, objects] = await Promise.all([api.routes.get(id), api.routes.objectsContent(id)]);
      setState({ kind: 'ready', route, objects });
    } catch (e) {
      setState({ kind: 'error', message: e instanceof Error ? e.message : t.app.genericError });
    }
  }, [id]);

  useEffect(() => {
    if (isEditor) void load();
  }, [isEditor, load]);

  if (!isEditor) return <Navigate to="/rutes" replace />;

  return (
    <Page title={state.kind === 'ready' ? t.editor.cardsTitle(state.route.name) : t.editor.title} onBack={() => navigate('/editor')}>
      {state.kind === 'loading' && <LoadingView />}
      {state.kind === 'error' && <ErrorView message={state.message} onRetry={() => void load()} />}
      {state.kind === 'ready' && (
        <VStack align="stretch" gap="3">
          {state.objects.length === 0 && (
            <Text fontSize="sm" color="fg.muted">
              {t.editor.noObjects}
            </Text>
          )}
          {state.objects.map((object) => (
            <HStack key={object.id} as="button" textAlign="left" w="100%" bg="bg.panel" rounded="xl" shadow="sm" p="3" gap="3" align="flex-start" onClick={() => setEditing(object)}>
              <Image src={object.imageUrl} alt={object.type} boxSize="16" objectFit="contain" flexShrink={0} />
              <Box flex="1" minW="0">
                <Heading as="h3" size="sm">
                  {object.title ?? t.objects.names[object.type] ?? object.type}
                </Heading>
                <Text fontSize="sm" color="fg.muted" lineClamp={2}>
                  {object.storyText ?? `${t.units.distance(object.distanceFromStartM)}, ${object.leg}`}
                </Text>
                <HStack gap="2" mt="1">
                  <Badge variant="subtle">{`${object.points} ${t.app.points}`}</Badge>
                  {(object.title || object.storyText) && <Badge colorPalette="accent">{t.routes.hasContent}</Badge>}
                </HStack>
              </Box>
            </HStack>
          ))}
        </VStack>
      )}
      <EditCardSheet
        object={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          void load();
        }}
      />
    </Page>
  );
}
