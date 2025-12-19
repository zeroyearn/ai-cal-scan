
import { FoodAnalysis, ImageLayout, LayoutConfig, ElementState, LabelState, HitRegion } from "../types";

const CARD_SCALE_MODIFIER = 1.0;

export function drawScene(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  analysis: FoodAnalysis,
  layout: ImageLayout
): HitRegion[] {
  // RATING MODE: Completely different rendering pipeline
  if (layout.mode === 'rating') {
      return drawRatingComposite(ctx, img, analysis, layout);
  }

  // STANDARD MODES (Food & Viral)
  const regions: HitRegion[] = [];

  // Clear and draw background only if image is provided
  if (img) {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.drawImage(img, 0, 0, ctx.canvas.width, ctx.canvas.height);
  }

  const { width, height } = ctx.canvas;

  // Draw Viral Caption (If exists)
  if (layout.caption && layout.caption.visible && layout.caption.text) {
      const bbox = drawCaptionInternal(
          ctx,
          layout.caption.text,
          layout.caption.x * width,
          layout.caption.y * height,
          layout.caption.scale,
          width // pass canvas width for wrapping
      );
      regions.push({
          id: 'caption',
          type: 'caption',
          ...bbox
      });
  }

  // Draw Meal Type (Standard Mode)
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
 * Renders a "Report Card" style composition for Rating Mode with interactive elements.
 * Optimized to match reference: Side-by-side header, List body.
 */
function drawRatingComposite(
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement | null,
    analysis: FoodAnalysis,
    layout: ImageLayout
): HitRegion[] {
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    const regions: HitRegion[] = [];
    const rating = analysis.rating || { score: 0, verdict: "Unknown", title: "Analysis", description: "No data." };
    
    // Score Color Logic
    let scoreColor = "#65a30d"; // Green (Lime-600)
    let scoreRingColor = "#bef264"; // Lime-300
    if (rating.score < 70) { scoreColor = "#ca8a04"; scoreRingColor = "#fde047"; } // Yellow
    if (rating.score < 50) { scoreColor = "#dc2626"; scoreRingColor = "#fca5a5"; } // Red

    // 1. Background
    ctx.fillStyle = "#f3f4f6"; // Light gray bg like reference
    ctx.fillRect(0, 0, w, h);

    // --- Header Section ---
    const headerPadding = w * 0.05;
    const headerH = w * 0.55; // Height of top section
    
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, headerH);
    
    // 2. Image (Left Side)
    // Fixed position relative to top-left, not draggable (background element)
    const imgSize = w * 0.4;
    const imgX = headerPadding;
    const imgY = headerPadding;
    
    if (img) {
        // Crop square center
        const minDim = Math.min(img.width, img.height);
        const sx = (img.width - minDim) / 2;
        const sy = (img.height - minDim) / 2;
        
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(imgX, imgY, imgSize, imgSize, w * 0.04);
        ctx.clip();
        ctx.drawImage(img, sx, sy, minDim, minDim, imgX, imgY, imgSize, imgSize);
        // Inner border
        ctx.strokeStyle = "rgba(0,0,0,0.05)";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
    }

    // 3. Score (Interactive)
    if (layout.score && layout.score.visible) {
        const cx = layout.score.x * w;
        const cy = layout.score.y * h;
        const s = layout.score.scale;
        
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillStyle = scoreColor;
        const fontSize = 80 * s * (w/1000); 
        ctx.font = `800 ${fontSize}px Inter, sans-serif`;
        
        const scoreText = `${rating.score}`;
        ctx.fillText(scoreText, cx, cy);
        const scoreMetrics = ctx.measureText(scoreText);
        
        // /100 suffix
        ctx.fillStyle = "#9ca3af";
        ctx.font = `600 ${fontSize * 0.4}px Inter, sans-serif`;
        ctx.fillText("/100", cx + scoreMetrics.width + (w*0.01), cy + (fontSize * 0.45));
        
        regions.push({
            id: 'score',
            type: 'score',
            x: cx,
            y: cy,
            w: scoreMetrics.width * 1.5, 
            h: fontSize
        });
    }

    // 4. Verdict Pill (Interactive)
    if (layout.verdict && layout.verdict.visible) {
        const cx = layout.verdict.x * w;
        const cy = layout.verdict.y * h;
        const s = layout.verdict.scale;
        
        const fontSize = 28 * s * (w/1000);
        ctx.font = `bold ${fontSize}px Inter, sans-serif`;
        const vText = rating.verdict;
        const vMetrics = ctx.measureText(vText);
        
        const pillPaddingX = fontSize * 1.2;
        const pillPaddingY = fontSize * 0.6;
        const pillW = vMetrics.width + pillPaddingX * 2;
        const pillH = fontSize + pillPaddingY * 2;
        
        // Draw pill
        ctx.fillStyle = scoreColor;
        ctx.beginPath();
        ctx.roundRect(cx, cy, pillW, pillH, pillH/2);
        ctx.fill();
        
        ctx.fillStyle = "#ffffff";
        ctx.textBaseline = "middle";
        ctx.textAlign = "center";
        ctx.fillText(vText, cx + pillW/2, cy + pillH/2 + (fontSize*0.05));
        
        regions.push({
            id: 'verdict',
            type: 'verdict',
            x: cx,
            y: cy,
            w: pillW,
            h: pillH
        });
    }

    // 5. Product Name (Interactive)
    if (layout.mealType && layout.mealType.visible) {
        const cx = layout.mealType.x * w;
        const cy = layout.mealType.y * h;
        const s = layout.mealType.scale;
        
        const fontSize = 42 * s * (w/1000);
        ctx.fillStyle = "#1f2937"; // Dark gray
        ctx.font = `bold ${fontSize}px Inter, sans-serif`;
        ctx.textBaseline = "top";
        ctx.textAlign = "left";
        
        const text = layout.mealType.text || analysis.summary;
        // Wrap title if it's too long
        const maxTitleW = w - (w*0.05) - cx; // From x to right edge
        const words = text.split(" ");
        let line = "";
        let dy = cy;
        
        for (let i = 0; i < words.length; i++) {
            const testLine = line + words[i] + " ";
            if (ctx.measureText(testLine).width > maxTitleW && i > 0) {
                ctx.fillText(line, cx, dy);
                line = words[i] + " ";
                dy += fontSize * 1.2;
            } else {
                line = testLine;
            }
        }
        ctx.fillText(line, cx, dy);
        
        regions.push({
            id: 'title',
            type: 'title',
            x: cx,
            y: cy,
            w: maxTitleW,
            h: (dy - cy) + fontSize
        });
    }

    // 6. Branding Element "scored by [Logo] AI Cal" (Interactive)
    if (layout.branding && layout.branding.visible) {
        const cx = layout.branding.x * w;
        const cy = layout.branding.y * h;
        const s = layout.branding.scale;
        
        const fontSize = 24 * s * (w/1000);
        ctx.font = `500 ${fontSize}px Inter, sans-serif`;
        ctx.textBaseline = "middle";
        ctx.textAlign = "center";
        
        // Measure components
        const prefix = "scored by ";
        const brandName = "AI Cal";
        const prefixMetrics = ctx.measureText(prefix);
        const brandMetrics = ctx.measureText(brandName);
        const logoSize = fontSize * 1.8;
        const spacing = fontSize * 0.4;
        
        const totalW = prefixMetrics.width + spacing + logoSize + spacing + brandMetrics.width;
        
        // Draw logic centered on cx, cy
        const startX = cx - (totalW / 2);
        
        // Draw "scored by"
        ctx.fillStyle = "#9ca3af"; // Gray
        ctx.textAlign = "left";
        ctx.fillText(prefix, startX, cy);
        
        // Draw Logo (Apple Icon)
        const logoX = startX + prefixMetrics.width + spacing;
        drawAppleLogo(ctx, logoX, cy - (logoSize*0.45), logoSize, "#111827");
        
        // Draw "AI Cal"
        const brandX = logoX + logoSize + spacing;
        ctx.fillStyle = "#111827"; // Black
        ctx.font = `800 ${fontSize}px Inter, sans-serif`;
        ctx.fillText(brandName, brandX, cy);
        
        // Horizontal Line (Optional styling visual container)
        // Let's draw faint lines extending out? 
        // No, keep it clean as requested.
        
        regions.push({
            id: 'branding',
            type: 'branding',
            x: startX,
            y: cy - fontSize,
            w: totalW,
            h: fontSize * 2
        });
    }

    // --- Analysis Card (List Style) ---
    if (layout.card && layout.card.visible) {
        const cx = layout.card.x * w; 
        const cy = layout.card.y * h;
        const s = layout.card.scale;
        
        const cardW = w * 0.92;
        
        const baseFontSize = 32 * s * (w/1000);
        const titleColor = "#111827";
        const bodyColor = "#4b5563";
        
        // -- Prepare List Items --
        const items = [];
        
        // Item 1: Main Gemini Analysis
        items.push({
            score: (analysis.healthScore || 5) * 10,
            scoreColor: scoreColor,
            ringColor: scoreRingColor,
            title: rating.title || "Nutritional Analysis",
            text: rating.description
        });
        
        // Item 2: Protein Highlight (if significant)
        if (analysis.nutrition.protein) {
             items.push({
                score: 100, // Visual full ring for "Feature"
                label: "PRO",
                scoreColor: "#3b82f6", // Blue
                ringColor: "#bfdbfe",
                title: "Protein Content",
                text: `${analysis.nutrition.protein} of protein. A key macronutrient for muscle repair and satiety.`
            });
        }
        
        // Start Drawing List
        const listStartX = cx + (cardW * 0.05);
        let currentY = cy + (cardW * 0.08); // Top padding inside card
        
        // Card Background (Preliminary draw to be behind text)
        ctx.save();
        
        // Shadow & Box
        ctx.shadowColor = "rgba(0,0,0,0.06)";
        ctx.shadowBlur = 30;
        ctx.shadowOffsetY = 10;
        ctx.fillStyle = "#ffffff";
        
        ctx.beginPath();
        ctx.roundRect(cx, cy, cardW, h - cy - (w*0.05), w * 0.05);
        ctx.fill();
        ctx.shadowColor = "transparent"; // Reset
        
        // Card Title
        ctx.font = `800 ${baseFontSize * 1.2}px Inter, sans-serif`;
        ctx.fillStyle = "#111827";
        ctx.textAlign = "left";
        ctx.fillText("✨ ANALYSIS", listStartX, currentY);
        currentY += (baseFontSize * 2);
        
        // Draw Items
        const ringSize = w * 0.14;
        const textStartX = listStartX + ringSize + (w * 0.04);
        const maxTextW = (cx + cardW) - textStartX - (cardW * 0.05);
        
        items.forEach(item => {
            const itemStartY = currentY;
            
            // 1. Draw Ring
            const ringX = listStartX + ringSize/2;
            const ringY = itemStartY + ringSize/2;
            const radius = ringSize * 0.45;
            
            // Background Ring
            ctx.beginPath();
            ctx.arc(ringX, ringY, radius, 0, Math.PI * 2);
            ctx.strokeStyle = item.ringColor || "#e5e7eb";
            ctx.lineWidth = radius * 0.2;
            ctx.stroke();
            
            // Foreground Ring (Arc)
            const scorePct = item.score / 100;
            ctx.beginPath();
            ctx.arc(ringX, ringY, radius, -Math.PI/2, (-Math.PI/2) + (Math.PI * 2 * scorePct));
            ctx.strokeStyle = item.scoreColor;
            ctx.lineCap = 'round';
            ctx.stroke();
            
            // Center Text
            ctx.fillStyle = "#111827";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            if (item.label) {
                 ctx.font = `bold ${radius * 0.6}px Inter, sans-serif`;
                 ctx.fillText(item.label, ringX, ringY);
            } else {
                 ctx.font = `bold ${radius * 0.8}px Inter, sans-serif`;
                 ctx.fillText(`${item.score}`, ringX, ringY);
            }

            // 2. Draw Text Content
            ctx.textAlign = "left";
            ctx.textBaseline = "top";
            
            // Title
            let textY = itemStartY + (w*0.01);
            ctx.font = `bold ${baseFontSize}px Inter, sans-serif`;
            ctx.fillStyle = titleColor;
            ctx.fillText(item.title, textStartX, textY);
            textY += (baseFontSize * 1.4);
            
            // Body
            ctx.font = `400 ${baseFontSize * 0.85}px Inter, sans-serif`;
            ctx.fillStyle = bodyColor;
            
            const words = item.text.split(" ");
            let line = "";
            for (let i = 0; i < words.length; i++) {
                const testLine = line + words[i] + " ";
                if (ctx.measureText(testLine).width > maxTextW && i > 0) {
                    ctx.fillText(line, textStartX, textY);
                    line = words[i] + " ";
                    textY += (baseFontSize * 1.2);
                } else {
                    line = testLine;
                }
            }
            ctx.fillText(line, textStartX, textY);
            
            // Advance Y
            const itemContentH = textY - itemStartY + (baseFontSize * 1.2);
            const minItemH = ringSize + (w*0.04);
            currentY += Math.max(itemContentH, minItemH);
        });

        regions.push({
            id: 'card',
            type: 'card',
            x: cx,
            y: cy,
            w: cardW,
            h: currentY - cy 
        });
        
        ctx.restore();
    }
    
    return regions; 
}

function drawAppleLogo(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
    ctx.save();
    ctx.translate(x, y);
    const scale = size / 100;
    ctx.scale(scale, scale);
    
    ctx.fillStyle = color;
    ctx.beginPath();
    // Simplified Apple shape approximation
    ctx.moveTo(50, 25);
    ctx.bezierCurveTo(40, 25, 35, 30, 25, 30);
    ctx.bezierCurveTo(10, 30, 0, 45, 0, 65);
    ctx.bezierCurveTo(0, 85, 15, 100, 30, 100);
    ctx.bezierCurveTo(40, 100, 45, 95, 50, 95);
    ctx.bezierCurveTo(55, 95, 60, 100, 70, 100);
    ctx.bezierCurveTo(85, 100, 100, 85, 100, 65);
    ctx.bezierCurveTo(100, 50, 90, 40, 80, 35);
    ctx.bezierCurveTo(80, 35, 75, 45, 75, 55);
    ctx.bezierCurveTo(75, 70, 85, 75, 90, 75);
    ctx.bezierCurveTo(88, 85, 80, 95, 70, 95);
    ctx.bezierCurveTo(65, 95, 60, 90, 50, 90);
    ctx.bezierCurveTo(40, 90, 35, 95, 30, 95);
    ctx.bezierCurveTo(20, 95, 10, 80, 10, 65);
    ctx.bezierCurveTo(10, 50, 20, 35, 35, 35);
    ctx.bezierCurveTo(40, 35, 45, 40, 50, 40);
    ctx.bezierCurveTo(55, 40, 60, 35, 65, 35);
    ctx.bezierCurveTo(75, 35, 85, 40, 90, 45);
    ctx.fill();
    
    // Leaf
    ctx.beginPath();
    ctx.moveTo(50, 20);
    ctx.bezierCurveTo(50, 10, 60, 0, 70, 0);
    ctx.bezierCurveTo(60, 0, 50, 10, 50, 20);
    ctx.bezierCurveTo(50, 20, 40, 20, 40, 20); // Stem base
    // Actually simplified leaf:
    ctx.ellipse(60, 10, 12, 6, -Math.PI/4, 0, Math.PI*2);
    ctx.fill();
    
    ctx.restore();
}

function drawMacroMini(ctx: CanvasRenderingContext2D, label: string, val: string, x: number, y: number, w: number, h: number, scale: number) {
    ctx.fillStyle = "#f9fafb";
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 8 * scale * 4); 
    ctx.fill();
    
    ctx.fillStyle = "#6b7280";
    ctx.font = `600 ${28 * scale}px Inter, sans-serif`; 
    ctx.textAlign = "left";
    ctx.fillText(label.toUpperCase(), x + (24*scale), y + (24*scale));
    
    ctx.fillStyle = "#111827";
    ctx.font = `bold ${42 * scale}px Inter, sans-serif`;
    ctx.fillText(val, x + (24*scale), y + h - (24*scale));
}

export const getInitialLayout = (
  imgWidth: number, 
  imgHeight: number, 
  analysis: FoodAnalysis,
  config?: LayoutConfig
): ImageLayout => {
  const defaultTitleScale = config?.defaultTitleScale ?? 7.6;
  const defaultCardScale = config?.defaultCardScale ?? 4.2;
  const defaultLabelScale = config?.defaultLabelScale ?? 1.0;
  const defaultLabelStyle = config?.defaultLabelStyle ?? 'default';

  // --- Standard Mode Defaults ---
  const titleX = config?.defaultTitlePos?.x !== undefined ? config.defaultTitlePos.x / 100 : 0.5;
  const titleY = config?.defaultTitlePos?.y !== undefined ? config.defaultTitlePos.y / 100 : 0.08;

  // --- Rating Mode Defaults ---
  // Side-by-side header layout positions
  const ratingScoreX = 0.52;
  const ratingScoreY = 0.05; 
  
  const ratingVerdictX = 0.52;
  const ratingVerdictY = 0.16; 
  
  const ratingTitleX = 0.52;
  const ratingTitleY = 0.26; 
  
  const ratingCardY = 0.35; 
  
  const ratingBrandingY = 0.305; // Between header and card

  const mealType: ElementState = {
    x: ratingTitleX, 
    y: ratingTitleY,
    scale: defaultTitleScale, 
    text: analysis.mealType,
    visible: true
  };
  
  if (config?.defaultTitlePos) {
      mealType.x = config.defaultTitlePos.x / 100;
      mealType.y = config.defaultTitlePos.y / 100;
  }

  const cardScaleRef = imgWidth / 1200;
  let cardX, cardY;

  if (config?.defaultCardPos && config.defaultCardPos.x !== undefined && config.defaultCardPos.y !== undefined) {
      cardX = config.defaultCardPos.x / 100;
      cardY = config.defaultCardPos.y / 100;
  } else {
      const cardH_px = (260 + 70) * cardScaleRef * (defaultCardScale * CARD_SCALE_MODIFIER);
      const margin_px = 32 * cardScaleRef;
      const visualMarginX = Math.max(0, margin_px); 
      cardX = visualMarginX / imgWidth;
      cardY = (imgHeight - cardH_px - margin_px) / imgHeight;
      if (cardY < 0) cardY = 0.05;
  }

  const card: ElementState = {
    x: 0.04, 
    y: ratingCardY,
    scale: defaultCardScale,
    visible: true
  };

  const caption: ElementState = {
      x: 0.5,
      y: 0.85, 
      scale: 1.0,
      visible: true,
      text: "" 
  };
  
  const score: ElementState = {
      x: ratingScoreX,
      y: ratingScoreY,
      scale: 1.0,
      visible: true
  };
  
  const verdict: ElementState = {
      x: ratingVerdictX,
      y: ratingVerdictY,
      scale: 1.0,
      visible: true
  };
  
  const branding: ElementState = {
      x: 0.5,
      y: ratingBrandingY,
      scale: 1.0,
      visible: true
  };

  const seenNames = new Set<string>();
  const labels: LabelState[] = [];
  
  analysis.items.forEach((item) => {
      const nameKey = item.name.toLowerCase().trim();
      if (seenNames.has(nameKey)) return;
      seenNames.add(nameKey);
      
      const idx = labels.length;
      let cx = 0.5, cy = 0.5;
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

  if (labels.length === 1 && analysis.healthTag) {
     const mainLabel = labels[0];
     labels.push({
        id: 9999,
        text: `✨ ${analysis.healthTag}`,
        x: mainLabel.x,
        y: mainLabel.y + 0.12, 
        anchorX: mainLabel.anchorX,
        anchorY: mainLabel.anchorY,
        scale: defaultLabelScale * 0.75, 
        visible: true,
        style: 'pill'
     });
  }

  return { mealType, card, labels, caption, score, verdict, branding };
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
                 sWidth = height * targetRatio;
                 sHeight = height;
                 sx = (width - sWidth) / 2;
             } else {
                 sWidth = width;
                 sHeight = width / targetRatio;
                 sy = (height - sHeight) / 2;
             }
        }

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
        
        dWidth = Math.floor(dWidth);
        dHeight = Math.floor(dHeight);

        const canvas = document.createElement("canvas");
        canvas.width = dWidth;
        canvas.height = dHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject(new Error("Could not get canvas context")); return; }
        
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, dWidth, dHeight);
        
        const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
        const base64 = dataUrl.split(",")[1];
        resolve({ base64, mimeType: "image/jpeg" });
      };
      img.onerror = (e) => { URL.revokeObjectURL(objectUrl); reject(e); };
      img.src = objectUrl;
    });
};

function drawCaptionInternal(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    scale: number,
    maxWidth: number
): { x: number, y: number, w: number, h: number } {
    const fontSize = 48 * scale;
    ctx.font = `bold ${fontSize}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Simple wrap logic
    const lines: string[] = [];
    let line = '';
    const safeWidth = maxWidth * 0.9;
    
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const testLine = line + char;
        const metrics = ctx.measureText(testLine);
        if (metrics.width > safeWidth && i > 0) {
            lines.push(line);
            line = char;
        } else {
            line = testLine;
        }
    }
    lines.push(line);

    const lineHeight = fontSize * 1.3;
    const totalHeight = lines.length * lineHeight;
    
    ctx.shadowColor = "rgba(0,0,0,0.8)";
    ctx.shadowBlur = 4;
    ctx.lineWidth = 3;
    ctx.strokeStyle = "black";
    ctx.fillStyle = "white"; 
    
    let currentY = y - (totalHeight / 2) + (lineHeight / 2);
    
    lines.forEach(l => {
        ctx.strokeText(l, x, currentY);
        ctx.fillText(l, x, currentY);
        currentY += lineHeight;
    });
    
    ctx.shadowColor = "transparent";
    
    return {
        x: x - safeWidth/2,
        y: y - totalHeight/2,
        w: safeWidth,
        h: totalHeight
    };
}

function drawMealTypeInternal(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    scale: number
): { x: number, y: number, w: number, h: number } {
    const fontSize = 60 * scale;
    ctx.font = `800 ${fontSize}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    
    const metrics = ctx.measureText(text.toUpperCase());
    const w = metrics.width;
    const h = fontSize;
    
    ctx.fillStyle = "white";
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 10;
    
    ctx.fillText(text.toUpperCase(), x, y);
    ctx.shadowColor = "transparent";
    
    return { x: x - w/2, y: y, w, h };
}

function drawLabelTextOnlyInternal(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    scale: number
): { x: number, y: number, w: number, h: number } {
    const fontSize = 32 * scale;
    ctx.font = `600 ${fontSize}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    const metrics = ctx.measureText(text);
    const w = metrics.width;
    const h = fontSize;
    
    ctx.shadowColor = "rgba(0,0,0,0.8)";
    ctx.shadowBlur = 4;
    ctx.fillStyle = "white";
    ctx.fillText(text, x, y);
    ctx.shadowColor = "transparent";
    
    return { x: x - w/2, y: y - h/2, w, h };
}

function drawLabelPillInternal(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    scale: number
): { x: number, y: number, w: number, h: number } {
    const fontSize = 28 * scale;
    ctx.font = `bold ${fontSize}px Inter, sans-serif`;
    const metrics = ctx.measureText(text);
    const paddingX = 16 * scale;
    const paddingY = 8 * scale;
    const w = metrics.width + paddingX * 2;
    const h = fontSize + paddingY * 2;
    
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.shadowColor = "rgba(0,0,0,0.2)";
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.roundRect(x - w/2, y - h/2, w, h, h/2);
    ctx.fill();
    ctx.shadowColor = "transparent";
    
    ctx.fillStyle = "#111827"; 
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y + (scale * 2)); 
    
    return { x: x - w/2, y: y - h/2, w, h };
}

function drawNutritionCardInternal(
    ctx: CanvasRenderingContext2D,
    analysis: FoodAnalysis,
    x: number,
    y: number,
    scale: number
): { x: number, y: number, w: number, h: number } {
    const baseW = 300; 
    const w = baseW * scale;
    
    const padding = 20 * scale;
    const titleSize = 24 * scale;
    const calSize = 56 * scale;
    const macroLabelSize = 14 * scale;
    const macroValSize = 18 * scale;
    
    // Estimate height
    const h = (padding * 2) + titleSize + (10*scale) + calSize + (10*scale) + (40*scale); 
    
    // Draw Card Background
    ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
    ctx.shadowColor = "rgba(0,0,0,0.15)";
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 10;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 16 * scale);
    ctx.fill();
    ctx.shadowColor = "transparent";
    
    // Draw Title (Summary)
    ctx.fillStyle = "#374151";
    ctx.font = `600 ${titleSize}px Inter, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(analysis.summary || "Food Analysis", x + padding, y + padding);
    
    // Draw Calories
    ctx.fillStyle = "#111827";
    ctx.font = `800 ${calSize}px Inter, sans-serif`;
    const calText = `${analysis.nutrition.calories}`;
    ctx.fillText(calText, x + padding, y + padding + titleSize + (10*scale));
    
    const calMetrics = ctx.measureText(calText);
    ctx.font = `500 ${titleSize * 0.6}px Inter, sans-serif`;
    ctx.fillStyle = "#6b7280";
    ctx.fillText("kcal", x + padding + calMetrics.width + (8*scale), y + padding + titleSize + (10*scale) + (calSize * 0.5));
    
    // Macros Row
    const macroY = y + h - padding - (40*scale);
    const colW = (w - (padding*2)) / 3;
    
    drawMacroItem(ctx, "PROTEIN", analysis.nutrition.protein, x + padding, macroY, scale, macroLabelSize, macroValSize);
    drawMacroItem(ctx, "CARBS", analysis.nutrition.carbs, x + padding + colW, macroY, scale, macroLabelSize, macroValSize);
    drawMacroItem(ctx, "FAT", analysis.nutrition.fat, x + padding + (colW*2), macroY, scale, macroLabelSize, macroValSize);
    
    return { x, y, w, h };
}

function drawMacroItem(ctx: CanvasRenderingContext2D, label: string, val: string, x: number, y: number, scale: number, labelSize: number, valSize: number) {
    ctx.fillStyle = "#9ca3af";
    ctx.font = `600 ${labelSize}px Inter, sans-serif`;
    ctx.fillText(label, x, y);
    
    ctx.fillStyle = "#1f2937";
    ctx.font = `700 ${valSize}px Inter, sans-serif`;
    ctx.fillText(val, x, y + labelSize + (4*scale));
}

// --- Exports ---

export async function renderFinalImage(
    previewUrl: string, 
    analysis: FoodAnalysis, 
    layout: ImageLayout
): Promise<string> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) { reject(new Error("No context")); return; }
            
            drawScene(ctx, img, analysis, layout);
            resolve(canvas.toDataURL('image/jpeg', 0.95));
        };
        img.onerror = reject;
        img.src = previewUrl;
    });
}

export async function generateCollage(
    urls: string[], 
    config: { width: number, height: number, padding: number, color: string }
): Promise<string> {
    const canvas = document.createElement('canvas');
    canvas.width = config.width;
    canvas.height = config.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error("No context");
    
    ctx.fillStyle = config.color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    if (urls.length !== 4) throw new Error("Collage requires exactly 4 images");
    
    const cellW = (config.width - (config.padding * 3)) / 2;
    const cellH = (config.height - (config.padding * 3)) / 2;
    
    const positions = [
        { x: config.padding, y: config.padding },
        { x: config.padding * 2 + cellW, y: config.padding },
        { x: config.padding, y: config.padding * 2 + cellH },
        { x: config.padding * 2 + cellW, y: config.padding * 2 + cellH },
    ];
    
    const loadImage = (url: string) => new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
    });
    
    try {
        const images = await Promise.all(urls.map(loadImage));
        
        images.forEach((img, i) => {
            const pos = positions[i];
            const ratio = Math.max(cellW / img.width, cellH / img.height);
            const sw = cellW / ratio;
            const sh = cellH / ratio;
            const sx = (img.width - sw) / 2;
            const sy = (img.height - sh) / 2;
            
            ctx.save();
            ctx.beginPath();
            ctx.rect(pos.x, pos.y, cellW, cellH);
            ctx.clip();
            ctx.drawImage(img, sx, sy, sw, sh, pos.x, pos.y, cellW, cellH);
            ctx.restore();
        });
        
        return canvas.toDataURL('image/jpeg', 0.95);
    } catch (e) {
        console.error("Failed to generate collage", e);
        throw e;
    }
}
