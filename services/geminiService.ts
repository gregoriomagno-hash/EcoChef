import { GoogleGenAI, Type, Schema } from "@google/genai";
import { Ingredient, Recipe, DietaryPreference } from "../types";

const API_KEY_OPENAI = process.env.API_KEY_OPENAI;
const API_KEY_GEMINI = process.env.API_KEY;

// --- GEMINI CONFIGURATION ---

const ai = new GoogleGenAI({ apiKey: API_KEY_GEMINI || '' });
const modelFlash = 'gemini-2.5-flash';

const ingredientListSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    ingredients: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Lista de ingredientes de comida identificados en las imágenes.",
    },
  },
  required: ["ingredients"],
};

const recipeListSchema: Schema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING },
      description: { type: Type.STRING },
      ingredientsUsed: { type: Type.ARRAY, items: { type: Type.STRING } },
      missingIngredients: { type: Type.ARRAY, items: { type: Type.STRING } },
      steps: { type: Type.ARRAY, items: { type: Type.STRING } },
      difficulty: { type: Type.STRING, enum: ["Fácil", "Media", "Difícil"] },
      time: { type: Type.STRING },
    },
    required: ["title", "ingredientsUsed", "missingIngredients", "steps", "difficulty", "time"],
  },
};

// --- OPENAI HELPERS ---

async function callOpenAIVision(base64Images: string[]): Promise<string[]> {
  const messages = [
    {
      role: "user",
      content: [
        { 
          type: "text", 
          text: "Identifica todos los alimentos, ingredientes y productos de cocina visibles en estas imágenes. Combina los resultados en una lista única sin duplicados. Sé específico pero genérico (ej: 'tomate' en vez de 'tomate rama'). Devuelve SOLO un JSON con la estructura: { \"ingredients\": [\"string\"] }. Nombres en español." 
        },
        ...base64Images.map(img => ({
          type: "image_url",
          image_url: {
            url: `data:image/jpeg;base64,${img}`,
            detail: "low"
          }
        }))
      ]
    }
  ];

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${API_KEY_OPENAI}`
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: messages,
      response_format: { type: "json_object" },
      temperature: 0.4,
      max_tokens: 500
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI Vision Error: ${response.statusText}`);
  }

  const data = await response.json();
  const content = JSON.parse(data.choices[0].message.content);
  return content.ingredients || [];
}

async function callOpenAIText(prompt: string): Promise<Recipe[]> {
  const systemPrompt = `
    Eres un asistente de cocina experto.
    Tu tarea es sugerir recetas basadas en ingredientes.
    
    Respuesta OBLIGATORIA en formato JSON con la siguiente estructura:
    {
      "recipes": [
        {
          "title": "string",
          "description": "string (breve)",
          "ingredientsUsed": ["string"],
          "missingIngredients": ["string"],
          "steps": ["string"],
          "difficulty": "Fácil" | "Media" | "Difícil",
          "time": "string (ej: 15 min)"
        }
      ]
    }
  `;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${API_KEY_OPENAI}`
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" },
      temperature: 0.7
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI API Error: ${response.statusText}`);
  }

  const data = await response.json();
  const content = JSON.parse(data.choices[0].message.content);
  
  // Map and add IDs
  return (content.recipes || []).map((r: any, index: number) => ({
    ...r,
    id: `recipe-openai-${Date.now()}-${index}`,
  }));
}

// --- MAIN EXPORTED FUNCTIONS ---

/**
 * Analyzes one or multiple images to detect food ingredients.
 * Uses OpenAI if API_KEY_OPENAI is present, otherwise Gemini.
 */
export const detectIngredientsFromImages = async (base64Images: string[]): Promise<string[]> => {
  try {
    if (API_KEY_OPENAI) {
      console.log("Using OpenAI for Vision");
      return await callOpenAIVision(base64Images);
    } else {
      console.log("Using Gemini for Vision");
      const imageParts = base64Images.map(img => ({
        inlineData: {
          mimeType: 'image/jpeg',
          data: img,
        },
      }));

      const response = await ai.models.generateContent({
        model: modelFlash,
        contents: {
          parts: [
            ...imageParts,
            {
              text: "Identifica todos los alimentos, ingredientes y productos de cocina visibles en estas imágenes. Si hay varias fotos, combina los resultados en una sola lista única sin duplicados. Sé específico pero genérico (ej: 'tomate' en vez de 'tomate rama'). Devuelve los nombres en español.",
            },
          ],
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: ingredientListSchema,
          temperature: 0.4,
        },
      });

      const json = JSON.parse(response.text || '{"ingredients": []}');
      return json.ingredients || [];
    }
  } catch (error) {
    console.error("Error detecting ingredients:", error);
    throw new Error("No pudimos identificar los ingredientes. Inténtalo de nuevo.");
  }
};

/**
 * Generates recipes based on ingredients and preferences.
 * Uses OpenAI if API_KEY_OPENAI is present, otherwise Gemini.
 */
export const suggestRecipes = async (
  ingredients: Ingredient[],
  preference: DietaryPreference
): Promise<Recipe[]> => {
  try {
    const ingredientNames = ingredients.map(i => i.name).join(", ");
    const priorityNames = ingredients.filter(i => i.isPriority).map(i => i.name).join(", ");
    
    let prompt = `Tengo estos ingredientes disponibles: ${ingredientNames}. `;
    
    if (priorityNames) {
      prompt += `IMPORTANTE: Debes intentar usar estos ingredientes prioritarios que van a caducar: ${priorityNames}. `;
    }

    if (preference !== DietaryPreference.NONE) {
      prompt += `Restricción dietética estricta: ${preference}. `;
    }

    prompt += `
      Sugiere 4 recetas sencillas y creativas que maximicen el uso de mis ingredientes disponibles. 
      Se permiten sugerir ingredientes básicos de despensa (sal, aceite, pimienta, agua) sin listarlos como "faltantes".
      Prioriza recetas donde 'missingIngredients' sea una lista vacía o muy corta.
    `;

    if (API_KEY_OPENAI) {
      console.log("Using OpenAI for Recipes");
      return await callOpenAIText(prompt);
    } else {
      console.log("Using Gemini for Recipes");
      const response = await ai.models.generateContent({
        model: modelFlash,
        contents: prompt + " Devuelve la respuesta en formato JSON.",
        config: {
          responseMimeType: "application/json",
          responseSchema: recipeListSchema,
          temperature: 0.7,
        },
      });

      const rawRecipes = JSON.parse(response.text || '[]');
      
      return rawRecipes.map((r: any, index: number) => ({
        ...r,
        id: `recipe-gemini-${Date.now()}-${index}`,
      }));
    }
  } catch (error) {
    console.error("Error generating recipes:", error);
    throw new Error("No pudimos generar recetas en este momento.");
  }
};