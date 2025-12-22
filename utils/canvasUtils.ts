import { FoodAnalysis, ImageLayout, HitRegion, ElementState, LabelState, LayoutConfig, CollageTransform, LabelStyle } from "../types";

// --- Constants for Scale Calibration ---
// These factors calibrate the "User Scale" to the "Canvas Scale".
// Unified across preview and export.
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
      // Enforce minimum export width for crisp text
      const TARGET_WIDTH = 2048;

      // Calculate dimensions maintaining aspect ratio
      // If original is larger than 2048, keep it. If smaller, upscale.
      let dWidth = img.width;
      let dHeight = img.height;

      if (dWidth < TARGET_WIDTH) {
        const scale = TARGET_WIDTH / dWidth;
        dWidth = TARGET_WIDTH;
        dHeight = Math.round(dHeight * scale);
      }

      const canvas = document.createElement("canvas");
      canvas.width = dWidth;
      canvas.height = dHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject("No Context"); return; }

      // Enable high quality upscaling for the background image
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // Use the unified drawing function
      // drawScene draws the image to full canvas size automatically
      drawScene(ctx, img, analysis, layout);

      resolve(canvas.toDataURL("image/jpeg", 0.92));
    };
    img.onerror = reject;
  });
};


// --- Internal Drawing Functions (Returns Bounding Box for Hit Testing) ---

function measureLabelText(ctx: CanvasRenderingContext2D, text: string, scale: number, isTextOnly: boolean) {
  const fontSize = 28 * scale;
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
  const r = h / 2;
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
  ctx.font = `600 ${fontSize}px Inter, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#111827";
  ctx.fillText(text, centerX, centerY);

  return { x, y, w, h };
}

function drawLabelTextOnlyInternal(ctx: CanvasRenderingContext2D, text: string, centerX: number, centerY: number, scale: number) {
  const { w, h } = measureLabelText(ctx, text, scale, true);
  const x = centerX - w / 2;
  const y = centerY - h / 2;

  ctx.save();
  const fontSize = 28 * scale;
  ctx.font = `800 ${fontSize}px Inter, sans-serif`;
  ctx.textAlign = "center";
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

  ctx.restore();

  return { x, y, w, h };
}

function drawMealTypeInternal(ctx: CanvasRenderingContext2D, text: string, centerX: number, topY: number, scale: number) {
  const fontSize = 80 * scale;
  ctx.font = `bold ${fontSize}px Inter, sans-serif`;
  const metrics = ctx.measureText(text);
  const w = metrics.width;
  const h = fontSize;
  const x = centerX - w / 2;
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

  // Badge
  const badgeW = 70 * scale;
  const badgeH = 36 * scale;
  const badgeX = x + cardW - paddingX - badgeW;
  const badgeY = contentStartY;

  ctx.strokeStyle = "#111827";
  ctx.lineWidth = 1.5 * scale;
  ctx.beginPath();
  ctx.roundRect(badgeX, badgeY, badgeW, badgeH, badgeH / 2);
  ctx.stroke();

  ctx.font = `600 ${16 * scale}px Inter, sans-serif`;
  ctx.fillStyle = "#111827";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`${analysis.items.length} 🥣`, badgeX + badgeW / 2, badgeY + badgeH / 2 + 2 * scale);

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
      if (ctx.measureText(testLine2).width < titleW) {
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
  ctx.fillText(`🔥 ${analysis.nutrition.calories} Kcal`, x + paddingX + 24 * scale, calY + calH / 2 + 2 * scale);

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
  ctx.ellipse(cx + aR * 0.4, cy - aR * 1.3, aR * 0.3, aR * 0.15, -Math.PI / 4, 0, Math.PI * 2);
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
  ctx.fillText(value, x + w / 2, y + h - 20 * scale);
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

  // Meal Type: Top Center or custom Y
  const mealType: ElementState = {
    x: 0.5,
    y: config?.defaultTitleY ?? 0.08,
    scale: defaultTitleScale,
    text: analysis.mealType,
    visible: true
  };

  // Card: Bottom Left or Right
  const cardScaleRef = imgWidth / 1200;

  // Calculate height with default scale AND Modifier
  const cardH_px = (260 + 70) * cardScaleRef * (defaultCardScale * CARD_SCALE_MODIFIER);

  // Margin 32px
  const margin_px = 32 * cardScaleRef;
  const visualMarginX = Math.max(0, margin_px); // Simplified margin calc

  // Default X (Left) if not provided
  let cardX = visualMarginX / imgWidth;

  if (config?.defaultCardX !== undefined) {
    cardX = config.defaultCardX;
  }

  // Default Y (Bottom) if not provided
  let cardY = (imgHeight - cardH_px - margin_px) / imgHeight;

  if (config?.defaultCardY !== undefined) {
    cardY = config.defaultCardY;
  }

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
      scale: defaultLabelScale,
      visible: true,
      style: defaultLabelStyle
    };
  });

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
    img.src = objectUrl;
  });
};

// Already exported
export const createCollage = async (files: (File | null)[], transforms: CollageTransform[] = [], padding: number = 0): Promise<File> => {
  const CANVAS_SIZE = 2048; // High res for good analysis
  const GRID_SIZE = CANVAS_SIZE / 2;

  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  const ctx = canvas.getContext('2d');

  if (!ctx) throw new Error("Could not create collage canvas");

  // Fill white background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  const loadImage = (file: File): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = reject;
      img.src = url;
    });
  };

  // Draw each image into its quadrant (crop to square to fit perfectly)
  for (let i = 0; i < 4; i++) {
    const file = files[i];
    if (!file) {
      continue;
    }

    // Default transform if missing
    const t = transforms[i] || { scale: 1, x: 0, y: 0 };

    try {
      const img = await loadImage(file);

      // Calculate grid position
      const dx = (i % 2) * GRID_SIZE;
      const dy = Math.floor(i / 2) * GRID_SIZE;
      const moveX = t.x * GRID_SIZE;
      const moveY = t.y * GRID_SIZE;

      // Calculate Spacing/Padding Inset (padding is percentage of slot width)
      const inset = GRID_SIZE * padding;
      const contentSize = GRID_SIZE - (2 * inset);

      // Calculate "Fit" (Contain) Base Scaling within the content area
      // Image must fit into contentSize x contentSize
      const baseScale = Math.min(contentSize / img.width, contentSize / img.height);
      const drawW = img.width * baseScale;
      const drawH = img.height * baseScale;

      // Center the fitted image in the quadrant (accounting for inset)
      // Top-Left of content area is (dx + inset, dy + inset)
      // Center of content area is (dx + inset + contentSize/2) === (dx + GRID/2)
      // So center is same.
      // Top-Left of image relative to quadrant origin (dx, dy):
      // x = inset + (contentSize - drawW)/2
      const imgX = inset + (contentSize - drawW) / 2;
      const imgY = inset + (contentSize - drawH) / 2;


      ctx.save();

      // Clip to Content Area (respecting padding)
      ctx.beginPath();
      ctx.rect(dx + inset, dy + inset, contentSize, contentSize);
      ctx.clip();

      // Move to Center of Quadrant to apply transform
      ctx.translate(dx + GRID_SIZE / 2, dy + GRID_SIZE / 2);

      // Apply User Pan/Zoom
      ctx.translate(moveX, moveY);
      ctx.scale(t.scale, t.scale);

      // Move back to draw space (relative to quadrant center)
      ctx.translate(-GRID_SIZE / 2, -GRID_SIZE / 2);

      // Draw the full image fitted
      ctx.drawImage(img, 0, 0, img.width, img.height, imgX, imgY, drawW, drawH);

      ctx.restore();

    } catch (e) {
      console.error(`Failed to load image for slot ${i}`, e);
    }
  }

  const blobPromise = new Promise<File>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], `collage-${Date.now()}.jpg`, { type: 'image/jpeg' });
        resolve(file);
      } else {
        reject(new Error("Failed to create collage blob"));
      }
    }, 'image/jpeg', 0.9);
  });

  // Safety timeout: 10 seconds
  const timeoutPromise = new Promise<File>((_, reject) => {
    setTimeout(() => reject(new Error("Collage creation timed out after 10s")), 10000);
  });

  return Promise.race([blobPromise, timeoutPromise]);
};