// Volume-to-weight approximations by food density category.
// All values in grams per unit.
const DENSITY_TABLE = {
  liquid:  { cup: 240, tbsp: 15, tsp: 5 },   // milk, soup, yogurt, juice, oil
  dense:   { cup: 195, tbsp: 12, tsp: 4 },   // cooked rice, oats, pasta, beans
  chopped: { cup: 130, tbsp:  8, tsp: 3 },   // raw veg, fruit, nuts, cheese
  leafy:   { cup:  45, tbsp:  3, tsp: 1 },   // spinach, flour, protein powder
}

const OZ_TO_G = 28.35

export const DENSITY_OPTIONS = [
  { value: 'liquid',  label: 'Liquid / Creamy', hint: 'milk, soup, yogurt, juice, oil' },
  { value: 'dense',   label: 'Cooked / Dense',  hint: 'rice, oats, pasta, beans' },
  { value: 'chopped', label: 'Chopped / Diced', hint: 'raw veg, fruit, nuts, cheese' },
  { value: 'leafy',   label: 'Leafy / Fluffy',  hint: 'greens, flour, protein powder' },
]

export const UNIT_OPTIONS = [
  { value: 'g',     label: 'g' },
  { value: 'oz',    label: 'oz' },
  { value: 'cup',   label: 'cup' },
  { value: 'tbsp',  label: 'tbsp' },
  { value: 'tsp',   label: 'tsp' },
  { value: 'piece', label: 'piece' },
]

// Returns estimated grams, or null if not deterministic (piece).
export function toGrams(quantity, unit, density = 'dense') {
  if (!quantity || quantity <= 0) return null
  if (unit === 'g')    return Math.round(quantity)
  if (unit === 'oz')   return Math.round(quantity * OZ_TO_G)
  if (unit === 'piece') return null
  const rate = DENSITY_TABLE[density]?.[unit]
  if (!rate) return null
  return Math.round(quantity * rate)
}

// Returns a human-readable serving label, e.g. "1.5 cups (~293g)"
export function servingLabel(quantity, unit, density) {
  const g = toGrams(quantity, unit, density)
  const unitLabel = quantity === 1 ? unit : `${unit}s`
  const base = `${quantity} ${unitLabel}`
  if (g == null) return base
  if (unit === 'g' || unit === 'oz') return base
  return `${base} (~${g}g)`
}

// Scales per-100g nutrient values to the serving size in grams.
export function scaleNutrients(per100g, grams) {
  if (!grams || !per100g) return per100g
  const factor = grams / 100
  return {
    calories:    Math.round((per100g.calories    || 0) * factor),
    protein:     Math.round((per100g.protein     || 0) * factor * 10) / 10,
    carbs:       Math.round((per100g.carbs       || 0) * factor * 10) / 10,
    fat:         Math.round((per100g.fat         || 0) * factor * 10) / 10,
    sugar_total: Math.round((per100g.sugar_total || 0) * factor * 10) / 10,
    sugar_added: Math.round((per100g.sugar_added || 0) * factor * 10) / 10,
  }
}
