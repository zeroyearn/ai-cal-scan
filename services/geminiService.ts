
import { GoogleGenAI, Type } from "@google/genai";
import { FoodAnalysis } from "../types";

// The analysis schema for the model's response in JSON format.
const analysisSchema = {
  type: Type.OBJECT,
  properties: {
    isFood: { type: Type.BOOLEAN, description: "True if the main subject is food. False if it is a menu, a person, a wrapper, or blurry." },
    hasExistingText: { type: Type.BOOLEAN, description: "True if the image contains visible text describing the food, nutrition labels, or branding overlays." },
    mealType: { type: Type.STRING, description: "E.g., Breakfast, Lunch, Dinner, Snack." },
    summary: { type: Type.STRING, description: "A short 5-8 word summary of the dish." },
    healthScore: { type: Type.NUMBER, description: "A health score from 1 to 10 based on nutritional density and balance (10 is healthiest)." },
    healthTag: { type: Type.STRING, description: "A very short (max 5 words) description of the key health benefit. E.g., 'High in Protein', 'Rich in Vitamins', 'Heart Healthy'." },
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: "Name of the specific ingredient/item." },
          box_2d: {
            type: Type.ARRAY,
            items: { type: Type.NUMBER },
            description: "Bounding box [ymin, xmin, ymax, xmax] using 0-1000 scale.",
          },
        },
        required: ["name", "box_2d"],
      },
    },
    nutrition: {
      type: Type.OBJECT,
      properties: {
        calories: { type: Type.NUMBER, description: "Estimated total calories." },
        carbs: { type: Type.STRING, description: "Estimated carbs (e.g., '15g')." },
        protein: { type: Type.STRING, description: "Estimated protein (e.g., '42g')." },
        fat: { type: Type.STRING, description: "Estimated fat (e.g., '33g')." },
      },
      required: ["calories", "carbs", "protein", "fat"],
    },
  },
  required: ["isFood", "hasExistingText", "items", "nutrition", "mealType", "summary"],
};

// Helper function to handle exponential backoff for API rate limits.
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function getClient(apiKey?: string, baseUrl?: string) {
  const effectiveKey = apiKey || process.env.API_KEY;
  if (!effectiveKey) {
    throw new Error("Gemini API Key is missing. Please configure it in Settings.");
  }

  const clientConfig: any = { apiKey: effectiveKey };
  
  if (baseUrl && baseUrl.trim().length > 0) {
    let url = baseUrl.trim();
    if (url.endsWith('/')) url = url.slice(0, -1);
    clientConfig.baseUrl = url;
  }

  clientConfig.customHeaders = {
    'Authorization': `Bearer ${effectiveKey}`
  };

  return new GoogleGenAI(clientConfig);
}

// Analyzes a food image using the Gemini API.
export async function analyzeFoodImage(
  base64Image: string, 
  mimeType: string, 
  apiKey?: string, 
  baseUrl?: string
): Promise<FoodAnalysis> {
  const maxRetries = 3;
  let attempt = 0;
  const ai = getClient(apiKey, baseUrl);

  while (attempt <= maxRetries) {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: {
          parts: [
            { inlineData: { mimeType: mimeType, data: base64Image } },
            {
              text: `Analyze this image for a bulk food processing tool.
              1. **Verification**: Determine if the *main subject* is real food. If it is a menu, a recipe book, a human face, an empty plate, or just a wrapper, set 'isFood' to false.
              2. **Text Detection**: Check if the image *already* has text overlays, watermarks, subtitles, or nutrition facts added to it. If yes, set 'hasExistingText' to true.
              3. **Analysis**: Identify specific ingredients. IMPORTANT: If there are multiple identical items (e.g. a pile of potatoes, multiple cookies), only detect ONE representative item (preferably the most central one) to label. Do NOT label every single instance.
              4. **Health Score**: If it is a clear food item, provide a 'healthScore' (1-10) and a 'healthTag' (short benefit).
              5. **Nutrition**: Estimate nutrition facts for the visible portion.`,
            },
          ],
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: analysisSchema,
          systemInstruction: "You are a rigid food analysis AI. You flag images with existing text overlays and reject non-food images. Provide health scores for valid food.",
        },
      });

      if (!response.text) throw new Error("No response from Gemini");
      return JSON.parse(response.text) as FoodAnalysis;

    } catch (error: any) {
      attempt++;
      if (shouldRetry(error) && attempt <= maxRetries) {
        await delay(Math.pow(2, attempt - 1) * 1000);
        continue;
      }
      console.error("Gemini Analysis Error:", error);
      throw error;
    }
  }
  throw new Error("Failed to analyze image after multiple retries.");
}

// New function for Viral Caption Generation
export async function generateViralCaption(
    base64Image: string,
    mimeType: string,
    formula: string,
    apiKey?: string,
    baseUrl?: string
): Promise<string> {
    const ai = getClient(apiKey, baseUrl);
    
    try {
        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: {
                parts: [
                    { inlineData: { mimeType: mimeType, data: base64Image } },
                    { text: `Identify the visual elements in this image and complete the following specific viral content formula.
                    
                    FORMULA TEMPLATE:
                    "${formula}"
                    
                    INSTRUCTIONS:
                    1. Replace the [bracketed placeholders] with specific details visible in the image or implied context.
                    2. Keep the tone emotional, urgent, or authoritative as implied by the formula.
                    3. Do NOT output the instructions, only the final completed text.
                    4. If the formula has numbers (e.g. "1.", "2."), keep them.
                    5. Language: Chinese (Simplified).
                    ` }
                ]
            }
        });
        return response.text?.trim() || "Generated caption failed.";
    } catch (error) {
        console.error("Viral Caption Error:", error);
        return "Caption generation failed.";
    }
}

function shouldRetry(error: any) {
    return error?.status === 503 || 
           error?.status === 429 || 
           error?.message?.includes('503') || 
           error?.message?.includes('429') || 
           error?.message?.toLowerCase().includes('overloaded') ||
           error?.message?.toLowerCase().includes('unavailable') ||
           error?.message?.toLowerCase().includes('quota');
}
