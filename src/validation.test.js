import { describe, expect, it } from 'vitest';
import { validatePet, validateReport, validatePhoto } from './validation.js';
describe('formularios ciudadanos', () => {
  it('rechaza mascotas sin nombre', () => expect(validatePet({ name: ' ', district: 'Comas' })).toMatch(/nombre/));
  it('exige descripción útil y ubicación', () => expect(validateReport({ district: 'Comas', category: 'Heces', address: 'Parque central', description: 'Mal' })).toMatch(/cinco/));
  it('acepta reportes completos', () => expect(validateReport({ district: 'Comas', category: 'Heces', address: 'Parque central', description: 'Heces en la vereda' })).toBe(''));
  it('rechaza archivos no fotográficos', () => expect(validatePhoto(new File(['x'], 'x.txt', { type: 'text/plain' }))).toMatch(/JPG/));
});
