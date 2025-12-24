export interface FoodItem {
  name: string;
  box_2d: number[]; // [ymin, xmin, ymax, xmax] 0-1000 scale
  calories?: number; // Estimated calories for this specific item
}

export interface NutritionInfo {
  calories: number;
  carbs: string;
  protein: string;
  fat: string;
  vitamins?: string[]; // e.g. ["Vitamin C 20%", "Iron 10%"]
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
  color?: string; // Text color
  backgroundColor?: string; // Background color (e.g. for nutrition card)
}

export type LabelStyle = 'default' | 'pill' | 'text';

export interface LabelState extends ElementState {
  id: number; // Index of the food item
  anchorX: number; // Percentage 0-1 (Fixed point on food)
  anchorY: number; // Percentage 0-1
  style: LabelStyle;
}

export interface LogoState extends ElementState {
  url: string;
}

export interface ImageLayout {
  card: ElementState;
  mealType: ElementState;
  labels: LabelState[];
  logo?: LogoState;
}

export interface LayoutConfig {
  defaultLabelStyle: LabelStyle;
  defaultTitleScale: number;
  defaultCardScale: number;
  defaultLabelScale: number;
  defaultCardX?: number; // 0-1
  defaultCardY?: number; // 0-1
  defaultTitleY?: number;
}

export interface ModeConfig extends Required<LayoutConfig> {
  cardBackgroundColor?: string;
  cardTextColor?: string;
}

export type AppMode = 'scan' | 'collage' | 'nutrition';

export type ProcessStatus = 'idle' | 'analyzing' | 'rendering' | 'complete' | 'error' | 'not-food';

export interface ProcessedImage {
  id: string;
  sourceMode: AppMode;
  file: File;
  previewUrl: string;
  status: ProcessStatus;
  analysis?: FoodAnalysis;
  layout?: ImageLayout; // The dynamic layout configuration
  resultUrl?: string; // The flattened result (generated from layout)
  error?: string;
  driveFileId?: string; // ID of the original file if imported from Google Drive
}

export interface CollageTransform {
  scale: number;
  x: number;
  y: number;
}

export interface HitRegion {
  id: number | string;
  type: 'card' | 'title' | 'label' | 'logo';
  x: number; // Pixel X on canvas
  y: number; // Pixel Y on canvas
  w: number; // Width in pixels
  h: number; // Height in pixels
  rotation?: number;
}