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
