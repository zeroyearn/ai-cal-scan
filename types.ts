
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

export interface RatingInfo {
    score: number; // 0-100
    verdict: string; // e.g., "Acceptable", "Excellent", "Avoid"
    title: string; // e.g., "High Protein Support"
    description: string; // Detailed analysis paragraph
}

export interface FoodAnalysis {
  isFood: boolean;
  hasExistingText: boolean;
  mealType: string;
  items: FoodItem[];
  nutrition: NutritionInfo;
  summary: string;
  healthScore?: number; // 1-10 scale
  healthTag?: string; // Short health benefit description
  rating?: RatingInfo; // New field for Rating Mode
}

// --- Layout Types ---

export interface ElementState {
  x: number; // Percentage 0-1 of image width
  y: number; // Percentage 0-1 of image height
  scale: number; // Multiplier (1.0 = default)
  text?: string; // Text content (allow editing)
  visible: boolean;
}

export type LabelStyle = 'default' | 'pill' | 'text';

export interface LabelState extends ElementState {
  id: number; // Index of the food item
  anchorX: number; // Percentage 0-1 (Fixed point on food)
  anchorY: number; // Percentage 0-1
  style: LabelStyle;
}

export interface ImageLayout {
  card: ElementState;
  mealType: ElementState;
  labels: LabelState[];
  caption?: ElementState; // For Viral Text
  score?: ElementState; // New: For Rating Score
  verdict?: ElementState; // New: For Rating Verdict
  branding?: ElementState; // New: For "Scored by AI Cal"
  mode?: 'food' | 'viral' | 'rating' | 'collage'; // Track layout mode
}

export interface LayoutConfig {
  defaultLabelStyle: LabelStyle;
  defaultTitleScale: number;
  defaultCardScale: number;
  defaultLabelScale: number;
  defaultTitlePos?: { x: number, y: number };
  defaultCardPos?: { x: number, y: number };
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
  viralStep?: number; // 1-6 for the Viral Story Mode
  mode: 'food' | 'viral' | 'collage' | 'rating'; // The mode this image belongs to
}

export interface HitRegion {
  id: number | string;
  type: 'card' | 'title' | 'label' | 'caption' | 'score' | 'verdict' | 'branding';
  x: number; // Pixel X on canvas
  y: number; // Pixel Y on canvas
  w: number; // Width in pixels
  h: number; // Height in pixels
  rotation?: number;
}
