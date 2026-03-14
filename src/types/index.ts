// ===== Core Domain Types =====

export interface Shop {
  id: string;
  name: string;
  blogId: string;
  rssUrl: string;
}

export interface Category {
  id: string;
  name: string;
  subcategories: string[];
}

export interface KeywordOption {
  title: string;
  mainKeyword: string;
  subKeyword1: string;
  subKeyword2: string;
}

export interface KeywordGenerationResult {
  results: KeywordOption[];
  forbiddenList: string[];
  referenceList: string[];
}

export interface KeywordValidationResult {
  isValid: boolean;
  failures: { rule: string; reason: string }[];
}

// ===== Validation Types =====

export interface ValidationResult {
  needsRevision: boolean;
  prohibitedWords: string[];
  cautionPhrases: string[];
  overusedWords: { word: string; count: number }[];
  revisionReasons: string[];
}

// ===== Article Types =====

export interface ArticleContent {
  title: string;
  content: string;
  mainKeyword: string;
  subKeyword1: string;
  subKeyword2: string;
  shopName: string;
  category: string;
  validation: ValidationResult;
}

// ===== Image Types =====

export interface BlogImage {
  index: number;
  imageId: string;
  imageUrl: string;
  prompt: string;
  section: string;
  status: "pending" | "generating" | "success" | "failed" | "retrying";
}

// ===== Workflow Types =====

export type WorkflowStage = 1 | 2 | 3 | 4;

export interface WorkflowState {
  sessionId: string;
  currentStage: WorkflowStage;
  shop: Shop | null;
  category: Category | null;
  topic: string;
  selectedKeyword: KeywordOption | null;
  article: ArticleContent | null;
  images: BlogImage[];
  naverDraftSaved: boolean;
}

// ===== API Response Types =====

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// ===== Naver Token Types =====

export interface NaverBlogToken {
  blogId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

// ===== SSE Event Types =====

export interface SSEImageEvent {
  type:
    | "progress"
    | "image-ready"
    | "image-failed"
    | "retrying"
    | "complete";
  index?: number;
  total?: number;
  imageId?: string;
  imageUrl?: string;
  error?: string;
  successCount?: number;
  failCount?: number;
}
