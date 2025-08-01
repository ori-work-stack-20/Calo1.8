import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import { User, SignUpData, SignInData, AuthResponse } from "../types";
import { authAPI } from "../services/api";
import { clearAllQueries } from "../services/queryClient";

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;
  isAuthenticated: boolean;
}

const initialState: AuthState = {
  user: null,
  token: null,
  isLoading: false,
  error: null,
  isAuthenticated: false,
};

export const signUp = createAsyncThunk(
  "auth/signup",
  async (data: SignUpData, { rejectWithValue }) => {
    try {
      console.log("🔄 Starting sign up process...");
      const response = await authAPI.signUp(data);

      if (response.success) {
        console.log("✅ Sign up successful");
        return response;
      }

      return rejectWithValue(response.error || "Signup failed");
    } catch (error: any) {
      console.error("💥 Sign up error:", error);

      // Extract meaningful error message
      let errorMessage = "Signup failed";
      if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error.message) {
        errorMessage = error.message;
      }

      return rejectWithValue(errorMessage);
    }
  }
);

export const signIn = createAsyncThunk(
  "auth/signIn",
  async (data: SignInData, { rejectWithValue }) => {
    try {
      console.log("🔄 Starting sign in process...");
      const response = await authAPI.signIn(data);

      if (response.success && response.token && response.user) {
        console.log("✅ Sign in successful");
        return response;
      }

      return rejectWithValue(response.error || "Login failed");
    } catch (error: any) {
      console.error("💥 Sign in error:", error);

      // Extract meaningful error message
      let errorMessage = "Login failed";
      if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error.message) {
        errorMessage = error.message;
      }

      return rejectWithValue(errorMessage);
    }
  }
);

export const verifyEmail = createAsyncThunk(
  "auth/verifyEmail",
  async (data: { email: string; code: string }, { rejectWithValue }) => {
    try {
      console.log("🔄 Starting email verification process...");
      const response = await authAPI.verifyEmail(data.email, data.code);

      if (response.success && response.token && response.user) {
        console.log("✅ Email verification successful");
        return response;
      }

      return rejectWithValue(response.error || "Email verification failed");
    } catch (error: any) {
      console.error("💥 Email verification error:", error);

      // Extract meaningful error message
      let errorMessage = "Email verification failed";
      if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error.message) {
        errorMessage = error.message;
      }

      return rejectWithValue(errorMessage);
    }
  }
);

export const signOut = createAsyncThunk(
  "auth/signOut",
  async (_, { rejectWithValue }) => {
    try {
      console.log("🔄 Starting sign out process...");

      // Clear AsyncStorage first
      const AsyncStorage =
        require("@react-native-async-storage/async-storage").default;
      await AsyncStorage.clear();
      console.log("✅ AsyncStorage cleared");

      // Clear TanStack Query cache
      clearAllQueries();

      // Clear API auth
      await authAPI.signOut();
      console.log("✅ Sign out successful");

      return true;
    } catch (error: any) {
      console.error("💥 SignOut error:", error);
      // Even if there's an error, try to clear everything
      try {
        const AsyncStorage =
          require("@react-native-async-storage/async-storage").default;
        await AsyncStorage.clear();
        await authAPI.signOut();
      } catch {}
      return rejectWithValue(
        error instanceof Error ? error.message : "SignOut failed"
      );
    }
  }
);

export const loadStoredAuth = createAsyncThunk(
  "auth/loadStoredAuth",
  async (_, { rejectWithValue }) => {
    try {
      console.log("🔄 Loading stored auth...");
      const token = await authAPI.getStoredToken();
      if (token) {
        console.log("✅ Found stored token");
        return token;
      }
      console.log("ℹ️ No stored token found");
      return null;
    } catch (error) {
      console.error("💥 Load stored auth error:", error);
      return rejectWithValue("Failed to load stored auth");
    }
  }
);

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    // Add manual signout reducer as fallback
    forceSignOut: (state) => {
      console.log("🔄 Force sign out");
      state.user = null;
      state.token = null;
      state.isAuthenticated = false;
      state.error = null;
    },
    updateUserSubscription: (
      state,
      action: PayloadAction<{ subscription_type: string }>
    ) => {
      if (state.user) {
        state.user.subscription_type = action.payload.subscription_type as any;
      }
    },
    setQuestionnaireCompleted: (state) => {
      if (state.user) {
        state.user.is_questionnaire_completed = true;
      }
    },
    updateSubscription: (state, action) => {
      if (
        state.user &&
        state.user.subscription_type !== action.payload.subscription_type
      ) {
        state.user.subscription_type = action.payload.subscription_type;
      }
    },
    loginSuccess: (state, action) => {
      state.isAuthenticated = true;
      state.user = action.payload.user;
      state.token = action.payload.token;
      state.isLoading = false;
      state.error = null;
    },
    setUser: (state, action) => {
      // Only update if user data actually changed
      const newUserData = action.payload;
      const currentUserData = state.user;

      // Simple comparison for key fields to prevent unnecessary updates
      if (
        !currentUserData ||
        currentUserData.user_id !== newUserData.user_id ||
        currentUserData.email_verified !== newUserData.email_verified ||
        currentUserData.subscription_type !== newUserData.subscription_type ||
        currentUserData.is_questionnaire_completed !==
          newUserData.is_questionnaire_completed
      ) {
        state.user = newUserData;
        state.isAuthenticated = true;
        state.isLoading = false;
        state.error = null;
      }
    },
    setToken: (state, action) => {
      state.token = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(signUp.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(signUp.fulfilled, (state, action) => {
        state.isLoading = false;
        // Don't set authenticated until email is verified
        if (action.payload.needsEmailVerification) {
          state.user = null;
          state.token = null;
          state.isAuthenticated = false;
          console.log("✅ Sign up successful - awaiting email verification");
        } else {
          state.user = action.payload.user || null;
          state.token = action.payload.token || null;
          state.isAuthenticated = true;
          console.log("✅ Sign up state updated");
        }
        state.error = null;
      })
      .addCase(signUp.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
        state.isAuthenticated = false;
        console.log("❌ Sign up failed:", action.payload);
      })
      .addCase(signIn.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(signIn.fulfilled, (state, action) => {
        state.isLoading = false;
        state.user = action.payload.user || null;
        state.token = action.payload.token || null;
        state.isAuthenticated = true;
        state.error = null;
        console.log("✅ Sign in state updated");
      })
      .addCase(signIn.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
        state.isAuthenticated = false;
        console.log("❌ Sign in failed:", action.payload);
      })
      .addCase(signOut.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(signOut.fulfilled, (state) => {
        state.user = null;
        state.token = null;
        state.isAuthenticated = false;
        state.error = null;
        state.isLoading = false;
        console.log("✅ Sign out state updated");
      })
      .addCase(signOut.rejected, (state, action) => {
        // Even if signout fails, clear the local state
        state.user = null;
        state.token = null;
        state.isAuthenticated = false;
        state.isLoading = false;
        state.error = action.payload as string;
        console.log("⚠️ Sign out failed but state cleared:", action.payload);
      })
      .addCase(loadStoredAuth.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(loadStoredAuth.fulfilled, (state, action) => {
        state.isLoading = false;
        if (action.payload) {
          state.token = action.payload;
          state.isAuthenticated = true;
          console.log("✅ Stored auth loaded");
        } else {
          console.log("ℹ️ No stored auth found");
        }
      })
      .addCase(loadStoredAuth.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
        console.log("❌ Load stored auth failed:", action.payload);
      })
      .addCase(verifyEmail.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(verifyEmail.fulfilled, (state, action) => {
        state.isLoading = false;
        state.user = action.payload.user || null;
        state.token = action.payload.token || null;
        state.isAuthenticated = true;
        state.error = null;
        console.log("✅ Email verification state updated");

        // Store token for mobile
        if (action.payload.token) {
          const { Platform } = require("react-native");
          if (Platform.OS !== "web") {
            const SecureStore = require("expo-secure-store");
            SecureStore.setItemAsync("auth_token_secure", action.payload.token)
              .then(() => {
                console.log(
                  "✅ Token stored in SecureStore after verification"
                );
              })
              .catch((error: any) => {
                console.error(
                  "❌ Failed to store token in SecureStore:",
                  error
                );
              });
          }
        }
      })
      .addCase(verifyEmail.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
        state.isAuthenticated = false;
        console.log("❌ Email verification failed:", action.payload);
      });
  },
});

export const {
  clearError,
  forceSignOut,
  updateUserSubscription,
  setQuestionnaireCompleted,
  updateSubscription,
  loginSuccess,
  setUser,
  setToken,
} = authSlice.actions;
export default authSlice.reducer;
