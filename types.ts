export enum DietaryPreference {
  NONE = 'Ninguna',
  VEGETARIAN = 'Vegetariano',
  VEGAN = 'Vegano',
}

export interface Ingredient {
  id: string;
  name: string;
  isPriority: boolean;
}

export interface Recipe {
  id: string;
  title: string;
  description: string;
  ingredientsUsed: string[];
  missingIngredients: string[];
  steps: string[];
  difficulty: 'Fácil' | 'Media' | 'Difícil';
  time: string;
}

export type ViewState = 'HOME' | 'CAMERA' | 'INGREDIENTS' | 'RECIPES' | 'RECIPE_DETAIL';

export interface ScanResult {
  ingredients: string[];
}