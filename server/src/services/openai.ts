import OpenAI from "openai";
import { MealAnalysisResult } from "../types/openai";
import { extractCleanJSON } from "../utils/openai";

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  : null;

export class OpenAIService {
  static async analyzeMealImage(
    imageBase64: string,
    language: string = "english",
    updateText?: string,
    editedIngredients?: any[]
  ): Promise<MealAnalysisResult> {
    if (!openai || !process.env.OPENAI_API_KEY) {
      throw new Error("OpenAI API key not configured");
    }

    try {
      console.log("🤖 Starting OpenAI meal analysis...");
      console.log("🌐 Language:", language);
      console.log("💬 Update text provided:", !!updateText);
      console.log("🥗 Edited ingredients count:", editedIngredients?.length || 0);

      const isHebrew = language === "hebrew";
      
      // Build the analysis prompt
      let analysisPrompt = this.buildAnalysisPrompt(isHebrew);
      
      // Add context for updates or edits
      if (updateText || (editedIngredients && editedIngredients.length > 0)) {
        analysisPrompt += this.buildUpdateContext(updateText, editedIngredients, isHebrew);
      }

      const messages: any[] = [
        {
          role: "system",
          content: analysisPrompt,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: updateText 
                ? `Please analyze this meal image and incorporate the following user feedback: "${updateText}". ${editedIngredients?.length ? `The user has also provided ${editedIngredients.length} edited ingredients.` : ""}`
                : "Please analyze this meal image and provide detailed nutritional information.",
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${imageBase64}`,
                detail: "high",
              },
            },
          ],
        },
      ];

      console.log("📤 Sending request to OpenAI...");
      
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages,
        max_tokens: 2000,
        temperature: 0.1,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error("No response content from OpenAI");
      }

      console.log("📥 Received response from OpenAI");
      console.log("📄 Response length:", content.length);

      // Extract and parse JSON
      const cleanedJSON = extractCleanJSON(content);
      const parsedResult = JSON.parse(cleanedJSON);

      console.log("✅ Successfully parsed OpenAI response");
      console.log("🍽️ Meal name:", parsedResult.name);
      console.log("🥗 Ingredients count:", parsedResult.ingredients?.length || 0);

      // Validate and normalize the response
      const normalizedResult = this.normalizeAnalysisResult(parsedResult, isHebrew);
      
      console.log("✅ Analysis completed successfully");
      return normalizedResult;

    } catch (error) {
      console.error("💥 OpenAI analysis error:", error);
      
      if (error instanceof Error) {
        if (error.message.includes("quota")) {
          throw new Error("AI analysis quota exceeded. Please try again later.");
        } else if (error.message.includes("rate limit")) {
          throw new Error("Too many requests. Please wait a moment and try again.");
        } else if (error.message.includes("invalid_request_error")) {
          throw new Error("Invalid image format. Please try a different image.");
        }
      }
      
      throw new Error("AI analysis failed. Please try again.");
    }
  }

  static async updateMealAnalysis(
    originalAnalysis: any,
    updateText: string,
    language: string = "english"
  ): Promise<MealAnalysisResult> {
    if (!openai || !process.env.OPENAI_API_KEY) {
      throw new Error("OpenAI API key not configured");
    }

    try {
      console.log("🔄 Updating meal analysis with OpenAI...");
      
      const isHebrew = language === "hebrew";
      
      const updatePrompt = this.buildUpdatePrompt(originalAnalysis, updateText, isHebrew);

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: updatePrompt,
          },
          {
            role: "user",
            content: `Please update the meal analysis based on this feedback: "${updateText}"`,
          },
        ],
        max_tokens: 1500,
        temperature: 0.1,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error("No response content from OpenAI");
      }

      const cleanedJSON = extractCleanJSON(content);
      const parsedResult = JSON.parse(cleanedJSON);

      return this.normalizeAnalysisResult(parsedResult, isHebrew);

    } catch (error) {
      console.error("💥 OpenAI update error:", error);
      throw new Error("Failed to update meal analysis");
    }
  }

  static async generateText(prompt: string, maxTokens: number = 1000): Promise<string> {
    if (!openai || !process.env.OPENAI_API_KEY) {
      throw new Error("OpenAI API key not configured");
    }

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        max_tokens: maxTokens,
        temperature: 0.7,
      });

      return response.choices[0]?.message?.content || "";
    } catch (error) {
      console.error("💥 OpenAI text generation error:", error);
      throw error;
    }
  }

  private static buildAnalysisPrompt(isHebrew: boolean): string {
    if (isHebrew) {
      return `אתה מומחה תזונה מקצועי המנתח תמונות של ארוחות. נתח את התמונה ותחזיר JSON מדויק עם המידע הבא:

{
  "name": "שם הארוחה בעברית",
  "description": "תיאור קצר של הארוחה",
  "calories": מספר_קלוריות_כולל,
  "protein": מספר_גרמי_חלבון,
  "carbs": מספר_גרמי_פחמימות,
  "fat": מספר_גרמי_שומן,
  "fiber": מספר_גרמי_סיבים,
  "sugar": מספר_גרמי_סוכר,
  "sodium": מספר_מיליגרם_נתרן,
  "ingredients": [
    {
      "name": "שם המרכיב בעברית",
      "calories": מספר_קלוריות,
      "protein": מספר_גרמי_חלבון,
      "carbs": מספר_גרמי_פחמימות,
      "fat": מספר_גרמי_שומן,
      "fiber": מספר_גרמי_סיבים,
      "sugar": מספר_גרמי_סוכר,
      "sodium_mg": מספר_מיליגרם_נתרן
    }
  ],
  "cooking_method": "שיטת_הכנה",
  "food_category": "קטגוריית_מזון",
  "confidence": מספר_בין_0_ל_100,
  "recommendations": "המלצות_בריאותיות_והערות"
}

חשוב:
- זהה כל מרכיב בנפרד עם ערכים תזונתיים מדויקים
- חשב ערכים תזונתיים על בסיס כמויות מוערכות
- תן ערכים מספריים בלבד (לא טקסט)
- ודא שסכום המרכיבים תואם לסך הכולל
- השתמש בשמות עבריים למרכיבים`;
    }

    return `You are a professional nutrition expert analyzing meal images. Analyze the image and return accurate JSON with this information:

{
  "name": "meal_name_in_english",
  "description": "brief_meal_description",
  "calories": total_calories_number,
  "protein": total_protein_grams,
  "carbs": total_carbs_grams,
  "fat": total_fat_grams,
  "fiber": total_fiber_grams,
  "sugar": total_sugar_grams,
  "sodium": total_sodium_milligrams,
  "ingredients": [
    {
      "name": "ingredient_name",
      "calories": calories_number,
      "protein": protein_grams,
      "carbs": carbs_grams,
      "fat": fat_grams,
      "fiber": fiber_grams,
      "sugar": sugar_grams,
      "sodium_mg": sodium_milligrams
    }
  ],
  "cooking_method": "cooking_method",
  "food_category": "food_category",
  "confidence": confidence_0_to_100,
  "recommendations": "health_recommendations_and_notes"
}

Important:
- Identify each ingredient separately with accurate nutritional values
- Calculate nutritional values based on estimated quantities
- Provide only numeric values (no text)
- Ensure ingredient totals match overall totals
- Be precise with portion estimates`;
  }

  private static buildUpdateContext(
    updateText?: string,
    editedIngredients?: any[],
    isHebrew: boolean = false
  ): string {
    let context = isHebrew ? "\n\nהקשר נוסף:\n" : "\n\nAdditional context:\n";
    
    if (updateText) {
      context += isHebrew 
        ? `- המשתמש הוסיף הערה: "${updateText}"\n`
        : `- User provided feedback: "${updateText}"\n`;
    }
    
    if (editedIngredients && editedIngredients.length > 0) {
      context += isHebrew
        ? `- המשתמש ערך ${editedIngredients.length} מרכיבים:\n`
        : `- User edited ${editedIngredients.length} ingredients:\n`;
      
      editedIngredients.forEach((ingredient, index) => {
        context += `  ${index + 1}. ${ingredient.name}: ${ingredient.calories} cal, ${ingredient.protein}g protein\n`;
      });
    }
    
    context += isHebrew
      ? "\nאנא התחשב במידע זה בעת עדכון הניתוח."
      : "\nPlease incorporate this information when updating the analysis.";
    
    return context;
  }

  private static buildUpdatePrompt(
    originalAnalysis: any,
    updateText: string,
    isHebrew: boolean
  ): string {
    const basePrompt = isHebrew
      ? `אתה מומחה תזונה המעדכן ניתוח ארוחה קיים על בסיס משוב מהמשתמש.`
      : `You are a nutrition expert updating an existing meal analysis based on user feedback.`;

    const originalData = isHebrew
      ? `\n\nניתוח מקורי:\n${JSON.stringify(originalAnalysis, null, 2)}`
      : `\n\nOriginal analysis:\n${JSON.stringify(originalAnalysis, null, 2)}`;

    const updateInstruction = isHebrew
      ? `\n\nמשוב מהמשתמש: "${updateText}"\n\nאנא עדכן את הניתוח בהתאם למשוב והחזר JSON מעודכן באותו פורמט.`
      : `\n\nUser feedback: "${updateText}"\n\nPlease update the analysis according to the feedback and return updated JSON in the same format.`;

    return basePrompt + originalData + updateInstruction;
  }

  private static normalizeAnalysisResult(
    result: any,
    isHebrew: boolean
  ): MealAnalysisResult {
    // Ensure all required fields exist with proper types
    const normalized: MealAnalysisResult = {
      name: result.name || (isHebrew ? "ארוחה לא מזוהה" : "Unknown meal"),
      description: result.description || "",
      calories: Number(result.calories) || 0,
      protein: Number(result.protein) || 0,
      carbs: Number(result.carbs) || 0,
      fat: Number(result.fat) || 0,
      fiber: Number(result.fiber) || 0,
      sugar: Number(result.sugar) || 0,
      sodium: Number(result.sodium) || 0,
      confidence: Number(result.confidence) || 75,
      
      // Normalize ingredients array
      ingredients: Array.isArray(result.ingredients) 
        ? result.ingredients.map((ingredient: any) => ({
            name: ingredient.name || (isHebrew ? "מרכיב לא מזוהה" : "Unknown ingredient"),
            calories: Number(ingredient.calories) || 0,
            protein: Number(ingredient.protein || ingredient.protein_g) || 0,
            carbs: Number(ingredient.carbs || ingredient.carbs_g) || 0,
            fat: Number(ingredient.fat || ingredient.fats_g) || 0,
            fiber: Number(ingredient.fiber || ingredient.fiber_g) || 0,
            sugar: Number(ingredient.sugar || ingredient.sugar_g) || 0,
            sodium_mg: Number(ingredient.sodium_mg || ingredient.sodium) || 0,
            cholesterol_mg: Number(ingredient.cholesterol_mg) || 0,
            saturated_fats_g: Number(ingredient.saturated_fats_g) || 0,
            polyunsaturated_fats_g: Number(ingredient.polyunsaturated_fats_g) || 0,
            monounsaturated_fats_g: Number(ingredient.monounsaturated_fats_g) || 0,
            omega_3_g: Number(ingredient.omega_3_g) || 0,
            omega_6_g: Number(ingredient.omega_6_g) || 0,
            soluble_fiber_g: Number(ingredient.soluble_fiber_g) || 0,
            insoluble_fiber_g: Number(ingredient.insoluble_fiber_g) || 0,
            alcohol_g: Number(ingredient.alcohol_g) || 0,
            caffeine_mg: Number(ingredient.caffeine_mg) || 0,
            serving_size_g: Number(ingredient.serving_size_g) || 0,
            glycemic_index: ingredient.glycemic_index || null,
            insulin_index: ingredient.insulin_index || null,
            vitamins_json: ingredient.vitamins_json || {},
            micronutrients_json: ingredient.micronutrients_json || {},
            allergens_json: ingredient.allergens_json || {},
          }))
        : [],
      
      // Optional fields
      cooking_method: result.cooking_method || result.cookingMethod || "",
      food_category: result.food_category || result.foodCategory || "",
      recommendations: result.recommendations || result.healthNotes || "",
      servingSize: result.serving_size || result.servingSize || "1 serving",
      cookingMethod: result.cooking_method || result.cookingMethod || "",
      healthNotes: result.recommendations || result.health_notes || "",
      
      // Extended nutritional fields
      saturated_fats_g: Number(result.saturated_fats_g) || undefined,
      polyunsaturated_fats_g: Number(result.polyunsaturated_fats_g) || undefined,
      monounsaturated_fats_g: Number(result.monounsaturated_fats_g) || undefined,
      omega_3_g: Number(result.omega_3_g) || undefined,
      omega_6_g: Number(result.omega_6_g) || undefined,
      soluble_fiber_g: Number(result.soluble_fiber_g) || undefined,
      insoluble_fiber_g: Number(result.insoluble_fiber_g) || undefined,
      cholesterol_mg: Number(result.cholesterol_mg) || undefined,
      alcohol_g: Number(result.alcohol_g) || undefined,
      caffeine_mg: Number(result.caffeine_mg) || undefined,
      liquids_ml: Number(result.liquids_ml) || undefined,
      serving_size_g: Number(result.serving_size_g) || undefined,
      allergens_json: result.allergens_json || {},
      vitamins_json: result.vitamins_json || {},
      micronutrients_json: result.micronutrients_json || {},
      glycemic_index: result.glycemic_index || undefined,
      insulin_index: result.insulin_index || undefined,
      processing_level: result.processing_level || "",
      additives_json: result.additives_json || {},
      health_risk_notes: result.health_risk_notes || undefined,
    };

    // Validate that ingredient totals roughly match meal totals
    if (normalized.ingredients.length > 0) {
      const ingredientTotals = normalized.ingredients.reduce(
        (acc, ingredient) => ({
          calories: acc.calories + ingredient.calories,
          protein: acc.protein + ingredient.protein,
          carbs: acc.carbs + ingredient.carbs,
          fat: acc.fat + ingredient.fat,
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0 }
      );

      // If totals are significantly different, log a warning but don't fail
      const caloriesDiff = Math.abs(ingredientTotals.calories - normalized.calories);
      if (caloriesDiff > normalized.calories * 0.2) {
        console.warn("⚠️ Ingredient totals don't match meal totals:", {
          mealCalories: normalized.calories,
          ingredientCalories: ingredientTotals.calories,
          difference: caloriesDiff,
        });
      }
    }

    return normalized;
  }
}

export { openai };