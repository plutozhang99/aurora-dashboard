export type WidgetType =
  | 'clock'
  | 'weather'
  | 'calendar'
  | 'email'
  | 'todo'
  | 'news'
  | 'briefing';

export interface WidgetInstance {
  id: string;
  type: WidgetType;
  /** Free-form per-widget config persisted to IndexedDB */
  config?: Record<string, unknown>;
}

export interface LayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
}

export type Breakpoint = 'lg' | 'md' | 'sm' | 'xs';

export interface DashboardLayout {
  widgets: WidgetInstance[];
  layouts: Record<Breakpoint, LayoutItem[]>;
}

export interface TodoItem {
  id: string;
  text: string;
  done: boolean;
  dueDate?: string;
  createdAt: number;
  /** When this todo was confirmed from an email suggestion, the source email refs. */
  sourceEmailId?: string;
  sourceAccountId?: string;
  sourceSubject?: string;
}

/**
 * An AI/keyword-derived actionable to-do extracted from an email. Lives in the
 * separate `suggestions` store until the user confirms (→ a real TodoItem) or
 * ignores it (→ dismissed marker, never resurfaces).
 */
export interface TodoSuggestion {
  id: string;
  text: string;
  sourceAccountId: string;
  sourceEmailId: string;
  from: string;
  subject: string;
  /** Locally set when the user ignores the suggestion; persisted so it stays hidden. */
  dismissed?: boolean;
}

export interface EmailItem {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  receivedAt: number;
  important: boolean;
  dismissed: boolean;
  /** Account this item was aggregated from (`m-{accountId}-{uid}` namespace). */
  sourceAccountId?: string;
}

/** A non-fatal per-account failure surfaced by aggregated endpoints. */
export interface AccountError {
  accountId: string;
  message: string;
}

export interface NewsItem {
  id: string;
  title: string;
  source: string;
  url: string;
  publishedAt: number;
}

export interface PromptOverrides {
  /** Prompt for classifying which inbox emails are important. */
  emailImportance: string;
  /** Prompt for extracting today's scheduled events from emails. */
  scheduleExtract: string;
  /** Prompt for extracting actionable to-dos from emails. */
  emailTodo: string;
  /** Prompt for generating the spoken morning briefing. */
  briefingSummary: string;
}

/** One IMAP account. Credentials are persisted only to the local IndexedDB. */
export interface EmailAccount {
  id: string;
  label?: string;
  enabled: boolean;
  host: string;
  port: number;
  user: string;
  password: string; // stored locally only
  secure: boolean;
}

export interface AppSettings {
  // Weather
  weatherLat: number;
  weatherLon: number;
  weatherCityLabel: string;
  weatherUnit: 'metric' | 'imperial';

  // News
  newsFeeds: string[];

  // Email (IMAP) — multiple accounts, aggregated by the backend.
  emailAccounts: EmailAccount[];

  // AI provider
  aiProvider: 'anthropic' | 'openai' | 'none';
  aiApiKey: string;
  aiModel: string;

  // Server URL (optional, blank = same origin /api)
  serverUrl: string;

  // Morning briefing
  /** Earliest local time the briefing auto-generates on first open, "HH:MM". */
  morningTime: string;
  /** TTS engine for reading the briefing aloud. 'cloud' reserved (not yet implemented). */
  ttsEngine: 'browser' | 'cloud';

  // Theme
  reduceMotion: boolean;
  accent: string;

  // Prompts (per-feature overrides; empty string → use default)
  prompts: PromptOverrides;

  // Per-feature mode: 'ai' lets the LLM judge, 'keyword' uses local regex on the
  // editable keyword list below. 'ai' silently falls back to 'keyword' if no AI
  // provider is configured.
  emailImportanceMode: 'ai' | 'keyword';
  scheduleMode: 'ai' | 'keyword';
  emailImportanceKeywords: string[];
  scheduleHintKeywords: string[];
}

export const DEFAULT_SETTINGS: AppSettings = {
  weatherLat: 30.2741,
  weatherLon: 120.1551,
  weatherCityLabel: '杭州',
  weatherUnit: 'metric',
  newsFeeds: [
    'https://hnrss.org/frontpage',
    'https://www.theverge.com/rss/index.xml',
  ],
  emailAccounts: [],
  aiProvider: 'none',
  aiApiKey: '',
  aiModel: 'claude-sonnet-4-6',
  serverUrl: '',
  morningTime: '06:00',
  ttsEngine: 'browser',
  reduceMotion: false,
  accent: '#9b5cff',
  // Filled in below once DEFAULT_PROMPTS is declared (TS hoisting note: this property is set via Object.assign on next line).
  prompts: undefined as unknown as PromptOverrides,
  emailImportanceMode: 'keyword',
  scheduleMode: 'keyword',
  emailImportanceKeywords: [
    'urgent', 'important', 'asap', 'action required', 'invoice', 'pay',
    'security', 'verify', 'reset password',
    '会议', '面试', '合同', '发票', '账单', '逾期', '验证', '紧急', '重要',
  ],
  scheduleHintKeywords: [
    'meeting', 'appointment', 'call', 'interview', 'deadline', 'due',
    '会议', '约会', '面试', '预约', '截止', '提醒',
  ],
};

export const DEFAULT_EMAIL_KEYWORDS = [...DEFAULT_SETTINGS.emailImportanceKeywords];
export const DEFAULT_SCHEDULE_KEYWORDS = [...DEFAULT_SETTINGS.scheduleHintKeywords];

export const DEFAULT_PROMPTS: PromptOverrides = {
  emailImportance: [
    '你是一个邮件分类助手。任务：从一批最近 48 小时的收件箱邮件中挑出"重要邮件"。',
    '',
    '判定为重要的典型信号（满足任意一条即可）：',
    '- 来自真实个人/同事/客户/导师/家人的直接沟通（非营销列表）。',
    '- 含有明确的待办、截止时间、面试/会议/合同/账单/发票/付款。',
    '- 涉及账号安全、登录验证、密码重置、异常活动告警。',
    '- 来自学校、政府、银行、医院、签证、税务等机构的实质通知。',
    '',
    '判定为不重要的典型信号：',
    '- 群发营销、广告、促销、newsletter、社交平台推送、自动化通知摘要。',
    '- 收据/订阅续费提醒等纯信息性、无需用户操作的邮件。',
    '',
    '严格只输出 JSON，形如：{"important":[{"uid":<number>,"reason":"<不超过20字>"}]}。不要输出任何额外文字。',
  ].join('\n'),
  scheduleExtract: [
    '你是一个日程抽取助手。任务：从用户今天收到的邮件中，识别"今天发生"的可执行日程项。',
    '',
    '抽取规则：',
    '- 仅保留今天（按用户本地时区）真正发生的事件；昨天/未来日期请丢弃。',
    '- 事件类型示例：会议、面试、约会、电话、deadline、提交截止、寄送/到达时间、提醒。',
    '- 时间格式统一为 24 小时制 HH:MM；如邮件只给出"上午/下午"等模糊描述，请合理推断（早上=09:00、上午=10:00、中午=12:00、下午=15:00、晚上=20:00）。完全没有时间信息则用 "—"。',
    '- 标题简短，<= 30 个汉字/字符，不要带引号。',
    '',
    '严格只输出 JSON，形如：{"events":[{"uid":<number>,"time":"HH:MM 或 —","title":"<标题>"}]}。不要输出任何额外文字。',
  ].join('\n'),
  emailTodo: [
    '你是一个待办抽取助手。任务：从一批最近 48 小时的收件箱邮件中，识别"需要用户去做的事"，提炼成可执行的待办项。',
    '',
    '抽取规则：',
    '- 只保留真正需要用户采取行动的事项：回复/确认/提交/付款/审核/预约/准备材料/补充信息等。',
    '- 纯通知、营销、收据、自动化摘要等无需用户操作的邮件，不产生待办。',
    '- 每封邮件最多产出一条最关键的待办；没有可执行事项则跳过该邮件。',
    '- 待办文案是简短的动作描述（动词开头，<= 20 个汉字/字符），不要带引号、不要加发件人前缀。',
    '',
    '严格只输出 JSON，形如：{"todos":[{"uid":<number>,"text":"<不超过20字的动作描述>"}]}。不要输出任何额外文字。',
  ].join('\n'),
  briefingSummary: [
    '你是一位贴心的晨间播报助手。任务：把"今日日程 + 重要邮件 + 新闻摘要"整合成一段自然、口语化、适合朗读的中文晨间简报。',
    '',
    '输入是一个 JSON，包含 today(日期)、schedule(今日日程数组)、emails(重要邮件数组)、news(新闻数组)。',
    '',
    '写作要求：',
    '- 以亲切的问候开场（如"早上好"），然后用连贯的口语叙述，而非生硬罗列。',
    '- 先讲今日日程（几点有什么安排），再讲需要关注的重要邮件，最后用一两句概括今天值得一看的新闻。',
    '- 简洁、自然、可朗读；避免 Markdown 符号、表情和编号列表。',
    '- 若某类素材为空，自然跳过，不要强行提及"无数据"。',
    '- 全部素材都为空时，给出一句轻松的早安问候即可。',
    '',
    '严格只输出 JSON，形如：{"text":"<可朗读的整段晨报文本>","sections":{"schedule":"...","emails":"...","news":"..."}}。sections 可选，可省略或为 null。不要输出任何额外文字。',
  ].join('\n'),
};

// Wire prompts into DEFAULT_SETTINGS (declared before DEFAULT_PROMPTS for readability).
DEFAULT_SETTINGS.prompts = DEFAULT_PROMPTS;
