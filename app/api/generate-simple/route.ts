import { NextResponse } from 'next/server';
import Groq from 'groq-sdk';

// SIMPLE RELIABLE GENERATION
// Uses templates for common objects, AI fills in details

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// PRE-BUILT TEMPLATES for common objects (guaranteed to work)
const TEMPLATES: Record<string, any> = {
  'teddy bear': {
    name: "Teddy Bear",
    description: "A cute stuffed teddy bear",
    parameters: [
      { name: "Arm_Angle", type: "number", default: 30, min: 0, max: 90, unit: "°" },
      { name: "Head_Tilt", type: "number", default: 0, min: -20, max: 20, unit: "°" }
    ],
    materials: {
      fur: { color: "#8B5A2B", roughness: 0.9, metalness: 0 },
      dark: { color: "#1a1a1a", roughness: 0.3, metalness: 0.1 },
      pink: { color: "#FFB6C1", roughness: 0.7, metalness: 0 }
    },
    parts: [
      { id: "body", type: "sphere", args: [0.45, 32, 32], position: [0, 0.5, 0], material: "fur" },
      { id: "head", type: "sphere", args: [0.35, 32, 32], position: [0, 1.1, 0], material: "fur" },
      { id: "snout", type: "sphere", args: [0.12, 24, 24], position: [0, 1.0, 0.28], material: "fur" },
      { id: "nose", type: "sphere", args: [0.05, 16, 16], position: [0, 1.02, 0.38], material: "dark" },
      { id: "eye_left", type: "sphere", args: [0.05, 16, 16], position: [-0.12, 1.18, 0.25], material: "dark" },
      { id: "eye_right", type: "sphere", args: [0.05, 16, 16], position: [0.12, 1.18, 0.25], material: "dark" },
      { id: "ear_left", type: "sphere", args: [0.12, 24, 24], position: [-0.25, 1.4, 0], material: "fur" },
      { id: "ear_right", type: "sphere", args: [0.12, 24, 24], position: [0.25, 1.4, 0], material: "fur" },
      { id: "ear_inner_left", type: "sphere", args: [0.06, 16, 16], position: [-0.25, 1.4, 0.05], material: "pink" },
      { id: "ear_inner_right", type: "sphere", args: [0.06, 16, 16], position: [0.25, 1.4, 0.05], material: "pink" },
      { id: "arm_left", type: "capsule", args: [0.1, 0.25, 8, 16], position: [-0.45, 0.6, 0.1], rotation: [0, 0, 0.8], material: "fur" },
      { id: "arm_right", type: "capsule", args: [0.1, 0.25, 8, 16], position: [0.45, 0.6, 0.1], rotation: [0, 0, -0.8], material: "fur" },
      { id: "leg_left", type: "capsule", args: [0.12, 0.2, 8, 16], position: [-0.2, 0.15, 0.1], material: "fur" },
      { id: "leg_right", type: "capsule", args: [0.12, 0.2, 8, 16], position: [0.2, 0.15, 0.1], material: "fur" },
      { id: "belly", type: "sphere", args: [0.25, 24, 24], position: [0, 0.5, 0.25], material: "pink" }
    ],
    hud: { title: "Teddy Bear", displays: [{ label: "Arm Angle", parameter: "Arm_Angle", unit: "°" }] }
  },
  
  'sports car': {
    name: "Sports Car",
    description: "A sleek sports car",
    parameters: [
      { name: "Wheel_Spin", type: "number", default: 0, min: 0, max: 100, unit: "%" },
      { name: "Steering", type: "number", default: 0, min: -35, max: 35, unit: "°" }
    ],
    materials: {
      body: { color: "#DC2626", roughness: 0.2, metalness: 0.8 },
      glass: { color: "#87CEEB", roughness: 0.1, metalness: 0.2 },
      tire: { color: "#1a1a1a", roughness: 0.9, metalness: 0 },
      chrome: { color: "#C0C0C0", roughness: 0.1, metalness: 0.9 }
    },
    parts: [
      { id: "body", type: "roundedBox", args: [1.4, 0.35, 3.2, 0.1], position: [0, 0.4, 0], material: "body" },
      { id: "cabin", type: "roundedBox", args: [1.2, 0.35, 1.4, 0.08], position: [0, 0.7, -0.2], material: "body" },
      { id: "hood", type: "roundedBox", args: [1.3, 0.15, 0.9, 0.05], position: [0, 0.5, 1.2], material: "body" },
      { id: "trunk", type: "roundedBox", args: [1.2, 0.2, 0.6, 0.05], position: [0, 0.45, -1.4], material: "body" },
      { id: "windshield", type: "box", args: [1.1, 0.35, 0.08], position: [0, 0.75, 0.5], rotation: [-0.5, 0, 0], material: "glass" },
      { id: "rear_window", type: "box", args: [1.0, 0.3, 0.08], position: [0, 0.7, -0.8], rotation: [0.4, 0, 0], material: "glass" },
      { id: "wheel_fl", type: "cylinder", args: [0.22, 0.22, 0.15, 24], position: [-0.65, 0.22, 1.0], rotation: [0, 0, 1.5708], material: "tire" },
      { id: "wheel_fr", type: "cylinder", args: [0.22, 0.22, 0.15, 24], position: [0.65, 0.22, 1.0], rotation: [0, 0, 1.5708], material: "tire" },
      { id: "wheel_rl", type: "cylinder", args: [0.22, 0.22, 0.15, 24], position: [-0.65, 0.22, -1.0], rotation: [0, 0, 1.5708], material: "tire" },
      { id: "wheel_rr", type: "cylinder", args: [0.22, 0.22, 0.15, 24], position: [0.65, 0.22, -1.0], rotation: [0, 0, 1.5708], material: "tire" },
      { id: "rim_fl", type: "cylinder", args: [0.12, 0.12, 0.16, 16], position: [-0.65, 0.22, 1.0], rotation: [0, 0, 1.5708], material: "chrome" },
      { id: "rim_fr", type: "cylinder", args: [0.12, 0.12, 0.16, 16], position: [0.65, 0.22, 1.0], rotation: [0, 0, 1.5708], material: "chrome" },
      { id: "rim_rl", type: "cylinder", args: [0.12, 0.12, 0.16, 16], position: [-0.65, 0.22, -1.0], rotation: [0, 0, 1.5708], material: "chrome" },
      { id: "rim_rr", type: "cylinder", args: [0.12, 0.12, 0.16, 16], position: [0.65, 0.22, -1.0], rotation: [0, 0, 1.5708], material: "chrome" },
      { id: "headlight_l", type: "sphere", args: [0.08, 16, 16], position: [-0.5, 0.45, 1.55], material: "chrome" },
      { id: "headlight_r", type: "sphere", args: [0.08, 16, 16], position: [0.5, 0.45, 1.55], material: "chrome" }
    ],
    hud: { title: "Sports Car", displays: [{ label: "Speed", parameter: "Wheel_Spin", unit: "%" }] }
  },

  'helicopter': {
    name: "Helicopter",
    description: "A helicopter with spinning rotors",
    parameters: [
      { name: "Rotor_Speed", type: "number", default: 50, min: 0, max: 100, unit: "%" },
      { name: "Pitch", type: "number", default: 0, min: -15, max: 15, unit: "°" }
    ],
    materials: {
      body: { color: "#2563EB", roughness: 0.3, metalness: 0.6 },
      glass: { color: "#87CEEB", roughness: 0.1, metalness: 0.1 },
      metal: { color: "#6B7280", roughness: 0.4, metalness: 0.7 }
    },
    parts: [
      { id: "body", type: "capsule", args: [0.4, 1.0, 16, 32], position: [0, 0.6, 0], rotation: [0, 0, 1.5708], material: "body" },
      { id: "cockpit", type: "sphere", args: [0.38, 32, 24], position: [0.5, 0.65, 0], material: "glass" },
      { id: "tail_boom", type: "cylinder", args: [0.08, 0.05, 1.2, 16], position: [-0.9, 0.6, 0], rotation: [0, 0, 1.5708], material: "body" },
      { id: "tail_fin", type: "box", args: [0.3, 0.25, 0.03], position: [-1.5, 0.7, 0], material: "body" },
      { id: "main_rotor_hub", type: "cylinder", args: [0.1, 0.1, 0.08, 16], position: [0, 1.05, 0], material: "metal" },
      { id: "main_rotor_1", type: "box", args: [0.08, 0.02, 1.8], position: [0, 1.1, 0], rotation: [0, 0, 0], material: "metal", animation: { type: "rotate", axis: "y", speed: 5 } },
      { id: "main_rotor_2", type: "box", args: [0.08, 0.02, 1.8], position: [0, 1.1, 0], rotation: [0, 1.5708, 0], material: "metal", animation: { type: "rotate", axis: "y", speed: 5 } },
      { id: "tail_rotor", type: "box", args: [0.03, 0.4, 0.02], position: [-1.5, 0.6, 0.12], material: "metal", animation: { type: "rotate", axis: "z", speed: 8 } },
      { id: "skid_left", type: "cylinder", args: [0.025, 0.025, 1.0, 8], position: [-0.3, 0.1, 0], rotation: [0, 0, 1.5708], material: "metal" },
      { id: "skid_right", type: "cylinder", args: [0.025, 0.025, 1.0, 8], position: [0.3, 0.1, 0], rotation: [0, 0, 1.5708], material: "metal" },
      { id: "skid_strut_fl", type: "cylinder", args: [0.02, 0.02, 0.3, 8], position: [-0.3, 0.25, 0.35], material: "metal" },
      { id: "skid_strut_fr", type: "cylinder", args: [0.02, 0.02, 0.3, 8], position: [0.3, 0.25, 0.35], material: "metal" },
      { id: "skid_strut_rl", type: "cylinder", args: [0.02, 0.02, 0.3, 8], position: [-0.3, 0.25, -0.35], material: "metal" },
      { id: "skid_strut_rr", type: "cylinder", args: [0.02, 0.02, 0.3, 8], position: [0.3, 0.25, -0.35], material: "metal" }
    ],
    hud: { title: "Helicopter", displays: [{ label: "Rotor", parameter: "Rotor_Speed", unit: "%" }] }
  },

  'airplane': {
    name: "Airplane",
    description: "A passenger airplane",
    parameters: [
      { name: "Pitch", type: "number", default: 0, min: -15, max: 15, unit: "°" },
      { name: "Roll", type: "number", default: 0, min: -30, max: 30, unit: "°" }
    ],
    materials: {
      body: { color: "#F3F4F6", roughness: 0.3, metalness: 0.7 },
      wing: { color: "#D1D5DB", roughness: 0.4, metalness: 0.6 },
      window: { color: "#1E3A8A", roughness: 0.1, metalness: 0.2 },
      engine: { color: "#6B7280", roughness: 0.5, metalness: 0.8 }
    },
    parts: [
      { id: "fuselage", type: "capsule", args: [0.25, 2.0, 16, 32], position: [0, 0.5, 0], rotation: [0, 0, 1.5708], material: "body" },
      { id: "nose", type: "sphere", args: [0.25, 32, 24], position: [1.2, 0.5, 0], material: "body" },
      { id: "cockpit", type: "sphere", args: [0.2, 24, 16], position: [1.0, 0.6, 0], material: "window" },
      { id: "wing_left", type: "roundedBox", args: [0.8, 0.05, 0.35, 0.02], position: [-0.15, 0.45, -0.6], rotation: [0, 0, 0.05], material: "wing" },
      { id: "wing_right", type: "roundedBox", args: [0.8, 0.05, 0.35, 0.02], position: [-0.15, 0.45, 0.6], rotation: [0, 0, -0.05], material: "wing" },
      { id: "tail_fin", type: "roundedBox", args: [0.25, 0.4, 0.04, 0.02], position: [-1.0, 0.8, 0], material: "wing" },
      { id: "tail_left", type: "roundedBox", args: [0.2, 0.04, 0.2, 0.02], position: [-1.0, 0.55, -0.15], material: "wing" },
      { id: "tail_right", type: "roundedBox", args: [0.2, 0.04, 0.2, 0.02], position: [-1.0, 0.55, 0.15], material: "wing" },
      { id: "engine_left", type: "cylinder", args: [0.08, 0.08, 0.25, 16], position: [-0.1, 0.35, -0.45], rotation: [0, 0, 1.5708], material: "engine" },
      { id: "engine_right", type: "cylinder", args: [0.08, 0.08, 0.25, 16], position: [-0.1, 0.35, 0.45], rotation: [0, 0, 1.5708], material: "engine" },
      { id: "window1", type: "sphere", args: [0.03, 8, 8], position: [0.6, 0.6, 0.22], material: "window" },
      { id: "window2", type: "sphere", args: [0.03, 8, 8], position: [0.4, 0.6, 0.22], material: "window" },
      { id: "window3", type: "sphere", args: [0.03, 8, 8], position: [0.2, 0.6, 0.22], material: "window" },
      { id: "window4", type: "sphere", args: [0.03, 8, 8], position: [0.0, 0.6, 0.22], material: "window" },
      { id: "window5", type: "sphere", args: [0.03, 8, 8], position: [0.6, 0.6, -0.22], material: "window" },
      { id: "window6", type: "sphere", args: [0.03, 8, 8], position: [0.4, 0.6, -0.22], material: "window" }
    ],
    hud: { title: "Airplane", displays: [{ label: "Pitch", parameter: "Pitch", unit: "°" }] }
  },

  'house': {
    name: "House",
    description: "A simple house",
    parameters: [
      { name: "Door_Open", type: "number", default: 0, min: 0, max: 90, unit: "°" }
    ],
    materials: {
      wall: { color: "#FEF3C7", roughness: 0.8, metalness: 0 },
      roof: { color: "#991B1B", roughness: 0.7, metalness: 0.1 },
      door: { color: "#78350F", roughness: 0.6, metalness: 0.1 },
      window: { color: "#BFDBFE", roughness: 0.1, metalness: 0.1 },
      chimney: { color: "#7C2D12", roughness: 0.8, metalness: 0 }
    },
    parts: [
      { id: "walls", type: "roundedBox", args: [1.2, 0.8, 1.0, 0.02], position: [0, 0.4, 0], material: "wall" },
      { id: "roof", type: "cone", args: [0.9, 0.5, 4], position: [0, 1.05, 0], rotation: [0, 0.785, 0], material: "roof" },
      { id: "door", type: "roundedBox", args: [0.25, 0.45, 0.05, 0.02], position: [0, 0.25, 0.5], material: "door" },
      { id: "doorknob", type: "sphere", args: [0.02, 8, 8], position: [0.08, 0.25, 0.53], material: "door" },
      { id: "window_front_l", type: "roundedBox", args: [0.2, 0.2, 0.03, 0.01], position: [-0.35, 0.5, 0.5], material: "window" },
      { id: "window_front_r", type: "roundedBox", args: [0.2, 0.2, 0.03, 0.01], position: [0.35, 0.5, 0.5], material: "window" },
      { id: "window_left", type: "roundedBox", args: [0.03, 0.2, 0.2, 0.01], position: [-0.6, 0.5, 0], material: "window" },
      { id: "window_right", type: "roundedBox", args: [0.03, 0.2, 0.2, 0.01], position: [0.6, 0.5, 0], material: "window" },
      { id: "chimney", type: "roundedBox", args: [0.15, 0.35, 0.15, 0.02], position: [0.3, 1.1, -0.2], material: "chimney" }
    ],
    hud: { title: "House", displays: [{ label: "Door", parameter: "Door_Open", unit: "°" }] }
  },

  'tree': {
    name: "Tree",
    description: "A tree with leaves",
    parameters: [
      { name: "Wind", type: "number", default: 0, min: 0, max: 100, unit: "%" }
    ],
    materials: {
      trunk: { color: "#78350F", roughness: 0.9, metalness: 0 },
      leaves: { color: "#166534", roughness: 0.8, metalness: 0 }
    },
    parts: [
      { id: "trunk", type: "cylinder", args: [0.1, 0.15, 0.8, 12], position: [0, 0.4, 0], material: "trunk" },
      { id: "leaves1", type: "sphere", args: [0.5, 16, 16], position: [0, 1.1, 0], material: "leaves" },
      { id: "leaves2", type: "sphere", args: [0.35, 16, 16], position: [0.25, 1.3, 0.1], material: "leaves" },
      { id: "leaves3", type: "sphere", args: [0.35, 16, 16], position: [-0.2, 1.25, -0.15], material: "leaves" },
      { id: "leaves4", type: "sphere", args: [0.25, 12, 12], position: [0, 1.5, 0], material: "leaves" }
    ],
    hud: { title: "Tree", displays: [] }
  },

  'dog': {
    name: "Dog",
    description: "A cute dog",
    parameters: [
      { name: "Tail_Wag", type: "number", default: 50, min: 0, max: 100, unit: "%" }
    ],
    materials: {
      fur: { color: "#D97706", roughness: 0.9, metalness: 0 },
      dark: { color: "#1C1917", roughness: 0.4, metalness: 0.1 },
      tongue: { color: "#EC4899", roughness: 0.6, metalness: 0 }
    },
    parts: [
      { id: "body", type: "capsule", args: [0.25, 0.5, 16, 24], position: [0, 0.4, 0], rotation: [0, 0, 1.5708], material: "fur" },
      { id: "head", type: "sphere", args: [0.22, 24, 24], position: [0.5, 0.55, 0], material: "fur" },
      { id: "snout", type: "capsule", args: [0.08, 0.15, 8, 16], position: [0.7, 0.5, 0], rotation: [0, 0, 1.5708], material: "fur" },
      { id: "nose", type: "sphere", args: [0.04, 12, 12], position: [0.82, 0.52, 0], material: "dark" },
      { id: "eye_left", type: "sphere", args: [0.04, 12, 12], position: [0.55, 0.65, -0.12], material: "dark" },
      { id: "eye_right", type: "sphere", args: [0.04, 12, 12], position: [0.55, 0.65, 0.12], material: "dark" },
      { id: "ear_left", type: "sphere", args: [0.1, 12, 12], position: [0.4, 0.72, -0.15], material: "fur" },
      { id: "ear_right", type: "sphere", args: [0.1, 12, 12], position: [0.4, 0.72, 0.15], material: "fur" },
      { id: "leg_fl", type: "capsule", args: [0.06, 0.2, 8, 12], position: [0.25, 0.15, -0.15], material: "fur" },
      { id: "leg_fr", type: "capsule", args: [0.06, 0.2, 8, 12], position: [0.25, 0.15, 0.15], material: "fur" },
      { id: "leg_bl", type: "capsule", args: [0.06, 0.2, 8, 12], position: [-0.25, 0.15, -0.15], material: "fur" },
      { id: "leg_br", type: "capsule", args: [0.06, 0.2, 8, 12], position: [-0.25, 0.15, 0.15], material: "fur" },
      { id: "tail", type: "capsule", args: [0.04, 0.2, 8, 12], position: [-0.45, 0.5, 0], rotation: [0.5, 0, 0.8], material: "fur" },
      { id: "tongue", type: "sphere", args: [0.03, 8, 8], position: [0.75, 0.45, 0], material: "tongue" }
    ],
    hud: { title: "Dog", displays: [{ label: "Tail", parameter: "Tail_Wag", unit: "%" }] }
  },

  'cat': {
    name: "Cat",
    description: "A cute cat",
    parameters: [
      { name: "Tail_Curl", type: "number", default: 30, min: 0, max: 90, unit: "°" }
    ],
    materials: {
      fur: { color: "#9CA3AF", roughness: 0.9, metalness: 0 },
      dark: { color: "#1F2937", roughness: 0.4, metalness: 0.1 },
      pink: { color: "#F9A8D4", roughness: 0.6, metalness: 0 }
    },
    parts: [
      { id: "body", type: "capsule", args: [0.2, 0.4, 16, 24], position: [0, 0.35, 0], rotation: [0, 0, 1.5708], material: "fur" },
      { id: "head", type: "sphere", args: [0.2, 24, 24], position: [0.4, 0.5, 0], material: "fur" },
      { id: "ear_left", type: "cone", args: [0.06, 0.12, 4], position: [0.35, 0.7, -0.1], rotation: [0.2, 0, -0.2], material: "fur" },
      { id: "ear_right", type: "cone", args: [0.06, 0.12, 4], position: [0.35, 0.7, 0.1], rotation: [-0.2, 0, 0.2], material: "fur" },
      { id: "snout", type: "sphere", args: [0.08, 16, 16], position: [0.55, 0.45, 0], material: "fur" },
      { id: "nose", type: "sphere", args: [0.025, 8, 8], position: [0.62, 0.47, 0], material: "pink" },
      { id: "eye_left", type: "sphere", args: [0.04, 12, 12], position: [0.5, 0.55, -0.1], material: "dark" },
      { id: "eye_right", type: "sphere", args: [0.04, 12, 12], position: [0.5, 0.55, 0.1], material: "dark" },
      { id: "leg_fl", type: "capsule", args: [0.05, 0.15, 8, 12], position: [0.15, 0.12, -0.12], material: "fur" },
      { id: "leg_fr", type: "capsule", args: [0.05, 0.15, 8, 12], position: [0.15, 0.12, 0.12], material: "fur" },
      { id: "leg_bl", type: "capsule", args: [0.05, 0.15, 8, 12], position: [-0.2, 0.12, -0.12], material: "fur" },
      { id: "leg_br", type: "capsule", args: [0.05, 0.15, 8, 12], position: [-0.2, 0.12, 0.12], material: "fur" },
      { id: "tail", type: "capsule", args: [0.03, 0.3, 8, 12], position: [-0.4, 0.4, 0], rotation: [0, 0, 0.5], material: "fur" }
    ],
    hud: { title: "Cat", displays: [{ label: "Tail", parameter: "Tail_Curl", unit: "°" }] }
  },

  'robot': {
    name: "Robot",
    description: "A humanoid robot",
    parameters: [
      { name: "Arm_Angle", type: "number", default: 0, min: -90, max: 90, unit: "°" },
      { name: "Head_Turn", type: "number", default: 0, min: -45, max: 45, unit: "°" }
    ],
    materials: {
      metal: { color: "#E5E7EB", roughness: 0.3, metalness: 0.8 },
      dark: { color: "#374151", roughness: 0.5, metalness: 0.6 },
      glow: { color: "#3B82F6", roughness: 0.2, metalness: 0.3, emissive: "#3B82F6", emissiveIntensity: 0.5 }
    },
    parts: [
      { id: "torso", type: "roundedBox", args: [0.5, 0.6, 0.3, 0.05], position: [0, 0.9, 0], material: "metal" },
      { id: "chest_plate", type: "roundedBox", args: [0.4, 0.35, 0.05], position: [0, 1.0, 0.15], material: "dark" },
      { id: "head", type: "roundedBox", args: [0.3, 0.3, 0.25, 0.05], position: [0, 1.45, 0], material: "metal" },
      { id: "visor", type: "box", args: [0.25, 0.08, 0.05], position: [0, 1.48, 0.12], material: "glow" },
      { id: "antenna_l", type: "cylinder", args: [0.02, 0.02, 0.12, 8], position: [-0.12, 1.65, 0], material: "dark" },
      { id: "antenna_r", type: "cylinder", args: [0.02, 0.02, 0.12, 8], position: [0.12, 1.65, 0], material: "dark" },
      { id: "shoulder_l", type: "sphere", args: [0.1, 16, 16], position: [-0.35, 1.1, 0], material: "dark" },
      { id: "shoulder_r", type: "sphere", args: [0.1, 16, 16], position: [0.35, 1.1, 0], material: "dark" },
      { id: "arm_upper_l", type: "capsule", args: [0.06, 0.2, 8, 16], position: [-0.4, 0.85, 0], material: "metal" },
      { id: "arm_upper_r", type: "capsule", args: [0.06, 0.2, 8, 16], position: [0.4, 0.85, 0], material: "metal" },
      { id: "arm_lower_l", type: "capsule", args: [0.05, 0.2, 8, 16], position: [-0.4, 0.55, 0], material: "metal" },
      { id: "arm_lower_r", type: "capsule", args: [0.05, 0.2, 8, 16], position: [0.4, 0.55, 0], material: "metal" },
      { id: "hip", type: "roundedBox", args: [0.4, 0.15, 0.25, 0.03], position: [0, 0.55, 0], material: "dark" },
      { id: "leg_upper_l", type: "capsule", args: [0.07, 0.25, 8, 16], position: [-0.15, 0.35, 0], material: "metal" },
      { id: "leg_upper_r", type: "capsule", args: [0.07, 0.25, 8, 16], position: [0.15, 0.35, 0], material: "metal" },
      { id: "leg_lower_l", type: "capsule", args: [0.06, 0.2, 8, 16], position: [-0.15, 0.1, 0], material: "metal" },
      { id: "leg_lower_r", type: "capsule", args: [0.06, 0.2, 8, 16], position: [0.15, 0.1, 0], material: "metal" },
      { id: "foot_l", type: "roundedBox", args: [0.1, 0.05, 0.15, 0.02], position: [-0.15, 0.025, 0.02], material: "dark" },
      { id: "foot_r", type: "roundedBox", args: [0.1, 0.05, 0.15, 0.02], position: [0.15, 0.025, 0.02], material: "dark" }
    ],
    hud: { title: "Robot", displays: [{ label: "Arm", parameter: "Arm_Angle", unit: "°" }] }
  }
};

// Find best matching template
function findTemplate(topic: string): any | null {
  const lower = topic.toLowerCase();
  
  // Exact match
  if (TEMPLATES[lower]) return TEMPLATES[lower];
  
  // Partial match
  for (const key of Object.keys(TEMPLATES)) {
    if (lower.includes(key) || key.includes(lower)) {
      return TEMPLATES[key];
    }
  }
  
  // Keyword match
  if (lower.includes('bear') || lower.includes('teddy')) return TEMPLATES['teddy bear'];
  if (lower.includes('car') || lower.includes('vehicle') || lower.includes('automobile')) return TEMPLATES['sports car'];
  if (lower.includes('helicopter') || lower.includes('chopper') || lower.includes('heli')) return TEMPLATES['helicopter'];
  if (lower.includes('robot') || lower.includes('android') || lower.includes('mech')) return TEMPLATES['robot'];
  if (lower.includes('airplane') || lower.includes('plane') || lower.includes('aircraft') || lower.includes('jet')) return TEMPLATES['airplane'];
  if (lower.includes('house') || lower.includes('home') || lower.includes('building')) return TEMPLATES['house'];
  if (lower.includes('tree') || lower.includes('plant')) return TEMPLATES['tree'];
  if (lower.includes('dog') || lower.includes('puppy')) return TEMPLATES['dog'];
  if (lower.includes('cat') || lower.includes('kitten')) return TEMPLATES['cat'];
  
  return null;
}

export async function POST(req: Request) {
  try {
    const { topic } = await req.json();

    if (!topic) {
      return NextResponse.json({ error: 'Topic required' }, { status: 400 });
    }

    console.log(`Generating: "${topic}"`);

    // Try to find a template
    const template = findTemplate(topic);
    
    if (template) {
      console.log(`Using template: ${template.name}`);
      return NextResponse.json({
        success: true,
        component: template,
        partCount: template.parts.length,
        source: 'template'
      });
    }

    // No template - use AI but with VERY strict instructions
    const prompt = `Generate a 3D model for: "${topic}"

STRICT RULES:
- Output ONLY valid JSON, nothing else
- Model fits in 2x2x2 box centered at origin
- Ground is Y=0
- Use spheres for round parts, roundedBox for rectangular
- Minimum 8 parts

JSON FORMAT:
{
  "name": "${topic}",
  "materials": {
    "primary": {"color": "#666666", "roughness": 0.5, "metalness": 0.3}
  },
  "parts": [
    {"id": "main", "type": "sphere", "args": [0.3, 32, 32], "position": [0, 0.5, 0], "material": "primary"}
  ],
  "hud": {"title": "${topic}", "displays": []}
}`;

    const result = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 3000,
    });

    const text = result.choices[0]?.message?.content || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
      // Return a simple fallback
      return NextResponse.json({
        success: true,
        component: {
          name: topic,
          materials: { primary: { color: "#6366f1", roughness: 0.5, metalness: 0.3 } },
          parts: [
            { id: "main", type: "sphere", args: [0.5, 32, 32], position: [0, 0.5, 0], material: "primary" }
          ],
          hud: { title: topic, displays: [] }
        },
        source: 'fallback'
      });
    }

    const component = JSON.parse(jsonMatch[0]);
    
    return NextResponse.json({
      success: true,
      component,
      partCount: component.parts?.length || 0,
      source: 'ai'
    });

  } catch (error) {
    console.error('Generate error:', error);
    return NextResponse.json({ error: 'Generation failed' }, { status: 500 });
  }
}
