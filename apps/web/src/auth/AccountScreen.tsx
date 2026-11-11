import { Avatar, Box, Button, Field, Heading, HStack, Input, PinInput, Text, VStack } from '@chakra-ui/react';
import { LOGIN_CODE_LENGTH } from '@petjada/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { LuLogOut, LuMail, LuTrash2 } from 'react-icons/lu';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { Page } from '../components/AppShell';
import { LoadingView } from '../components/StatusViews';
import { ThemeToggle } from '../components/ThemeToggle';
import { toast } from '../components/ui/toaster';
import { config } from '../config';
import { t } from '../i18n/ca';
import { session } from './session';
import { useSession } from './use-session';

function authErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return t.auth.errors[error.code] ?? error.message;
  return t.app.genericError;
}

/** Bloc "crea un compte" per a convidats: email i codi de 6 xifres. */
function GuestBlock() {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState<string[]>([]);
  const [expiresIn, setExpiresIn] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendLink = async (event?: FormEvent) => {
    event?.preventDefault();
    const trimmed = email.trim();
    if (!trimmed.includes('@')) {
      setError(t.auth.errors.VALIDATION);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setExpiresIn(await session.requestMagicLink(trimmed));
      setEmail(trimmed);
      setCode([]);
      setStep('code');
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const verify = async (event?: FormEvent) => {
    event?.preventDefault();
    const value = code.join('').replace(/\D/g, '');
    if (value.length !== LOGIN_CODE_LENGTH) {
      setError(t.auth.errors.INVALID_CODE);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const user = await session.verifyCode(email, value);
      toast(t.auth.welcome(user.displayName), 'success', 4000);
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box bg="bg.panel" rounded="xl" shadow="sm" p="4">
      {step === 'email' ? (
        <form onSubmit={(e) => void sendLink(e)}>
          <VStack align="stretch" gap="4">
            <Heading as="h2" size="md">
              {t.auth.guestTitle}
            </Heading>
            <Text fontSize="sm" color="fg.muted">
              {t.auth.guestIntro}
            </Text>
            <Field.Root invalid={error !== null}>
              <Field.Label>{t.auth.email}</Field.Label>
              <Input type="email" inputMode="email" autoComplete="email" placeholder="nom@exemple.cat" value={email} onChange={(e) => setEmail(e.target.value)} />
              {error && <Field.ErrorText>{error}</Field.ErrorText>}
            </Field.Root>
            <Button type="submit" colorPalette="brand" size="lg" loading={busy}>
              <LuMail /> {t.auth.sendLink}
            </Button>
          </VStack>
        </form>
      ) : (
        <form onSubmit={(e) => void verify(e)}>
          <VStack align="stretch" gap="4">
            <Heading as="h2" size="md">
              {t.auth.checkEmailTitle}
            </Heading>
            <Text>{t.auth.checkEmailIntro(email)}</Text>
            <Text fontSize="sm" color="fg.muted">
              {t.auth.checkEmailHint}
            </Text>
            <Text fontSize="sm" color="fg.muted">
              {t.auth.expiresIn(Math.max(1, Math.round(expiresIn / 60)))}
            </Text>
            <Field.Root invalid={error !== null}>
              <Field.Label>{t.auth.codeLabel}</Field.Label>
              <PinInput.Root otp size="lg" value={code} onValueChange={(e) => setCode(e.value)} autoFocus>
                <PinInput.HiddenInput />
                <PinInput.Control>
                  {Array.from({ length: LOGIN_CODE_LENGTH }, (_, i) => (
                    <PinInput.Input key={i} index={i} inputMode="numeric" autoComplete="one-time-code" />
                  ))}
                </PinInput.Control>
              </PinInput.Root>
              {error && <Field.ErrorText>{error}</Field.ErrorText>}
            </Field.Root>
            <Button type="submit" colorPalette="brand" size="lg" loading={busy}>
              {t.auth.verify}
            </Button>
            <HStack>
              <Button variant="ghost" size="sm" onClick={() => void sendLink()} disabled={busy}>
                {t.auth.resend}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { setStep('email'); setError(null); }}>
                {t.auth.changeEmail}
              </Button>
            </HStack>
          </VStack>
        </form>
      )}
    </Box>
  );
}

/** Mode local: no hi ha comptes; avisa que les dades viuen només al dispositiu. */
function LocalNotice() {
  return (
    <Box bg="bg.panel" rounded="xl" shadow="sm" p="4">
      <VStack align="stretch" gap="2">
        <Heading as="h2" size="md">
          {t.auth.localTitle}
        </Heading>
        <Text fontSize="sm" color="fg.muted">
          {t.auth.localIntro}
        </Text>
      </VStack>
    </Box>
  );
}

/** Perfil: àlies, avatar, tancar sessió i esborrar el compte. */
function ProfileBlock() {
  const user = useSession()!;
  const [name, setName] = useState(user.displayName);
  const [avatar, setAvatar] = useState(user.avatarUrl ?? '');
  const [saving, setSaving] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [confirmWord, setConfirmWord] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setName(user.displayName);
    setAvatar(user.avatarUrl ?? '');
  }, [user.id, user.displayName, user.avatarUrl]);

  const save = async () => {
    setSaving(true);
    try {
      await session.updateProfile(name.trim() || user.displayName, avatar.trim() || null);
      toast(t.auth.profileSaved, 'success');
    } catch (e) {
      toast(authErrorMessage(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await session.deleteAccount();
      toast(t.auth.deleteDone, 'info');
      setShowDelete(false);
      setConfirmWord('');
    } catch (e) {
      toast(authErrorMessage(e), 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Box bg="bg.panel" rounded="xl" shadow="sm" p="4">
      <VStack align="stretch" gap="4">
        <HStack gap="3">
          <Avatar.Root size="xl" colorPalette="brand">
            <Avatar.Fallback name={user.displayName} />
            {user.avatarUrl && <Avatar.Image src={user.avatarUrl} alt="" />}
          </Avatar.Root>
          <Box>
            <Heading as="h2" size="md">
              {user.displayName}
            </Heading>
            <Text fontSize="sm" color="fg.muted">
              {t.auth.totalPoints(user.totalPoints)}
            </Text>
          </Box>
        </HStack>
        {user.email && (
          <Text fontSize="sm" color="fg.muted">
            {user.email}. {t.auth.emailPrivate}
          </Text>
        )}
        <Field.Root>
          <Field.Label>{t.auth.displayName}</Field.Label>
          <Input value={name} autoComplete="nickname" onChange={(e) => setName(e.target.value)} />
          <Field.HelperText>{t.auth.displayNameHint}</Field.HelperText>
        </Field.Root>
        <Field.Root>
          <Field.Label>{t.auth.avatarUrl}</Field.Label>
          <Input type="url" inputMode="url" placeholder="https://" value={avatar} onChange={(e) => setAvatar(e.target.value)} />
        </Field.Root>
        <Button colorPalette="brand" size="lg" onClick={() => void save()} loading={saving}>
          {t.auth.saveProfile}
        </Button>
        {!user.isGuest && (
          <Button variant="outline" colorPalette="brand" size="lg" onClick={() => void session.logout().then(() => toast(t.auth.logoutDone, 'info'))}>
            <LuLogOut /> {t.auth.logout}
          </Button>
        )}
        <Button variant="ghost" colorPalette="red" size="lg" onClick={() => setShowDelete((v) => !v)}>
          <LuTrash2 /> {t.auth.deleteAccount}
        </Button>
        {showDelete && (
          <VStack align="stretch" gap="3" borderWidth="1px" borderColor="red.solid" rounded="xl" p="3">
            <Heading as="h3" size="sm">
              {t.auth.deleteConfirmTitle}
            </Heading>
            <Text fontSize="sm" color="fg.muted">
              {t.auth.deleteConfirmText}
            </Text>
            <Field.Root>
              <Field.Label>{t.auth.deleteConfirmType}</Field.Label>
              <Input value={confirmWord} autoComplete="off" placeholder={t.auth.deleteConfirmWord} onChange={(e) => setConfirmWord(e.target.value)} />
            </Field.Root>
            <Button colorPalette="red" size="lg" disabled={confirmWord.trim() !== t.auth.deleteConfirmWord} loading={deleting} onClick={() => void remove()}>
              {t.app.delete}
            </Button>
          </VStack>
        )}
      </VStack>
    </Box>
  );
}

export function AccountScreen() {
  const user = useSession();
  return (
    <Page title={t.auth.accountTitle}>
      {!user ? (
        <LoadingView />
      ) : (
        <VStack align="stretch" gap="4">
          {config.backend === 'local' ? <LocalNotice /> : user.isGuest && <GuestBlock />}
          <ThemeToggle />
          <ProfileBlock />
        </VStack>
      )}
    </Page>
  );
}

/** `#/auth/done`: destí de l'enllaç màgic al navegador. Renova la sessió amb la cookie. */
export function AuthDoneScreen() {
  const navigate = useNavigate();
  useEffect(() => {
    void session.refresh().then((ok) => {
      toast(ok ? t.auth.linkDone : t.auth.linkFailed, ok ? 'success' : 'error', 4000);
      navigate(ok ? '/rutes' : '/compte', { replace: true });
    });
  }, [navigate]);
  return <LoadingView />;
}

/** `#/auth/error?code=`: l'enllaç màgic no era vàlid. */
export function AuthErrorScreen() {
  const navigate = useNavigate();
  useEffect(() => {
    const code = new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('code') ?? '';
    toast(t.auth.errors[code] ?? t.auth.linkFailed, 'error', 5000);
    navigate('/compte', { replace: true });
  }, [navigate]);
  return <LoadingView />;
}
