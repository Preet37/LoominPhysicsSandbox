export type SimulationStatus = 'OPTIMAL' | 'WARNING' | 'CRITICAL_FAILURE';

export interface SimulationResult {
  status: SimulationStatus;
  score: number;
  message: string;
  sustainabilityImpact: 'LOW' | 'MEDIUM' | 'HIGH';
}

export const PHYSICS_RULES = {
  wind_turbine: {
    limits: {
      max_wind_speed: 60, // m/s
      min_blade_pitch: 5, // degrees
      max_blade_length: 120 // meters
    },
    materials: {
      "steel": { score: 50, impact: "HIGH" },
      "carbon_fiber": { score: 70, impact: "MEDIUM" },
      "recycled_composite": { score: 95, impact: "LOW" },
      "wood_laminate": { score: 90, impact: "LOW" }
    }
  },
  robot_arm: {
    limits: {
      max_payload: 50, // kg
      max_extension: 2.5 // meters
    },
    materials: {
      "aluminum": { score: 60, impact: "MEDIUM" },
      "titanium": { score: 40, impact: "HIGH" },
      "bioplastic": { score: 95, impact: "LOW" }
    }
  }
};

export function evaluateDesign(topic: string, vars: any): SimulationResult {
  // @ts-ignore
  const rules = PHYSICS_RULES[topic];
  
  if (!rules) return { status: 'OPTIMAL', score: 50, message: 'Simulation Ready', sustainabilityImpact: 'LOW' };

  let status: SimulationStatus = 'OPTIMAL';
  let message = 'Design is stable.';
  
  // Logic for Wind Turbine
  if (topic === 'wind_turbine') {
    if (vars.wind_speed > rules.limits.max_wind_speed) {
      status = 'CRITICAL_FAILURE';
      message = 'STRUCTURAL FAILURE: Wind speed exceeds catastrophic limit.';
    } else if (vars.blade_length > rules.limits.max_blade_length) {
      status = 'WARNING';
      message = 'Warning: Blade length causes excess torque/stress.';
    }
  }

  // Logic for Robot Arm
  if (topic === 'robot_arm') {
    if (vars.payload > rules.limits.max_payload) {
        status = 'CRITICAL_FAILURE';
        message = 'MOTOR FAILURE: Payload exceeds servo rating.';
    }
  }

  // Calculate Sustainability Score
  let materialScore = 50; 
  let impact: 'LOW' | 'MEDIUM' | 'HIGH' = 'MEDIUM';
  
  if (vars.material && rules.materials[vars.material]) {
    materialScore = rules.materials[vars.material].score;
    impact = rules.materials[vars.material].impact as 'LOW' | 'MEDIUM' | 'HIGH';
  }

  if (status === 'CRITICAL_FAILURE') materialScore = 0; // Broken things aren't sustainable

  return { status, score: materialScore, message, sustainabilityImpact: impact };
}