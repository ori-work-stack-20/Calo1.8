import axios from "axios";
import { SignInData, SignUpData, MealAnalysisData, Meal } from "../types";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { store } from "../store";
import { router } from "expo-router";
const API_URL = process.env.EXPO_PUBLIC_API_URL;
// Get the correct API URL based on platform
const getApiBaseUrl = () => {
  if (Platform.OS === "web") {
    // For web development, use localhost
    return "http://localhost:5000/api";
  } else {
    // For mobile devices, use your computer's IP address
    // Updated with your correct IP address
    return API_URL;
  }
};

const API_BASE_URL = getApiBaseUrl();

console.log("🌐 API Base URL:", API_BASE_URL);
console.log("📱 Platform:", Platform.OS);

// Create axios instance with optimizations
export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000, // Increased timeout for image analysis
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: Platform.OS === "web", // Only enable credentials for web (cookies)
  maxRedirects: 3,
  // Remove maxConcurrency, it's invalid here
});

// Request deduplication map
const pendingRequests = new Map<string, Promise<any>>();

// Helper function to create request key for deduplication
const createRequestKey = (config: any): string => {
  return `${config.method?.toUpperCase()}-${config.url}-${JSON.stringify(
    config.params || {}
  )}-${JSON.stringify(config.data || {})}`;
};

// SECURE TOKEN STORAGE - Use SecureStore for mobile, cookies for web
const STORAGE_KEY = "auth_token_secure";

// Helper function to get token - Use SecureStore for mobile, cookies for web
const getAuthToken = async (): Promise<string | null> => {
  try {
    if (Platform.OS === "web") {
      // For web, cookies are handled automatically by withCredentials
      console.log("🌐 Web platform - cookies handled automatically");
      return null; // Don't need to manually handle tokens on web
    } else {
      // For mobile, use SecureStore
      console.log("📱 Mobile platform - getting token from SecureStore");

      try {
        const token = await SecureStore.getItemAsync(STORAGE_KEY);
        console.log(
          "🔐 Token retrieved from SecureStore:",
          token ? "Found" : "Not found"
        );
        return token;
      } catch (secureStoreError) {
        console.error("💥 SecureStore get failed:", secureStoreError);
        return null;
      }
    }
  } catch (error) {
    console.warn("⚠️ Failed to get auth token:", error);
    return null;
  }
};

// Helper function to store token - Use SecureStore for mobile
const storeAuthToken = async (token: string): Promise<void> => {
  try {
    if (Platform.OS === "web") {
      // For web, cookies are handled by the server
      console.log("🌐 Web token will be stored via server cookie");
    } else {
      // For mobile, use SecureStore
      console.log("📱 Mobile platform - storing token in SecureStore");

      try {
        await SecureStore.setItemAsync(STORAGE_KEY, token);
        console.log("🔐 Token stored in SecureStore successfully");
      } catch (secureStoreError) {
        console.error("💥 SecureStore storage failed:", secureStoreError);
        throw new Error("Failed to store authentication token securely");
      }
    }
    console.log("🔐 Token stored securely");
  } catch (error) {
    console.error("⚠️ Failed to store auth token:", error);
    throw error;
  }
};

// Helper function to clear token - Use SecureStore for mobile
const clearAuthToken = async (): Promise<void> => {
  try {
    if (Platform.OS === "web") {
      // For web, cookies are cleared by server
      console.log("🌐 Web token will be cleared by server");
    } else {
      // For mobile, clear SecureStore
      console.log("📱 Mobile platform - clearing token from SecureStore");

      try {
        await SecureStore.deleteItemAsync(STORAGE_KEY);
        console.log("🔐 Token cleared from SecureStore successfully");
      } catch (secureStoreError) {
        console.warn(
          "⚠️ SecureStore clear failed (non-critical):",
          secureStoreError
        );
      }
    }
    console.log("🗑️ Token cleared securely");
  } catch (error) {
    console.warn("⚠️ Failed to clear auth token:", error);
  }
};

// Helper function to transform server meal data to client format
const transformMealData = (serverMeal: any): Meal => {
  return {
    // Primary fields
    meal_id: serverMeal.meal_id,
    id: serverMeal.meal_id?.toString() || serverMeal.id || "0",
    user_id: serverMeal.user_id,
    image_url: serverMeal.image_url,
    upload_time: serverMeal.upload_time,
    analysis_status: serverMeal.analysis_status || "PENDING",
    meal_name: serverMeal.meal_name,
    calories: serverMeal.calories,
    protein_g: serverMeal.protein_g,
    carbs_g: serverMeal.carbs_g,
    fats_g: serverMeal.fats_g,
    fiber_g: serverMeal.fiber_g,
    sugar_g: serverMeal.sugar_g,
    sodium_mg: serverMeal.sodium_mg,
    created_at: serverMeal.created_at,

    // Computed fields for compatibility
    name: serverMeal.meal_name || "Unknown Meal",
    description: serverMeal.meal_name || "",
    imageUrl: serverMeal.image_url,
    protein: serverMeal.protein_g || 0,
    carbs: serverMeal.carbs_g || 0,
    fat: serverMeal.fats_g || 0,
    fiber: serverMeal.fiber_g || 0,
    sugar: serverMeal.sugar_g || 0,
    sodium: serverMeal.sodium_mg || 0,
    userId: serverMeal.user_id,

    // History features
    is_favorite: serverMeal.is_favorite || false,
    taste_rating: serverMeal.taste_rating || 0,
    satiety_rating: serverMeal.satiety_rating || 0,
    energy_rating: serverMeal.energy_rating || 0,
    heaviness_rating: serverMeal.heaviness_rating || 0,

    // Ingredients - properly parse JSON if needed
    ingredients: (() => {
      if (Array.isArray(serverMeal.ingredients)) return serverMeal.ingredients;
      if (typeof serverMeal.ingredients === "string") {
        try {
          return JSON.parse(serverMeal.ingredients);
        } catch {
          return [];
        }
      }
      return [];
    })(),

    // Optional nutritional fields
    saturated_fats_g: serverMeal.saturated_fats_g,
    polyunsaturated_fats_g: serverMeal.polyunsaturated_fats_g,
    monounsaturated_fats_g: serverMeal.monounsaturated_fats_g,
    omega_3_g: serverMeal.omega_3_g,
    omega_6_g: serverMeal.omega_6_g,
    soluble_fiber_g: serverMeal.soluble_fiber_g,
    insoluble_fiber_g: serverMeal.insoluble_fiber_g,
    cholesterol_mg: serverMeal.cholesterol_mg,
    alcohol_g: serverMeal.alcohol_g,
    caffeine_mg: serverMeal.caffeine_mg,
    liquids_ml: serverMeal.liquids_ml,
    serving_size_g: serverMeal.serving_size_g,
    allergens_json: serverMeal.allergens_json,
    vitamins_json: serverMeal.vitamins_json,
    micronutrients_json: serverMeal.micronutrients_json,
    glycemic_index: serverMeal.glycemic_index,
    insulin_index: serverMeal.insulin_index,
    food_category: serverMeal.food_category,
    processing_level: serverMeal.processing_level,
    cooking_method: serverMeal.cooking_method,
    additives_json: serverMeal.additives_json,
    health_risk_notes: serverMeal.health_risk_notes,
  };
};

// Request interceptor with deduplication and auth token
api.interceptors.request.use(
  async (config) => {
    try {
      // Add request deduplication for GET requests
      if (config.method?.toLowerCase() === "get") {
        const requestKey = createRequestKey(config);
        if (pendingRequests.has(requestKey)) {
          return pendingRequests.get(requestKey);
        }
      }

      if (Platform.OS !== "web") {
        const token = await getAuthToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
      }
    } catch (error) {
      console.warn("Failed to get auth token:", error);
    }
    return config;
  },
  (error) => {
    console.error("Request interceptor error:", error);
    return Promise.reject(error);
  }
);

// Response interceptor with deduplication cleanup and error handling
api.interceptors.response.use(
  (response) => {
    console.log("✅ API Response success:", response.config.url);

    // Clean up pending request for GET requests
    if (response.config.method?.toLowerCase() === "get") {
      const requestKey = createRequestKey(response.config);
      pendingRequests.delete(requestKey);
    }

    return response;
  },
  async (error) => {
    console.error("🚨 API Response Error:", {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      url: error.config?.url,
      method: error.config?.method,
      message: error.message,
      code: error.code,
    });

    // Clean up pending request on error
    if (error.config?.method?.toLowerCase() === "get") {
      const requestKey = createRequestKey(error.config);
      pendingRequests.delete(requestKey);
    }

    // Check for network errors
    if (error.code === "NETWORK_ERROR" || error.message === "Network Error") {
      console.error("🌐 Network connectivity issue detected");
      console.error("💡 Check if your server is running and accessible");
      console.error("💡 Verify your IP address in the API configuration");
    }

    // Handle timeout errors specifically
    if (error.code === "ECONNABORTED" || error.message.includes("timeout")) {
      console.error("⏰ Request timeout detected");
      console.error(
        "💡 Consider reducing image size or check network stability"
      );
    }

    if (error.response?.status === 401) {
      // Token expired or invalid - clear stored token
      try {
        await clearAuthToken();
        console.log("🗑️ Cleared invalid token");
      } catch (clearError) {
        console.warn("⚠️ Failed to clear token:", clearError);
      }
    }
    return Promise.reject(error);
  }
);

export const authAPI = {
  signIn: async (data: SignInData) => {
    try {
      console.log("🔑 Attempting sign in...");
      console.log("🌐 API URL:", `${API_BASE_URL}/auth/signin`);

      const response = await api.post("/auth/signin", data);

      // Store token for mobile only (web uses cookies)
      if (
        Platform.OS !== "web" &&
        response.data.success &&
        response.data.token
      ) {
        await storeAuthToken(response.data.token);
        console.log("✅ Sign in successful, token stored securely for mobile");
      } else if (Platform.OS === "web") {
        console.log("✅ Sign in successful, cookie set by server for web");
      }

      return response.data;
    } catch (error: any) {
      console.error("💥 Sign in error:", error);

      // Provide more specific error messages
      if (error.code === "NETWORK_ERROR" || error.message === "Network Error") {
        throw new Error(
          "Cannot connect to server. Please check your internet connection and ensure the server is running."
        );
      }

      throw error;
    }
  },

  signUp: async (data: SignUpData) => {
    try {
      console.log("📝 Attempting sign up...");
      console.log("🌐 API URL:", `${API_BASE_URL}/auth/signup`);
      console.log("📧 Email:", data.email);

      const response = await api.post("/auth/signup", data);

      console.log("✅ Signup API response:", response.data);

      // Don't store token during signup - user needs to verify email first
      if (response.data.success) {
        console.log("✅ Sign up successful - email verification required");
      }

      return response.data;
    } catch (error: any) {
      console.error("💥 Sign up error:", error);
      console.error("💥 Error response:", error.response?.data);

      // Provide more specific error messages
      if (error.code === "NETWORK_ERROR" || error.message === "Network Error") {
        throw new Error(
          "Cannot connect to server. Please check your internet connection and ensure the server is running."
        );
      }

      // Return the specific error from the server
      if (error.response?.data?.error) {
        throw new Error(error.response.data.error);
      }

      throw error;
    }
  },

  signOut: async () => {
    try {
      // Call server signout endpoint to clear server-side session and cookie
      await api.post("/auth/signout");
      router.push("/signin");
      // Clear local storage
      await clearAuthToken();
      console.log("🔓 Auth token cleared securely");
    } catch (error) {
      console.error("💥 Sign out error:", error);
      // Even if server call fails, clear local storage
      await clearAuthToken();
      throw error;
    }
  },

  verifyEmail: async (email: string, code: string) => {
    try {
      console.log("🔑 Attempting email verification...");
      console.log("🌐 API URL:", `${API_BASE_URL}/auth/verify-email`);

      const response = await api.post("/auth/verify-email", { email, code });

      // Store token for mobile only (web uses cookies)
      if (
        Platform.OS !== "web" &&
        response.data.success &&
        response.data.token
      ) {
        await storeAuthToken(response.data.token);
        console.log(
          "✅ Email verification successful, token stored securely for mobile"
        );
      } else if (Platform.OS === "web") {
        console.log(
          "✅ Email verification successful, cookie set by server for web"
        );
      }

      return response.data;
    } catch (error: any) {
      console.error("💥 Email verification error:", error);

      // Provide more specific error messages
      if (error.code === "NETWORK_ERROR" || error.message === "Network Error") {
        throw new Error(
          "Cannot connect to server. Please check your internet connection and ensure the server is running."
        );
      }

      throw error;
    }
  },

  getStoredToken: async () => {
    try {
      return await getAuthToken();
    } catch (error) {
      console.error("💥 Get stored token error:", error);
      return null;
    }
  },
};

export const nutritionAPI = {
  analyzeMeal: async (
    imageBase64: string,
    updateText: string | undefined = undefined,
    editedIngredients: any[] = [],
    language: string = "en"
  ): Promise<{ success: boolean; data?: MealAnalysisData; error?: string }> => {
    try {
      console.log("🔍 Making analyze meal API request...");
      console.log("📊 Base64 length:", imageBase64.length);
      console.log("🥗 Edited ingredients count:", editedIngredients.length);
      console.log("💬 Update text provided:", !!updateText);
      console.log("🌐 Language:", language);

      // Clean base64 - remove data URL prefix if present
      let cleanBase64 = imageBase64;
      if (imageBase64.startsWith("data:image/")) {
        const commaIndex = imageBase64.indexOf(",");
        if (commaIndex !== -1) {
          cleanBase64 = imageBase64.substring(commaIndex + 1);
        }
      }

      console.log("📊 Clean base64 length:", cleanBase64.length);

      const requestData = {
        imageBase64: cleanBase64, // Send clean base64 without data URL prefix
        language: language === "he" ? "hebrew" : "english",
        date: new Date().toISOString().split("T")[0],
        updateText: updateText || undefined,
        editedIngredients: editedIngredients.length > 0 ? editedIngredients : undefined,
      };

      console.log("📤 Request data structure:", {
        imageBase64Length: requestData.imageBase64.length,
        language: requestData.language,
        hasUpdateText: !!requestData.updateText,
        editedIngredientsCount: requestData.editedIngredients?.length || 0,
      });

      // Create a custom timeout for this specific request
      const response = await api.post("/nutrition/analyze", requestData, {
        timeout: 90000, // 90 seconds for image analysis
        headers: {
          "Content-Type": "application/json",
        },
      });

      console.log("🎯 RAW ANALYZE API RESPONSE:");
      console.log("=====================================");
      console.log("📋 Response Success:", response.data.success);
      console.log(
        "📋 Response Data Keys:",
        Object.keys(response.data.data || {})
      );
      console.log("📋 Ingredients count:", response.data.data?.ingredients?.length || 0);
      console.log("=====================================");

      return response.data;
    } catch (error: any) {
      console.error("💥 Analyze meal API error:", error);

      // Handle different types of errors
      if (error.code === "ECONNABORTED" || error.message.includes("timeout")) {
        console.error("⏰ Request timeout - server may be processing");
        return {
          success: false,
          error: "Request timeout - please try again with a smaller image",
        };
      }

      if (error.response) {
        console.error("Error response status:", error.response.status);
        console.error("Error response data:", error.response.data);
        return {
          success: false,
          error: error.response.data?.error || "Server error occurred",
        };
      } else if (error.request) {
        console.error("Network error details:", {
          status: error.request.status,
          statusText: error.request.statusText,
          response: error.request.response,
        });

        // Check if server is responding
        if (error.request.status === 0) {
          return {
            success: false,
            error:
              "Cannot connect to server - please check your internet connection",
          };
        }

        return {
          success: false,
          error: "Network error - please check your connection",
        };
      } else {
        console.error("Request setup error:", error.message);
        return {
          success: false,
          error: error.message || "Failed to make request",
        };
      }
    }
  },

  updateMeal: async (
    meal_id: string,
    updateText: string
  ): Promise<{ success: boolean; data?: any; error?: string }> => {
    try {
      console.log("🔄 Making update meal API request...");
      console.log("🆔 Meal ID:", meal_id);
      console.log("📝 Update text:", updateText);

      const response = await api.put("/nutrition/update", {
        meal_id,
        updateText,
        language: "english",
      });

      console.log("🎯 RAW UPDATE API RESPONSE:");
      console.log("=====================================");
      console.log("📋 Full Response:", JSON.stringify(response.data, null, 2));
      console.log("=====================================");

      if (response.data.success && response.data.data) {
        // Transform the meal data
        const transformedMeal = transformMealData(response.data.data);
        return {
          success: true,
          data: transformedMeal,
        };
      }

      return response.data;
    } catch (error: any) {
      console.error("💥 Update meal API error:", error);

      if (error.response) {
        console.error("Error response:", error.response.data);
        return {
          success: false,
          error: error.response.data?.error || "Server error occurred",
        };
      } else if (error.request) {
        console.error("Network error:", error.request);
        return {
          success: false,
          error: "Network error - please check your connection and server IP",
        };
      } else {
        console.error("Request setup error:", error.message);
        return {
          success: false,
          error: error.message || "Failed to make request",
        };
      }
    }
  },

  saveMeal: async (
    mealData: MealAnalysisData,
    imageBase64?: string
  ): Promise<Meal> => {
    try {
      console.log("📤 Making save meal API request...");

      const response = await api.post("/nutrition/save", {
        mealData,
        imageBase64,
      });

      console.log("🎯 RAW SAVE API RESPONSE:");
      console.log("=====================================");
      console.log("📋 Full Response:", JSON.stringify(response.data, null, 2));
      console.log("=====================================");

      if (response.data.success && response.data.data) {
        return transformMealData(response.data.data);
      } else {
        throw new Error(response.data.error || "Failed to save meal");
      }
    } catch (error: any) {
      console.error("💥 Save meal API error:", error);

      if (error.response?.data?.error) {
        throw new Error(error.response.data.error);
      } else if (error.message) {
        throw new Error(error.message);
      } else {
        throw new Error("Failed to save meal");
      }
    }
  },

  getMeals: async (offset = 0, limit = 100): Promise<Meal[]> => {
    try {
      console.log("📥 Making get meals API request...");

      const response = await api.get("/nutrition/meals", {
        params: { offset, limit },
      });

      console.log("🎯 RAW GET MEALS API RESPONSE:");
      console.log("=====================================");
      console.log("📋 Full Response:", JSON.stringify(response.data, null, 2));
      console.log("=====================================");

      if (response.data.success) {
        const meals = response.data.data || [];
        console.log("🔄 Transforming", meals.length, "meals...");

        // Transform each meal to match our interface
        const transformedMeals = meals.map((meal: any) =>
          transformMealData(meal)
        );

        console.log("✅ Transformed meals:", transformedMeals.length);
        return transformedMeals;
      } else {
        throw new Error(response.data.error || "Failed to fetch meals");
      }
    } catch (error: any) {
      console.error("💥 Get meals API error:", error);

      if (error.response?.data?.error) {
        throw new Error(error.response.data.error);
      } else if (error.message) {
        throw new Error(error.message);
      } else {
        throw new Error("Failed to fetch meals");
      }
    }
  },

  getDailyStats: async (date: string) => {
    try {
      console.log("📊 Getting daily stats for:", date);

      const response = await api.get(`/nutrition/daily-stats?date=${date}`);

      console.log("✅ Daily stats response:", response.data);
      return response.data;
    } catch (error: any) {
      console.error("💥 Daily stats API error:", error);
      throw error;
    }
  },

  getRangeStatistics: async (startDate: string, endDate: string) => {
    try {
      console.log("📊 Getting range statistics:", {
        start: startDate,
        end: endDate,
      });

      // Ensure dates are in YYYY-MM-DD format
      const formatDate = (dateStr: string) => {
        // Check if already in YYYY-MM-DD format
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
          return dateStr;
        }

        // Parse and format the date
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) {
          throw new Error(`Invalid date: ${dateStr}`);
        }

        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
      };

      const formattedStartDate = formatDate(startDate);
      const formattedEndDate = formatDate(endDate);

      console.log("📊 Formatted dates for API:", {
        formattedStartDate,
        formattedEndDate,
      });

      // 🔧 EXPLICIT URL BUILDING - Build the URL manually to be 100% sure
      const baseUrl = "/nutrition/stats/range";
      const queryParams = new URLSearchParams({
        startDate: formattedStartDate,
        endDate: formattedEndDate,
      });
      const fullUrl = `${baseUrl}?${queryParams.toString()}`;

      console.log("🔍 Full URL being called:", fullUrl);
      console.log("🔍 Query params object:", Object.fromEntries(queryParams));

      // Make the request with the explicit URL
      const response = await api.get(fullUrl);

      console.log("✅ Range statistics response:", response.data);
      return response.data;
    } catch (error: any) {
      console.error("💥 Range statistics API error:", error);

      // Enhanced error logging
      if (error.response) {
        console.error("🔍 Error response data:", error.response.data);
        console.error("🔍 Error response status:", error.response.status);
        console.error("🔍 Error response headers:", error.response.headers);
        console.error("🔍 Request URL:", error.config?.url);
        console.error("🔍 Request params:", error.config?.params);
      }

      throw error;
    }
  },
  // NEW API METHODS FOR HISTORY FEATURES
  saveMealFeedback: async (
    mealId: string,
    feedback: {
      tasteRating?: number;
      satietyRating?: number;
      energyRating?: number;
      heavinessRating?: number;
    }
  ) => {
    try {
      console.log("💬 Making save meal feedback API request...");
      console.log("🆔 Meal ID:", mealId);
      console.log("📊 Feedback:", feedback);

      const response = await api.post(
        `/nutrition/meals/${mealId}/feedback`,
        feedback
      );

      console.log("✅ Save feedback response:", response.data);
      return response.data;
    } catch (error: any) {
      console.error("💥 Save feedback API error:", error);
      throw error;
    }
  },

  toggleMealFavorite: async (mealId: string) => {
    try {
      console.log("❤️ Making toggle meal favorite API request...");
      console.log("🆔 Meal ID:", mealId);

      const response = await api.post(`/nutrition/meals/${mealId}/favorite`);

      console.log("✅ Toggle favorite response:", response.data);
      return response.data;
    } catch (error: any) {
      console.error("💥 Toggle favorite API error:", error);
      throw error;
    }
  },

  duplicateMeal: async (mealId: string, newDate?: string) => {
    try {
      console.log("📋 Making duplicate meal API request...");
      console.log("🆔 Meal ID:", mealId);
      console.log("📅 New date:", newDate);

      // Ensure we're sending the correct meal ID format
      const requestData = {
        newDate: newDate || new Date().toISOString().split("T")[0],
      };

      console.log("📤 Request data:", requestData);
      console.log("🔗 Request URL:", `/nutrition/meals/${mealId}/duplicate`);

      const response = await api.post(
        `/nutrition/meals/${mealId}/duplicate`,
        requestData
      );

      console.log("✅ Duplicate meal response:", response.data);

      if (response.data.success && response.data.data) {
        return {
          success: true,
          data: transformMealData(response.data.data),
        };
      }

      return response.data;
    } catch (error: any) {
      console.error("💥 Duplicate meal API error:", error);
      console.error("💥 Error details:", {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        url: error.config?.url,
        method: error.config?.method,
      });
      throw error;
    }
  },
};

// NEW CALENDAR API
export const calendarAPI = {
  getCalendarData: async (year: number, month: number) => {
    try {
      console.log("📅 Making get calendar data API request...");
      console.log("📊 Year:", year, "Month:", month);

      const response = await api.get(`/calendar/data/${year}/${month}`);

      console.log("🎯 RAW CALENDAR DATA API RESPONSE:");
      console.log("=====================================");
      console.log("📋 Full Response:", JSON.stringify(response.data, null, 2));
      console.log("=====================================");

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error || "Failed to fetch calendar data");
      }
    } catch (error: any) {
      console.error("💥 Get calendar data API error:", error);

      if (error.response?.data?.error) {
        throw new Error(error.response.data.error);
      } else if (error.message) {
        throw new Error(error.message);
      } else {
        throw new Error("Failed to fetch calendar data");
      }
    }
  },

  getStatistics: async (year: number, month: number) => {
    try {
      console.log("📊 Making get statistics API request...");
      console.log("📊 Year:", year, "Month:", month);

      const response = await api.get(`/calendar/statistics/${year}/${month}`);

      console.log("🎯 RAW STATISTICS API RESPONSE:");
      console.log("=====================================");
      console.log("📋 Full Response:", JSON.stringify(response.data, null, 2));
      console.log("=====================================");

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error || "Failed to fetch statistics");
      }
    } catch (error: any) {
      console.error("💥 Get statistics API error:", error);

      if (error.response?.data?.error) {
        throw new Error(error.response.data.error);
      } else if (error.message) {
        throw new Error(error.message);
      } else {
        throw new Error("Failed to fetch statistics");
      }
    }
  },

  addEvent: async (
    date: string,
    title: string,
    type: string,
    description?: string
  ) => {
    try {
      console.log("📝 Making add event API request...");
      console.log("📅 Date:", date, "Title:", title, "Type:", type);

      const response = await api.post("/calendar/events", {
        date,
        title,
        type,
        description,
      });

      console.log("✅ Add event response:", response.data);

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error || "Failed to add event");
      }
    } catch (error: any) {
      console.error("💥 Add event API error:", error);

      if (error.response?.data?.error) {
        throw new Error(error.response.data.error);
      } else if (error.message) {
        throw new Error(error.message);
      } else {
        throw new Error("Failed to add event");
      }
    }
  },

  deleteEvent: async (eventId: string) => {
    try {
      console.log("🗑️ Making delete event API request...");
      console.log("🗑️ Event ID:", eventId);

      const response = await api.delete(`/calendar/events/${eventId}`);

      console.log("✅ Delete event response:", response.data);
      return response.data;
    } catch (error: any) {
      console.error("💥 Delete event API error:", error);
      throw error;
    }
  },

  getEventsForDate: async (date: string) => {
    try {
      console.log("📅 Making get events for date API request...");
      console.log("📅 Date:", date);

      const response = await api.get(`/calendar/events/${date}`);

      console.log("✅ Get events for date response:", response.data);
      return response.data.data;
    } catch (error: any) {
      console.error("💥 Get events for date API error:", error);
      throw error;
    }
  },

  getMonthComparison: async (year: number, month: number) => {
    try {
      console.log("📊 Making get month comparison API request...");
      console.log("📊 Year:", year, "Month:", month);

      const response = await api.get(`/calendar/comparison/${year}/${month}`);

      console.log("✅ Get month comparison response:", response.data);
      return response.data.data;
    } catch (error: any) {
      console.error("💥 Get month comparison API error:", error);
      throw error;
    }
  },
};

export const userAPI = {
  verifyEmail: async (
    email: string,
    code: string
  ): Promise<{
    success: boolean;
    user?: any;
    token?: string;
    error?: string;
  }> => {
    try {
      console.log("🔄 Verifying email:", email);
      const response = await api.post("/auth/verify-email", {
        email,
        code,
      });
      console.log("✅ verifyEmail response:", response.data);
      return response.data;
    } catch (error: any) {
      console.error("💥 verifyEmail error:", error);
      const errMsg =
        error.response?.data?.error ||
        error.message ||
        "Failed to verify email";
      return { success: false, error: errMsg };
    }
  },
  getUserProfile: async (): Promise<any> => {
    try {
      const response = await api.get("/user/profile");
      return response.data;
    } catch (error) {
      console.error("Get user profile error:", error);
      throw error;
    }
  },

  getMeals: async (): Promise<any[]> => {
    try {
      const response = await api.get("/nutrition/meals");
      return response.data?.data || [];
    } catch (error) {
      console.error("Get meals error:", error);
      throw error;
    }
  },

  getDailyStats: async (date: string): Promise<any> => {
    try {
      const response = await api.get(`/nutrition/daily-stats?date=${date}`);
      return response.data;
    } catch (error) {
      console.error("Get daily stats error:", error);
      throw error;
    }
  },

  updateSubscription: async (subscriptionType: string) => {
    // Optimized with minimal logging
    const token = await getAuthToken();

    if (!token) {
      throw new Error("Missing or invalid authorization");
    }

    try {
      const response = await api.put("/user/subscription", {
        subscription_type: subscriptionType,
      });
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 401) {
        // Silent token cleanup on auth error
        try {
          const SecureStore = require("expo-secure-store");
          await SecureStore.deleteItemAsync("auth_token_secure");
          const AsyncStorage =
            require("@react-native-async-storage/async-storage").default;
          await AsyncStorage.removeItem("auth_token");
          store.dispatch({ type: "auth/forceSignOut" });
        } catch {}
      }
      throw error;
    }
  },

  getGlobalStatistics: async () => {
    try {
      console.log("📊 Making get global statistics API request...");

      const response = await api.get("/user/global-statistics");

      console.log("🎯 RAW GLOBAL STATISTICS API RESPONSE:");
      console.log("=====================================");
      console.log("📋 Full Response:", JSON.stringify(response.data, null, 2));
      console.log("=====================================");

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(
          response.data.error || "Failed to fetch global statistics"
        );
      }
    } catch (error: any) {
      console.error("💥 Get global statistics API error:", error);

      if (error.response?.data?.error) {
        throw new Error(error.response.data.error);
      } else if (error.message) {
        throw new Error(error.message);
      } else {
        throw new Error("Failed to fetch global statistics");
      }
    }
  },
  updateProfile: async (data: any) => {
    const response = await api.put("/user/profile", data);
    return response.data;
  },

  deleteProfile: async () => {
    const response = await api.delete("/user/delete");
    return response.data;
  },
  resendVerificationCode: async (
    email: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      console.log("🔄 Resending verification code:", email);
      const response = await api.post("/auth/resend-verification", { email });
      console.log("✅ resendVerificationCode response:", response.data);
      return response.data;
    } catch (error: any) {
      console.error("💥 resendVerificationCode error:", error);
      const errMsg =
        error.response?.data?.error ||
        error.message ||
        "Failed to resend verification code";
      return { success: false, error: errMsg };
    }
  },
};

// MEAL PLAN API
export const mealPlanAPI = {
  loadMealPlan: async (): Promise<{
    success: boolean;
    data?: any;
    error?: string;
  }> => {
    try {
      console.log("🔄 Loading current meal plan");
      const response = await api.get("/meal-plans/current");
      console.log("✅ loadMealPlan response:", response.data);

      if (response.data.success) {
        return {
          success: true,
          data: {
            weeklyPlan: response.data.data,
            planId: null, // Will be set when we have an active plan
          },
        };
      } else {
        return {
          success: false,
          error: response.data.error || "Failed to load meal plan",
        };
      }
    } catch (error: any) {
      console.error("💥 loadMealPlan error:", error);
      return {
        success: true,
        error:
          error.response?.data?.error ||
          error.message ||
          "Failed to load meal plan",
      };
    }
  },

  createAIMealPlan: async (
    config: any
  ): Promise<{ success: boolean; data?: any; error?: string }> => {
    try {
      console.log("🤖 Creating AI meal plan with config:", config);
      const response = await api.post("/meal-plans/create", config, {
        timeout: 60000,
      });
      console.log("✅ createAIMealPlan response:", response.data);
      return response.data;
    } catch (error: any) {
      console.error("💥 createAIMealPlan error:", error);
      const errMsg =
        error.response?.data?.error ||
        error.message ||
        "Failed to create meal plan";
      return { success: false, error: errMsg };
    }
  },

  replaceMeal: async (
    planId: string,
    payload: {
      day_of_week: number;
      meal_timing: string;
      meal_order: number;
      preferences: any;
    }
  ): Promise<{ success: boolean; data?: any; error?: string }> => {
    try {
      console.log("🔄 Replacing meal with payload:", payload);
      const response = await api.put(`/meal-plans/${planId}/replace`, payload, {
        timeout: 30000,
      });
      console.log("✅ replaceMeal response:", response.data);
      return response.data;
    } catch (error: any) {
      console.error("💥 replaceMeal error:", error);
      const errMsg =
        error.response?.data?.error ||
        error.message ||
        "Failed to replace meal";
      return { success: false, error: errMsg };
    }
  },

  markMealAsFavorite: async (
    template_id: string
  ): Promise<{ success: boolean; data?: any; error?: string }> => {
    try {
      console.log("❤️ Marking meal as favorite:", template_id);
      const response = await api.post("/meal-plans/preferences", {
        template_id,
        preference_type: "favorite",
        rating: 5,
      });
      console.log("✅ markMealAsFavorite response:", response.data);
      return response.data;
    } catch (error: any) {
      console.error("💥 markMealAsFavorite error:", error);
      const errMsg =
        error.response?.data?.error ||
        error.message ||
        "Failed to mark as favorite";
      return { success: false, error: errMsg };
    }
  },

  generateShoppingList: async (
    planId: string,
    weekStartDate: string
  ): Promise<{ success: boolean; data?: any; error?: string }> => {
    try {
      console.log(
        "🛒 Generating shopping list for plan:",
        planId,
        "week:",
        weekStartDate
      );
      const response = await api.post(
        `/meal-plans/${planId}/shopping-list`,
        { week_start_date: weekStartDate },
        { timeout: 15000 }
      );
      console.log("✅ generateShoppingList response:", response.data);
      return response.data;
    } catch (error: any) {
      console.error("💥 generateShoppingList error:", error);
      const errMsg =
        error.response?.data?.error ||
        error.message ||
        "Failed to generate shopping list";
      return { success: false, error: errMsg };
    }
  },
};

// Statistics API
export const getRangeStatistics = async (
  startDate: string,
  endDate: string
) => {
  try {
    const response = await api.get(`/statistics`, {
      params: {
        start_date: startDate,
        end_date: endDate,
        period: "custom",
      },
    });
    return { success: true, data: response.data };
  } catch (error) {
    console.error("Failed to get range statistics:", error);
    throw error;
  }
};

export const getStatistics = async (
  period: "today" | "week" | "month" = "week"
) => {
  try {
    const response = await api.get("/statistics", {
      params: { period },
    });
    return { success: true, data: response.data };
  } catch (error) {
    console.error("Failed to get statistics:", error);
    throw error;
  }
};

// NEW CHAT API
export const chatAPI = {
  sendMessage: async (message: string, language: string = "hebrew") => {
    try {
      console.log("💬 Sending chat message:", message);

      const response = await api.post("/chat/message", {
        message,
        language,
      });

      console.log("✅ Chat response:", response.data);
      return response.data;
    } catch (error: any) {
      console.error("💥 Chat API error:", error);
      throw error;
    }
  },

  getChatHistory: async (limit: number = 50) => {
    try {
      console.log("📜 Getting chat history...");

      const response = await api.get("/chat/history", {
        params: { limit },
      });

      console.log("✅ Chat history response:", response.data);
      return response.data;
    } catch (error: any) {
      console.error("💥 Chat history API error:", error);
      // Return empty history on error instead of throwing
      return { success: true, data: [] };
    }
  },

  clearHistory: async () => {
    try {
      console.log("🗑️ Clearing chat history...");

      const response = await api.delete("/chat/history");

      console.log("✅ Clear history response:", response.data);
      return response.data;
    } catch (error: any) {
      console.error("💥 Clear history API error:", error);
      throw error;
    }
  },
};

// QUESTIONNAIRE API
export const questionnaireAPI = {
  saveQuestionnaire: async (questionnaireData: any) => {
    try {
      console.log("📝 Saving questionnaire...");
      console.log("🌐 API URL:", `${API_BASE_URL}/questionnaire`);

      const response = await api.post("/questionnaire", questionnaireData);

      console.log("✅ Questionnaire saved successfully");
      return response.data;
    } catch (error: any) {
      console.error("💥 Save questionnaire error:", error);

      if (error.code === "NETWORK_ERROR" || error.message === "Network Error") {
        throw new Error(
          "Cannot connect to server. Please check your internet connection and ensure the server is running."
        );
      }

      throw error;
    }
  },

  getQuestionnaire: async () => {
    try {
      console.log("📖 Getting questionnaire...");

      const response = await api.get("/questionnaire");

      console.log("✅ Questionnaire retrieved successfully");
      return response.data;
    } catch (error: any) {
      console.error("💥 Get questionnaire error:", error);
      throw error;
    }
  },
};

// NEW FOOD SCANNER API
export const foodScannerAPI = {
  scanBarcode: async (barcode: string) => {
    try {
      console.log("🔍 Scanning barcode:", barcode);
      console.log("🌐 API URL:", `${API_BASE_URL}/food-scanner/barcode`);

      const response = await api.post("/food-scanner/barcode", {
        barcode,
      });

      console.log("✅ Barcode scan response:", response.data);
      return response.data;
    } catch (error: any) {
      console.error("💥 Barcode scan API error:", error);
      console.error("💥 Error details:", {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        url: error.config?.url,
        method: error.config?.method,
      });
      throw error;
    }
  },

  scanProductImage: async (imageBase64: string) => {
    try {
      console.log("📷 Scanning product image...");
      console.log("🌐 API URL:", `${API_BASE_URL}/food-scanner/image`);

      // Remove data URL prefix if present
      const cleanBase64 = imageBase64.replace(
        /^data:image\/[a-z]+;base64,/,
        ""
      );

      const response = await api.post("/food-scanner/image", {
        imageBase64: cleanBase64,
      });

      console.log("✅ Image scan response:", response.data);
      return response.data;
    } catch (error: any) {
      console.error("💥 Image scan API error:", error);
      console.error("💥 Error details:", {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        url: error.config?.url,
        method: error.config?.method,
      });
      throw error;
    }
  },

  addToMealLog: async (
    productData: any,
    quantity: number,
    mealTiming: string
  ) => {
    try {
      console.log("📝 Adding to meal log...");

      const response = await api.post("/food-scanner/add-to-meal", {
        productData,
        quantity,
        mealTiming,
      });

      console.log("✅ Added to meal log:", response.data);
      return response.data;
    } catch (error: any) {
      console.error("💥 Add to meal API error:", error);
      throw error;
    }
  },

  getScannedHistory: async () => {
    try {
      console.log("📋 Getting scanned history...");

      const response = await api.get("/food-scanner/history");

      console.log("✅ Scanned history:", response.data);
      return response.data;
    } catch (error: any) {
      console.error("💥 Get scanned history API error:", error);
      throw error;
    }
  },
};
// Adding meal update and delete methods to the mealAPI object.
export const mealAPI = {
  uploadMeal: (formData: FormData) =>
    api.post("/nutrition/upload", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    }),

  getMeals: () => api.get("/nutrition/meals"),

  getMealById: (mealId: number) => api.get(`/nutrition/meals/${mealId}`),

  updateMeal: (mealId: number, updates: any) =>
    api.put(`/nutrition/meals/${mealId}`, updates),

  deleteMeal: async (mealId: string) => {
    try {
      console.log("🗑️ Making delete meal API request...");
      console.log("🗑️ Meal ID:", mealId);

      const response = await api.delete(`/nutrition/meals/${mealId}`);

      console.log("✅ Delete meal response:", response.data);
      return response.data;
    } catch (error: any) {
      console.error("💥 Delete meal API error:", error);
      throw error;
    }
  },

  getMealHistory: async (period: string = "week") => {
    try {
      console.log("📋 Making get meal history API request...");
      console.log("📊 Period:", period);

      const response = await api.get(`/nutrition/meals/history`, {
        params: { period },
      });

      console.log("🎯 RAW MEAL HISTORY API RESPONSE:");
      console.log("=====================================");
      console.log("📋 Full Response:", JSON.stringify(response.data, null, 2));
      console.log("=====================================");

      if (response.data.success) {
        const meals = response.data.data || [];
        console.log("🔄 Transforming", meals.length, "meal history items...");

        // Transform each meal to match our interface
        const transformedMeals = meals.map((meal: any) =>
          transformMealData(meal)
        );

        console.log("✅ Transformed meal history:", transformedMeals.length);
        return { success: true, data: transformedMeals };
      } else {
        throw new Error(response.data.error || "Failed to fetch meal history");
      }
    } catch (error: any) {
      console.error("💥 Get meal history API error:", error);

      if (error.response?.data?.error) {
        throw new Error(error.response.data.error);
      } else if (error.message) {
        throw new Error(error.message);
      } else {
        throw new Error("Failed to fetch meal history");
      }
    }
  },
};
