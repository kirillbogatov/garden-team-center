import * as React from 'react';
import * as AvatarPrimitive from '@radix-ui/react-avatar';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import * as SelectPrimitive from '@radix-ui/react-select';
import * as SeparatorPrimitive from '@radix-ui/react-separator';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import { Check, ChevronDown, Search, TriangleAlert, X } from 'lucide-react';
import { cn, initials } from '@/lib/utils';



function normalizeDropdownSearchValue(value) {
  return String(value || '').trim().toLowerCase().replace(/ё/g, 'е');
}

function extractNodeText(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractNodeText).join(' ');
  if (React.isValidElement(node)) return extractNodeText(node.props?.children);
  return '';
}

function filterCollectionChildren(children, query, itemTypes) {
  if (!query) return React.Children.toArray(children);
  const filtered = React.Children.toArray(children).map((child) => {
    if (!React.isValidElement(child)) return child;
    if (itemTypes.includes(child.type)) {
      const text = normalizeDropdownSearchValue(extractNodeText(child.props?.children));
      return text.includes(query) ? child : null;
    }
    if (child.type === React.Fragment) {
      const nested = filterCollectionChildren(child.props?.children, query, itemTypes);
      return nested.some(Boolean) ? React.cloneElement(child, undefined, nested) : null;
    }
    return child;
  }).filter(Boolean);

  const isSeparator = (child) => React.isValidElement(child) && child.props?.['data-dropdown-separator'];
  return filtered.filter((child, index, list) => {
    if (!isSeparator(child)) return true;
    if (index === 0 || index === list.length - 1) return false;
    return !isSeparator(list[index - 1]);
  });
}

function useDropdownFilterState() {
  const [query, setQuery] = React.useState('');
  const normalizedQuery = normalizeDropdownSearchValue(query);
  const onKeyDownCapture = React.useCallback((event) => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.target instanceof HTMLElement && ['INPUT', 'TEXTAREA'].includes(event.target.tagName)) return;
    if (event.key === 'Backspace') {
      if (!query) return;
      event.preventDefault();
      setQuery((current) => current.slice(0, -1));
      return;
    }
    if (event.key === 'Escape' && query) {
      event.preventDefault();
      event.stopPropagation();
      setQuery('');
      return;
    }
    if (event.key.length === 1) {
      event.preventDefault();
      setQuery((current) => `${current}${event.key}`);
    }
  }, [query]);
  const resetQuery = React.useCallback(() => setQuery(''), []);
  return { query, normalizedQuery, onKeyDownCapture, resetQuery };
}

function DropdownFilterHint({ query, onClear }) {
  if (!query) return null;
  return <div className="flex items-center gap-2 border-b px-2.5 py-2 text-[12px] text-muted-foreground"><Search className="h-3.5 w-3.5 shrink-0" /><span className="min-w-0 flex-1 truncate">Фильтр: <span className="font-medium text-foreground/90">{query}</span></span><button type="button" className="rounded px-1 py-0.5 text-[12px] font-medium hover:bg-muted hover:text-foreground" onMouseDown={(event) => event.preventDefault()} onClick={onClear}>Сбросить</button></div>;
}

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[12px] text-[14px] font-medium transition-[background-color,color,border-color,opacity] focus-visible:ring-2 focus-visible:ring-ring/25 disabled:pointer-events-none disabled:opacity-45 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'button-primary-soft border text-primary-foreground',
        secondary: 'border border-border bg-background text-foreground hover:bg-muted/65 active:bg-muted/80',
        outline: 'border border-border bg-background text-foreground hover:bg-muted/65',
        ghost: 'text-muted-foreground hover:bg-muted/65 hover:text-foreground',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
      },
      size: {
        default: 'h-10 px-4', sm: 'h-9 rounded-[10px] px-3 text-[13px]', lg: 'h-12 px-5 text-[16px]', icon: 'h-10 w-10', 'icon-sm': 'h-9 w-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button';
  return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
});
Button.displayName = 'Button';

export const Input = React.forwardRef(({ className, type, ...props }, ref) => {
  const baseClass = 'flex h-11 w-full rounded-[12px] border border-input bg-card px-4 py-2 text-[16px] transition-colors placeholder:text-muted-foreground/65 focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50';
  if (type === 'date') {
    // Keep the full-size field, but keep the native calendar button beside the date.
    // Using the native picker preserves keyboard access, localisation and showPicker behavior.
    return <div className={cn(baseClass, 'garden-date-field focus-within:border-ring', className)}>
      <input {...props} ref={ref} type="date" className="garden-date-field-input" />
    </div>;
  }
  return <input ref={ref} type={type} className={cn(baseClass, className)} {...props} />;
});
Input.displayName = 'Input';

// A form with a single text field saves on Enter (Shift+Enter keeps the newline).
const isSingleFieldForm = (form) => form && form.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]), textarea, select, [contenteditable=true]').length === 1;

export const Textarea = React.forwardRef(({ className, onKeyDown, ...props }, ref) => (
  <textarea ref={ref} onKeyDown={(event) => {
    onKeyDown?.(event);
    if (event.defaultPrevented || event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey || event.nativeEvent.isComposing) return;
    const form = event.currentTarget.form;
    if (!isSingleFieldForm(form)) return;
    event.preventDefault();
    form.requestSubmit();
  }} className={cn('flex min-h-[112px] w-full resize-y rounded-[12px] border border-input bg-card px-4 py-3 text-[16px] leading-6 placeholder:text-muted-foreground/65 focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50', className)} {...props} />
));
Textarea.displayName = 'Textarea';

export function Label({ className, ...props }) {
  return <label className={cn('text-[13px] font-medium text-muted-foreground', className)} {...props} />;
}

const badgeVariants = cva('inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-[14px] font-normal leading-none', {
  variants: {
    variant: {
      default: 'border-transparent bg-primary/10 text-accent-foreground',
      secondary: 'border-transparent bg-secondary text-secondary-foreground',
      outline: 'bg-background text-foreground',
      muted: 'border-transparent bg-muted text-muted-foreground',
      danger: 'border-transparent bg-destructive/10 text-red-700 dark:text-red-300',
      success: 'border-transparent bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
      warning: 'border-transparent bg-amber-500/10 text-amber-700 dark:text-amber-300',
    },
  }, defaultVariants: { variant: 'default' },
});
export function Badge({ className, variant, ...props }) { return <span className={cn(badgeVariants({ variant }), className)} {...props} />; }

export function Avatar({ person, size = 'md', className }) {
  const sizes = { xs: 'h-6 w-6 text-[12px]', sm: 'h-8 w-8 text-[12px]', md: 'h-9 w-9 text-[13px]', lg: 'h-11 w-11 text-[14px]', xl: 'h-16 w-16 text-[17px]' };
  const name = person?.name || person?.displayName || 'Пользователь';
  return (
    <AvatarPrimitive.Root className={cn('relative inline-flex shrink-0 overflow-hidden rounded-full bg-muted ring-1 ring-border', sizes[size], className)}>
      <AvatarPrimitive.Image src={person?.photoUrl || ''} alt={name} className="aspect-square h-full w-full object-cover" style={{ objectPosition: person?.photoPosition || '50% 50%' }} />
      <AvatarPrimitive.Fallback className="flex h-full w-full items-center justify-center bg-secondary font-semibold text-secondary-foreground">{initials(name)}</AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}

export const Separator = React.forwardRef(({ className, orientation = 'horizontal', ...props }, ref) => (
  <SeparatorPrimitive.Root ref={ref} decorative orientation={orientation} className={cn('shrink-0 bg-border', orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px', className)} {...props} />
));
Separator.displayName = 'Separator';

export function TooltipProvider({ children }) { return <TooltipPrimitive.Provider delayDuration={350}>{children}</TooltipPrimitive.Provider>; }
export function Tooltip({ children, content }) {
  return <TooltipPrimitive.Root><TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger><TooltipPrimitive.Portal><TooltipPrimitive.Content sideOffset={6} className="z-[80] rounded-[7px] border bg-popover px-2 py-1.5 text-xs text-popover-foreground shadow-quiet">{content}<TooltipPrimitive.Arrow className="fill-popover" /></TooltipPrimitive.Content></TooltipPrimitive.Portal></TooltipPrimitive.Root>;
}

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export function DialogContent({ className, children, ...props }) {
  return <DialogPrimitive.Portal><DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/20 backdrop-blur-[1px] data-[state=open]:animate-in data-[state=closed]:animate-out"/><DialogPrimitive.Content className={cn('fixed left-1/2 top-1/2 z-50 grid w-[calc(100%-32px)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-5 rounded-[24px] border bg-popover p-6 shadow-quiet', className)} {...props}>{children}<DialogPrimitive.Close className="absolute right-3 top-3 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4"/></DialogPrimitive.Close></DialogPrimitive.Content></DialogPrimitive.Portal>;
}
export function DialogHeader({ className, ...props }) { return <div className={cn('space-y-1.5 pr-8', className)} {...props}/>; }
export const DialogTitle = React.forwardRef((props, ref) => <DialogPrimitive.Title ref={ref} className="text-base font-semibold tracking-tight" {...props}/>);
DialogTitle.displayName = 'DialogTitle';
export const DialogDescription = React.forwardRef((props, ref) => <DialogPrimitive.Description ref={ref} className="text-sm text-muted-foreground" {...props}/>);
DialogDescription.displayName = 'DialogDescription';
export function DialogFooter({ className, ...props }) { return <div className={cn('mt-2 flex justify-end gap-2', className)} {...props}/>; }

export function AlertDialog({ open, onOpenChange, title, description, confirmLabel = 'Удалить', cancelLabel = 'Отмена', busyLabel = 'Удаляю…', destructive = true, onConfirm, busy = false }) {
  return <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
    <DialogContent className="max-w-sm">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>
      {description && <div className="text-sm text-muted-foreground">{description}</div>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>{cancelLabel}</Button>
        <Button type="button" variant={destructive ? 'destructive' : 'default'} onClick={onConfirm} disabled={busy}>{busy ? busyLabel : confirmLabel}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
export function DropdownMenuContent({ className, sideOffset = 6, children, ...props }) {
  const { query, normalizedQuery, onKeyDownCapture, resetQuery } = useDropdownFilterState();
  const filteredChildren = React.useMemo(() => filterCollectionChildren(children, normalizedQuery, [DropdownMenuItem]), [children, normalizedQuery]);
  return <DropdownMenuPrimitive.Portal><DropdownMenuPrimitive.Content sideOffset={sideOffset} onCloseAutoFocus={resetQuery} onKeyDownCapture={onKeyDownCapture} className={cn('z-[70] min-w-44 rounded-[8px] border bg-popover p-1 text-popover-foreground shadow-quiet', className)} {...props}><DropdownFilterHint query={query} onClear={resetQuery} />{filteredChildren.length ? filteredChildren : <div className="px-2.5 py-3 text-sm text-muted-foreground">Ничего не найдено</div>}</DropdownMenuPrimitive.Content></DropdownMenuPrimitive.Portal>;
}
export function DropdownMenuItem({ className, inset, ...props }) { return <DropdownMenuPrimitive.Item className={cn('flex cursor-default select-none items-center gap-2 rounded-md px-2.5 py-2 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50', inset && 'pl-8', className)} {...props}/>; }
export function DropdownMenuLabel({ className, ...props }) { return <DropdownMenuPrimitive.Label className={cn('px-2.5 py-1.5 text-xs font-medium text-muted-foreground', className)} {...props}/>; }
export const DropdownMenuSeparator = (props) => <DropdownMenuPrimitive.Separator data-dropdown-separator className="-mx-1 my-1 h-px bg-border" {...props}/>;

export const Select = SelectPrimitive.Root;
export const SelectValue = SelectPrimitive.Value;
export function SelectTrigger({ className, children, ...props }) { return <SelectPrimitive.Trigger className={cn('flex h-9 min-w-[120px] items-center justify-between gap-2 whitespace-nowrap rounded-[7px] border border-input bg-card px-3 text-[14px] outline-none focus:border-ring data-[placeholder]:text-muted-foreground [&>span:first-child]:min-w-0 [&>span:first-child]:truncate', className)} {...props}>{children}<SelectPrimitive.Icon className="shrink-0"><ChevronDown className="h-4 w-4 text-muted-foreground"/></SelectPrimitive.Icon></SelectPrimitive.Trigger>; }
export function SelectContent({ className, children, ...props }) {
  const { query, normalizedQuery, onKeyDownCapture, resetQuery } = useDropdownFilterState();
  const filteredChildren = React.useMemo(() => filterCollectionChildren(children, normalizedQuery, [SelectItem]), [children, normalizedQuery]);
  return <SelectPrimitive.Portal><SelectPrimitive.Content position="popper" sideOffset={5} onCloseAutoFocus={resetQuery} onKeyDownCapture={onKeyDownCapture} className={cn('z-[80] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-[8px] border bg-popover p-1 text-popover-foreground shadow-quiet', className)} {...props}><DropdownFilterHint query={query} onClear={resetQuery} /><SelectPrimitive.Viewport>{filteredChildren.length ? filteredChildren : <div className="px-2.5 py-3 text-sm text-muted-foreground">Ничего не найдено</div>}</SelectPrimitive.Viewport></SelectPrimitive.Content></SelectPrimitive.Portal>;
}
export const SelectSeparator = (props) => <SelectPrimitive.Separator data-dropdown-separator className="-mx-1 my-1 h-px bg-border" {...props}/>;
export function SelectItem({ className, children, ...props }) { return <SelectPrimitive.Item className={cn('relative flex cursor-default select-none items-center rounded-md py-2 pl-8 pr-3 text-sm outline-none focus:bg-accent focus:text-accent-foreground', className)} {...props}><span className="absolute left-2.5 flex h-3.5 w-3.5 items-center justify-center"><SelectPrimitive.ItemIndicator><Check className="h-3.5 w-3.5"/></SelectPrimitive.ItemIndicator></span><SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText></SelectPrimitive.Item>; }

export function ScrollArea({ className, children, ...props }) { return <ScrollAreaPrimitive.Root className={cn('relative overflow-hidden', className)} {...props}><ScrollAreaPrimitive.Viewport className="h-full w-full rounded-[inherit]">{children}</ScrollAreaPrimitive.Viewport><ScrollAreaPrimitive.Scrollbar orientation="vertical" className="flex w-2.5 touch-none select-none p-[1px]"><ScrollAreaPrimitive.Thumb className="relative flex-1 rounded-full bg-border"/></ScrollAreaPrimitive.Scrollbar><ScrollAreaPrimitive.Corner/></ScrollAreaPrimitive.Root>; }

export function Switch({ className, ...props }) { return <SwitchPrimitive.Root className={cn('peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent bg-input transition-colors data-[state=checked]:bg-primary', className)} {...props}><SwitchPrimitive.Thumb className="pointer-events-none block h-4 w-4 rounded-full bg-background shadow-sm transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0"/></SwitchPrimitive.Root>; }

export function Skeleton({ className }) { return <div className={cn('animate-pulse rounded-md bg-muted', className)}/>; }

export function ErrorState({ error, onRetry, title = 'Не удалось загрузить данные' }) {
  const offline = !error?.status;
  const description = offline ? 'Нет связи с сервером. Проверьте, что Garden запущен, и повторите попытку.' : `Сервер ответил ошибкой ${error.status}. Данные не потеряны, повторите попытку.`;
  return <div role="alert" className="flex min-h-52 flex-col items-center justify-center border-y border-dashed px-8 py-10 text-center"><div className="mb-4 rounded-full bg-muted p-3"><TriangleAlert className="h-5 w-5 text-muted-foreground"/></div><h3 className="font-medium">{title}</h3><p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>{onRetry && <Button className="mt-4" variant="outline" onClick={onRetry}>Повторить</Button>}</div>;
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return <div className="flex min-h-52 flex-col items-center justify-center border-y border-dashed px-8 py-10 text-center">{Icon && <div className="mb-4 rounded-full bg-muted p-3"><Icon className="h-5 w-5 text-muted-foreground"/></div>}<h3 className="font-medium">{title}</h3>{description && <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>}{action && <div className="mt-5">{action}</div>}</div>;
}
