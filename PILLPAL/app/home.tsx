import { useState, useEffect, useRef, useCallback } from "react";
import '@tensorflow/tfjs-react-native';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Animated,
  Modal,
  Alert,
  AppState,
  Linking,
  Button, 
  // ActivityIndicator,
  Image
} from "react-native";
import { decodeJpeg } from '@tensorflow/tfjs-react-native';
import * as tf from '@tensorflow/tfjs';
import * as mobilenet from '@tensorflow-models/mobilenet';
// import * as ImagePicker from 'expo-image-picker';
// import { useEffect, useState } from 'react';
// import { readFile } from 'react-native-fs';
// import Papa from 'papaparse';

import { Buffer } from 'buffer';
import axios from "axios";
import { Ionicons } from "@expo/vector-icons";
import { Link, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle } from "react-native-svg";
// import * as mobilenet from '@tensorflow-models/mobilenet'; 
import {
  getMedications,
  Medication,
  getTodaysDoses,
  recordDose,
  DoseHistory,
} from "../utils/storage";
import { useFocusEffect } from "@react-navigation/native";
import * as ImagePicker from 'expo-image-picker';
import {
  registerForPushNotificationsAsync,
  scheduleMedicationReminder,
} from "../utils/notifications";
import { ActivityIndicator } from "react-native";
// const GOOGLE_VISION_API_KEY = "AIzaSyDNF7UcRa76-_NdkICV7eATD7-8KJJjbNk"; // Replace with your actual key
const { width } = Dimensions.get("window");
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const QUICK_ACTIONS = [
  {
    icon: "add-circle-outline" as const,
    label: "Add\nMedication",
    route: "/medications/add" as const,
    color: "#2E7D32",
    gradient: ["#4CAF50", "#2E7D32"] as [string, string],
  },
  {
    icon: "calendar-outline" as const,
    label: "Calendar\nView",
    route: "/calendar" as const,
    color: "#1976D2",
    gradient: ["#2196F3", "#1976D2"] as [string, string],
  },
  {
    icon: "time-outline" as const,
    label: "History\nLog",
    route: "/history" as const,
    color: "#C2185B",
    gradient: ["#E91E63", "#C2185B"] as [string, string],
  },
  {
    icon: "medical-outline" as const,
    label: "Refill\nTracker",
    route: "/refills" as const,
    color: "#E64A19",
    gradient: ["#FF5722", "#E64A19"] as [string, string],
  },
];

interface CircularProgressProps {
  progress: number;
  totalDoses: number;
  completedDoses: number;
}

function CircularProgress({
  progress,
  totalDoses,
  completedDoses,
}: CircularProgressProps) {
  const animatedValue = useRef(new Animated.Value(0)).current;
  const size = width * 0.55;
  const strokeWidth = 15;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  useEffect(() => {
    Animated.timing(animatedValue, {
      toValue: progress,
      duration: 1500,
      useNativeDriver: true,
    }).start();
  }, [progress]);

  const strokeDashoffset = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [circumference, 0],
  });

  return (
    <View style={styles.progressContainer}>
      <View style={styles.progressTextContainer}>
        <Text style={styles.progressPercentage}>
          {Math.round(progress * 100)}%
        </Text>
        <Text style={styles.progressDetails}>
          {completedDoses} of {totalDoses} doses
        </Text>
      </View>
      <Svg width={size} height={size} style={styles.progressRing}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgba(255, 255, 255, 0.2)"
          strokeWidth={strokeWidth}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="white"
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
    </View>
  );
}

const GOOGLE_VISION_API_KEY = "AIzaSyDNF7UcRa76-_NdkICV7eATD7-8KJJjbNk";
const VISION_API_URL = `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_VISION_API_KEY}`;
const FDA_API_URL = "https://api.fda.gov/drug/label.json";

const RXIMAGE_API_URL = "https://rximage.nlm.nih.gov/api/rximage/1/rxnav";
import useMedicineData from '../hooks/useMedicineData';

export default function HomeScreen() {
  const [showScanner, setShowScanner] = useState(false);
  const [scannedPill, setScannedPill] = useState<any>(null);
  const [tfReady, setTfReady] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [pillInfo, setPillInfo] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const router = useRouter();
  const [showNotifications, setShowNotifications] = useState(false);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [todaysMedications, setTodaysMedications] = useState<Medication[]>([]);
  const [completedDoses, setCompletedDoses] = useState(0);
  const [doseHistory, setDoseHistory] = useState<DoseHistory[]>([]);
  const { searchMedicine, loading,error } = useMedicineData();

  const loadMedications = useCallback(async () => {
    try {
      const [allMedications, todaysDoses] = await Promise.all([
        getMedications(),
        getTodaysDoses(),
      ]);
  
      setDoseHistory(todaysDoses);
      setMedications(allMedications);
      const today = new Date();
      const todayMeds = allMedications.filter((med) => {
        const startDate = new Date(med.startDate);
        const durationDays = parseInt(med.duration.split(" ")[0]);
        return durationDays === -1 || 
               (today >= startDate && 
                today <= new Date(startDate.getTime() + durationDays * 24 * 60 * 60 * 1000));
      });
  
      setTodaysMedications(todayMeds);
      setCompletedDoses(todaysDoses.filter((dose) => dose.taken).length);
    } catch (error) {
      console.error("Error loading medications:", error);
    }
  }, [getMedications, getTodaysDoses]); // Add dependencies

  const setupNotifications = async () => {
    try {
      const token = await registerForPushNotificationsAsync();
      if (!token) {
        console.log("Failed to get push notification token");
        return;
      }

      // Schedule reminders for all medications
      const medications = await getMedications();
      for (const medication of medications) {
        if (medication.reminderEnabled) {
          await scheduleMedicationReminder(medication);
        }
      }
    } catch (error) {
      console.error("Error setting up notifications:", error);
    }
  };

  // Use useEffect for initial load
  useEffect(() => {
    loadMedications();
    setupNotifications();

    // Handle app state changes for notifications
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active") {
        loadMedications();
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  // Use useFocusEffect for subsequent updates
  useFocusEffect(
    useCallback(() => {
      const unsubscribe = () => {
        // Cleanup if needed
      };

      loadMedications();
      return () => unsubscribe();
    }, [loadMedications])
  );

  const handleTakeDose = async (medication: Medication) => {
    try {
      await recordDose(medication.id, true, new Date().toISOString());
      await loadMedications(); // Reload data after recording dose
    } catch (error) {
      console.error("Error recording dose:", error);
      Alert.alert("Error", "Failed to record dose. Please try again.");
    }
  };

  const isDoseTaken = (medicationId: string) => {
    return doseHistory.some(
      (dose) => dose.medicationId === medicationId && dose.taken
    );
  };

  const progress =
    todaysMedications.length > 0
      ? completedDoses / (todaysMedications.length * 2)
      : 0;

  // Types
type PillInfo = {
  name: string;
  description?: string;
  dosage?: string;
  manufacturer?: string;
  imprint?: string;
  color?: string;
  shape?: string;
  confidence: number;
  method: string;
  source?: string;
  advice?: string;
  ndc?: string;
};

type VisionResponse = {
  textAnnotations?: Array<{ description: string }>;
  labelAnnotations?: Array<{ description: string; score: number }>;
  localizedObjectAnnotations?: Array<{ name: string }>;
};

// Initialize TensorFlow and request permissions
useEffect(() => {
  const initialize = async () => {
    try {
      // Request camera permissions
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
      
      // Initialize TensorFlow
      await tf.ready();
      setTfReady(true);
      console.log('TensorFlow initialized successfully');
    } catch (error) {
      console.error('Initialization error:', error);
      setTfReady(false);
    }
  };
  
  initialize();
  
  return () => {
    // Cleanup if needed
  };
}, []);

const captureImage = async () => {
  if (!hasPermission) {
    Alert.alert(
      'Permission required', 
      'Camera access is needed to scan pills',
      [{ text: 'OK', onPress: () => Linking.openSettings() }]
    );
    return;
  }

  setIsProcessing(true);
  try {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
      base64: true,
    });

    if (!result.canceled && result.assets?.[0]?.base64) {
      const base64Image = result.assets[0].base64;
      const imageUri = `data:image/jpeg;base64,${base64Image}`;
      setCapturedImage(imageUri);
      
      // Process the image
      await identifyPill(base64Image);
    }
  } catch (error) {
    console.error('Image capture error:', error);
    Alert.alert(
      'Error', 
      'Failed to capture image. Please try again in good lighting.',
      [{ text: 'OK' }]
    );
  } finally {
    setIsProcessing(false);
  }
};

const identifyPill = async (base64Image: string) => {
  try {
    // 1. Analyze image with Google Vision
    const visionResponse = await analyzeWithGoogleVision(base64Image);
    if (!visionResponse) throw new Error('Image analysis failed');

    // 2. Extract pill characteristics
    const { color, shape, markings } = extractPillCharacteristics(visionResponse);
    console.log('Extracted characteristics:', { color, shape, markings });
    // const testResult = searchMedicine("LL"); // Example imprint
    // console.log("Manual test search:", testResult);

    // 3. Search in local database first
    if (markings) {
      const pill = searchMedicine(markings);
      if (pill) {
        setPillInfo({
          name: pill.medicine_name,
          description: `Imprint: ${pill.splimprint}\nDosage Form: ${pill.dosage_form}\n\nActive Ingredients:\n${pill.spl_ingredients}`,
          method: 'Local Database',
          advice: 'Verify with medication packaging',
        });
      } else {
        setPillInfo({
          name: 'Unknown Medication',
          description: `No local match found for imprint: ${markings}`,
          confidence: 40,
          method: 'Local Database',
          advice: 'Double-check imprint and try again',
        });
      }
    }
  } catch (error) {
    console.error('Pill identification error:', error);
    setPillInfo({
      name: 'Identification Error',
      description: error instanceof Error ? error.message : 'Failed to process medication',
      confidence: 0,
      method: 'System Error',
      advice: 'Try again with better lighting or enter details manually'
    });
  }
};


// Helper to extract dosage from complex SPL data
const extractDosageFromLabel = (label: any): string => {
  if (label?.openfda?.product_ndc) {
    return label.openfda.dosage_form?.join(", ") || "Unknown dosage";
  }
  return "Unknown dosage";
};

const analyzeWithGoogleVision = async (base64Image: string, retries = 2): Promise<VisionResponse | null> => {
  try {
    const requestData = {
      requests: [{
        image: { content: base64Image },
        features: [
          { type: 'TEXT_DETECTION', maxResults: 5 },
          { type: 'LABEL_DETECTION', maxResults: 10 },
          { type: 'OBJECT_LOCALIZATION', maxResults: 3 }
        ]
      }]
    };

    const response = await axios.post(VISION_API_URL, requestData, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 8000,  // Reduced from 10s to 8s
      timeoutErrorMessage: 'Vision API request timed out'
    });

    return response.data?.responses?.[0] ?? null;
  } catch (error) {
    if (retries > 0 && axios.isAxiosError(error) && !error.response) {
      console.warn(`Vision API timeout, ${retries} retries remaining...`);
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s before retry
      return analyzeWithGoogleVision(base64Image, retries - 1);
    }
    
    console.error('Vision API final error:', error);
    return null;
  }
};
const extractPillCharacteristics = (visionResponse: VisionResponse) => {
  // Define possible colors and shapes
  const colors = ['white', 'blue', 'red', 'yellow', 'green', 'pink', 'orange', 'brown', 'black', 'gray'];
  const shapes = ['round', 'oval', 'capsule', 'tablet', 'pill', 'circle', 'rectangle', 'square'];

  // Initialize defaults
  let color = 'unknown';
  let shape = 'unknown';
  let markings = '';

  // Extract color from label annotations
  if (visionResponse.labelAnnotations) {
    for (const label of visionResponse.labelAnnotations) {
      const lowerDesc = label.description.toLowerCase();
      const foundColor = colors.find(c => lowerDesc.includes(c));
      if (foundColor) {
        color = foundColor;
        break;
      }
    }
  }

  // Extract shape from object annotations
  if (visionResponse.localizedObjectAnnotations) {
    for (const obj of visionResponse.localizedObjectAnnotations) {
      const lowerName = obj.name.toLowerCase();
      const foundShape = shapes.find(s => lowerName.includes(s));
      if (foundShape) {
        shape = foundShape;
        break;
      }
    }
  }

  // Extract markings from text annotations
  if (visionResponse.textAnnotations && visionResponse.textAnnotations.length > 0) {
    // Find the most likely imprint (shortest text that looks like an imprint)
    const potentialMarkings = visionResponse.textAnnotations
      .filter(ta => ta.description.length <= 10 && /[A-Za-z0-9]/.test(ta.description))
      .sort((a, b) => a.description.length - b.description.length);
    
    if (potentialMarkings.length > 0) {
      markings = potentialMarkings[0].description.replace(/\s+/g, '').toUpperCase();
    }
  }

  return { color, shape, markings };
};

const searchFdaDatabase = async (
  imprint?: string,
  color?: string,
  shape?: string
): Promise<PillInfo | null> => {
  try {
    // Validate we have at least one searchable characteristic
    if (!imprint && (!color || color === 'unknown') && (!shape || shape === 'unknown')) {
      console.log('Insufficient data for FDA search');
      return null;
    }

    // Build search query parts with proper encoding
    const searchParts: string[] = [];
    if (imprint) searchParts.push(`imprint:"${encodeURIComponent(imprint)}"`);
    if (color && color !== 'unknown') searchParts.push(`color:"${encodeURIComponent(color)}"`);
    if (shape && shape !== 'unknown') searchParts.push(`shape:"${encodeURIComponent(shape)}"`);

    // If no valid search criteria after filtering
    if (searchParts.length === 0) return null;

    const searchQuery = searchParts.join('+AND+');
    const url = `${FDA_API_URL}?search=${searchQuery}&limit=1`;

    console.log('FDA API query:', url);

    const response = await axios.get(url, {
      timeout: 5000,
      headers: {
        'Accept': 'application/json'
      }
    });

    if (response.data?.results?.length > 0) {
      const product = response.data.results[0];
      return {
        name: product.brand_name || product.generic_name || 'Unknown Medication',
        description: product.description || 'No description available',
        dosage: product.dosage_form || 'Unknown dosage',
        manufacturer: product.labeler_name || 'Unknown manufacturer',
        imprint: imprint || '',
        color: color || 'unknown',
        shape: shape || 'unknown',
        confidence: 85, // Reduced from 90 to be more conservative
        method: 'FDA Database',
        source: 'U.S. Food and Drug Administration',
        // Add additional FDA-specific fields if available
        ...(product.product_ndc && { ndc: product.product_ndc }),
        ...(product.route && { administrationRoute: product.route.join(', ') })
      };
    }

    console.log('No results found in FDA database');
    return null;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('FDA API error details:', {
        status: error.response?.status,
        url: error.config?.url,
        message: error.message
      });
      
      // Handle specific error cases
      if (error.response?.status === 404) {
        console.log('No matching medications found');
      } else if (error.response?.status === 429) {
        console.warn('FDA API rate limit exceeded');
      }
    } else {
      console.error('Non-Axios error:', error);
    }
    return null;
  }
};

const resetScanner = () => {
  setCapturedImage(null);
  setPillInfo(null);
};
  
  

  // Render UI
  if (hasPermission === null) {
    return (
      <Modal visible={showScanner} animationType="slide">
        <View style={styles.centerContainer}>
          <Text>Requesting permissions...</Text>
        </View>
      </Modal>
    );
  }

  if (hasPermission === false) {
    return (
      <Modal visible={showScanner} animationType="slide">
        <View style={styles.centerContainer}>
          <Text>Camera access is required for pill identification</Text>
          <Button 
            title="Open Settings" 
            onPress={() => Linking.openSettings()} 
          />
        </View>
      </Modal>
    );
  }
  

  

  return (
    <ScrollView 
      style={styles.container} 
      contentContainerStyle={{ alignItems: "center", justifyContent: "center" }} 
      showsVerticalScrollIndicator={false}
    >
      <LinearGradient colors={["#1a8e2d", "#146922"]} style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.flex1}>
            <Text style={styles.greeting}>Daily Progress</Text>
          </View>
          <View style={styles.headerIconsContainer}>
            <TouchableOpacity 
              style={styles.scannerButton}
              onPress={() => setShowScanner(true)}
            >
              <Ionicons name="scan-outline" size={24} color="white" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.notificationButton}
              onPress={() => setShowNotifications(true)}
            >
              <Ionicons name="notifications-outline" size={24} color="white" />
              {todaysMedications.length > 0 && (
                <View style={styles.notificationBadge}>
                  <Text style={styles.notificationCount}>
                    {todaysMedications.length}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.headerContent}>
          <CircularProgress
            progress={progress}
            totalDoses={todaysMedications.length * 2}
            completedDoses={completedDoses}
          />
        </View>
      </LinearGradient>

      <View style={styles.content}>
        <View style={styles.quickActionsContainer}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.quickActionsGrid}>
            {QUICK_ACTIONS.map((action) => (
              <Link href={action.route} key={action.label} asChild>
                <TouchableOpacity style={styles.actionButton}>
                  <LinearGradient
                    colors={action.gradient}
                    style={styles.actionGradient}
                  >
                    <View style={styles.actionContent}>
                      <View style={styles.actionIcon}>
                        <Ionicons name={action.icon} size={28} color="white" />
                      </View>
                      <Text style={styles.actionLabel}>{action.label}</Text>
                    </View>
                  </LinearGradient>
                </TouchableOpacity>
              </Link>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Today's Schedule</Text>
            <Link href="/calendar" asChild>
              <TouchableOpacity>
                <Text style={styles.seeAllButton}>See All</Text>
              </TouchableOpacity>
            </Link>
          </View>
          {todaysMedications.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="medical-outline" size={48} color="#ccc" />
              <Text style={styles.emptyStateText}>
                No medications scheduled for today
              </Text>
              <Link href="/medications/add" asChild>
                <TouchableOpacity style={styles.addMedicationButton}>
                  <Text style={styles.addMedicationButtonText}>
                    Add Medication
                  </Text>
                </TouchableOpacity>
              </Link>
            </View>
          ) : (
            todaysMedications.map((medication) => {
              const taken = isDoseTaken(medication.id);
              return (
                <View key={medication.id} style={styles.doseCard}>
                  <View
                    style={[
                      styles.doseBadge,
                      { backgroundColor: `${medication.color}15` },
                    ]}
                  >
                    <Ionicons
                      name="medical"
                      size={24}
                      color={medication.color}
                    />
                  </View>
                  <View style={styles.doseInfo}>
                    <View>
                      <Text style={styles.medicineName}>{medication.name}</Text>
                      <Text style={styles.dosageInfo}>{medication.dosage}</Text>
                    </View>
                    <View style={styles.doseTime}>
                      <Ionicons name="time-outline" size={16} color="#666" />
                      <Text style={styles.timeText}>{medication.times[0]}</Text>
                    </View>
                  </View>
                  {taken ? (
                    <View style={[styles.takenBadge]}>
                      <Ionicons
                        name="checkmark-circle"
                        size={20}
                        color="#4CAF50"
                      />
                      <Text style={styles.takenText}>Taken</Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={[
                        styles.takeDoseButton,
                        { backgroundColor: medication.color },
                      ]}
                      onPress={() => handleTakeDose(medication)}
                    >
                      <Text style={styles.takeDoseText}>Take</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })
          )}
        </View>
      </View>

      {/* Notifications Modal */}
      <Modal
        visible={showNotifications}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowNotifications(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Notifications</Text>
              <TouchableOpacity
                onPress={() => setShowNotifications(false)}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            {todaysMedications.map((medication) => (
              <View key={medication.id} style={styles.notificationItem}>
                <View style={styles.notificationIcon}>
                  <Ionicons name="medical" size={24} color={medication.color} />
                </View>
                <View style={styles.notificationContent}>
                  <Text style={styles.notificationTitle}>
                    {medication.name}
                  </Text>
                  <Text style={styles.notificationMessage}>
                    {medication.dosage}
                  </Text>
                  <Text style={styles.notificationTime}>
                    {medication.times[0]}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      </Modal>

      <Modal 
  visible={showScanner} 
  animationType="slide" 
  transparent={true}
  onRequestClose={() => setShowScanner(false)} // Added for Android back button support
>
  <View style={styles.scannerContainer}>
    {/* Close Button - Always visible */}
    <TouchableOpacity 
      style={styles.closeButton}
      onPress={() => {
        setShowScanner(false);
        setPillInfo(null); // Reset pill info when closing
        setCapturedImage(null); // Reset captured image
      }}
      activeOpacity={0.7}
    >
      <Ionicons name="close" size={30} color="white" />
    </TouchableOpacity>

    {/* Content Area */}
    {isProcessing ? (
      // Processing State
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#0000ff" />
        <Text style={styles.processingText}>Analyzing medication...</Text>
      </View>
    ) : pillInfo ? (
      // Results State
      <View style={styles.resultContainer}>
        {capturedImage && (
          <Image 
            source={{ uri: capturedImage }} 
            style={styles.pillImage}
            resizeMode="contain"
          />
        )}
        
        <Text style={styles.pillName}>{pillInfo.name}</Text>
        <Text style={styles.pillDescription}>{pillInfo.description}</Text>
        
        <View style={styles.pillDetails}>
          {pillInfo.dosage && <Text style={styles.detailText}>Dosage: {pillInfo.dosage}</Text>}
          {pillInfo.manufacturer && <Text style={styles.detailText}>Manufacturer: {pillInfo.manufacturer}</Text>}
          {pillInfo.markings && <Text style={styles.detailText}>Markings: {pillInfo.markings}</Text>}
          <Text style={styles.confidenceText}>Confidence: {pillInfo.confidence}%</Text>
        </View>
        
        {/* Action Buttons */}
        <View style={styles.buttonRow}>
          <TouchableOpacity 
            style={[styles.actionButton, styles.scanAgainButton]}
            onPress={() => {
              setPillInfo(null);
              setCapturedImage(null);
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.buttonText}>Scan Again</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.actionButton, styles.doneButton]}
            onPress={() => {
              setShowScanner(false);
              // Consider saving the scanned info if needed
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.buttonText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    ) : (
      // Camera/Scanning State
      <View style={styles.cameraContainer}>
        <View style={styles.cameraPlaceholder}>
          <Ionicons name="camera" size={48} color="#ccc" />
          <Text style={styles.cameraText}>Camera will open when scanning</Text>
        </View>
        
        <TouchableOpacity 
          style={styles.captureButton}
          onPress={captureImage}
          disabled={isProcessing}
          activeOpacity={0.7}
        >
          {isProcessing ? (
            <ActivityIndicator color="white" />
          ) : (
            <>
              <Ionicons name="camera" size={32} color="white" />
              <Text style={styles.captureButtonText}>Scan Medication</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    )}
  </View>
</Modal>



    </ScrollView>
  );
}
    

const styles = StyleSheet.create({
  scanAgainButton: {
    backgroundColor: '#f0f0f0',
    height: 36,            // Fixed height
    minWidth: 100,         // Minimum width
    paddingHorizontal: 12, // Adjust if needed
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  
  doneButton: {
    backgroundColor: '#4CAF50',
    height: 36,            // Fixed height (same as Scan Again)
    minWidth: 70,         // Minimum width
    paddingHorizontal: 12,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#333',
    textAlign: 'center',
    fontWeight: 'bold',
  },
  doneButtonText: {
    color: 'white',
    textAlign: 'center',
    fontWeight: 'bold',
  },
  processingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#333',
  },
  pillDetails: {
    marginVertical: 15,
  },
  detailText: {
    fontSize: 14,
    marginBottom: 5,
  },
  confidenceText: {
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 10,
    color: '#4CAF50',
  },
  // scanAgainButton: {
  //   backgroundColor: '#f0f0f0',
  // },
  // doneButton: {
  //   backgroundColor: '#4CAF50',
  // },
  // buttonText: {
  //   color: '#333',
  // },
  container: {
    flex: 1,
    // padding: 20
  },

  contentContainer: {
    flexGrow: 1, 
    justifyContent: "center", 
    alignItems: "center"
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center"
  },
  resultContainer: {
    marginTop: 20,
    padding: 15,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 5
  },
  pillName: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10
  },
  advice: {
    color: 'red',
    marginTop: 10,
    fontStyle: 'italic'
  },
  scannerContainer: {
    flex: 1,
    backgroundColor: '#1a8e2d',
    padding: 20,
  },
  cameraContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraPlaceholder: {
    width: 250,
    height: 250,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 30,
  },
  cameraText: {
    color: 'white',
    textAlign: 'center',
  },
  pillImage: {
    width: 200,
    height: 200,
    borderRadius: 10,
    marginBottom: 20,
  },
  pillDescription: {
    fontSize: 16,
    marginBottom: 15,
    textAlign: 'center',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 20,
    marginTop: 30,
  },
  captureButton: {
    padding: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 10,
    alignItems: 'center',
  },
  captureButtonText: {
    color: 'white',
    marginTop: 10,
  },
  closeButton: {
    position: 'absolute',
    top: 40,
    right: 20,
    zIndex: 1,
    padding: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
  },
  processingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pillImagePreview: {
    width: 150,
    height: 150,
    borderRadius: 10,
    marginBottom: 20,
  },
  scannerSubtitle: {
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 30,
    fontSize: 16,
  },
  headerIconsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  scannerButton: {
    padding: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  closeScannerButton: {
    position: 'absolute',
    top: 40,
    right: 20,
    zIndex: 1,
  },
  scannerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 30,
  },
  scannerTitle: {
    fontSize: 24,
    color: 'white',
    fontWeight: 'bold',
  },
  scanButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scannerHint: {
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  pillInfoContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  pillInfoTitle: {
    fontSize: 22,
    color: 'white',
    fontWeight: 'bold',
    marginBottom: 20,
  },
  pillConfidence: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 30,
  },
  scanAgainText: {
    color: '#1a8e2d',
    fontWeight: 'bold',
    fontSize: 16,
  },
  header: {
    paddingTop: 50,
    paddingBottom: 25,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },
  headerContent: {
    alignItems: "center",
    paddingHorizontal: 20,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    marginBottom: 20,
  },
  greeting: {
    fontSize: 18,
    fontWeight: "600",
    color: "white",
    opacity: 0.9,
  },
  content: {
    flex: 1,
    paddingTop: 20,
  },
  quickActionsContainer: {
    paddingHorizontal: 20,
    marginBottom: 25,
  },
  quickActionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 15,
  },
  actionButton: {
    width: (width - 52) / 2,
    height: 110,
    borderRadius: 16,
    overflow: "hidden",
  },
  actionGradient: {
    flex: 1,
    padding: 15,
  },
  actionContent: {
    flex: 1,
    justifyContent: "space-between",
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  actionLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "white",
    marginTop: 8,
  },
  section: {
    paddingHorizontal: 20,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1a1a1a",
    marginBottom: 5,
  },
  seeAllButton: {
    color: "#2E7D32",
    fontWeight: "600",
  },
  doseCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "white",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  doseBadge: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 15,
  },
  doseInfo: {
    flex: 1,
    justifyContent: "space-between",
  },
  medicineName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
  },
  dosageInfo: {
    fontSize: 14,
    color: "#666",
    marginBottom: 4,
  },
  doseTime: {
    flexDirection: "row",
    alignItems: "center",
  },
  timeText: {
    marginLeft: 5,
    color: "#666",
    fontSize: 14,
  },
  takeDoseButton: {
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 15,
    marginLeft: 10,
  },
  takeDoseText: {
    color: "white",
    fontWeight: "600",
    fontSize: 14,
  },
  progressContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 10,
  },
  progressTextContainer: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  progressPercentage: {
    fontSize: 36,
    fontWeight: "bold",
    color: "white",
  },
  progressLabel: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.9)",
    marginTop: 4,
  },
  progressRing: {
    transform: [{ rotate: "-90deg" }],
  },
  flex1: {
    flex: 1,
  },
  notificationButton: {
    position: "relative",
    padding: 8,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    borderRadius: 12,
    marginLeft: 8,
  },
  notificationBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: "#FF5252",
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#146922",
    paddingHorizontal: 4,
  },
  notificationCount: {
    color: "white",
    fontSize: 11,
    fontWeight: "bold",
  },
  progressDetails: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.8)",
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "white",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: "80%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
  },
  // closeButton: {x
  notificationItem: {
    flexDirection: "row",
    padding: 15,
    borderRadius: 12,
    backgroundColor: "#f5f5f5",
    marginBottom: 10,
  },
  notificationIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#E8F5E9",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 15,
  },
  notificationContent: {
    flex: 1,
  },
  notificationTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
  },
  notificationMessage: {
    fontSize: 14,
    color: "#666",
    marginBottom: 4,
  },
  notificationTime: {
    fontSize: 12,
    color: "#999",
  },
  emptyState: {
    alignItems: "center",
    padding: 30,
    backgroundColor: "white",
    borderRadius: 16,
    marginTop: 10,
  },
  emptyStateText: {
    fontSize: 16,
    color: "#666",
    marginTop: 10,
    marginBottom: 20,
  },
  addMedicationButton: {
    backgroundColor: "#1a8e2d",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  addMedicationButtonText: {
    color: "white",
    fontWeight: "600",
  },
  takenBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E8F5E9",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginLeft: 10,
  },
  takenText: {
    color: "#4CAF50",
    fontWeight: "600",
    fontSize: 14,
    marginLeft: 4,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 20,
    marginTop: 20,
  },
  
});