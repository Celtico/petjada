import { describe, expect, it } from 'vitest';
import type { ObjectCardDto } from '@petjada/shared';
import { formatCard } from './card';

const base: ObjectCardDto = {
  objectId: 'o1',
  routeId: 'r1',
  routeName: 'Volta al parc',
  type: 'gla',
  imageUrl: '/objects/gla.webp',
  points: 14,
  hasContent: false,
  title: null,
  storyText: null,
  storyImageUrl: null,
  distanceFromStartM: 1250,
  collectionId: null,
  collectionName: null,
};

describe('formatCard', () => {
  it('fitxa genèrica: nom de la ruta i distància recorreguda', () => {
    const vm = formatCard(base);
    expect(vm.title).toContain('Volta al parc');
    expect(vm.text).toContain('1.3 km');
    expect(vm.imageUrl).toBe('/objects/gla.webp');
    expect(vm.collectionLine).toBeNull();
    expect(vm.pointsLine).toContain('14');
  });

  it('fitxa pròpia: títol, text i imatge del contingut', () => {
    const vm = formatCard({
      ...base,
      hasContent: true,
      title: 'La font vella',
      storyText: 'Construïda el 1780.',
      storyImageUrl: 'https://example.org/font.jpg',
      collectionName: 'Peces del Segrià',
    });
    expect(vm.title).toBe('La font vella');
    expect(vm.text).toBe('Construïda el 1780.');
    expect(vm.imageUrl).toBe('https://example.org/font.jpg');
    expect(vm.collectionLine).toContain('Peces del Segrià');
  });

  it('fitxa pròpia sense imatge fa servir la imatge de l’objecte', () => {
    const vm = formatCard({ ...base, hasContent: true, title: 'Títol', storyText: 'Text' });
    expect(vm.imageUrl).toBe('/objects/gla.webp');
  });

  it('distàncies curtes en metres', () => {
    const vm = formatCard({ ...base, distanceFromStartM: 240 });
    expect(vm.text).toContain('240 m');
  });
});
