export interface FoodItem {
  name: string;
  box_2d: number[]; // [ymin, xmin, ymax, xmax] 0-1000 scale
}

export interface NutritionInfo {
  calories: number;
  carbs: string;
  protein: string;
  fat: string;
  totalWeight?: string;
}

export interface FoodAnalysis {
  isFood: boolean;
  hasExistingText: boolean;
  mealType: string;
  items: FoodItem[];
  nutrition: NutritionInfo;
  summary: string;
}

// --- Layout Types ---

export interface ElementState {
  x: number; // Percentage 0-1 of image width
  y: number; // Percentage 0-1 of image height
  scale: number; // Multiplier (1.0 = default)
  text?: string; // Text content (allow editing)
  visible: boolean;
}

export interface LabelState extends ElementState {
  id: number; // Index of the food item
  anchorX: number; // Percentage 0-1 (Fixed point on food)
  anchorY: number; // Percentage 0-1
}

export interface ImageLayout {
  card: ElementState;
  mealType: ElementState;
  labels: LabelState[];
}

export type ProcessStatus = 'idle' | 'analyzing' | 'rendering' | 'complete' | 'error' | 'not-food';

export interface ProcessedImage {
  id: string;
  file: File;
  previewUrl: string;
  status: ProcessStatus;
  analysis?: FoodAnalysis;
  layout?: ImageLayout; // The dynamic layout configuration
  resultUrl?: string; // The flattened result (generated from layout)
  error?: string;
  driveFileId?: string; // ID of the original file if imported from Google Drive
}