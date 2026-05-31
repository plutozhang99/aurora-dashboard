import { Alert } from 'antd';
import type { WidgetInstance } from '@/types';
import { NowWidget } from './NowWidget';
import { CalendarWidget } from './CalendarWidget';
import { EmailWidget } from './EmailWidget';
import { TodoWidget } from './TodoWidget';
import { NoteWidget } from './NoteWidget';
import { NewsWidget } from './NewsWidget';

export function renderWidget(w: WidgetInstance) {
  switch (w.type) {
    case 'now': return <NowWidget />;
    case 'calendar': return <CalendarWidget />;
    case 'email': return <EmailWidget />;
    case 'todo': return <TodoWidget />;
    case 'note': return <NoteWidget />;
    case 'news': return <NewsWidget />;
    default: return <Alert type="warning" message={`未知组件: ${w.type}`} />;
  }
}

export const WIDGET_CATALOG: { type: WidgetInstance['type']; name: string; emoji: string }[] = [
  { type: 'now', name: '此刻 · 时间/天气', emoji: '🕘' },
  { type: 'calendar', name: '今日日程', emoji: '📅' },
  { type: 'email', name: '重要邮件', emoji: '📬' },
  { type: 'todo', name: '待办', emoji: '✅' },
  { type: 'note', name: '便签 · 随手记', emoji: '📝' },
  { type: 'news', name: '新闻', emoji: '📰' },
];
