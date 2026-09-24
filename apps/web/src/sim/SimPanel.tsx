import { Badge, Box, Button, Heading, HStack, IconButton, Slider, Text, VStack } from '@chakra-ui/react';
import { useEffect, useReducer, useState } from 'react';
import { LuGauge, LuPause, LuPlay, LuRotateCcw } from 'react-icons/lu';
import { t } from '../i18n/ca';
import { simulation } from './index';

const MULTIPLIERS = [1, 4, 10];

function LabeledSlider({
  label,
  value,
  min,
  max,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  onChange: (v: number) => void;
}) {
  return (
    <Slider.Root size="sm" min={min} max={max} step={1} value={[value]} onValueChange={(e) => onChange(e.value[0])}>
      <HStack justify="space-between">
        <Slider.Label fontSize="xs">{label}</Slider.Label>
        <Text fontSize="xs">
          {value}
          {unit}
        </Text>
      </HStack>
      <Slider.Control>
        <Slider.Track>
          <Slider.Range />
        </Slider.Track>
        <Slider.Thumb index={0} />
      </Slider.Control>
    </Slider.Root>
  );
}

/** Panell flotant de simulació (només si `VITE_ENABLE_SIM`). */
export function SimPanel() {
  const [open, setOpen] = useState(false);
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const [multiplier, setMultiplier] = useState(1);
  const [heading, setHeading] = useState(0);
  const [pitch, setPitch] = useState(0);
  const [accuracy, setAccuracy] = useState(8);

  useEffect(() => {
    const offA = simulation.onChange(rerender);
    const offB = simulation.position.onProgress(rerender);
    return () => {
      offA();
      offB();
    };
  }, []);

  if (!simulation.enabled) return null;
  const sim = simulation.position;
  const active = simulation.isActive;

  return (
    <Box position="fixed" left="3" bottom="calc(var(--chakra-spacing-safe-bottom) + var(--chakra-spacing-20))" zIndex={20}>
      {open && (
        <VStack
          align="stretch"
          gap="2"
          bg="bg.panel"
          rounded="xl"
          shadow="lg"
          p="3"
          mb="2"
          w="72"
          maxW="calc(100vw - 24px)"
          fontSize="sm"
        >
          <Heading as="h4" size="sm">
            {t.sim.title}
          </Heading>
          <Button size="sm" colorPalette="brand" variant={active ? 'solid' : 'outline'} onClick={() => simulation.setActive(!active)}>
            {active ? `${t.sim.title}: ON` : t.sim.off}
          </Button>
          <HStack>
            <Button size="sm" flex="1" variant={sim.currentMode === 'follow' ? 'solid' : 'outline'} colorPalette="brand" onClick={() => { sim.setMode('follow'); rerender(); }}>
              {t.sim.followRoute}
            </Button>
            <Button size="sm" flex="1" variant={sim.currentMode === 'click' ? 'solid' : 'outline'} colorPalette="brand" onClick={() => { sim.setMode('click'); rerender(); }}>
              {t.sim.clickMap}
            </Button>
          </HStack>
          <HStack>
            <IconButton aria-label={sim.isPlaying ? t.sim.pause : t.sim.play} size="sm" colorPalette="accent" disabled={!sim.hasTrack} onClick={() => { if (sim.isPlaying) sim.pause(); else sim.play(); rerender(); }}>
              {sim.isPlaying ? <LuPause /> : <LuPlay />}
            </IconButton>
            <IconButton aria-label={t.sim.reset} size="sm" variant="outline" onClick={() => { sim.reset(); rerender(); }}>
              <LuRotateCcw />
            </IconButton>
            <Badge colorPalette="brand">{t.sim.progress(Math.round(sim.progressFraction * 100))}</Badge>
          </HStack>
          <HStack>
            <Text fontSize="xs" w="16">{t.sim.speed}</Text>
            {MULTIPLIERS.map((m) => (
              <Button key={m} size="xs" variant={multiplier === m ? 'solid' : 'outline'} colorPalette="brand" onClick={() => { sim.setMultiplier(m); setMultiplier(m); }}>
                {`${m}x`}
              </Button>
            ))}
          </HStack>
          <LabeledSlider label={t.sim.heading} value={heading} min={0} max={359} unit="°" onChange={(v) => { setHeading(v); simulation.orientation.setHeading(v); }} />
          <LabeledSlider label={t.sim.pitch} value={pitch} min={-60} max={60} unit="°" onChange={(v) => { setPitch(v); simulation.orientation.setPitch(v); }} />
          <LabeledSlider label={t.sim.accuracy} value={accuracy} min={3} max={60} unit=" m" onChange={(v) => { setAccuracy(v); sim.setAccuracy(v); }} />
          <Text fontSize="xs" color="fg.muted">
            {sim.currentMode === 'follow' ? (sim.hasTrack ? '' : t.sim.noRoute) : t.sim.clickHint}
          </Text>
        </VStack>
      )}
      <IconButton aria-label={t.sim.toggle} rounded="full" size="lg" colorPalette={active ? 'accent' : 'brand'} variant={active ? 'solid' : 'subtle'} shadow="md" onClick={() => setOpen((v) => !v)}>
        <LuGauge />
      </IconButton>
    </Box>
  );
}
