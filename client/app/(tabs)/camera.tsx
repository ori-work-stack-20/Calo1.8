import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  ScrollView,
  TextInput,
  Modal,
  Dimensions,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useDispatch, useSelector } from "react-redux";
import { RootState, AppDispatch } from "@/src/store";
import {
  analyzeMeal,
  updateMeal,
  postMeal,
  clearPendingMeal,
  clearError,
  processImage,
} from "@/src/store/mealSlice";
import { useTranslation } from "react-i18next";
import { useLanguage } from "@/src/i18n/context/LanguageContext";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import {
  Camera,
  Image as ImageIcon,
  Send,
  Edit3,
  Trash2,
  Plus,
  Minus,
  RotateCcw,
  CheckCircle,
  AlertTriangle,
  Info,
  X,
  Save,
  RefreshCw,
} from "lucide-react-native";
import { useMealDataRefresh } from "@/hooks/useMealDataRefresh";

const { width: screenWidth } = Dimensions.get("window");

interface Ingredient {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  sugar?: number;
  sodium_mg?: number;
}

interface AnalysisData {
  meal_name: string;
  description?: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fats_g: number;
  fiber_g?: number;
  sugar_g?: number;
  sodium_g?: number;
  ingredients: Ingredient[];
  healthScore?: string;
  recommendations?: string;
  cooking_method?: string;
  food_category?: string;
}

export default function CameraScreen() {
  const { t } = useTranslation();
  const { isRTL } = useLanguage();
  const dispatch = useDispatch<AppDispatch>();
  const { refreshAllMealData } = useMealDataRefresh();

  const {
    pendingMeal,
    isAnalyzing,
    isPosting,
    isUpdating,
    error,
  } = useSelector((state: RootState) => state.meal);

  // Local state
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [userComment, setUserComment] = useState("");
  const [editedIngredients, setEditedIngredients] = useState<Ingredient[]>([]);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingIngredient, setEditingIngredient] = useState<Ingredient | null>(null);
  const [editingIndex, setEditingIndex] = useState<number>(-1);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null);
  const [hasBeenAnalyzed, setHasBeenAnalyzed] = useState(false);

  // Refs
  const scrollViewRef = useRef<ScrollView>(null);

  // Clear error on mount
  useEffect(() => {
    dispatch(clearError());
  }, [dispatch]);

  // Update local state when pending meal changes
  useEffect(() => {
    if (pendingMeal?.analysis) {
      setAnalysisData(pendingMeal.analysis);
      setEditedIngredients(pendingMeal.analysis.ingredients || []);
      setHasBeenAnalyzed(true);
      
      // Convert base64 to display format if needed
      if (pendingMeal.image_base_64) {
        const imageUri = pendingMeal.image_base_64.startsWith('data:')
          ? pendingMeal.image_base_64
          : `data:image/jpeg;base64,${pendingMeal.image_base_64}`;
        setSelectedImage(imageUri);
      }
    }
  }, [pendingMeal]);

  // Image selection handlers
  const handleTakePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          t("camera.permission"),
          "Camera permission is required to take photos"
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
        base64: false,
      });

      if (!result.canceled && result.assets[0]) {
        const imageUri = result.assets[0].uri;
        setSelectedImage(imageUri);
        resetAnalysisState();
      }
    } catch (error) {
      console.error("Camera error:", error);
      Alert.alert(t("common.error"), "Failed to take photo");
    }
  };

  const handleSelectFromGallery = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          t("camera.permission"),
          "Gallery permission is required to select photos"
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
        base64: false,
      });

      if (!result.canceled && result.assets[0]) {
        const imageUri = result.assets[0].uri;
        setSelectedImage(imageUri);
        resetAnalysisState();
      }
    } catch (error) {
      console.error("Gallery error:", error);
      Alert.alert(t("common.error"), "Failed to select image");
    }
  };

  // Reset analysis state when new image is selected
  const resetAnalysisState = () => {
    setAnalysisData(null);
    setEditedIngredients([]);
    setUserComment("");
    setHasBeenAnalyzed(false);
    dispatch(clearPendingMeal());
    dispatch(clearError());
  };

  // Initial analysis
  const handleAnalyzeImage = async () => {
    if (!selectedImage) {
      Alert.alert(t("common.error"), "Please select an image first");
      return;
    }

    try {
      console.log("🔍 Starting initial meal analysis...");
      
      // Process image to get base64
      const base64Image = await processImage(selectedImage);
      
      const analysisParams = {
        imageBase64: base64Image,
        language: isRTL ? "hebrew" : "english",
      };

      if (userComment.trim()) {
        analysisParams.updateText = userComment.trim();
      }

      const result = await dispatch(analyzeMeal(analysisParams));
      
      if (analyzeMeal.fulfilled.match(result)) {
        console.log("✅ Initial analysis completed successfully");
        scrollViewRef.current?.scrollTo({ y: 0, animated: true });
      } else {
        console.error("❌ Analysis failed:", result.payload);
        Alert.alert(
          t("camera.analysis_failed"),
          typeof result.payload === "string" 
            ? result.payload 
            : "Failed to analyze meal. Please try again."
        );
      }
    } catch (error) {
      console.error("💥 Analysis error:", error);
      Alert.alert(
        t("camera.analysis_failed"),
        error instanceof Error ? error.message : "Analysis failed"
      );
    }
  };

  // Re-analysis after edits
  const handleReAnalyze = async () => {
    if (!selectedImage || !hasBeenAnalyzed) {
      Alert.alert(t("common.error"), "No meal to re-analyze");
      return;
    }

    try {
      console.log("🔄 Starting re-analysis with edits...");
      
      const base64Image = await processImage(selectedImage);
      
      const reAnalysisParams = {
        imageBase64: base64Image,
        language: isRTL ? "hebrew" : "english",
        updateText: userComment.trim() || "User edited ingredients",
        editedIngredients: editedIngredients,
      };

      const result = await dispatch(analyzeMeal(reAnalysisParams));
      
      if (analyzeMeal.fulfilled.match(result)) {
        console.log("✅ Re-analysis completed successfully");
        Alert.alert(
          t("common.success"),
          "Meal re-analyzed successfully with your edits!"
        );
      } else {
        console.error("❌ Re-analysis failed:", result.payload);
        Alert.alert(
          t("camera.re_analysis_failed"),
          typeof result.payload === "string" 
            ? result.payload 
            : "Failed to re-analyze meal. Please try again."
        );
      }
    } catch (error) {
      console.error("💥 Re-analysis error:", error);
      Alert.alert(
        t("camera.re_analysis_failed"),
        error instanceof Error ? error.message : "Re-analysis failed"
      );
    }
  };

  // Save meal to database
  const handleSaveMeal = async () => {
    if (!analysisData) {
      Alert.alert(t("common.error"), "No analysis data to save");
      return;
    }

    try {
      console.log("💾 Saving meal to database...");
      
      const result = await dispatch(postMeal());
      
      if (postMeal.fulfilled.match(result)) {
        console.log("✅ Meal saved successfully");
        
        // Refresh meal data
        await refreshAllMealData();
        
        Alert.alert(
          t("camera.save_success"),
          "Meal saved successfully!",
          [
            {
              text: t("common.ok"),
              onPress: () => {
                resetAnalysisState();
                setSelectedImage(null);
              },
            },
          ]
        );
      } else {
        console.error("❌ Save failed:", result.payload);
        Alert.alert(
          t("camera.save_failed"),
          typeof result.payload === "string" 
            ? result.payload 
            : "Failed to save meal. Please try again."
        );
      }
    } catch (error) {
      console.error("💥 Save error:", error);
      Alert.alert(
        t("camera.save_failed"),
        error instanceof Error ? error.message : "Save failed"
      );
    }
  };

  // Delete meal (discard analysis)
  const handleDeleteMeal = () => {
    setShowDeleteConfirm(true);
  };

  const confirmDeleteMeal = () => {
    console.log("🗑️ Deleting meal analysis...");
    
    resetAnalysisState();
    setSelectedImage(null);
    setShowDeleteConfirm(false);
    
    Alert.alert(
      t("common.success"),
      "Meal analysis deleted successfully"
    );
  };

  // Ingredient editing functions
  const handleEditIngredient = (ingredient: Ingredient, index: number) => {
    setEditingIngredient({ ...ingredient });
    setEditingIndex(index);
    setShowEditModal(true);
  };

  const handleAddIngredient = () => {
    const newIngredient: Ingredient = {
      name: "",
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      fiber: 0,
      sugar: 0,
      sodium_mg: 0,
    };
    setEditingIngredient(newIngredient);
    setEditingIndex(-1);
    setShowEditModal(true);
  };

  const handleRemoveIngredient = (index: number) => {
    const updatedIngredients = editedIngredients.filter((_, i) => i !== index);
    setEditedIngredients(updatedIngredients);
  };

  const handleSaveIngredient = () => {
    if (!editingIngredient || !editingIngredient.name.trim()) {
      Alert.alert(t("common.error"), "Ingredient name is required");
      return;
    }

    const updatedIngredients = [...editedIngredients];
    
    if (editingIndex >= 0) {
      // Update existing ingredient
      updatedIngredients[editingIndex] = editingIngredient;
    } else {
      // Add new ingredient
      updatedIngredients.push(editingIngredient);
    }
    
    setEditedIngredients(updatedIngredients);
    setShowEditModal(false);
    setEditingIngredient(null);
    setEditingIndex(-1);
  };

  // Calculate total nutrition from ingredients
  const calculateTotalNutrition = (ingredients: Ingredient[]) => {
    return ingredients.reduce(
      (totals, ingredient) => ({
        calories: totals.calories + (ingredient.calories || 0),
        protein: totals.protein + (ingredient.protein || 0),
        carbs: totals.carbs + (ingredient.carbs || 0),
        fat: totals.fat + (ingredient.fat || 0),
        fiber: totals.fiber + (ingredient.fiber || 0),
        sugar: totals.sugar + (ingredient.sugar || 0),
        sodium: totals.sodium + (ingredient.sodium_mg || 0),
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, sodium: 0 }
    );
  };

  // Render functions
  const renderImageSelection = () => (
    <View style={styles.imageSelectionContainer}>
      <LinearGradient
        colors={["#f0fdf4", "#ecfdf5"]}
        style={styles.imageSelectionGradient}
      >
        <View style={styles.imageSelectionHeader}>
          <Camera size={48} color="#10b981" />
          <Text style={[styles.imageSelectionTitle, isRTL && styles.rtlText]}>
            {t("camera.smart_analysis")}
          </Text>
          <Text style={[styles.imageSelectionSubtitle, isRTL && styles.rtlText]}>
            {t("camera.analysis_subtitle")}
          </Text>
        </View>

        <View style={styles.imageSelectionButtons}>
          <TouchableOpacity
            style={styles.imageSelectionButton}
            onPress={handleTakePhoto}
          >
            <LinearGradient
              colors={["#10b981", "#059669"]}
              style={styles.imageButtonGradient}
            >
              <Camera size={24} color="#ffffff" />
              <Text style={styles.imageButtonText}>
                {t("camera.take_picture")}
              </Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.imageSelectionButton}
            onPress={handleSelectFromGallery}
          >
            <LinearGradient
              colors={["#059669", "#047857"]}
              style={styles.imageButtonGradient}
            >
              <ImageIcon size={24} color="#ffffff" />
              <Text style={styles.imageButtonText}>
                {t("camera.choose_gallery")}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        <View style={styles.tipContainer}>
          <Info size={20} color="#10b981" />
          <View style={styles.tipTextContainer}>
            <Text style={[styles.tipTitle, isRTL && styles.rtlText]}>
              {t("camera.optimal_results")}
            </Text>
            <Text style={[styles.tipDescription, isRTL && styles.rtlText]}>
              {t("camera.tip_description")}
            </Text>
          </View>
        </View>
      </LinearGradient>
    </View>
  );

  const renderSelectedImage = () => (
    <View style={styles.selectedImageContainer}>
      <Image source={{ uri: selectedImage! }} style={styles.selectedImage} />
      
      <View style={styles.imageActions}>
        <TouchableOpacity
          style={styles.imageActionButton}
          onPress={() => {
            resetAnalysisState();
            setSelectedImage(null);
          }}
        >
          <X size={20} color="#ef4444" />
          <Text style={styles.imageActionText}>{t("camera.clear")}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.imageActionButton}
          onPress={handleTakePhoto}
        >
          <RotateCcw size={20} color="#6b7280" />
          <Text style={styles.imageActionText}>{t("camera.retake_photo")}</Text>
        </TouchableOpacity>
      </View>

      {!hasBeenAnalyzed && (
        <View style={styles.commentContainer}>
          <Text style={[styles.commentLabel, isRTL && styles.rtlText]}>
            {t("camera.additional_info")}
          </Text>
          <TextInput
            style={[styles.commentInput, isRTL && styles.rtlTextInput]}
            placeholder={t("camera.enter_correction")}
            placeholderTextColor="#9ca3af"
            value={userComment}
            onChangeText={setUserComment}
            multiline
            numberOfLines={3}
            textAlign={isRTL ? "right" : "left"}
          />
        </View>
      )}

      {!hasBeenAnalyzed && (
        <TouchableOpacity
          style={[styles.analyzeButton, isAnalyzing && styles.buttonDisabled]}
          onPress={handleAnalyzeImage}
          disabled={isAnalyzing}
        >
          <LinearGradient
            colors={isAnalyzing ? ["#9ca3af", "#6b7280"] : ["#10b981", "#059669"]}
            style={styles.analyzeButtonGradient}
          >
            {isAnalyzing ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Send size={20} color="#ffffff" />
            )}
            <Text style={styles.analyzeButtonText}>
              {isAnalyzing ? t("camera.analyzing") : t("camera.analyze_photo")}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      )}
    </View>
  );

  const renderAnalysisResults = () => {
    if (!analysisData) return null;

    const totalNutrition = calculateTotalNutrition(editedIngredients);

    return (
      <View style={styles.analysisContainer}>
        <LinearGradient
          colors={["#ffffff", "#f8fafc"]}
          style={styles.analysisGradient}
        >
          {/* Analysis Header */}
          <View style={styles.analysisHeader}>
            <CheckCircle size={24} color="#10b981" />
            <Text style={[styles.analysisTitle, isRTL && styles.rtlText]}>
              {t("camera.analysis_results")}
            </Text>
          </View>

          {/* Meal Name */}
          <View style={styles.mealNameContainer}>
            <Text style={[styles.mealName, isRTL && styles.rtlText]}>
              {analysisData.meal_name}
            </Text>
            {analysisData.description && (
              <Text style={[styles.mealDescription, isRTL && styles.rtlText]}>
                {analysisData.description}
              </Text>
            )}
          </View>

          {/* Nutrition Summary */}
          <View style={styles.nutritionSummary}>
            <Text style={[styles.sectionTitle, isRTL && styles.rtlText]}>
              {t("camera.nutritional_info")}
            </Text>
            
            <View style={styles.nutritionGrid}>
              <View style={styles.nutritionCard}>
                <Text style={styles.nutritionValue}>{Math.round(totalNutrition.calories)}</Text>
                <Text style={styles.nutritionLabel}>{t("meals.calories")}</Text>
              </View>
              <View style={styles.nutritionCard}>
                <Text style={styles.nutritionValue}>{Math.round(totalNutrition.protein)}g</Text>
                <Text style={styles.nutritionLabel}>{t("meals.protein")}</Text>
              </View>
              <View style={styles.nutritionCard}>
                <Text style={styles.nutritionValue}>{Math.round(totalNutrition.carbs)}g</Text>
                <Text style={styles.nutritionLabel}>{t("meals.carbs")}</Text>
              </View>
              <View style={styles.nutritionCard}>
                <Text style={styles.nutritionValue}>{Math.round(totalNutrition.fat)}g</Text>
                <Text style={styles.nutritionLabel}>{t("meals.fat")}</Text>
              </View>
            </View>

            {(totalNutrition.fiber > 0 || totalNutrition.sugar > 0) && (
              <View style={styles.additionalNutrition}>
                {totalNutrition.fiber > 0 && (
                  <View style={styles.additionalNutritionItem}>
                    <Text style={styles.additionalNutritionLabel}>{t("camera.fiber")}:</Text>
                    <Text style={styles.additionalNutritionValue}>{Math.round(totalNutrition.fiber)}g</Text>
                  </View>
                )}
                {totalNutrition.sugar > 0 && (
                  <View style={styles.additionalNutritionItem}>
                    <Text style={styles.additionalNutritionLabel}>{t("camera.sugar")}:</Text>
                    <Text style={styles.additionalNutritionValue}>{Math.round(totalNutrition.sugar)}g</Text>
                  </View>
                )}
                {totalNutrition.sodium > 0 && (
                  <View style={styles.additionalNutritionItem}>
                    <Text style={styles.additionalNutritionLabel}>{t("camera.sodium")}:</Text>
                    <Text style={styles.additionalNutritionValue}>{Math.round(totalNutrition.sodium)}mg</Text>
                  </View>
                )}
              </View>
            )}
          </View>

          {/* Ingredients List */}
          <View style={styles.ingredientsSection}>
            <View style={styles.ingredientsHeader}>
              <Text style={[styles.sectionTitle, isRTL && styles.rtlText]}>
                {t("camera.identified_ingredients")}
              </Text>
              <TouchableOpacity
                style={styles.addIngredientButton}
                onPress={handleAddIngredient}
              >
                <Plus size={16} color="#10b981" />
                <Text style={styles.addIngredientText}>{t("common.add")}</Text>
              </TouchableOpacity>
            </View>

            {editedIngredients.map((ingredient, index) => (
              <View key={index} style={styles.ingredientCard}>
                <View style={styles.ingredientInfo}>
                  <Text style={[styles.ingredientName, isRTL && styles.rtlText]}>
                    {ingredient.name}
                  </Text>
                  <View style={styles.ingredientNutrition}>
                    <Text style={styles.ingredientNutritionText}>
                      {Math.round(ingredient.calories)} {t("meals.kcal")} • {Math.round(ingredient.protein)}g {t("meals.protein")}
                    </Text>
                  </View>
                </View>
                
                <View style={styles.ingredientActions}>
                  <TouchableOpacity
                    style={styles.ingredientActionButton}
                    onPress={() => handleEditIngredient(ingredient, index)}
                  >
                    <Edit3 size={16} color="#6b7280" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.ingredientActionButton}
                    onPress={() => handleRemoveIngredient(index)}
                  >
                    <Trash2 size={16} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>

          {/* Additional Information */}
          {(analysisData.cooking_method || analysisData.recommendations) && (
            <View style={styles.additionalInfoSection}>
              <Text style={[styles.sectionTitle, isRTL && styles.rtlText]}>
                {t("camera.additional_info")}
              </Text>
              
              {analysisData.cooking_method && (
                <View style={styles.infoItem}>
                  <Text style={[styles.infoLabel, isRTL && styles.rtlText]}>
                    Cooking Method:
                  </Text>
                  <Text style={[styles.infoValue, isRTL && styles.rtlText]}>
                    {analysisData.cooking_method}
                  </Text>
                </View>
              )}
              
              {analysisData.recommendations && (
                <View style={styles.infoItem}>
                  <Text style={[styles.infoLabel, isRTL && styles.rtlText]}>
                    Health Notes:
                  </Text>
                  <Text style={[styles.infoValue, isRTL && styles.rtlText]}>
                    {analysisData.recommendations}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Action Buttons */}
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={handleDeleteMeal}
            >
              <Trash2 size={20} color="#ef4444" />
              <Text style={styles.secondaryButtonText}>
                {t("camera.delete_analysis")}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.secondaryButton, isUpdating && styles.buttonDisabled]}
              onPress={handleReAnalyze}
              disabled={isUpdating}
            >
              {isUpdating ? (
                <ActivityIndicator size="small" color="#10b981" />
              ) : (
                <RefreshCw size={20} color="#10b981" />
              )}
              <Text style={styles.secondaryButtonText}>
                {isUpdating ? t("camera.updating_analysis") : t("camera.re_analyze")}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.primaryButton, isPosting && styles.buttonDisabled]}
              onPress={handleSaveMeal}
              disabled={isPosting}
            >
              <LinearGradient
                colors={isPosting ? ["#9ca3af", "#6b7280"] : ["#10b981", "#059669"]}
                style={styles.primaryButtonGradient}
              >
                {isPosting ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Save size={20} color="#ffffff" />
                )}
                <Text style={styles.primaryButtonText}>
                  {isPosting ? t("common.loading") : t("camera.save_meal")}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </View>
    );
  };

  const renderEditModal = () => (
    <Modal
      visible={showEditModal}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setShowEditModal(false)}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.modalOverlay}
      >
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {editingIndex >= 0 ? t("common.edit") : t("common.add")} Ingredient
            </Text>
            <TouchableOpacity onPress={() => setShowEditModal(false)}>
              <X size={24} color="#6b7280" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Name *</Text>
              <TextInput
                style={styles.modalInput}
                value={editingIngredient?.name || ""}
                onChangeText={(text) =>
                  setEditingIngredient(prev => prev ? { ...prev, name: text } : null)
                }
                placeholder="Enter ingredient name"
                textAlign={isRTL ? "right" : "left"}
              />
            </View>

            <View style={styles.inputRow}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Calories</Text>
                <TextInput
                  style={styles.modalInput}
                  value={editingIngredient?.calories?.toString() || "0"}
                  onChangeText={(text) =>
                    setEditingIngredient(prev => prev ? { 
                      ...prev, 
                      calories: parseFloat(text) || 0 
                    } : null)
                  }
                  keyboardType="numeric"
                  placeholder="0"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Protein (g)</Text>
                <TextInput
                  style={styles.modalInput}
                  value={editingIngredient?.protein?.toString() || "0"}
                  onChangeText={(text) =>
                    setEditingIngredient(prev => prev ? { 
                      ...prev, 
                      protein: parseFloat(text) || 0 
                    } : null)
                  }
                  keyboardType="numeric"
                  placeholder="0"
                />
              </View>
            </View>

            <View style={styles.inputRow}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Carbs (g)</Text>
                <TextInput
                  style={styles.modalInput}
                  value={editingIngredient?.carbs?.toString() || "0"}
                  onChangeText={(text) =>
                    setEditingIngredient(prev => prev ? { 
                      ...prev, 
                      carbs: parseFloat(text) || 0 
                    } : null)
                  }
                  keyboardType="numeric"
                  placeholder="0"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Fat (g)</Text>
                <TextInput
                  style={styles.modalInput}
                  value={editingIngredient?.fat?.toString() || "0"}
                  onChangeText={(text) =>
                    setEditingIngredient(prev => prev ? { 
                      ...prev, 
                      fat: parseFloat(text) || 0 
                    } : null)
                  }
                  keyboardType="numeric"
                  placeholder="0"
                />
              </View>
            </View>

            <View style={styles.inputRow}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Fiber (g)</Text>
                <TextInput
                  style={styles.modalInput}
                  value={editingIngredient?.fiber?.toString() || "0"}
                  onChangeText={(text) =>
                    setEditingIngredient(prev => prev ? { 
                      ...prev, 
                      fiber: parseFloat(text) || 0 
                    } : null)
                  }
                  keyboardType="numeric"
                  placeholder="0"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Sugar (g)</Text>
                <TextInput
                  style={styles.modalInput}
                  value={editingIngredient?.sugar?.toString() || "0"}
                  onChangeText={(text) =>
                    setEditingIngredient(prev => prev ? { 
                      ...prev, 
                      sugar: parseFloat(text) || 0 
                    } : null)
                  }
                  keyboardType="numeric"
                  placeholder="0"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Sodium (mg)</Text>
              <TextInput
                style={styles.modalInput}
                value={editingIngredient?.sodium_mg?.toString() || "0"}
                onChangeText={(text) =>
                  setEditingIngredient(prev => prev ? { 
                    ...prev, 
                    sodium_mg: parseFloat(text) || 0 
                  } : null)
                }
                keyboardType="numeric"
                placeholder="0"
              />
            </View>
          </ScrollView>

          <View style={styles.modalActions}>
            <TouchableOpacity
              style={styles.modalCancelButton}
              onPress={() => setShowEditModal(false)}
            >
              <Text style={styles.modalCancelText}>{t("common.cancel")}</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.modalSaveButton}
              onPress={handleSaveIngredient}
            >
              <Text style={styles.modalSaveText}>{t("common.save")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );

  const renderDeleteConfirmModal = () => (
    <Modal
      visible={showDeleteConfirm}
      animationType="fade"
      transparent={true}
      onRequestClose={() => setShowDeleteConfirm(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.confirmModalContent}>
          <AlertTriangle size={48} color="#ef4444" />
          <Text style={styles.confirmTitle}>
            {t("camera.delete_analysis")}
          </Text>
          <Text style={styles.confirmMessage}>
            {t("camera.delete_confirmation")}
          </Text>
          
          <View style={styles.confirmActions}>
            <TouchableOpacity
              style={styles.confirmCancelButton}
              onPress={() => setShowDeleteConfirm(false)}
            >
              <Text style={styles.confirmCancelText}>{t("common.cancel")}</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.confirmDeleteButton}
              onPress={confirmDeleteMeal}
            >
              <Text style={styles.confirmDeleteText}>{t("common.delete")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  // Error display
  const renderError = () => {
    if (!error) return null;

    return (
      <View style={styles.errorContainer}>
        <AlertTriangle size={20} color="#ef4444" />
        <Text style={[styles.errorText, isRTL && styles.rtlText]}>
          {error}
        </Text>
        <TouchableOpacity
          style={styles.errorDismiss}
          onPress={() => dispatch(clearError())}
        >
          <X size={16} color="#ef4444" />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, isRTL && styles.rtlText]}>
            {t("camera.title")}
          </Text>
          <Text style={[styles.subtitle, isRTL && styles.rtlText]}>
            {t("camera.description")}
          </Text>
        </View>

        {/* Error Display */}
        {renderError()}

        {/* Main Content */}
        {!selectedImage ? (
          renderImageSelection()
        ) : (
          <>
            {renderSelectedImage()}
            {renderAnalysisResults()}
          </>
        )}
      </ScrollView>

      {/* Modals */}
      {renderEditModal()}
      {renderDeleteConfirmModal()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  header: {
    paddingHorizontal: 24,
    paddingVertical: 20,
    alignItems: "center",
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#1f2937",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#6b7280",
    textAlign: "center",
    lineHeight: 24,
  },
  rtlText: {
    textAlign: "right",
    writingDirection: "rtl",
  },
  rtlTextInput: {
    textAlign: "right",
  },

  // Error styles
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca",
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 24,
    marginBottom: 16,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: "#dc2626",
    marginLeft: 12,
  },
  errorDismiss: {
    padding: 4,
  },

  // Image selection styles
  imageSelectionContainer: {
    marginHorizontal: 24,
    borderRadius: 20,
    overflow: "hidden",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
  },
  imageSelectionGradient: {
    padding: 32,
  },
  imageSelectionHeader: {
    alignItems: "center",
    marginBottom: 32,
  },
  imageSelectionTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#065f46",
    marginTop: 16,
    marginBottom: 8,
  },
  imageSelectionSubtitle: {
    fontSize: 16,
    color: "#047857",
    textAlign: "center",
    lineHeight: 24,
  },
  imageSelectionButtons: {
    gap: 16,
    marginBottom: 24,
  },
  imageSelectionButton: {
    borderRadius: 16,
    overflow: "hidden",
    elevation: 2,
    shadowColor: "#10b981",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  imageButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    paddingHorizontal: 24,
    gap: 12,
  },
  imageButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
  },
  tipContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "rgba(255, 255, 255, 0.8)",
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  tipTextContainer: {
    flex: 1,
  },
  tipTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#065f46",
    marginBottom: 4,
  },
  tipDescription: {
    fontSize: 13,
    color: "#047857",
    lineHeight: 18,
  },

  // Selected image styles
  selectedImageContainer: {
    marginHorizontal: 24,
    marginBottom: 24,
  },
  selectedImage: {
    width: "100%",
    height: 240,
    borderRadius: 16,
    backgroundColor: "#f3f4f6",
  },
  imageActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
  },
  imageActionButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    gap: 8,
  },
  imageActionText: {
    fontSize: 14,
    color: "#6b7280",
    fontWeight: "500",
  },
  commentContainer: {
    marginTop: 16,
  },
  commentLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
  },
  commentInput: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: "#374151",
    minHeight: 80,
    textAlignVertical: "top",
  },
  analyzeButton: {
    marginTop: 20,
    borderRadius: 16,
    overflow: "hidden",
    elevation: 4,
    shadowColor: "#10b981",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  analyzeButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 18,
    gap: 12,
  },
  analyzeButtonText: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#ffffff",
  },

  // Analysis results styles
  analysisContainer: {
    marginHorizontal: 24,
    borderRadius: 20,
    overflow: "hidden",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
  },
  analysisGradient: {
    padding: 24,
  },
  analysisHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
    gap: 12,
  },
  analysisTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#065f46",
  },
  mealNameContainer: {
    marginBottom: 24,
    alignItems: "center",
  },
  mealName: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#1f2937",
    textAlign: "center",
    marginBottom: 8,
  },
  mealDescription: {
    fontSize: 16,
    color: "#6b7280",
    textAlign: "center",
    lineHeight: 22,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 16,
  },
  nutritionSummary: {
    marginBottom: 24,
  },
  nutritionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 16,
  },
  nutritionCard: {
    flex: 1,
    minWidth: (screenWidth - 96) / 2 - 6,
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  nutritionValue: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#10b981",
    marginBottom: 4,
  },
  nutritionLabel: {
    fontSize: 12,
    color: "#6b7280",
    fontWeight: "500",
    textTransform: "uppercase",
  },
  additionalNutrition: {
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  additionalNutritionItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  additionalNutritionLabel: {
    fontSize: 14,
    color: "#6b7280",
    fontWeight: "500",
  },
  additionalNutritionValue: {
    fontSize: 14,
    color: "#374151",
    fontWeight: "600",
  },

  // Ingredients styles
  ingredientsSection: {
    marginBottom: 24,
  },
  ingredientsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  addIngredientButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ecfdf5",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#10b981",
    gap: 4,
  },
  addIngredientText: {
    fontSize: 14,
    color: "#10b981",
    fontWeight: "600",
  },
  ingredientCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  ingredientInfo: {
    flex: 1,
  },
  ingredientName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 4,
  },
  ingredientNutrition: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  ingredientNutritionText: {
    fontSize: 13,
    color: "#6b7280",
  },
  ingredientActions: {
    flexDirection: "row",
    gap: 8,
  },
  ingredientActionButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: "#f9fafb",
  },

  // Additional info styles
  additionalInfoSection: {
    marginBottom: 24,
  },
  infoItem: {
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  infoLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 14,
    color: "#6b7280",
    lineHeight: 20,
  },

  // Action buttons styles
  actionButtons: {
    flexDirection: "row",
    gap: 12,
    flexWrap: "wrap",
  },
  primaryButton: {
    flex: 2,
    borderRadius: 16,
    overflow: "hidden",
    elevation: 4,
    shadowColor: "#10b981",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  primaryButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    gap: 8,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#ffffff",
  },
  secondaryButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 16,
    paddingVertical: 16,
    gap: 8,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6b7280",
  },
  buttonDisabled: {
    opacity: 0.6,
  },

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    width: screenWidth - 48,
    maxHeight: "80%",
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1f2937",
  },
  modalBody: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    maxHeight: 400,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputRow: {
    flexDirection: "row",
    gap: 12,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
  },
  modalInput: {
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    color: "#374151",
  },
  modalActions: {
    flexDirection: "row",
    paddingHorizontal: 24,
    paddingVertical: 20,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
    gap: 12,
  },
  modalCancelButton: {
    flex: 1,
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  modalCancelText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#6b7280",
  },
  modalSaveButton: {
    flex: 1,
    backgroundColor: "#10b981",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  modalSaveText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
  },

  // Confirm modal styles
  confirmModalContent: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 32,
    alignItems: "center",
    marginHorizontal: 24,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
  },
  confirmTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#1f2937",
    marginTop: 16,
    marginBottom: 8,
    textAlign: "center",
  },
  confirmMessage: {
    fontSize: 16,
    color: "#6b7280",
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 24,
  },
  confirmActions: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  confirmCancelButton: {
    flex: 1,
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  confirmCancelText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#6b7280",
  },
  confirmDeleteButton: {
    flex: 1,
    backgroundColor: "#ef4444",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  confirmDeleteText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
  },
});