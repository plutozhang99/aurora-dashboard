export type WidgetType =
  | 'clock'
  | 'weather'
  | 'calendar'
  | 'email'
  | 'todo'
  | 'system'
  | 'news'
  | 'music'
  | 'chat'
  | 'agent-usage';

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
}

export interface EmailItem {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  receivedAt: number;
  important: boolean;
  dismissed: boolean;
}

export interface NewsItem {
  id: string;
  title: string;
  source: string;
  url: string;
  publishedAt: number;
}

export interface PromptOverrides {
  /** Per-persona system prompt; key = persona id. Missing keys fall back to DEFAULT_PROMPTS.personas[id]. */
  personas: Record<string, string>;
  /** Prompt for classifying which inbox emails are important. */
  emailImportance: string;
  /** Prompt for extracting today's scheduled events from emails. */
  scheduleExtract: string;
}

export interface AppSettings {
  // Weather
  weatherLat: number;
  weatherLon: number;
  weatherCityLabel: string;
  weatherUnit: 'metric' | 'imperial';

  // News
  newsFeeds: string[];

  // Email (IMAP)
  emailEnabled: boolean;
  emailHost: string;
  emailPort: number;
  emailUser: string;
  emailPassword: string; // stored locally only
  emailSecure: boolean;

  // AI provider
  aiProvider: 'anthropic' | 'openai' | 'none';
  aiApiKey: string;
  aiModel: string;
  aiPersona: string; // current chat persona id

  // Music: Spotify integration (optional)
  spotifyClientId: string;
  spotifyEnabled: boolean;

  // Server URL (optional, blank = same origin /api)
  serverUrl: string;

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
  emailEnabled: false,
  emailHost: 'imap.gmail.com',
  emailPort: 993,
  emailUser: '',
  emailPassword: '',
  emailSecure: true,
  aiProvider: 'none',
  aiApiKey: '',
  aiModel: 'claude-sonnet-4-6',
  aiPersona: 'crisp',
  spotifyClientId: '',
  spotifyEnabled: false,
  serverUrl: '',
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

export interface ChatPersona {
  id: string;
  name: string;
  emoji: string;
  /** Default system prompt — may be overridden by settings.prompts.personas[id]. */
  systemPrompt: string;
}

export const PERSONAS: ChatPersona[] = [
  {
    id: 'crisp',
    name: '精炼助理',
    emoji: '⚡',
    systemPrompt:
      '你是一位极度简洁的助理。回答始终言简意赅、信息密集，不啰嗦、不寒暄、不重复用户的话。\n- 直接给结论，再按需补充关键论据。\n- 列表优先于段落，能省的词全部省掉。\n- 不确定的地方坦诚说明，不要编造。',
  },
  {
    id: 'warm',
    name: '温柔朋友',
    emoji: '🌸',
    systemPrompt:
      '你是一位温柔体贴的朋友。耐心倾听、给予共情，再给出温暖且务实的建议。\n- 先承接对方的情绪，再回应内容。\n- 不评判、不说教，鼓励对方按自己的节奏做决定。\n- 建议要具体、可执行，避免空泛的安慰话术。',
  },
  {
    id: 'mentor',
    name: '严师',
    emoji: '🧠',
    systemPrompt:
      '你是一位严谨的导师。指出错误，给出系统化的解决思路，要求高，反馈直接但不刻薄。\n- 先指出关键问题与其根因，再给出可执行的改进路径。\n- 鼓励对方自己推导而不是直接喂答案，必要时给出"下一步该如何思考"的提示。\n- 拒绝糊弄式回答；不确定时清楚说明边界。',
  },
  {
    id: 'jester',
    name: '段子手',
    emoji: '🃏',
    systemPrompt:
      '你是一位幽默的段子手。用机智、双关与轻松的语气回应，但不牺牲信息准确性。\n- 信息准确性 > 笑点；笑点服务于让回答更易记。\n- 避免冒犯性、政治敏感或针对个人的玩笑。\n- 严肃问题（健康、法律、安全）切回正经语气。',
  },
  {
    id: 'philosopher',
    name: '哲思',
    emoji: '🌌',
    systemPrompt:
      '你是一位思辨型对话者。从多重视角探讨问题，引用经典思想，留出反思空间。\n- 先帮对方厘清问题本身，再讨论答案。\n- 给出至少两种立场及其各自的强论据。\n- 避免居高临下的说教，邀请对方继续思考。',
  },
];

export const DEFAULT_PROMPTS: PromptOverrides = {
  personas: Object.fromEntries(PERSONAS.map((p) => [p.id, p.systemPrompt])),
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
};

// Wire prompts into DEFAULT_SETTINGS (declared before DEFAULT_PROMPTS for readability).
DEFAULT_SETTINGS.prompts = DEFAULT_PROMPTS;

/** Resolve the effective system prompt for a persona, applying user override if present. */
export function effectivePersonaPrompt(settings: AppSettings, personaId: string): string {
  const override = settings.prompts?.personas?.[personaId]?.trim();
  if (override) return override;
  return DEFAULT_PROMPTS.personas[personaId] ?? '';
}
