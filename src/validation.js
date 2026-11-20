export const districts = ['Los Olivos', 'Comas', 'San Martín de Porres', 'Independencia'];
export const categories = ['Heces', 'Orina', 'Mascota suelta'];
export function validatePet(pet) {
  if (!pet.name?.trim() || pet.name.trim().length > 80) return 'Escribe un nombre de hasta 80 caracteres.';
  if (!districts.includes(pet.district)) return 'Selecciona un distrito válido.';
  return '';
}
export function validateReport(report) {
  if (!districts.includes(report.district) || !categories.includes(report.category)) return 'Selecciona distrito y categoría.';
  if (!report.address?.trim() || report.address.trim().length < 3) return 'Escribe una ubicación o referencia.';
  if (!report.description?.trim() || report.description.trim().length < 5) return 'Describe el problema en al menos cinco caracteres.';
  return '';
}
export function validatePhoto(file) {
  if (!file) return '';
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return 'La foto debe ser JPG, PNG o WebP.';
  if (file.size > 5 * 1024 * 1024) return 'La foto debe pesar menos de 5 MB.';
  return '';
}
