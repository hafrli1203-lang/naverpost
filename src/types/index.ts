// ===== Core Domain Types =====

export interface Shop {
  id: string;
  name: string;
  blogId: string;
  rssUrl: string;
  address?: string;
  naverPlaceUrl?: string;
  homepageUrl?: string;
  brandBannerText?: string;
  parkingInfo?: string;
  businessHours?: string;
  mainProducts?: string[];
  serviceStrengths?: string[];
  visitChecklist?: string[];
  avoidClaims?: string[];
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
  volumeTier?: KeywordVolumeTier;
  monthlyTotalSearches?: number | null;
  blogDocumentCount?: number | null;
  competitionRatio?: number | null;
  opportunityScore?: number | null;
  suggestedTitleKeyword?: string;
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
  /** 같은 소재의 기존 글이 있지만 다른 관점이라 허용된 시리즈 후보. */
  series?: boolean;
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
  aiCliches?: string[];
  toneMismatches?: string[];
  weakHooks?: string[];
  mechanicalSignals?: string[];
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

export type KeywordVolumeTier = "pass" | "weak" | "unknown";

export interface SmartBlockAnalysisSignal {
  status: "available" | "unavailable";
  reason?: string;
  mainKeyword: string;
  documentVolume: number | null;
  blockTypeHint: "high-volume" | "mid-volume" | "long-tail" | "unknown";
  subKeywordCandidates: Array<{
    keyword: string;
    titleHits: number;
    fromAutocomplete: boolean;
    score: number;
  }>;
  recommendedTitleKeyword: string;
  notes: string[];
}

export interface KeywordOptionAnalysis {
  morphology?: MorphologyAnalysis;
  languageRisk?: LanguageRiskAnalysis;
  structure?: StructureActivationAnalysis;
  duplicateRisk?: DuplicatePatternAnalysis;
  competitorTitleSimilarity?: {
    percent: number;
    risk?: "low" | "medium" | "high";
    matchedTitle?: string;
    sharedTokens?: string[];
    structureOverlap?: boolean;
    endingOverlap?: boolean;
    reason?: string;
  };
  externalSignals?: ExternalSearchSignals;
  smartBlock?: SmartBlockAnalysisSignal;
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
  monthlyPcSearches?: number | null;
  monthlyMobileSearches?: number | null;
  monthlyTotalSearches?: number | null;
  blogDocumentCount?: number | null;
  competitionRatio?: number | null;
  opportunityScore?: number | null;
  seasonalFit?: "high" | "medium" | "low" | "unknown";
  seasonalReason?: string;
  monthlyPcSearchesLabel?: string;
  monthlyMobileSearchesLabel?: string;
  competitionLabel?: string;
  monthlyAveragePcCtr?: number | null;
  monthlyAverageMobileCtr?: number | null;
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

// ===== GEO Types =====

export type GeoCategoryKey =
  | "ai-quote-structure"
  | "trust-and-sources"
  | "entity-and-author"
  | "content-quality";

export type GeoRecommendationCategory =
  | "ai-quote-structure"
  | "trust-and-sources"
  | "entity-and-author";

export interface GeoCategoryScore {
  key: GeoCategoryKey;
  label: string;
  score: number;
  maxScore: number;
}

export interface GeoRecommendation {
  id:
    | "direct-answer-lead"
    | "question-heading"
    | "comparison-table"
    | "soften-claims"
    | "remove-template-blocks"
    | "add-source-citation"
    | "add-expert-quote"
    | "remove-cliches";
  title: string;
  description: string;
  category: GeoRecommendationCategory;
  impact: "low" | "medium" | "high";
  reason: string;
  before?: string;
  after?: string;
  selectedByDefault: boolean;
}

export interface GeoAnalysisResult {
  score: number;
  grade: "poor" | "fair" | "good" | "excellent";
  summary: string;
  categories: GeoCategoryScore[];
  recommendations: GeoRecommendation[];
  previewTitle: string;
  previewDescription: string;
  citationDensityLabel: string;
  citationDensityCount: number;
}

export interface GeoOptimizationResult {
  appliedRecommendationIds: GeoRecommendation["id"][];
  optimizedContent: string;
  analysisBefore: GeoAnalysisResult;
  analysisAfter: GeoAnalysisResult;
}

// ===== Article Types =====

export interface ArticleBrief {
  title: string;
  topic: string;
  articleType: "info" | "promo";
  charCount: 1000 | 1500 | 2000 | 2500;
  tone: "standard" | "friendly" | "casual";
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
    bodySampleSize?: number;
    commonNouns: string[];
    titleNouns: string[];
    bodyNouns?: string[];
    bodyHighlights?: string[];
    titleAngles?: string[];
    contentBlocks?: string[];
    cautionPoints?: string[];
  };
  smartBlock?: {
    recommendedTitleKeyword: string;
    subKeywordCandidates: string[];
    blockTypeHint: "high-volume" | "mid-volume" | "long-tail" | "unknown";
  };
  sources: BlaiSignalSource[];
}

export interface ResearchCitationEntry {
  institution: string;
  year?: string;
  fact: string;
  url?: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
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
  /** "empty" when Perplexity research failed/timed out and the body was written without external sources. */
  researchStatus?: "ok" | "empty";
  /** Multi-turn revision chat history shown in the article preview. */
  revisionChat?: ChatMessage[];
  brief?: ArticleBrief;
  washingApplied?: boolean;
  washingTone?: string;
  preWashContent?: string;
  preWashValidation?: ValidationResult;
  preWashGeo?: GeoAnalysisResult;
  geo?: GeoAnalysisResult;
  preGeoContent?: string;
  preGeoValidation?: ValidationResult;
  preGeoGeo?: GeoAnalysisResult;
  citations?: ResearchCitationEntry[];
  generationNote?: string;
}

// ===== Image Types =====

export interface BlogImage {
  index: number;
  imageId: string;
  imageUrl: string;
  mimeType?: string;
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
