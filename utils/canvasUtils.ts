import { FoodAnalysis, ImageLayout, HitRegion, ElementState, LabelState, LayoutConfig } from "../types";

// --- Constants for Scale Calibration ---
// These factors calibrate the "User Scale" to the "Canvas Scale".
// Unified across preview and export.
const TITLE_SCALE_MODIFIER = 0.15;
const CARD_SCALE_MODIFIER = 0.25;

// --- Main Drawing Logic (Shared by Preview and Export) ---

/**
 * Draws the entire scene (background image + overlays) onto the provided context.
 * Returns a list of HitRegions for the UI to generate interactive overlays.
 */
export const drawScene = (
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null, // Pass null if you only want to draw overlays (transparent bg)
  analysis: FoodAnalysis,
  layout: ImageLayout
): HitRegion[] => {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const hitRegions: HitRegion[] = [];

  // 1. Draw Background
  if (img) {
    ctx.drawImage(img, 0, 0, width, height);
  }

  // Base scale relative to a 1200px wide reference image
  // This ensures elements look the same relative size regardless of resolution
  const refScale = width / 1200;

  // 2. Draw Meal Type
  if (layout.mealType.visible) {
    const x = layout.mealType.x * width;
    // Apply Modifier
    const s = layout.mealType.scale * refScale * TITLE_SCALE_MODIFIER;
    // Text offset adjustment (centering) is handled in draw function, 
    // but the layout.y is the top-center anchor.
    const y = layout.mealType.y * height;
    
    const bounds = drawMealTypeInternal(ctx, layout.mealType.text || analysis.mealType, x, y, s);
    hitRegions.push({
      id: 'title',
      type: 'title',
      ...bounds
    });
  }

  // 3. Draw Labels & Lines
  layout.labels.forEach(label => {
    if (!label.visible) return;
    
    const pillX = label.x * width;
    const pillY = label.y * height;
    const anchorX = label.anchorX * width;
    const anchorY = label.anchorY * height;
    const s = label.scale * refScale; // No modifier for labels
    const text = label.text || "";

    // Draw Line & Dot (Only for 'default' style)
    if (label.style === 'default') {
      ctx.beginPath();
      ctx.moveTo(anchorX, anchorY);
      ctx.lineTo(pillX, pillY); 
      ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
      ctx.lineWidth = 3 * s;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(anchorX, anchorY, 6 * s, 0, Math.PI * 2);
      ctx.fillStyle = "white";
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.3)";
      ctx.lineWidth = 2 * s;
      ctx.stroke();
    }

    let bounds;
    // Draw Label Content
    if (label.style === 'text') {
       bounds = drawLabelTextOnlyInternal(ctx, text, pillX, pillY, s);
    } else {
       // 'default' and 'pill' use the pill look
       bounds = drawLabelPillInternal(ctx, text, pillX, pillY, s);
    }

    hitRegions.push({
      id: label.id,
      type: 'label',
      ...bounds
    });
  });

  // 4. Draw Nutrition Card
  if (layout.card.visible) {
    const s = layout.card.scale * refScale * CARD_SCALE_MODIFIER;
    const x = layout.card.x * width;
    const y = layout.card.y * height;
    
    const bounds = drawNutritionCardInternal(ctx, analysis, x, y, s);
    hitRegions.push({
      id: 'card',
      type: 'card',
      ...bounds
    });
  }

  return hitRegions;
};


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

      // Use the unified drawing function
      drawScene(ctx, img, analysis, layout);

      resolve(canvas.toDataURL("image/jpeg", 0.9));
    };
    img.onerror = reject;
  });
};


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
  const logoSize = 60 * scale; 
  ctx.fillStyle = "#111827"; 
  ctx.beginPath();
  ctx.roundRect(x, y, logoSize, logoSize, 14 * scale);
  ctx.fill();

  ctx.strokeStyle = "#4b5563"; 
  ctx.lineWidth = 3 * scale;
  ctx.lineCap = "round";
  const bLen = 10 * scale;
  const bPad = 8 * scale;
  
  ctx.beginPath(); ctx.moveTo(x + bPad, y + bPad + bLen); ctx.quadraticCurveTo(x + bPad, y + bPad, x + bPad + bLen, y + bPad); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + logoSize - bPad - bLen, y + bPad); ctx.quadraticCurveTo(x + logoSize - bPad, y + logoSize - bPad, x + logoSize - bPad + bLen, y + bPad); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + logoSize - bPad, y + logoSize - bPad - bLen); ctx.quadraticCurveTo(x + logoSize - bPad, y + logoSize - bPad, x + logoSize - bPad - bLen, y + logoSize - bPad); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + bPad + bLen, y + logoSize - bPad); ctx.quadraticCurveTo(x + bPad, y + logoSize - bPad, x + bPad, y + logoSize - bPad - bLen); ctx.stroke();

  const cx = x + logoSize / 2;
  const cy = y + logoSize / 2 + 3 * scale; 
  const aR = 15 * scale;

  ctx.fillStyle = "white";
  ctx.beginPath();
  ctx.moveTo(cx, cy - aR * 0.8);
  ctx.bezierCurveTo(cx + aR * 0.9, cy - aR * 1.3, cx + aR * 1.8, cy - aR * 0.3, cx + aR * 0.8, cy + aR * 0.95);
  ctx.quadraticCurveTo(cx, cy + aR * 1.2, cx - aR * 0.8, cy + aR * 0.95);
  ctx.bezierCurveTo(cx - aR * 1.8, cy - aR * 0.3, cx - aR * 0.9, cy - aR * 1.3, cx, cy - aR * 0.8);
  ctx.fill();

  ctx.strokeStyle = "white";
  ctx.lineWidth = 2 * scale;
  ctx.beginPath();
  ctx.moveTo(cx, cy - aR * 0.8);
  ctx.quadraticCurveTo(cx, cy - aR * 1.4, cx + aR * 0.4, cy - aR * 1.5);
  ctx.stroke();
  
  ctx.fillStyle = "white";
  ctx.beginPath();
  ctx.ellipse(cx + aR*0.4, cy - aR*1.3, aR*0.3, aR*0.15, -Math.PI/4, 0, Math.PI*2);
  ctx.fill();

  ctx.fillStyle = "#111827"; 
  ctx.font = `800 ${8 * scale}px Inter, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("AI Cal", cx, cy + 1 * scale);

  ctx.fillStyle = "#111827"; 
  ctx.font = `800 ${32 * scale}px Inter, sans-serif`; 
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("AI Cal", x + logoSize + 16 * scale, y + logoSize / 2);
}

function drawNewMacroCard(ctx: CanvasRenderingContext2D, label: string, value: string, icon: string, bg: string, color: string, x: number, y: number, w: number, h: number, scale: number) {
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 16 * scale);
  ctx.fill();
  ctx.strokeStyle = color + "40"; 
  ctx.lineWidth = 1 * scale;
  ctx.stroke();
  
  const headerY = y + 16 * scale;
  ctx.font = `500 ${13 * scale}px Inter, sans-serif`; 
  ctx.fillStyle = "#374151"; 
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(icon, x + 12 * scale, headerY);
  ctx.fillText(label, x + 36 * scale, headerY);
  
  ctx.font = `bold ${20 * scale}px Inter, sans-serif`; 
  ctx.fillStyle = "#111827"; 
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(value, x + w/2, y + h - 20 * scale);
}

// --- Layout Helpers (Unchanged) ---

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
        const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
        const base64 = dataUrl.split(",")[1];
        resolve({ base64, mimeType: "image/jpeg" });
      };
      img.onerror = (e) => { URL.revokeObjectURL(objectUrl); reject(e); };
      img.src = objectUrl;
    });
  };