import type { WidgetInstance } from '@/types';
import { ClockWidget } from './ClockWidget';
import { WeatherWidget } from './WeatherWidget';
import { CalendarWidget } from './CalendarWidget';
import { EmailWidget } from './EmailWidget';
import { TodoWidget } from './TodoWidget';
import { NewsWidget } from './NewsWidget';
import { BriefingWidget } from './BriefingWidget';

export function renderWidget(w: WidgetInstance) {
  switch (w.type) {
    case 'briefing': return <BriefingWidget />;
    case 'clock': return <ClockWidget />;
    case 'weather': return <WeatherWidget />;
    case 'calendar': return <CalendarWidget />;
    case 'email': return <EmailWidget />;
    case 'todo': return <TodoWidget />;
    case 'news': return <NewsWidget />;
    default: return <div className="text-white/40">未知组件: {w.type}</div>;
  }
}

export const WIDGET_CATALOG: { type: WidgetInstance['type']; name: string; emoji: string }[] = [
  { type: 'briefing', name: '晨间播报', emoji: '🌅' },
  { type: 'clock', name: '时钟 / 日期', emoji: '🕐' },
  { type: 'weather', name: '天气', emoji: '🌤️' },
  { type: 'calendar', name: '今日日程', emoji: '📅' },
  { type: 'email', name: '重要邮件', emoji: '📬' },
  { type: 'todo', name: '待办', emoji: '✅' },
  { type: 'news', name: '新闻', emoji: '📰' },
];
