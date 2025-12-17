import { GoogleGenAI, Type, Schema } from "@google/genai";
import { FoodAnalysis } from "../types";

// Removed global instance to support dynamic API keys
// const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const analysisSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    isFood: { type: Type.BOOLEAN, description: "True if the main subject is food." },
    hasExistingText: { type: Type.BOOLEAN, description: "True if the image already contains significant visible text." },
    mealType: { type: Type.STRING, description: "E.g., Breakfast, Lunch, Dinner, Snack." },
    summary: { type: Type.STRING, description: "A short 5-8 word summary of the dish." },
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
  required: ["isFood", "items", "nutrition", "mealType", "summary"],
};

// Helper function to wait
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function analyzeFoodImage(base64Image: string, mimeType: string, apiKey?: string): Promise<FoodAnalysis> {
  const maxRetries = 3;
  let attempt = 0;

  // Use provided key or fallback to env
  const effectiveKey = apiKey || process.env.API_KEY;
  if (!effectiveKey) {
      throw new Error("Gemini API Key is missing. Please configure it in Settings.");
  }
  
  // Instantiate client with the specific key for this request
  const ai = new GoogleGenAI({ apiKey: effectiveKey });

  while (attempt <= maxRetries) {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Image,
              },
            },
            {
              text: `Analyze this image for a food tracking app. 
              1. Determine if it is food. 
              2. Identify specific ingredients/parts (like 'Steak', 'Eggs', 'Broccoli') and provide their bounding box [ymin, xmin, ymax, xmax] on a 0-1000 scale.
              3. Estimate the nutrition facts for the whole plate.
              4. Detect if there is already text overlay on the image.`,
            },
          ],
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: analysisSchema,
          systemInstruction: "You are a specialized nutritionist AI. You are accurate with identifying food items and estimating their position in the photo.",
        },
      });

      if (!response.text) {
        throw new Error("No response from Gemini");
      }

      const data = JSON.parse(response.text) as FoodAnalysis;
      return data;

    } catch (error: any) {
      attempt++;
      
      // Check if the error is related to overloading (503) or generic server errors (500)
      const isOverloaded = 
        error?.status === 503 || 
        error?.message?.includes('503') || 
        error?.message?.toLowerCase().includes('overloaded') ||
        error?.message?.toLowerCase().includes('unavailable');

      if (isOverloaded && attempt <= maxRetries) {
        // Exponential backoff: 1000ms, 2000ms, 4000ms
        const waitTime = Math.pow(2, attempt - 1) * 1000;
        console.warn(`Model overloaded (503). Retrying in ${waitTime}ms... (Attempt ${attempt}/${maxRetries})`);
        await delay(waitTime);
        continue;
      }

      console.error("Gemini Analysis Error:", error);
      throw error;
    }
  }
  
  throw new Error("Failed to analyze image after multiple retries due to server overload.");
}