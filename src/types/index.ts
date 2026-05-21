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
};

export interface ChatPersona {
  id: string;
  name: string;
  emoji: string;
  systemPrompt: string;
}

export const PERSONAS: ChatPersona[] = [
  {
    id: 'crisp',
    name: '精炼助理',
    emoji: '⚡',
    systemPrompt: '你是一位极度简洁的助理。回答始终言简意赅、信息密集，不啰嗦，不寒暄。',
  },
  {
    id: 'warm',
    name: '温柔朋友',
    emoji: '🌸',
    systemPrompt: '你是一位温柔体贴的朋友。耐心倾听，鼓励、共情，给出温暖务实的建议。',
  },
  {
    id: 'mentor',
    name: '严师',
    emoji: '🧠',
    systemPrompt: '你是一位严谨的导师。指出错误，给出系统化的解决思路，要求高，反馈直接。',
  },
  {
    id: 'jester',
    name: '段子手',
    emoji: '🃏',
    systemPrompt: '你是一位幽默的段子手。用机智、双关与轻松的语气回应，但不牺牲信息准确性。',
  },
  {
    id: 'philosopher',
    name: '哲思',
    emoji: '🌌',
    systemPrompt: '你是一位思辨型对话者。从多重视角探讨问题，引用经典思想，留出反思空间。',
  },
];
