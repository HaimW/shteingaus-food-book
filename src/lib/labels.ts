// Enum values (English, stored in frontmatter) and their Hebrew labels.
export const MEALS = ['breakfast', 'lunch', 'dinner', 'dessert'] as const;
export const DISH_TYPES = ['main', 'side', 'salad', 'dessert', 'other'] as const;

export type Meal = (typeof MEALS)[number];
export type DishType = (typeof DISH_TYPES)[number];

export const MEAL_LABELS: Record<Meal, string> = {
  breakfast: 'ארוחת בוקר',
  lunch: 'ארוחת צהריים',
  dinner: 'ארוחת ערב',
  dessert: 'קינוח',
};

export const DISH_TYPE_LABELS: Record<DishType, string> = {
  main: 'מנה עיקרית',
  side: 'תוספת',
  salad: 'סלט',
  dessert: 'קינוח',
  other: 'אחר',
};

export const SITE_TITLE = 'ספר המתכונים משפחת שטיינגאוס';

/** Short meal names for navigation and filter chips. */
export const MEAL_SHORT_LABELS: Record<Meal, string> = {
  breakfast: 'בוקר',
  lunch: 'צהריים',
  dinner: 'ערב',
  dessert: 'קינוח',
};

/**
 * Extra spellings accepted for meal / dish type (besides the English key and the
 * label above), so family members can write what feels natural in the Google Doc.
 */
export const MEAL_ALIASES: Record<Meal, string[]> = {
  breakfast: ['בוקר', 'ארוחת הבוקר'],
  lunch: ['צהריים', 'צהרים', 'ארוחת צהרים', 'ארוחת הצהריים'],
  dinner: ['ערב', 'ארוחת הערב'],
  dessert: ['קינוחים', 'מתוק'],
};

export const DISH_TYPE_ALIASES: Record<DishType, string[]> = {
  main: ['עיקרית', 'עיקרי', 'חלבון', 'מנה עיקרית / חלבון', 'מנה עיקרית/חלבון', 'עיקריות'],
  side: ['תוספות', 'מנה נלווית'],
  salad: ['סלטים'],
  dessert: ['קינוחים', 'מתוק'],
  other: ['אחרת', 'שונות'],
};
