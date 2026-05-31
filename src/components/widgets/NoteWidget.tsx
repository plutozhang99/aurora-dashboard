import { Flex, Input } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiAvailable } from '@/lib/api';
import { loadNoteRemote, saveNoteRemote } from '@/lib/dataStore';
import { BackendDownNotice, WidgetHeader } from './CalendarWidget';

export function NoteWidget() {
  const { data } = useQuery({
    queryKey: ['note'],
    queryFn: async () => {
      const has = await apiAvailable();
      if (!has) return { text: '', hasBackend: false };
      return { text: await loadNoteRemote(), hasBackend: true };
    },
  });

  const [text, setText] = useState('');
  const [seeded, setSeeded] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Seed the editor from the backend exactly once; later refetches would fight
  // the cursor while the user is typing.
  useEffect(() => {
    if (!seeded && data?.hasBackend) {
      setText(data.text);
      setSeeded(true);
    }
  }, [seeded, data]);

  useEffect(() => () => clearTimeout(timer.current), []);

  function onChange(v: string) {
    setText(v);
    setStatus('saving');
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        await saveNoteRemote(v);
        setStatus('saved');
      } catch {
        setStatus('error');
      }
    }, 500);
  }

  const parts: string[] = [];
  if (text.length) parts.push(`${text.length} 字`);
  if (status === 'saving') parts.push('保存中…');
  else if (status === 'saved') parts.push('已保存');
  else if (status === 'error') parts.push('保存失败');

  const backendDown = data && !data.hasBackend;

  return (
    <Flex vertical className="widget-content">
      <WidgetHeader title="便签 · Note" right={parts.length ? parts.join(' · ') : undefined} />
      {backendDown ? (
        <BackendDownNotice />
      ) : (
        <Input.TextArea
          className="note-textarea"
          value={text}
          onChange={(e) => onChange(e.target.value)}
          placeholder="随手记点什么…想法、清单、链接，随便写，会自动保存到后端。"
          variant="borderless"
          autoSize={false}
        />
      )}
    </Flex>
  );
}
