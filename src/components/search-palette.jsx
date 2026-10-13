import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen, BriefcaseBusiness, CalendarClock, CalendarDays, CheckSquare, FileText,
  FolderOpen, Goal, Handshake, HelpCircle, Lightbulb, NotebookPen, Plus, Search,
  Sparkles, TriangleAlert, Users, Workflow, Wrench,
} from 'lucide-react';
import { Avatar } from '@/components/ui';
import { useResource } from '@/hooks/use-resource';
import { api } from '@/lib/api';
import { assistantSectionRoute, assistantSuggestions } from '@/components/assistant';
import { cn, formatEventDate, titleOf } from '@/lib/utils';
import { searchResultEntity, searchResultRoute } from '@/lib/search-result';

const QUICK_COMMANDS = [
  { label:'Создай', value:'Создай ', icon:Plus },
  { label:'Открой…', value:'Открой ', icon:FolderOpen },
  { label:'Покажи мои…', value:'Покажи мои ', icon:Search },
  { label:'Запиши в журнал', value:'Запиши в журнал: ', icon:NotebookPen },
];

const GROUP_META = {
  people:['Люди', Users], projects:['Проекты', BriefcaseBusiness], tasks:['Задачи', CheckSquare],
  issues:['Проблемы', TriangleAlert], meetings:['Встречи', CalendarClock], vacations:['Отсутствия', CalendarDays],
  journal:['Журнал', NotebookPen], goals:['Цели', Goal], agreements:['Договорённости', Handshake],
  links:['Ссылки и материалы', FileText], documents:['Документы', BookOpen], tools:['Инструменты', Wrench],
  labs:['Мастерская и идеи', Lightbulb], processes:['Процессы', Workflow], checkins:['Weekly', Sparkles],
};

function resultMeta(group, item) {
  if (group === 'people') { const person = searchResultEntity(item); return person.role || (person.type === 'stakeholder' ? 'Стейкхолдер' : 'Сотрудник'); }
  if (group === 'meetings') return item.date ? formatEventDate(item.date, { short:true }) : '';
  if (group === 'projects') return item.status || '';
  if (group === 'tasks' || group === 'issues' || group === 'agreements') return item.status || '';
  return item.description || item.sourceTitle || item.weekStart || '';
}

function assistantCommandQuery(value) {
  const q=String(value||'').trim().toLocaleLowerCase('ru').replace(/ё/g,'е');
  return /^(создай|создать|добавь|заведи|открой|открыть|покажи мои|покажи все мои|запиши в журнал|запиши в заметки|добавь заметку|как дела у|как там|что у|чем занят|чем занята|обзор проекта)(?:\s|:|$)/.test(q);
}

export function SearchPalette({ open, onOpenChange, onOpenShortcuts }) {
  const navigate=useNavigate();
  const people=useResource('people');
  const projects=useResource('projects');
  const inputRef=React.useRef(null);
  const requestRef=React.useRef(0);
  const [query,setQuery]=React.useState('');
  const [mode,setMode]=React.useState('quick');
  const [searchData,setSearchData]=React.useState(null);
  const [activeIndex,setActiveIndex]=React.useState(0);
  const [loading,setLoading]=React.useState(false);

  const suggestions=React.useMemo(()=>assistantSuggestions(query,people.data,projects.data),[query,people.data,projects.data]);

  React.useEffect(()=>{
    if(!open) return;
    setQuery(''); setMode('quick'); setSearchData(null); setActiveIndex(0); setLoading(false);
    requestAnimationFrame(()=>inputRef.current?.focus());
  },[open]);

  React.useEffect(()=>{
    if(!open) return;
    const trimmed=query.trim();
    const request=++requestRef.current;
    if(!trimmed){setMode('quick');setSearchData(null);setLoading(false);setActiveIndex(0);return;}
    if(suggestions.length){setMode('suggestions');setSearchData(null);setLoading(false);setActiveIndex(0);return;}
    if(assistantCommandQuery(trimmed)){setMode('command');setSearchData(null);setLoading(false);setActiveIndex(-1);return;}
    setMode('results');setLoading(true);setActiveIndex(-1);
    const timer=window.setTimeout(async()=>{
      try{
        const data=await api.get(`/api/search?q=${encodeURIComponent(trimmed)}`);
        if(request!==requestRef.current) return;
        setSearchData(data); setActiveIndex(-1);
      }catch{
        if(request!==requestRef.current) return;
        setSearchData({groups:{}});
      }finally{
        if(request===requestRef.current) setLoading(false);
      }
    },180);
    return()=>window.clearTimeout(timer);
  },[open,query,suggestions]);

  const close=React.useCallback(()=>onOpenChange(false),[onOpenChange]);
  const go=React.useCallback((route)=>{if(!route)return;close();navigate(route);},[close,navigate]);
  const runAssistant=React.useCallback((value)=>{close();navigate(`/?q=${encodeURIComponent(value)}&run=1`);},[close,navigate]);

  const quickItems=React.useMemo(()=>[
    ...QUICK_COMMANDS.map((item)=>({key:`quick:${item.label}`,label:item.label,icon:item.icon,action:()=>{setQuery(item.value);requestAnimationFrame(()=>{inputRef.current?.focus();inputRef.current?.setSelectionRange(item.value.length,item.value.length);});}})),
    {key:'help',label:'Горячие клавиши',icon:HelpCircle,action:()=>{close();onOpenShortcuts?.();}},
  ],[close,onOpenShortcuts]);

  const suggestionItems=React.useMemo(()=>suggestions.map((item,index)=>({
    key:`suggestion:${index}:${item.label}`,label:item.label,meta:item.meta,person:item.person,icon:item.kind==='project'?FolderOpen:Search,
    action:()=>{
      setQuery(item.insert || item.label || '');
      if(item.route){go(item.route);return;}
      if(item.submit){
        const value=item.insert || item.label || '';
        if(assistantCommandQuery(value)) runAssistant(value.trim());
        else requestAnimationFrame(()=>inputRef.current?.dispatchEvent(new Event('input',{bubbles:true})));
        return;
      }
      requestAnimationFrame(()=>{inputRef.current?.focus();const value=item.insert||'';inputRef.current?.setSelectionRange(value.length,value.length);});
    },
  })),[suggestions,go,runAssistant]);

  const resultSections=React.useMemo(()=>{
    const groups=searchData?.groups || {};
    return Object.entries(groups).filter(([,items])=>Array.isArray(items)&&items.length).map(([group,items])=>({group,items:items.slice(0,5)}));
  },[searchData]);

  const resultItems=React.useMemo(()=>resultSections.flatMap(({group,items})=>items.map((item,index)=>({
    key:`result:${group}:${item.id||item.person?.id||index}`,group,item,label:titleOf(searchResultEntity(item)),meta:resultMeta(group,item),action:()=>{
      if(group==='links' && item.url){close();window.open(item.url,'_blank','noopener,noreferrer');return;}
      go(searchResultRoute(group,item));
    },
  }))),[resultSections,close,go]);

  const flatItems=mode==='quick'?quickItems:mode==='suggestions'?suggestionItems:mode==='results'?resultItems:[];
  const choose=(index)=>{const item=flatItems[index];if(item?.action)item.action();};

  const submitQuery=()=>{
    const value=query.trim(); if(!value)return;
    if(activeIndex>=0&&flatItems[activeIndex]){choose(activeIndex);return;}
    const direct=assistantSectionRoute(value);
    if(direct){go(direct);return;}
    if(assistantCommandQuery(value)){runAssistant(value);return;}
    go(`/search?q=${encodeURIComponent(value)}`);
  };

  if(!open)return null;
  return <div className="fixed inset-0 z-[120] flex items-start justify-center bg-black/45 px-4 pt-[12vh]" role="presentation" onMouseDown={(event)=>{if(event.target===event.currentTarget)close();}}>
    <div className="search-palette w-full max-w-[560px] overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-2xl" role="dialog" aria-modal="true" aria-label="Поиск и быстрые действия">
      <div className="search-palette-input-row flex h-[48px] items-center gap-2 border-b px-4">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground"/>
        <input ref={inputRef} value={query} onChange={(event)=>setQuery(event.target.value)} onKeyDown={(event)=>{
          if(event.key==='Escape'){event.preventDefault();close();return;}
          if(event.key==='ArrowDown'){event.preventDefault();if(flatItems.length)setActiveIndex((current)=>current<0?0:Math.min(current+1,flatItems.length-1));return;}
          if(event.key==='ArrowUp'){event.preventDefault();if(flatItems.length)setActiveIndex((current)=>current<=0?0:current-1);return;}
          if(event.key==='Enter'){event.preventDefault();submitQuery();}
        }} placeholder="Поиск: задачи на сегодня, встречи без итогов, проекты…" autoComplete="off" spellCheck={false} className="search-palette-input h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-0"/>
      </div>
      <div className="max-h-[60vh] overflow-y-auto p-1.5">
        {mode==='quick' && <><PaletteTitle>Команды</PaletteTitle>{quickItems.slice(0,4).map((item,index)=><PaletteItem key={item.key} item={item} active={activeIndex===index} onMouseEnter={()=>setActiveIndex(index)} onClick={()=>choose(index)}/>) }<PaletteTitle>Помощь</PaletteTitle><PaletteItem item={quickItems[4]} active={activeIndex===4} onMouseEnter={()=>setActiveIndex(4)} onClick={()=>choose(4)}/></>}
        {mode==='suggestions' && <><PaletteTitle>Предложения</PaletteTitle>{suggestionItems.map((item,index)=><PaletteItem key={item.key} item={item} active={activeIndex===index} onMouseEnter={()=>setActiveIndex(index)} onClick={()=>choose(index)}/>)}</>}
        {mode==='command' && <div className="px-4 py-8 text-center text-sm text-muted-foreground">Продолжите запрос или нажмите Enter</div>}
        {mode==='results' && loading && <div className="px-4 py-8 text-center text-sm text-muted-foreground" aria-live="polite">Ищу…</div>}
        {mode==='results' && !loading && resultSections.length===0 && <div className="px-4 py-8 text-center text-sm text-muted-foreground">Ничего не найдено</div>}
        {mode==='results' && !loading && resultSections.map(({group,items})=>{const [label,GroupIcon]=GROUP_META[group]||[group,Search];return <React.Fragment key={group}><PaletteTitle>{label}</PaletteTitle>{items.map((item)=>{const globalIndex=resultItems.findIndex((candidate)=>candidate.group===group&&candidate.item===item);const paletteItem=resultItems[globalIndex];return <PaletteItem key={paletteItem.key} item={{...paletteItem,icon:GroupIcon}} active={activeIndex===globalIndex} onMouseEnter={()=>setActiveIndex(globalIndex)} onClick={()=>choose(globalIndex)}/>;})}</React.Fragment>;})}
        {mode==='results' && !loading && query.trim() && <button type="button" onClick={()=>go(`/search?q=${encodeURIComponent(query.trim())}`)} className="mt-1 flex min-h-9 w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground ui-focus-ring"><Search className="h-4 w-4 shrink-0 text-muted-foreground"/><span className="min-w-0 flex-1 truncate">Все результаты по «{query.trim()}»</span></button>}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t px-3.5 py-2 text-[12px] text-muted-foreground"><span>↑↓ навигация</span><span>Enter выбрать</span><span>Esc закрыть</span><span>? горячие клавиши</span></div>
    </div>
  </div>;
}

function PaletteTitle({children}){return <div className="px-2.5 pb-1 pt-2 text-[12px] font-medium uppercase tracking-[.06em] text-muted-foreground">{children}</div>;}
function PaletteItem({item,active,onMouseEnter,onClick}){const Icon=item.icon||Search;return <button type="button" onMouseEnter={onMouseEnter} onClick={onClick} className={cn('flex min-h-9 w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm ui-focus-ring',active?'bg-accent text-accent-foreground':'hover:bg-accent/70 hover:text-accent-foreground')}>
  <span className="grid h-5 w-5 shrink-0 place-items-center text-muted-foreground">{item.person?<Avatar person={item.person} size="xs"/>:<Icon className="h-4 w-4"/>}</span>
  <span className="min-w-0 flex-1 truncate">{item.label}</span>{item.meta&&<span className="max-w-[180px] shrink-0 truncate text-xs text-muted-foreground">{item.meta}</span>}
</button>;}
