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
  analysis?: KeywordOptionAnalysis;
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

// ===== Blai Analysis Types =====

export type BlaiSignalSource =
  | "document-rule"
  | "local-content"
  | "rss-history"
  | "perplexity"
  | "naver-search"
  | "claude-haiku"
  | "manual-input";

export interface AnalysisIssue {
  code: string;
  label: string;
  reason: string;
  severity: "low" | "medium" | "high";
  source: BlaiSignalSource;
}

export interface MorphemeStat {
  token: string;
  count: number;
  source: "title" | "body";
}

export interface MorphologyAnalysis {
  titleMorphemes: string[];
  repeatedBodyMorphemes: MorphemeStat[];
  uniqueBodyMorphemeCount: number;
  titleMorphemesActivatedInBody: string[];
  missingTitleMorphemesInBody: string[];
  topicAlignmentNotes: string[];
  issues: AnalysisIssue[];
}

export interface LanguageRiskAnalysis {
  profanity: string[];
  abuse: string[];
  adult: string[];
  commercial: string[];
  emphasis: string[];
  advertising: string[];
  issues: AnalysisIssue[];
}

export interface StructureActivationAnalysis {
  titleKeywordCoverage: string[];
  missingTitleKeywordCoverage: string[];
  hasTableText: boolean;
  hasQuoteText: boolean;
  hasCaptionText: boolean;
  hasAttachmentText: boolean;
  alignmentNotes: string[];
  issues: AnalysisIssue[];
}

export interface DuplicatePatternAnalysis {
  titlePatternOverlap: string[];
  keywordCombinationOverlap: string[];
  sectionOrderOverlap: string[];
  tableStructureOverlap: string[];
  expressionOverlap: string[];
  conclusionOverlap: string[];
  informationOrderOverlap: string[];
  issues: AnalysisIssue[];
}

export interface KeywordOptionAnalysis {
  morphology?: MorphologyAnalysis;
  languageRisk?: LanguageRiskAnalysis;
  structure?: StructureActivationAnalysis;
  duplicateRisk?: DuplicatePatternAnalysis;
  externalSignals?: ExternalSearchSignals;
  searchIntentAxis?: string;
  bodyExpansionFit?: {
    isLikelyExpandable: boolean;
    reason: string;
  };
  issues: AnalysisIssue[];
}

export interface SearchVolumeSignal {
  keyword: string;
  trend?: "rising" | "steady" | "falling" | "unknown";
  rawValue?: number | null;
  source: BlaiSignalSource;
}

export interface RelatedKeywordSignal {
  keyword: string;
  relationType:
    | "autocomplete"
    | "related-search"
    | "smartblock-topic"
    | "unknown";
  source: BlaiSignalSource;
}

export interface ExposureSignal {
  area:
    | "smartblock"
    | "popular"
    | "blog-tab"
    | "influencer-tab"
    | "integrated"
    | "unknown";
  rank?: number | null;
  competitionLabel?: string;
  source: BlaiSignalSource;
}

export interface ExternalSearchSignals {
  status: "available" | "unavailable";
  provider: string;
  checkedAt?: string;
  searchVolume?: SearchVolumeSignal[];
  relatedKeywords?: RelatedKeywordSignal[];
  exposures?: ExposureSignal[];
  notes: string[];
}

// ===== Validation Types =====

export interface ValidationResult {
  needsRevision: boolean;
  prohibitedWords: string[];
  cautionPhrases: string[];
  overusedWords: { word: string; count: number }[];
  missingKeywords: string[];
  hasTable: boolean;
  revisionReasons: string[];
  morphology?: MorphologyAnalysis;
  languageRisk?: LanguageRiskAnalysis;
  structure?: StructureActivationAnalysis;
  duplicateRisk?: DuplicatePatternAnalysis;
  issues?: AnalysisIssue[];
}

// ===== Article Types =====

export interface ArticleBrief {
  title: string;
  topic: string;
  articleType: "info" | "promo";
  charCount: 1000 | 1500 | 2000 | 2500;
  tone:
    | "standard"
    | "friendly"
    | "casual"
    | "business"
    | "expert";
  contentSubtype?: "blog" | "event" | "season" | "short";
  shop: Shop;
  category: Category;
  mainKeyword: string;
  subKeyword1: string;
  subKeyword2: string;
  researchSummary: string;
  titleMorphologyGuide: string[];
  duplicateAvoidanceRules: string[];
  networkContext: {
    currentBlogId: string;
    sameStoreHistory: string[];
    crossBlogStoreAngles: string[];
  };
  competitorMorphology?: {
    status: "available" | "unavailable";
    sampleSize: number;
    commonNouns: string[];
    titleNouns: string[];
  };
  sources: BlaiSignalSource[];
}

export interface ArticleContent {
  title: string;
  content: string;
  mainKeyword: string;
  subKeyword1: string;
  subKeyword2: string;
  shopName: string;
  category: string;
  validation: ValidationResult;
  brief?: ArticleBrief;
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
