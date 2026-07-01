// Core types for SemanticGuard AI — AI-Powered Candidate Fraud & Online Assessment Integrity System
// Operated by Semantic Services Rwanda

export type UserRole = 'candidate' | 'recruiter' | 'admin';

export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';

export type AlertType =
  | 'multiple_faces'
  | 'phone_detected'
  | 'looking_away'
  | 'tab_switch'
  | 'suspicious_movement'
  | 'audio_detected'
  | 'face_not_detected'
  | 'identity_mismatch'
  | 'browser_unfocused'
  | 'object_detected'
  // Secure Browser Lockdown
  | 'devtools_open'
  | 'keyboard_shortcut'
  | 'clipboard_attempt'
  | 'multiple_tabs';


export type AssessmentStatus = 'upcoming' | 'active' | 'completed' | 'cancelled';

export type RiskLevel = 'low' | 'medium' | 'high';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
  status: 'active' | 'inactive' | 'suspended';
  createdAt: string;
  lastLogin: string;
  mfaEnabled: boolean;
}

export interface Candidate extends User {
  role: 'candidate';
  candidateId: string;
  department: string; // hiring department
  position: string; // role/position applied for
  experienceYears: number;
  integrityScore: number;
  totalAssessments: number;
  passedAssessments: number;
}

export interface Recruiter extends User {
  role: 'recruiter';
  recruiterId: string;
  department: string;
  requisitions: string[]; // open roles / hiring tracks owned
  totalAssessmentsCreated: number;
}

export interface Assessment {
  id: string;
  title: string;
  position: string; // job position the assessment screens for
  recruiterId: string;
  recruiterName: string;
  duration: number; // minutes
  startTime: string;
  endTime: string;
  status: AssessmentStatus;
  totalQuestions: number;
  totalCandidates: number;
  aiMonitoring: {
    faceDetection: boolean;
    eyeTracking: boolean;
    phoneDetection: boolean;
    tabSwitchDetection: boolean;
    audioDetection: boolean;
    suspiciousMovement: boolean;
  };
  riskThreshold: number;
}

export type QuestionType = 'multiple_choice' | 'true_false' | 'short_answer' | 'coding';

// Coding assessments support JavaScript and Java only.
export type CodingLanguage = 'javascript' | 'java';

export interface CodingTestCase {
  id: string;
  args: unknown[];        // arguments passed to the entry function (language-agnostic)
  expectedOutput: string; // canonical JSON form of the expected return value
  display?: string;       // human-readable call shown in the UI
  hidden?: boolean;
}

export type QuestionDifficulty = 'easy' | 'medium' | 'hard';

export interface QuestionOption {
  id?: string;
  text: string;
  isCorrect?: boolean;   // present for recruiters/admins; stripped for candidates
  explanation?: string;
}

export interface Question {
  id: string;
  assessmentId: string;
  text: string;
  type: QuestionType;
  options?: QuestionOption[];
  correctAnswer?: string | number;
  marks: number;
  order: number;
  difficulty?: QuestionDifficulty;
  required?: boolean;
  // Coding-question fields (used when type === 'coding')
  language?: CodingLanguage;                              // single allowed language (legacy)
  languages?: CodingLanguage[];                           // languages the candidate may choose from
  entryPoint?: string;                                    // function name invoked by the test runner
  starterCode?: string;                                   // starter for a single-language question
  starterCodes?: Partial<Record<CodingLanguage, string>>; // per-language starter code
  testCases?: CodingTestCase[];
}

export interface AIAlert {
  id: string;
  sessionId: string;
  assessmentId: string;
  assessmentTitle: string;
  candidateId: string;
  candidateName: string;
  type: AlertType;
  severity: AlertSeverity;
  timestamp: string;
  description: string;
  reviewed: boolean;
  riskScore: number;
}

export interface AssessmentSession {
  id: string;
  assessmentId: string;
  assessmentTitle: string;
  candidateId: string;
  candidateName: string;
  candidateEmail?: string;
  startTime: string;
  endTime?: string;
  status: 'in_progress' | 'completed' | 'abandoned';
  score?: number;
  maxScore: number;
  percentage?: number;
  integrityScore: number;
  riskScore: number;
  riskLevel: RiskLevel;
  alerts: AIAlert[];
  tabSwitches: number;
  lookingAwayCount: number;
  faceNotDetectedCount: number;
  monitoringEnabled?: boolean;
}


export interface AIMonitoringStatus {
  faceDetected: boolean;
  faceVerified: boolean;
  facesCount: number;
  eyeGaze: 'screen' | 'away' | 'unknown';
  headPose: 'normal' | 'abnormal';
  phoneDetected: boolean;
  audioDetected: boolean;
  suspiciousMovement: boolean;
  browserFocused: boolean;
  tabSwitches: number;
  riskScore: number;
  riskLevel: RiskLevel;
}

/** A candidate currently under live proctoring (recruiter/admin monitoring view). */
export interface LiveCandidate {
  id: string;
  sessionId: string;
  name: string;
  candidateId: string;
  assessmentId: string;
  assessmentTitle: string;
  status: AIMonitoringStatus;
  isFlagged: boolean;
  alertCount: number;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  action: string;
  resource: string;
  ipAddress: string;
  status: 'success' | 'failure' | 'warning';
  details: string;
}

export interface SystemSettings {
  aiDetection: {
    faceDetection: boolean;
    eyeTracking: boolean;
    phoneDetection: boolean;
    tabSwitchDetection: boolean;
    audioDetection: boolean;
    suspiciousMovement: boolean;
  };
  sensitivity: {
    faceDetection: number;
    eyeTracking: number;
    phoneDetection: number;
    audioDetection: number;
    movement: number;
  };
  riskThreshold: number;
  mfaRequired: boolean;
  sessionTimeout: number;
  maxLoginAttempts: number;
  rateLimitRequests: number;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'alert' | 'success';
  read: boolean;
  timestamp: string;
}
