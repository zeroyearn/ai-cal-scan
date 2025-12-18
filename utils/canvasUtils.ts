import { FoodAnalysis, ImageLayout, LayoutConfig, ElementState, LabelState, HitRegion, CollageLabel } from "../types";

const CARD_SCALE_MODIFIER = 1.0;

export function drawScene(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  analysis: FoodAnalysis,
  layout: ImageLayout
): HitRegion[] {
  const regions: HitRegion[] = [];

  // Clear and draw background only if image is provided
  if (img) {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.drawImage(img, 0, 0, ctx.canvas.width, ctx.canvas.height);
  }

  const { width, height } = ctx.canvas;

  // Draw Meal Type
  if (layout.mealType && layout.mealType.visible && layout.mealType.text) {
    const bbox = drawMealTypeInternal(
      ctx,
      layout.mealType.text,
      layout.mealType.x * width,
      layout.mealType.y * height,
      layout.mealType.scale
    );
    regions.push({
        id: 'title',
        type: 'title',
        ...bbox
    });
  }

  // Draw Labels
  if (layout.labels) {
    layout.labels.forEach((label) => {
      if (!label.visible || !label.text) return;
      const lx = label.x * width;
      const ly = label.y * height;
      
      let bbox;
      if (label.style === 'text') {
        bbox = drawLabelTextOnlyInternal(ctx, label.text, lx, ly, label.scale);
      } else {
        // 'default' or 'pill'
        bbox = drawLabelPillInternal(ctx, label.text, lx, ly, label.scale);
      }
      regions.push({
          id: label.id,
          type: 'label',
          ...bbox
      });
    });
  }

  // Draw Nutrition Card
  if (layout.card && layout.card.visible) {
    const bbox = drawNutritionCardInternal(
      ctx,
      analysis,
      layout.card.x * width,
      layout.card.y * height,
      layout.card.scale
    );
    regions.push({
        id: 'card',
        type: 'card',
        ...bbox
    });
  }

  return regions;
}

/**
 * Generates the final high-res image for export.
 * Uses the exact same drawScene logic as the preview.
 */
export const renderFinalImage = async (
  base64Image: string,
  analysis: FoodAnalysis,
  layout: ImageLayout
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = base64Image;
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject("No Context"); return; }

      // Enable high-quality smoothing for the final render
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // Use the unified drawing function
      drawScene(ctx, img, analysis, layout);

      // CHANGE: Increased quality to 1.0 (Max)
      resolve(canvas.toDataURL("image/jpeg", 1.0));
    };
    img.onerror = reject;
  });
};

/**
 * Generates a 2x2 Collage from 4 images
 * Supports optional single label in the center
 */
export const generateCollage = async (
  imageUrls: string[],
  config: { width: number; height: number; padding: number; color: string },
  label?: CollageLabel,
  labelSettings?: { scale: number; y: number }
): Promise<string> => {
    if (imageUrls.length !== 4) throw new Error("Collage requires exactly 4 images");

    // Load all images
    const images = await Promise.all(imageUrls.map(url => new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
    })));

    const canvas = document.createElement("canvas");
    canvas.width = config.width;
    canvas.height = config.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not get canvas context");

    // Background
    ctx.fillStyle = config.color;
    ctx.fillRect(0, 0, config.width, config.height);

    // Calculate Grid
    const p = config.padding;
    const cellW = (config.width - (3 * p)) / 2;
    const cellH = (config.height - (3 * p)) / 2;
    
    // Positions:
    // 0: Top-Left  (p, p)
    // 1: Top-Right (p + cellW + p, p)
    // 2: Btm-Left  (p, p + cellH + p)
    // 3: Btm-Right (p + cellW + p, p + cellH + p)
    
    const positions = [
        { x: p, y: p },
        { x: p * 2 + cellW, y: p },
        { x: p, y: p * 2 + cellH },
        { x: p * 2 + cellW, y: p * 2 + cellH }
    ];

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Draw Images
    images.forEach((img, i) => {
        const pos = positions[i];
        const scale = Math.max(cellW / img.width, cellH / img.height);
        const renderW = img.width * scale;
        const renderH = img.height * scale;
        const offsetX = (cellW - renderW) / 2;
        const offsetY = (cellH - renderH) / 2;
        
        ctx.save();
        ctx.beginPath();
        ctx.rect(pos.x, pos.y, cellW, cellH);
        ctx.clip(); // Clip to cell box
        ctx.drawImage(img, pos.x + offsetX, pos.y + offsetY, renderW, renderH);
        ctx.restore();
    });

    // Draw Center Label if provided
    if (label && label.name) {
      // Scale calculation for label:
      const referenceWidth = 1000;
      const baseScale = (config.width / referenceWidth); 
      
      // Use provided scale modifier or default to 2.5
      const modifier = labelSettings?.scale ?? 2.5; 
      const labelScale = baseScale * modifier;

      const centerX = config.width / 2;
      
      // Use provided Y % or default to 50%
      const yPct = labelSettings?.y ?? 50;
      const centerY = config.height * (yPct / 100);
      
      let displayText = label.name;
      if (label.calories) {
           displayText += `\n${label.calories}`;
      }
      
      drawCollageCenterLabel(ctx, displayText, centerX, centerY, labelScale);
    }

    return canvas.toDataURL("image/jpeg", 0.95);
};

// Simplified Center Label Drawer for Collage
function drawCollageCenterLabel(ctx: CanvasRenderingContext2D, text: string, centerX: number, centerY: number, scale: number) {
  const lines = text.split('\n');
  
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;

  if (lines.length > 1) {
      // Two lines: Name (Large) + Calories (Smaller)
      const fontSize1 = 60 * scale;
      const fontSize2 = 36 * scale;
      const lineHeight = fontSize1 * 0.6 + fontSize2 * 0.6; // Distance between centers
      
      const y1 = centerY - (lineHeight * 0.4); 
      const y2 = centerY + (lineHeight * 0.6); 

      // Line 1
      ctx.font = `800 ${fontSize1}px Inter, sans-serif`;
      ctx.lineWidth = 12 * scale;
      ctx.strokeStyle = "black";
      ctx.strokeText(lines[0], centerX, y1);
      ctx.fillStyle = "white";
      ctx.fillText(lines[0], centerX, y1);

      // Line 2
      ctx.font = `700 ${fontSize2}px Inter, sans-serif`;
      ctx.lineWidth = 8 * scale;
      ctx.strokeStyle = "black";
      ctx.strokeText(lines[1], centerX, y2);
      ctx.fillStyle = "white";
      ctx.fillText(lines[1], centerX, y2);

  } else {
      // Single Line
      const fontSize = 60 * scale;
      ctx.font = `800 ${fontSize}px Inter, sans-serif`;
      
      ctx.lineWidth = 12 * scale;
      ctx.strokeStyle = "black";
      ctx.strokeText(text, centerX, centerY);
      
      ctx.fillStyle = "white";
      ctx.fillText(text, centerX, centerY);
  }
  
  ctx.restore();
}


// --- Internal Drawing Functions (Returns Bounding Box for Hit Testing) ---

function measureLabelText(ctx: CanvasRenderingContext2D, text: string, scale: number, isTextOnly: boolean) {
    const lines = text.split('\n');
    const fontSize = 28 * scale;
    
    if (lines.length > 1) {
        // Multi-line measurement
        
        // Line 1: Main Title
        ctx.font = isTextOnly 
          ? `800 ${fontSize}px Inter, sans-serif`
          : `600 ${fontSize}px Inter, sans-serif`;
        const m1 = ctx.measureText(lines[0]);
        
        // Line 2: Subtitle (smaller)
        const subFontSize = fontSize * 0.7; // 70% size
        ctx.font = isTextOnly 
          ? `600 ${subFontSize}px Inter, sans-serif`
          : `500 ${subFontSize}px Inter, sans-serif`;
        const m2 = ctx.measureText(lines[1]);
        
        const maxW = Math.max(m1.width, m2.width);
        const paddingX = isTextOnly ? 4 * scale : 20 * scale; // More padding for pills with subtitles
        const w = maxW + (paddingX * 2);
        
        // Height: Title + Gap + Subtitle
        const h = (fontSize * 1.3) + (subFontSize * 1.4);
        return { w, h };
    }

    // Single Line Logic
    ctx.font = isTextOnly 
      ? `800 ${fontSize}px Inter, sans-serif`
      : `600 ${fontSize}px Inter, sans-serif`;
    
    const metrics = ctx.measureText(text);
    const paddingX = isTextOnly ? 4 * scale : 16 * scale;
    const w = metrics.width + (paddingX * 2);
    const h = fontSize * 1.6;
    return { w, h };
}

function drawLabelPillInternal(ctx: CanvasRenderingContext2D, text: string, centerX: number, centerY: number, scale: number) {
  const { w, h } = measureLabelText(ctx, text, scale, false);
  const lines = text.split('\n');
  
  // For multi-line, use a fixed radius instead of full pill shape if it gets too tall
  const r = lines.length > 1 ? 16 * scale : h / 2;
  const x = centerX - w / 2;
  const y = centerY - h / 2;

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.3)";
  ctx.shadowBlur = 8 * scale;
  ctx.shadowOffsetY = 4 * scale;

  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
  ctx.fill();
  ctx.restore();

  // Text
  const fontSize = 28 * scale;
  
  if (lines.length > 1) {
      const subFontSize = fontSize * 0.7;
      
      // Title
      ctx.font = `600 ${fontSize}px Inter, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillStyle = "#111827";
      // Slightly above center
      ctx.fillText(lines[0], centerX, centerY - 2 * scale);
      
      // Subtitle
      ctx.font = `500 ${subFontSize}px Inter, sans-serif`;
      ctx.textBaseline = "top";
      ctx.fillStyle = "#4b5563"; // Gray-600
      ctx.fillText(lines[1], centerX, centerY + 2 * scale);

  } else {
      ctx.font = `600 ${fontSize}px Inter, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#111827";
      ctx.fillText(text, centerX, centerY);
  }

  return { x, y, w, h };
}

function drawLabelTextOnlyInternal(ctx: CanvasRenderingContext2D, text: string, centerX: number, centerY: number, scale: number) {
  const { w, h } = measureLabelText(ctx, text, scale, true);
  const x = centerX - w / 2;
  const y = centerY - h / 2;
  
  ctx.save();
  const fontSize = 28 * scale;
  const lines = text.split('\n');

  ctx.textAlign = "center";
  
  if (lines.length > 1) {
      const subFontSize = fontSize * 0.7;
      
      // Common settings
      ctx.lineJoin = "round";
      ctx.miterLimit = 2;

      // --- Line 1 (Title) ---
      const y1 = centerY - 2 * scale;
      ctx.font = `800 ${fontSize}px Inter, sans-serif`;
      ctx.textBaseline = "bottom";
      
      // Outline (No shadow on stroke to keep it crisp)
      ctx.shadowColor = "transparent";
      ctx.lineWidth = 4 * scale;
      ctx.strokeStyle = "rgba(0,0,0,0.8)";
      ctx.strokeText(lines[0], centerX, y1);
      
      // Fill (With Shadow)
      ctx.shadowColor = "rgba(0,0,0,0.6)";
      ctx.shadowBlur = 6 * scale;
      ctx.shadowOffsetY = 2 * scale;
      ctx.fillStyle = "white";
      ctx.fillText(lines[0], centerX, y1);

      // --- Line 2 (Subtitle) ---
      const y2 = centerY + 2 * scale;
      ctx.font = `600 ${subFontSize}px Inter, sans-serif`; 
      ctx.textBaseline = "top";
      
      // Outline
      ctx.shadowColor = "transparent";
      ctx.lineWidth = 3 * scale;
      ctx.strokeStyle = "rgba(0,0,0,0.8)";
      ctx.strokeText(lines[1], centerX, y2);
      
      // Fill
      ctx.shadowColor = "rgba(0,0,0,0.6)";
      ctx.fillStyle = "#f3f4f6"; // Slight off-white
      ctx.fillText(lines[1], centerX, y2);

  } else {
      ctx.font = `800 ${fontSize}px Inter, sans-serif`;
      ctx.textBaseline = "middle";
      
      // Thick Outline
      ctx.lineWidth = 4 * scale;
      ctx.strokeStyle = "rgba(0,0,0,0.8)";
      ctx.lineJoin = "round";
      ctx.miterLimit = 2;
      ctx.strokeText(text, centerX, centerY);

      // Soft Shadow
      ctx.shadowColor = "rgba(0,0,0,0.6)";
      ctx.shadowBlur = 6 * scale;
      ctx.shadowOffsetY = 2 * scale;
      
      // Main Text
      ctx.fillStyle = "white";
      ctx.fillText(text, centerX, centerY);
  }
  
  ctx.restore();

  return { x, y, w, h };
}

function drawMealTypeInternal(ctx: CanvasRenderingContext2D, text: string, centerX: number, topY: number, scale: number) {
  const fontSize = 80 * scale;
  ctx.font = `bold ${fontSize}px Inter, sans-serif`;
  const metrics = ctx.measureText(text);
  const w = metrics.width;
  const h = fontSize; 
  const x = centerX - w/2;
  const y = topY;

  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 10 * scale;
  ctx.shadowOffsetY = 2 * scale;

  ctx.fillStyle = "white";
  ctx.fillText(text, centerX, topY);
  ctx.restore();

  return { x, y, w, h };
}

function drawNutritionCardInternal(ctx: CanvasRenderingContext2D, analysis: FoodAnalysis, leftX: number, topY: number, scale: number) {
  const cardW = 540 * scale; 
  const headerH = 70 * scale; 
  const baseH = 260 * scale;
  const cardH = baseH + headerH; 
  const r = 24 * scale;
  
  // Drawing coords
  const x = leftX;
  const y = topY;

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.15)";
  ctx.shadowBlur = 20 * scale;
  ctx.shadowOffsetY = 10 * scale;
  
  ctx.fillStyle = "white";
  ctx.beginPath();
  ctx.roundRect(x, y, cardW, cardH, r);
  ctx.fill();
  ctx.shadowColor = "transparent";

  const paddingX = 24 * scale;
  const paddingY = 24 * scale;

  // Header
  drawCardBranding(ctx, x + paddingX, y + paddingY, scale);

  const contentStartY = y + paddingY + headerH;
  
  // Badge - If Health Score exists, show it. Otherwise show item count.
  if (analysis.healthScore !== undefined) {
      // Draw Health Score Badge
      const score = analysis.healthScore;
      const badgeW = 90 * scale;
      const badgeH = 36 * scale;
      const badgeX = x + cardW - paddingX - badgeW;
      const badgeY = contentStartY;
      
      let badgeColor = "#22c55e"; // Green (High)
      let badgeBg = "#f0fdf4";
      let badgeText = "#15803d";
      
      if (score < 7) { 
          badgeColor = "#f97316"; // Orange (Mid)
          badgeBg = "#fff7ed";
          badgeText = "#c2410c";
      }
      if (score < 4) {
          badgeColor = "#ef4444"; // Red (Low)
          badgeBg = "#fef2f2";
          badgeText = "#b91c1c";
      }
      
      ctx.fillStyle = badgeBg;
      ctx.strokeStyle = badgeColor;
      ctx.lineWidth = 1.5 * scale;
      ctx.beginPath();
      ctx.roundRect(badgeX, badgeY, badgeW, badgeH, badgeH/2);
      ctx.fill();
      ctx.stroke();
      
      ctx.font = `bold ${16 * scale}px Inter, sans-serif`;
      ctx.fillStyle = badgeText;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`Health: ${score}`, badgeX + badgeW/2, badgeY + badgeH/2 + 1*scale);

  } else {
      // Draw standard Item Count Badge
      const badgeW = 70 * scale;
      const badgeH = 36 * scale;
      const badgeX = x + cardW - paddingX - badgeW;
      const badgeY = contentStartY;
      
      ctx.strokeStyle = "#111827";
      ctx.lineWidth = 1.5 * scale;
      ctx.beginPath();
      ctx.roundRect(badgeX, badgeY, badgeW, badgeH, badgeH/2);
      ctx.stroke();
      
      ctx.font = `600 ${16 * scale}px Inter, sans-serif`;
      ctx.fillStyle = "#111827";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`${analysis.items.length} 🥣`, badgeX + badgeW/2, badgeY + badgeH/2 + 2*scale);
  }


  // Title
  // If health tag exists, we constrain title to fewer lines or shift layout slightly? 
  // We'll just draw the health tag below the title.
  
  const titleW = cardW - paddingX * 2 - 90 * scale - 16 * scale; // Adjust width to account for potential wider health badge
  ctx.font = `600 ${22 * scale}px Inter, sans-serif`; 
  ctx.fillStyle = "#1f2937"; 
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  
  const words = analysis.summary.split(" ");
  let line1 = "";
  let line2 = "";
  let currentLine = 1;
  
  for (let word of words) {
    const testLine = line1 + word + " ";
    const metrics = ctx.measureText(testLine);
    if (metrics.width > titleW && currentLine === 1) {
      currentLine = 2;
      line2 = word + " ";
    } else if (currentLine === 1) {
      line1 = testLine;
    } else {
       const testLine2 = line2 + word + " ";
       if(ctx.measureText(testLine2).width < titleW) {
          line2 = testLine2;
       } else {
          line2 = line2.trim() + "...";
          break;
       }
    }
  }
  
  let currentY = contentStartY;
  ctx.fillText(line1, x + paddingX, currentY);
  currentY += 28 * scale;
  
  if (line2) {
    ctx.fillText(line2, x + paddingX, currentY);
    currentY += 28 * scale;
  }
  
  // Draw Health Tag (Benefit) if exists
  if (analysis.healthTag) {
      // Add a small gap if we just wrote text
      if (!line2) currentY += 4 * scale; // Add a bit of spacing if only 1 line title
      
      ctx.font = `500 ${15 * scale}px Inter, sans-serif`;
      ctx.fillStyle = "#059669"; // Emerald 600
      ctx.fillText(`✨ ${analysis.healthTag}`, x + paddingX, currentY + 4 * scale);
  }

  // Calories
  // Fixed positioning logic in original code was specific. 
  // We need to ensure we don't overlap if we added extra lines.
  // Original: titleHeight = line2 ? 56 : 28. calY = contentStartY + titleHeight + 16.
  // New: We use currentY which tracks the bottom of the text block.
  
  // But to keep it consistent with the fixed card height (which might be tight), let's stick to the grid
  // but just push it down if needed? 
  // Actually, the card height is calculated as baseH + headerH.
  // To avoid breaking layout, let's keep the calories bar at fixed position if possible, 
  // or use the original logic if no health tag.
  
  const titleHeightBlock = line2 ? 56 * scale : 28 * scale;
  // If we have a health tag, we effectively "use" the space of a 2nd line or add to it.
  // Let's assume standard layout handles it well, but if we have tag + 2 lines, it might get tight.
  
  let calY = contentStartY + titleHeightBlock + 16 * scale;
  
  // If we added a tag, push Cal Y down slightly?
  if (analysis.healthTag) {
      calY = Math.max(calY, currentY + 24 * scale);
  }
  
  const calH = 64 * scale; 
  const calW = cardW - paddingX * 2;
  
  ctx.fillStyle = "#f0fdf4"; 
  ctx.strokeStyle = "#dcfce7"; 
  ctx.lineWidth = 1.5 * scale;
  ctx.beginPath();
  ctx.roundRect(x + paddingX, calY, calW, calH, 16 * scale);
  ctx.fill();
  ctx.stroke();
  
  ctx.font = `bold ${28 * scale}px Inter, sans-serif`;
  ctx.fillStyle = "#111827";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(`🔥 ${analysis.nutrition.calories} Kcal`, x + paddingX + 24 * scale, calY + calH/2 + 2*scale);

  // Macros
  const macroY = calY + calH + 16 * scale;
  const macroH = 80 * scale; 
  const gap = 12 * scale;
  const macroW = (calW - gap * 2) / 3;
  
  drawNewMacroCard(ctx, "Carbs", analysis.nutrition.carbs, "🌾", "#f0fdf4", "#16a34a", x + paddingX, macroY, macroW, macroH, scale);
  drawNewMacroCard(ctx, "Protein", analysis.nutrition.protein, "🥚", "#fffbeb", "#d97706", x + paddingX + macroW + gap, macroY, macroW, macroH, scale);
  drawNewMacroCard(ctx, "Fat", analysis.nutrition.fat, "🥩", "#fef2f2", "#dc2626", x + paddingX + (macroW + gap) * 2, macroY, macroW, macroH, scale);

  ctx.restore();

  return { x, y, w: cardW, h: cardH };
}

function drawCardBranding(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) {
  const iconSize = 32 * scale;
  
  // Icon Background
  ctx.fillStyle = "black";
  ctx.beginPath();
  ctx.roundRect(x, y, iconSize, iconSize, 8 * scale);
  ctx.fill();
  
  // "AI" text as icon placeholder
  ctx.fillStyle = "white";
  ctx.font = `bold ${12 * scale}px Inter, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("AI", x + iconSize/2, y + iconSize/2 + 1*scale);
  
  // Brand Text
  ctx.fillStyle = "#111827";
  ctx.font = `bold ${20 * scale}px Inter, sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("AI Cal", x + iconSize + 10 * scale, y + iconSize/2);
}

function drawNewMacroCard(
    ctx: CanvasRenderingContext2D, 
    label: string, 
    value: string, 
    icon: string, 
    bgColor: string, 
    accentColor: string, 
    x: number, 
    y: number, 
    w: number, 
    h: number, 
    scale: number
) {
    ctx.fillStyle = bgColor;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 12 * scale);
    ctx.fill();
    
    // Icon
    ctx.font = `${16 * scale}px Inter, sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = "#111827";
    ctx.fillText(icon, x + 10 * scale, y + 10 * scale);
    
    // Label
    ctx.fillStyle = "#6b7280";
    ctx.font = `600 ${11 * scale}px Inter, sans-serif`;
    ctx.fillText(label.toUpperCase(), x + 34 * scale, y + 11 * scale);
    
    // Value
    ctx.fillStyle = "#111827";
    ctx.font = `bold ${18 * scale}px Inter, sans-serif`;
    ctx.textBaseline = "bottom";
    ctx.fillText(value, x + 10 * scale, y + h - 10 * scale);
}

export const getInitialLayout = (
  imgWidth: number, 
  imgHeight: number, 
  analysis: FoodAnalysis,
  config?: LayoutConfig // New optional config parameter
): ImageLayout => {
  // Use defaults from config or fallback to original hardcoded values
  const defaultTitleScale = config?.defaultTitleScale ?? 7.6;
  const defaultCardScale = config?.defaultCardScale ?? 4.2;
  const defaultLabelScale = config?.defaultLabelScale ?? 1.0;
  const defaultLabelStyle = config?.defaultLabelStyle ?? 'default';

  // --- Meal Type (Title) Position ---
  // Default: Top Center (x: 0.5, y: 0.08)
  const titleX = config?.defaultTitlePos?.x !== undefined ? config.defaultTitlePos.x / 100 : 0.5;
  const titleY = config?.defaultTitlePos?.y !== undefined ? config.defaultTitlePos.y / 100 : 0.08;

  const mealType: ElementState = {
    x: titleX,
    y: titleY,
    scale: defaultTitleScale, 
    text: analysis.mealType,
    visible: true
  };

  // --- Nutrition Card Position ---
  const cardScaleRef = imgWidth / 1200;
  let cardX, cardY;

  if (config?.defaultCardPos && config.defaultCardPos.x !== undefined && config.defaultCardPos.y !== undefined) {
      // Use configured defaults (converted from 0-100 to 0-1)
      cardX = config.defaultCardPos.x / 100;
      cardY = config.defaultCardPos.y / 100;
  } else {
      // Calculate height with default scale AND Modifier to pin to bottom
      const cardH_px = (260 + 70) * cardScaleRef * (defaultCardScale * CARD_SCALE_MODIFIER);
      
      // Margin 32px
      const margin_px = 32 * cardScaleRef;
      const visualMarginX = Math.max(0, margin_px); 
      cardX = visualMarginX / imgWidth;
      
      // Position it at bottom with margin
      cardY = (imgHeight - cardH_px - margin_px) / imgHeight;
      
      // Safety check
      if (cardY < 0) cardY = 0.05;
  }

  const card: ElementState = {
    x: cardX,
    y: cardY,
    scale: defaultCardScale,
    visible: true
  };

  // Labels
  // Filter duplicates based on name (case-insensitive)
  const seenNames = new Set<string>();
  const labels: LabelState[] = [];
  
  analysis.items.forEach((item) => {
      const nameKey = item.name.toLowerCase().trim();
      if (seenNames.has(nameKey)) return;
      seenNames.add(nameKey);
      
      const idx = labels.length; // New index for the label array
      
      let cx = 0.5;
      let cy = 0.5;
      if (item.box_2d && item.box_2d.length === 4) {
        const [ymin, xmin, ymax, xmax] = item.box_2d;
        cx = (xmin + xmax) / 2 / 1000;
        cy = (ymin + ymax) / 2 / 1000;
      }

      labels.push({
        id: idx,
        text: item.name,
        x: cx,
        y: Math.max(0.05, cy - 0.15),
        anchorX: cx,
        anchorY: cy,
        scale: defaultLabelScale,
        visible: true,
        style: defaultLabelStyle
      });
  });

  // If we have a single item result, add the health tag as a separate label below the main one
  if (labels.length === 1 && analysis.healthTag) {
     const mainLabel = labels[0];
     labels.push({
        id: 9999, // Unique ID for the health tag
        text: `✨ ${analysis.healthTag}`,
        x: mainLabel.x,
        y: mainLabel.y + 0.12, // Position roughly below the main label
        anchorX: mainLabel.anchorX,
        anchorY: mainLabel.anchorY,
        scale: defaultLabelScale * 0.75, // Slightly smaller
        visible: true,
        style: 'pill' // Default to pill for clarity
     });
  }

  return { mealType, card, labels };
};

export const resizeImage = async (file: File, maxDimension: number = 1024, cropTo9_16: boolean = false): Promise<{ base64: string, mimeType: string }> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        let width = img.width;
        let height = img.height;
        
        let sx = 0, sy = 0, sWidth = width, sHeight = height;

        if (cropTo9_16) {
             const targetRatio = 9 / 16;
             const currentRatio = width / height;
             
             if (currentRatio > targetRatio) {
                 // Too wide
                 sWidth = height * targetRatio;
                 sHeight = height;
                 sx = (width - sWidth) / 2;
             } else {
                 // Too tall
                 sWidth = width;
                 sHeight = width / targetRatio;
                 sy = (height - sHeight) / 2;
             }
        }

        // Resize logic (on the cropped area)
        let dWidth = sWidth;
        let dHeight = sHeight;

        if (dWidth > maxDimension || dHeight > maxDimension) {
          if (dWidth > dHeight) {
            dHeight = Math.round((dHeight * maxDimension) / dWidth);
            dWidth = maxDimension;
          } else {
            dWidth = Math.round((dWidth * maxDimension) / dHeight);
            dHeight = maxDimension;
          }
        }
        
        // Ensure integer dimensions
        dWidth = Math.floor(dWidth);
        dHeight = Math.floor(dHeight);

        const canvas = document.createElement("canvas");
        canvas.width = dWidth;
        canvas.height = dHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject(new Error("Could not get canvas context")); return; }
        
        // Enable high quality image scaling
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, dWidth, dHeight);
        
        // CHANGE: Increased quality to 0.95 (Near Max)
        const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
        const base64 = dataUrl.split(",")[1];
        resolve({ base64, mimeType: "image/jpeg" });
      };
      img.onerror = (e) => { URL.revokeObjectURL(objectUrl); reject(e); };
      img.src = objectUrl;
    });
  };