import { GoogleGenAI, Type, Schema } from "@google/genai";
import { FoodAnalysis } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

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

export async function analyzeFoodImage(base64Image: string, mimeType: string): Promise<FoodAnalysis> {
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
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    throw error;
  }
}