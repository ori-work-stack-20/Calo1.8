import { Router, Response } from "express";
import { authenticateToken, AuthRequest } from "../middleware/auth";
import { prisma } from "../lib/database";
import { z } from "zod";
import { mealAnalysisSchema, mealUpdateSchema } from "../types/nutrition";
import { NutritionService } from "../services/nutrition";

const router = Router();

const waterIntakeSchema = z.object({
  cups: z.number().min(1).max(25),
  date: z.string().optional(),
});

// Track water intake
router.post(
  "/water-intake",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    const userId = req.user?.user_id;

    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    try {
      const { cups, date } = waterIntakeSchema.parse(req.body);
      const trackingDate = date ? new Date(date) : new Date();
      const milliliters = cups * 250;

      // Set date to start of day for consistent comparison
      const startOfDay = new Date(
        trackingDate.getFullYear(),
        trackingDate.getMonth(),
        trackingDate.getDate()
      );
      const endOfDay = new Date(
        trackingDate.getFullYear(),
        trackingDate.getMonth(),
        trackingDate.getDate() + 1
      );

      // Check if water intake record exists for today
      const existingRecord = await prisma.waterIntake.findFirst({
        where: {
          user_id: userId,
          date: {
            gte: startOfDay,
            lt: endOfDay,
          },
        },
      });

      let waterRecord;
      let xpAwarded = 0;
      let badgeAwarded = null;

      if (existingRecord) {
        waterRecord = await prisma.waterIntake.update({
          where: { id: existingRecord.id },
          data: {
            cups_consumed: cups,
            milliliters_consumed: milliliters,
            updated_at: new Date(),
          },
        });
      } else {
        waterRecord = await prisma.waterIntake.create({
          data: {
            user_id: userId,
            date: startOfDay,
            cups_consumed: cups,
            milliliters_consumed: milliliters,
          },
        });
      }

      // Award XP and badge if 16+ cups (only if not already awarded today)
      if (cups >= 16) {
        // Check if user already has scuba diver badge for today
        const todayBadgeCount = await prisma.userBadge.count({
          where: {
            user_id: userId,
            badge_id: "scuba_diver",
            earned_date: {
              gte: startOfDay,
              lt: endOfDay,
            },
          },
        });

        if (todayBadgeCount === 0) {
          // Create scuba diver badge if it doesn't exist
          await prisma.badge.upsert({
            where: { id: "scuba_diver" },
            update: {},
            create: {
              id: "scuba_diver",
              name: "Scuba Diver",
              description: "Drank 16+ cups of water in a day",
              icon: "🤿",
              rarity: "RARE",
              points_awarded: 100,
              category: "hydration",
            },
          });

          // Award badge to user (create new entry each time they achieve it)
          await prisma.userBadge.create({
            data: {
              user_id: userId,
              badge_id: "scuba_diver",
              earned_date: new Date(),
            },
          });

          // Update user level and XP
          const currentUser = await prisma.user.findUnique({
            where: { user_id: userId },
            select: { current_xp: true, total_points: true, level: true },
          });

          const newTotalPoints = (currentUser?.total_points || 0) + 100;
          const newCurrentXP = (currentUser?.current_xp || 0) + 100;
          const newLevel = Math.floor(newTotalPoints / 1000) + 1;
          const finalXP =
            newCurrentXP >= 1000 ? newCurrentXP - 1000 : newCurrentXP;

          await prisma.user.update({
            where: { user_id: userId },
            data: {
              current_xp: finalXP,
              total_points: newTotalPoints,
              level: newLevel,
            },
          });

          xpAwarded = 100;
          badgeAwarded = "scuba_diver";
        }
      }

      res.json({
        success: true,
        data: waterRecord,
        xpAwarded,
        badgeAwarded,
      });
    } catch (error) {
      console.error("Error tracking water intake:", error);
      res.status(500).json({ error: "Failed to track water intake" });
    }
  }
);

// Get water intake for a specific date
router.get(
  "/water-intake/:date",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    const userId = req.user?.user_id;
    const { date } = req.params;

    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    try {
      const trackingDate = new Date(date);
      const startOfDay = new Date(
        trackingDate.getFullYear(),
        trackingDate.getMonth(),
        trackingDate.getDate()
      );
      const endOfDay = new Date(
        trackingDate.getFullYear(),
        trackingDate.getMonth(),
        trackingDate.getDate() + 1
      );

      const waterRecord = await prisma.waterIntake.findFirst({
        where: {
          user_id: userId,
          date: {
            gte: startOfDay,
            lt: endOfDay,
          },
        },
      });

      res.json({
        success: true,
        data: waterRecord || { cups_consumed: 0, milliliters_consumed: 0 },
      });
    } catch (error) {
      console.error("Error fetching water intake:", error);
      res.status(500).json({ error: "Failed to fetch water intake" });
    }
  }
);

// Apply auth middleware to all routes
// router.use(authenticateToken); //commented to apply auth each route

// Analyze meal endpoint
router.post("/analyze", authenticateToken, async (req: AuthRequest, res) => {
  try {
    console.log("Analyze meal request received");
    console.log("Request body keys:", Object.keys(req.body));
    console.log("User ID:", req.user.user_id);
    console.log("Language:", req.body.language);
    console.log("Has update text:", !!req.body.updateText);
    console.log("Edited ingredients count:", req.body.editedIngredients?.length || 0);

    // Validate request body
    const validationResult = mealAnalysisSchema.safeParse(req.body);

    if (!validationResult.success) {
      console.error("Validation error:", validationResult.error);
      return res.status(400).json({
        success: false,
        error:
          "Invalid request data: " +
          validationResult.error.errors.map((e) => e.message).join(", "),
      });
    }

    const {
      imageBase64,
      language = "english",
      date,
      updateText,
      editedIngredients = [],
    } = validationResult.data;

    if (!imageBase64 || imageBase64.trim() === "") {
      return res.status(400).json({
        success: false,
        error: "Image data is required",
      });
    }

    // Validate image data
    let cleanBase64 = imageBase64;
    if (imageBase64.startsWith("data:image/")) {
      const commaIndex = imageBase64.indexOf(",");
      if (commaIndex !== -1) {
        cleanBase64 = imageBase64.substring(commaIndex + 1);
      }
    }

    // Check if base64 is valid
    const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
    if (!base64Regex.test(cleanBase64)) {
      return res.status(400).json({
        success: false,
        error: "Invalid image data format",
      });
    }

    if (cleanBase64.length < 1000) {
      return res.status(400).json({
        success: false,
        error: "Image data is too small or invalid",
      });
    }

    console.log("Processing meal analysis for user:", req.user.user_id);
    console.log("Image data length:", cleanBase64.length);
    console.log("Edited ingredients:", editedIngredients.length);
    console.log("Update text:", updateText ? "provided" : "not provided");

    // Validate request data
    const analysisSchema = z.object({
      imageBase64: z.string().min(1, "Image data is required"),
      language: z.string().default("english"),
      date: z.string().optional(),
      updateText: z.string().optional(),
      editedIngredients: z.array(z.any()).default([]),
    });

    const validatedData = analysisSchema.parse({
      imageBase64,
      language,
      date,
      updateText,
      editedIngredients,
    });

    const result = await NutritionService.analyzeMeal(req.user.user_id, {
      imageBase64: validatedData.imageBase64,
      language: validatedData.language,
      date: validatedData.date || new Date().toISOString().split("T")[0],
      updateText: validatedData.updateText,
      editedIngredients: validatedData.editedIngredients,
    });
    
    console.log("✅ Analysis completed successfully");
    console.log("📊 Result summary:", {
      success: result.success,
      mealName: result.data?.meal_name,
      calories: result.data?.calories,
      ingredientsCount: result.data?.ingredients?.length || 0,
    });
    
    console.log("Analysis completed successfully");
    res.json(result);
  } catch (error) {
    console.error("Analyze meal error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to analyze meal";
    res.status(500).json({
      success: false,
      error: message,
    });
  }
});

// Update meal endpoint
router.put("/update", authenticateToken, async (req: AuthRequest, res) => {
  try {
    console.log("Update meal request received");

    const validationResult = mealUpdateSchema.safeParse(req.body);

    if (!validationResult.success) {
      console.error("Validation error:", validationResult.error);
      return res.status(400).json({
        success: false,
        error:
          "Invalid request data: " +
          validationResult.error.errors.map((e) => e.message).join(", "),
      });
    }

    const { meal_id, updateText, language } = validationResult.data;

    console.log("Updating meal for user:", req.user.user_id);

    const meal = await NutritionService.updateMeal(req.user.user_id, {
      meal_id,
      updateText,
      language,
    });

    console.log("Meal updated successfully");

    res.json({
      success: true,
      message: "Meal updated successfully",
      data: meal,
    });
  } catch (error) {
    console.error("Update meal error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to update meal";
    res.status(500).json({
      success: false,
      error: message,
    });
  }
});

// Direct meal update endpoint for manual edits
router.put(
  "/meals/:mealId",
  authenticateToken,
  async (req: AuthRequest, res) => {
    try {
      const { mealId } = req.params;
      const userId = req.user.user_id;
      const mealData = req.body;

      console.log("Direct meal update for user:", userId, "meal:", mealId);

      // Validate meal belongs to user
      const existingMeal = await prisma.meal.findFirst({
        where: {
          meal_id: parseInt(mealId),
          user_id: userId,
        },
      });

      if (!existingMeal) {
        return res.status(404).json({
          success: false,
          error: "Meal not found or access denied",
        });
      }

      // Update meal with provided data
      const updatedMeal = await prisma.meal.update({
        where: {
          meal_id: parseInt(mealId),
        },
        data: {
          meal_name: mealData.meal_name || existingMeal.meal_name,
          calories: mealData.calories
            ? parseFloat(mealData.calories)
            : existingMeal.calories,
          protein_g: mealData.protein_g
            ? parseFloat(mealData.protein_g)
            : existingMeal.protein_g,
          carbs_g: mealData.carbs_g
            ? parseFloat(mealData.carbs_g)
            : existingMeal.carbs_g,
          fats_g: mealData.fats_g
            ? parseFloat(mealData.fats_g)
            : existingMeal.fats_g,
          fiber_g: mealData.fiber_g
            ? parseFloat(mealData.fiber_g)
            : existingMeal.fiber_g,
          sugar_g: mealData.sugar_g
            ? parseFloat(mealData.sugar_g)
            : existingMeal.sugar_g,
          sodium_mg: mealData.sodium_mg
            ? parseFloat(mealData.sodium_mg)
            : existingMeal.sodium_mg,
          saturated_fats_g: mealData.saturated_fats_g
            ? parseFloat(mealData.saturated_fats_g)
            : existingMeal.saturated_fats_g,
          polyunsaturated_fats_g: mealData.polyunsaturated_fats_g
            ? parseFloat(mealData.polyunsaturated_fats_g)
            : existingMeal.polyunsaturated_fats_g,
          monounsaturated_fats_g: mealData.monounsaturated_fats_g
            ? parseFloat(mealData.monounsaturated_fats_g)
            : existingMeal.monounsaturated_fats_g,
          cholesterol_mg: mealData.cholesterol_mg
            ? parseFloat(mealData.cholesterol_mg)
            : existingMeal.cholesterol_mg,
          serving_size_g: mealData.serving_size_g
            ? parseFloat(mealData.serving_size_g)
            : existingMeal.serving_size_g,
          ingredients: mealData.ingredients || existingMeal.ingredients,
          food_category: mealData.food_category || existingMeal.food_category,
          cooking_method:
            mealData.cooking_method || existingMeal.cooking_method,
          updated_at: new Date(),
        },
      });

      console.log("Meal updated successfully");

      res.json({
        success: true,
        message: "Meal updated successfully",
        data: updatedMeal,
      });
    } catch (error) {
      console.error("Direct meal update error:", error);
      const message =
        error instanceof Error ? error.message : "Failed to update meal";
      res.status(500).json({
        success: false,
        error: message,
      });
    }
  }
);

// Save meal endpoint
router.post("/save", authenticateToken, async (req: AuthRequest, res) => {
  try {
    console.log("Save meal request received");

    const { mealData, imageBase64 } = req.body;

    if (!mealData) {
      return res.status(400).json({
        success: false,
        error: "Meal data is required",
      });
    }

    console.log("Saving meal for user:", req.user.user_id);

    const meal = await NutritionService.saveMeal(
      req.user.user_id,
      mealData,
      imageBase64
    );

    console.log("Meal saved successfully");
    res.json({
      success: true,
      data: meal,
    });
  } catch (error) {
    console.error("Save meal error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to save meal";
    res.status(500).json({
      success: false,
      error: message,
    });
  }
});

// Get user meals
router.get("/meals", authenticateToken, async (req: AuthRequest, res) => {
  try {
    console.log("Get meals request for user:", req.user.user_id);

    const meals = await NutritionService.getUserMeals(req.user.user_id);

    res.json({
      success: true,
      data: meals,
    });
  } catch (error) {
    console.error("Get meals error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to fetch meals";
    res.status(500).json({
      success: false,
      error: message,
    });
  }
});

// Get daily stats
// Get range statistics
router.get("/stats/range", authenticateToken, async (req: AuthRequest, res) => {
  try {
    // 🔍 ENHANCED DEBUGGING - Log everything we receive
    console.log("📊 === RANGE STATS DEBUG START ===");
    console.log(
      "📊 Full req.query object:",
      JSON.stringify(req.query, null, 2)
    );
    console.log("📊 req.query keys:", Object.keys(req.query));
    console.log("📊 req.query values:", Object.values(req.query));

    // Log each possible parameter variation
    console.log("📊 req.query.startDate:", req.query.startDate);
    console.log("📊 req.query.endDate:", req.query.endDate);
    console.log("📊 req.query.start:", req.query.start);
    console.log("📊 req.query.end:", req.query.end);
    console.log("📊 === RANGE STATS DEBUG END ===");

    // Try both parameter name variations
    const startDate = req.query.startDate || req.query.start;
    const endDate = req.query.endDate || req.query.end;

    console.log("📊 Extracted parameters:", { startDate, endDate });

    // Validate required parameters
    if (!startDate || !endDate) {
      console.error("❌ Missing parameters:", { startDate, endDate });
      return res.status(400).json({
        success: false,
        error: "Both startDate and endDate are required",
      });
    }

    // Ensure dates are strings and trim whitespace
    const startDateStr = String(startDate).trim();
    const endDateStr = String(endDate).trim();

    console.log("📊 Received dates:", { startDateStr, endDateStr });

    // Validate date format (YYYY-MM-DD) - more strict validation
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(startDateStr)) {
      console.error("❌ Invalid startDate format:", startDateStr);
      return res.status(400).json({
        success: false,
        error: `Date must be in YYYY-MM-DD format. Received startDate: '${startDateStr}'`,
      });
    }

    if (!dateRegex.test(endDateStr)) {
      console.error("❌ Invalid endDate format:", endDateStr);
      return res.status(400).json({
        success: false,
        error: `Date must be in YYYY-MM-DD format. Received endDate: '${endDateStr}'`,
      });
    }

    // Parse dates to verify they are valid - use local time instead of UTC
    const startDateObj = new Date(startDateStr);
    const endDateObj = new Date(endDateStr);

    if (isNaN(startDateObj.getTime())) {
      return res.status(400).json({
        success: false,
        error: `Invalid start date: '${startDateStr}'`,
      });
    }

    if (isNaN(endDateObj.getTime())) {
      return res.status(400).json({
        success: false,
        error: `Invalid end date: '${endDateStr}'`,
      });
    }

    // Validate date range (startDate should be before or equal to endDate)
    if (startDateObj > endDateObj) {
      return res.status(400).json({
        success: false,
        error: "startDate must be before or equal to endDate",
      });
    }

    console.log("✅ Date validation passed:", { startDateStr, endDateStr });
    console.log("📊 Fetching range statistics for user:", req.user.user_id);

    const statistics = await NutritionService.getRangeStatistics(
      req.user.user_id,
      startDateStr,
      endDateStr
    );

    console.log("✅ Range statistics retrieved successfully");

    res.json({
      success: true,
      data: statistics,
    });
  } catch (error) {
    console.error("💥 Get range statistics error:", error);
    const message =
      error instanceof Error
        ? error.message
        : "Failed to fetch range statistics";
    res.status(500).json({
      success: false,
      error: message,
    });
  }
});
// NEW ENDPOINTS FOR HISTORY FEATURES

// Save meal feedback (ratings)
router.post(
  "/meals/:mealId/feedback",
  authenticateToken,
  async (req: AuthRequest, res) => {
    try {
      const { mealId } = req.params;
      const feedback = req.body;

      console.log("💬 Save feedback request for meal:", mealId);
      console.log("📊 Feedback data:", feedback);

      const result = await NutritionService.saveMealFeedback(
        req.user.user_id,
        mealId,
        feedback
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error("💥 Save feedback error:", error);
      const message =
        error instanceof Error ? error.message : "Failed to save feedback";
      res.status(500).json({
        success: false,
        error: message,
      });
    }
  }
);

// Toggle meal favorite status
router.post(
  "/meals/:mealId/favorite",
  authenticateToken,
  async (req: AuthRequest, res) => {
    try {
      const { mealId } = req.params;

      console.log("❤️ Toggle favorite request for meal:", mealId);

      const result = await NutritionService.toggleMealFavorite(
        req.user.user_id,
        mealId
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error("💥 Toggle favorite error:", error);
      const message =
        error instanceof Error ? error.message : "Failed to toggle favorite";
      res.status(500).json({
        success: false,
        error: message,
      });
    }
  }
);

// Duplicate meal to a new date
router.post(
  "/meals/:mealId/duplicate",
  authenticateToken,
  async (req: AuthRequest, res) => {
    try {
      const { mealId } = req.params;
      const { newDate } = req.body;

      console.log("📋 Duplicate meal request for meal:", mealId);
      console.log("📅 New date:", newDate);
      console.log("🔍 Request body:", req.body);

      // Validate mealId
      if (!mealId || mealId === "undefined") {
        return res.status(400).json({
          success: false,
          error: "Invalid meal ID provided",
        });
      }

      const result = await NutritionService.duplicateMeal(
        req.user.user_id,
        mealId,
        newDate
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error("💥 Duplicate meal error:", error);
      const message =
        error instanceof Error ? error.message : "Failed to duplicate meal";
      res.status(500).json({
        success: false,
        error: message,
      });
    }
  }
);

// Get meal details with full nutrition info
router.get(
  "/meals/:meal_id/details",
  authenticateToken,
  async (req: AuthRequest, res) => {
    try {
      const { meal_id } = req.params;
      const userId = req.user.user_id;

      console.log("🔍 Fetching full meal details:", meal_id);

      const meal = await prisma.meal.findFirst({
        where: {
          meal_id: parseInt(meal_id),
          user_id: userId,
        },
      });

      if (!meal) {
        return res.status(404).json({
          success: false,
          error: "Meal not found",
        });
      }

      // Format the complete meal data with all nutrition fields from schema
      const fullMealData = {
        ...meal,
        // Include all nutrition fields from your Prisma schema
        protein_g: meal.protein_g,
        carbs_g: meal.carbs_g,
        fats_g: meal.fats_g,
        saturated_fats_g: meal.saturated_fats_g,
        polyunsaturated_fats_g: meal.polyunsaturated_fats_g,
        monounsaturated_fats_g: meal.monounsaturated_fats_g,
        omega_3_g: meal.omega_3_g,
        omega_6_g: meal.omega_6_g,
        fiber_g: meal.fiber_g,
        soluble_fiber_g: meal.soluble_fiber_g,
        insoluble_fiber_g: meal.insoluble_fiber_g,
        sugar_g: meal.sugar_g,
        cholesterol_mg: meal.cholesterol_mg,
        sodium_mg: meal.sodium_mg,
        alcohol_g: meal.alcohol_g,
        caffeine_mg: meal.caffeine_mg,
        liquids_ml: meal.liquids_ml,
        serving_size_g: meal.serving_size_g,
        allergens_json: meal.allergens_json,
        vitamins_json: meal.vitamins_json,
        micronutrients_json: meal.micronutrients_json,
        glycemic_index: meal.glycemic_index,
        insulin_index: meal.insulin_index,
        food_category: meal.food_category,
        processing_level: meal.processing_level,
        cooking_method: meal.cooking_method,
        additives_json: meal.additives_json,
        health_risk_notes: meal.health_risk_notes,
        ingredients: meal.ingredients,
      };

      console.log("✅ Full meal details retrieved");

      res.json({
        success: true,
        data: fullMealData,
      });
    } catch (error) {
      console.error("💥 Get meal details error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch meal details",
      });
    }
  }
);

router.get(
  "/meals/:meal_id",
  authenticateToken,
  async (req: AuthRequest, res) => {
    try {
      const { meal_id } = req.params;
      const userId = req.user.user_id;

      console.log("🔍 Fetching meal:", meal_id);

      const meal = await prisma.meal.findFirst({
        where: {
          meal_id: parseInt(meal_id),
          user_id: userId,
        },
      });

      if (!meal) {
        return res.status(404).json({
          success: false,
          error: "Meal not found",
        });
      }

      console.log("✅ Meal retrieved");

      res.json({
        success: true,
        data: meal,
      });
    } catch (error) {
      console.error("💥 Get meal error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch meal",
      });
    }
  }
);

// PUT /api/nutrition/meals/:id - Update meal
router.put("/meals/:id", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const mealId = parseInt(req.params.id);
    const userId = req.user.user_id;
    const updates = req.body;

    // Verify meal belongs to user
    const existingMeal = await prisma.meal.findFirst({
      where: {
        meal_id: mealId,
        user_id: userId,
      },
    });

    if (!existingMeal) {
      return res.status(404).json({
        success: false,
        error: "Meal not found",
      });
    }

    // Update meal
    const updatedMeal = await prisma.meal.update({
      where: { meal_id: mealId },
      data: {
        ...updates,
        updated_at: new Date(),
      },
    });

    console.log("✅ Meal updated successfully:", mealId);

    res.json({
      success: true,
      message: "Meal updated successfully",
      data: updatedMeal,
    });
  } catch (error) {
    console.error("💥 Error updating meal:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update meal",
    });
  }
});

// DELETE /api/nutrition/meals/:id - Delete meal
router.delete(
  "/meals/:id",
  authenticateToken,
  async (req: AuthRequest, res) => {
    try {
      const mealId = parseInt(req.params.id);
      const userId = req.user.user_id;

      // Verify meal belongs to user
      const existingMeal = await prisma.meal.findFirst({
        where: {
          meal_id: mealId,
          user_id: userId,
        },
      });

      if (!existingMeal) {
        return res.status(404).json({
          success: false,
          error: "Meal not found",
        });
      }

      // Delete meal
      await prisma.meal.delete({
        where: { meal_id: mealId },
      });

      console.log("✅ Meal deleted successfully:", mealId);

      res.json({
        success: true,
        message: "Meal deleted successfully",
      });
    } catch (error) {
      console.error("💥 Error deleting meal:", error);
      res.status(500).json({
        success: false,
        error: "Failed to delete meal",
      });
    }
  }
);

// Get all meals for a user
router.get(
  "/meals",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      console.log("📥 Get meals request for user:", req.user.user_id);

      const { offset = 0, limit = 100 } = req.query;

      const meals = await NutritionService.getUserMeals(
        req.user.user_id,
        Number(offset),
        Number(limit)
      );

      console.log("✅ Retrieved", meals.length, "meals");
      res.json({
        success: true,
        data: meals,
      });
    } catch (error) {
      console.error("💥 Get meals error:", error);
      const message =
        error instanceof Error ? error.message : "Failed to fetch meals";
      res.status(500).json({
        success: false,
        error: message,
      });
    }
  }
);

// Get meal history for a user
router.get(
  "/meals/history",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      console.log("📥 Get meal history request for user:", req.user.user_id);

      const { period = "week" } = req.query;

      // Calculate date range based on period
      const now = new Date();
      let startDate = new Date();

      switch (period) {
        case "today":
          startDate.setHours(0, 0, 0, 0);
          break;
        case "week":
          startDate.setDate(now.getDate() - 7);
          break;
        case "month":
          startDate.setMonth(now.getMonth() - 1);
          break;
        case "all":
          startDate = new Date(0); // Beginning of time
          break;
        default:
          startDate.setDate(now.getDate() - 7);
      }

      const meals = await prisma.meal.findMany({
        where: {
          user_id: req.user.user_id,
          created_at: {
            gte: startDate,
            lte: now,
          },
        },
        orderBy: {
          created_at: "desc",
        },
      });

      console.log("✅ Retrieved", meals.length, "meal history items");
      res.json({
        success: true,
        data: meals,
      });
    } catch (error) {
      console.error("💥 Get meal history error:", error);
      const message =
        error instanceof Error ? error.message : "Failed to fetch meal history";
      res.status(500).json({
        success: false,
        error: message,
      });
    }
  }
);

export { router as nutritionRoutes };
