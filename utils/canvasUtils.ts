import { FoodAnalysis, ImageLayout, LabelState, ElementState } from "../types";

// --- Constants for Scale Calibration ---
// These factors calibrate the "User Scale" (e.g. 7.6) to the "Canvas Scale".
// This allows 760% to be a user-friendly number while keeping the drawing logic consistent.
const TITLE_SCALE_MODIFIER = 0.15;
const CARD_SCALE_MODIFIER = 0.25;

// --- Asset Generators (Create Sprites for the Editor) ---

/**
 * Generates a transparent PNG blob url for the Nutrition Card.
 * This allows the React UI to display it as a draggable <img>.
 */
export const generateCardSprite = async (analysis: FoodAnalysis): Promise<string> => {
  const canvas = document.createElement("canvas");
  // High resolution for crisp UI (Scale 2.0 relative to Base Dimensions)
  const scale = 2.0; 
  // Base dimensions (Compact Version)
  const baseW = 540;
  const headerH = 70;
  const baseH = 260;
  const cardH = baseH + headerH;
  
  // Padding to prevent shadow clipping (Shadow Blur 20 * Scale 2 = 40px)
  const padding = 40;

  canvas.width = baseW * scale + padding * 2;
  canvas.height = cardH * scale + padding * 2; 

  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  // Draw with offset to capture top/left shadows
  drawNutritionCardInternal(ctx, analysis, padding, padding, scale);
  
  return canvas.toDataURL("image/png");
};

/**
 * Generates a transparent PNG blob url for a Food Label Pill.
 */
export const generateLabelSprite = async (text: string): Promise<string> => {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  // Temporary font setup to measure
  const fontSize = 28 * 2; // High res
  ctx.font = `600 ${fontSize}px Inter, sans-serif`;
  const metrics = ctx.measureText(text);
  
  const paddingX = 16 * 2;
  // const paddingY = 10 * 2;
  const w = metrics.width + paddingX * 2;
  const h = fontSize * 1.6;
  
  // Add shadow buffer
  canvas.width = w + 40;
  canvas.height = h + 40;

  // Re-get context after resize (safeguard)
  const ctx2 = canvas.getContext("2d")!;
  ctx2.font = `600 ${fontSize}px Inter, sans-serif`;
  
  drawLabelPillInternal(ctx2, text, 20, 20, 2.0); // Offset 20 for shadow buffer

  return canvas.toDataURL("image/png");
};

/**
 * Generates a transparent PNG blob url for the Meal Title.
 */
export const generateTitleSprite = async (text: string): Promise<string> => {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if(!ctx) return "";

  const fontSize = 80 * 2;
  ctx.font = `bold ${fontSize}px Inter, sans-serif`;
  const metrics = ctx.measureText(text);
  
  const padding = 40; // Shadow buffer

  canvas.width = metrics.width + padding * 2;
  canvas.height = fontSize * 1.5 + padding * 2;
  
  const ctx2 = canvas.getContext("2d")!;
  // Center X, Offset Y
  drawMealTypeInternal(ctx2, text, canvas.width/2, padding, 2.0);

  return canvas.toDataURL("image/png");
};


// --- Main Rendering (Final Export) ---

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

      // 1. Draw Background
      ctx.drawImage(img, 0, 0);

      // Base scale relative to a 1200px wide reference image
      const refScale = canvas.width / 1200;

      // 2. Draw Meal Type
      if (layout.mealType.visible) {
        const x = layout.mealType.x * canvas.width;
        // Apply Modifier to User Scale to get Effective Scale
        const s = layout.mealType.scale * refScale * TITLE_SCALE_MODIFIER;
        
        // Adjust Y for padding used in Sprite (40px at Scale 2.0). 
        // Logic: 40px * (s / 2.0) = 20 * s.
        const y = layout.mealType.y * canvas.height + (20 * s); 
        
        drawMealTypeInternal(ctx, layout.mealType.text || analysis.mealType, x, y, s);
      }

      // 3. Draw Labels & Lines
      layout.labels.forEach(label => {
        if (!label.visible) return;
        
        const pillX = label.x * canvas.width;
        const pillY = label.y * canvas.height;
        const anchorX = label.anchorX * canvas.width;
        const anchorY = label.anchorY * canvas.height;
        const s = label.scale * refScale; // No modifier for labels
        const text = label.text || "";

        // Draw Line
        ctx.beginPath();
        ctx.moveTo(anchorX, anchorY);
        ctx.lineTo(pillX, pillY); 
        ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
        ctx.lineWidth = 3 * s;
        ctx.stroke();

        // Draw Anchor Dot
        ctx.beginPath();
        ctx.arc(anchorX, anchorY, 6 * s, 0, Math.PI * 2);
        ctx.fillStyle = "white";
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.3)";
        ctx.lineWidth = 2 * s;
        ctx.stroke();

        // Draw Pill
        const { w, h } = measureLabel(ctx, text, s);
        drawLabelPillInternal(ctx, text, pillX - w/2, pillY - h/2, s);
      });

      // 4. Draw Nutrition Card
      if (layout.card.visible) {
        // Adjust Position for Shadow Padding used in Sprite
        const s = layout.card.scale * refScale * CARD_SCALE_MODIFIER;
        
        // Sprite Padding was 40px at Scale 2.0.
        // Effective offset = 40 * (s / 2.0) = 20 * s.
        // Layout X/Y corresponds to the top-left of the Sprite (Shadow Buffer).
        // Actual Card Content needs to be drawn shifted by this offset.
        const offsetX = 20 * s;
        const offsetY = 20 * s;

        const x = layout.card.x * canvas.width + offsetX;
        const y = layout.card.y * canvas.height + offsetY;
        
        drawNutritionCardInternal(ctx, analysis, x, y, s);
      }

      resolve(canvas.toDataURL("image/jpeg", 0.9));
    };
  });
};


// --- Layout Helpers ---

export const getInitialLayout = (
  imgWidth: number, 
  imgHeight: number, 
  analysis: FoodAnalysis
): ImageLayout => {
  // Meal Type: Top Center
  // Default Scale 760% -> 7.6
  const mealType: ElementState = {
    x: 0.5,
    y: 0.08,
    scale: 7.6, 
    text: analysis.mealType,
    visible: true
  };

  // Card: Bottom Left
  // Default Scale 420% -> 4.2
  const defaultCardScale = 4.2;
  
  // Card dimensions logic
  // CHANGED: Use imgWidth only. Previous use of Math.max caused scaling mismatch on portrait images.
  const cardScaleRef = imgWidth / 1200;
  
  // Calculate height with default scale AND Modifier
  // Base H (330) * Ref * (UserScale * Modifier)
  const cardH_px = (260 + 70) * cardScaleRef * (defaultCardScale * CARD_SCALE_MODIFIER);
  
  // Margin 32px
  const margin_px = 32 * cardScaleRef;
  
  // Calculate X. Note: Since we use padded sprites, the layout x is top-left of the padding.
  // The content starts ~20px inside (relative to scale).
  // We can reduce margin slightly to keep visual alignment similar.
  const visualMarginX = Math.max(0, margin_px - (20 * (defaultCardScale * cardScaleRef * CARD_SCALE_MODIFIER)));
  const cardX = visualMarginX / imgWidth;
  
  // Position it at bottom with margin
  let cardY = (imgHeight - cardH_px - margin_px) / imgHeight;
  
  // Safety check
  if (cardY < 0) cardY = 0.05;

  const card: ElementState = {
    x: cardX,
    y: cardY,
    scale: defaultCardScale,
    visible: true
  };

  // Labels
  const labels: LabelState[] = analysis.items.map((item, idx) => {
    let cx = 0.5;
    let cy = 0.5;
    if (item.box_2d && item.box_2d.length === 4) {
      const [ymin, xmin, ymax, xmax] = item.box_2d;
      cx = (xmin + xmax) / 2 / 1000;
      cy = (ymin + ymax) / 2 / 1000;
    }

    return {
      id: idx,
      text: item.name,
      x: cx,
      y: Math.max(0.05, cy - 0.15),
      anchorX: cx,
      anchorY: cy,
      scale: 1.0,
      visible: true
    };
  });

  return { mealType, card, labels };
};

export const resizeImage = async (file: File, maxDimension: number = 1024): Promise<{ base64: string, mimeType: string }> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        let width = img.width;
        let height = img.height;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject(new Error("Could not get canvas context")); return; }
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
        const base64 = dataUrl.split(",")[1];
        resolve({ base64, mimeType: "image/jpeg" });
      };
      img.onerror = (e) => { URL.revokeObjectURL(objectUrl); reject(e); };
      img.src = objectUrl;
    });
  };

// --- Internal Drawing Functions (Used by both Sprites and Final Render) ---
// Note: These functions use "Base Dimensions" (e.g. 540px card width, 80px font).
// The modifiers above scale the User input down to these base dimensions appropriately.

function measureLabel(ctx: CanvasRenderingContext2D, text: string, scale: number) {
    const fontSize = 28 * scale;
    ctx.font = `600 ${fontSize}px Inter, sans-serif`;
    const metrics = ctx.measureText(text);
    const paddingX = 16 * scale;
    // const paddingY = 10 * scale;
    const w = metrics.width + (paddingX * 2);
    const h = fontSize * 1.6;
    return { w, h };
}

function drawLabelPillInternal(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, scale: number) {
  const { w, h } = measureLabel(ctx, text, scale);
  const r = h / 2;

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
  ctx.font = `600 ${fontSize}px Inter, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#111827";
  ctx.fillText(text, x + w/2, y + h/2);
}

function drawMealTypeInternal(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, scale: number) {
  const fontSize = 80 * scale;
  ctx.font = `bold ${fontSize}px Inter, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 10 * scale;
  ctx.shadowOffsetY = 2 * scale;

  ctx.fillStyle = "white";
  ctx.fillText(text, x, y);
  
  ctx.shadowColor = "transparent";
}

function drawNutritionCardInternal(ctx: CanvasRenderingContext2D, analysis: FoodAnalysis, x: number, y: number, scale: number) {
  const cardW = 540 * scale; 
  const headerH = 70 * scale; 
  const baseH = 260 * scale;
  const cardH = baseH + headerH; 
  const r = 24 * scale;

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
  
  // Badge
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

  // Title
  const titleW = cardW - paddingX * 2 - badgeW - 16 * scale;
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
  
  ctx.fillText(line1, x + paddingX, contentStartY);
  if (line2) {
    ctx.fillText(line2, x + paddingX, contentStartY + 30 * scale);
  }

  // Calories
  const titleHeight = line2 ? 56 * scale : 28 * scale;
  const calY = contentStartY + titleHeight + 16 * scale;
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
  ctx.beginPath(); ctx.moveTo(x + logoSize - bPad - bLen, y + bPad); ctx.quadraticCurveTo(x + logoSize - bPad, y + bPad, x + logoSize - bPad, y + bPad + bLen); ctx.stroke();
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