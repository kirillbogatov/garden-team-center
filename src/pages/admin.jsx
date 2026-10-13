import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, KeyRound, Pencil, Plus, ShieldCheck, Trash2, UserCog } from 'lucide-react';
import { Page, PageHeader } from '@/components/page';
import { AlertDialog, Avatar, Badge, Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, EmptyState, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Skeleton, Switch } from '@/components/ui';
import { useEndpoint, useResource } from '@/hooks/use-resource';
import { useCrudDialogForm } from '@/hooks/use-crud-dialog-form';
import { api } from '@/lib/api';

const ROLE_OPTIONS = [['member','Сотрудник'],['teamlead','Тимлид'],['admin','Администратор']];
const LEVEL_CONTROLS = {
  none:{available:false,own:'read',foreign:'none'}, own_read:{available:true,own:'read',foreign:'none'}, own_manage:{available:true,own:'edit',foreign:'none'},
  all_read:{available:true,own:'read',foreign:'read'}, all_own_manage:{available:true,own:'edit',foreign:'read'}, all_manage:{available:true,own:'edit',foreign:'edit'},
};
function levelFromControls({available,own,foreign}) { if(!available)return'none'; if(foreign==='edit')return'all_manage'; if(foreign==='read')return own==='edit'?'all_own_manage':'all_read'; return own==='edit'?'own_manage':'own_read'; }
function rolesOf(user){return Array.isArray(user?.roles)&&user.roles.length?user.roles:[user?.role||'member'];}
function adminError(err){const code=err?.data?.error;return({invalid_username:'Логин: 3–40 символов, латиница, цифры, точка, дефис или подчёркивание.',username_exists:'Такой логин уже используется.',display_name_required:'Укажите имя пользователя.',last_admin:'Нельзя отключить или снять роль администратора у последнего активного администратора.',cannot_delete_self:'Нельзя удалить собственную учётную запись.',person_required:'Для учётной записи без роли администратора нужно выбрать профиль сотрудника.',invalid_person:'Выбранный профиль не найден.',person_already_linked:'Этот профиль уже связан с другой активной учётной записью.'})[code]||'Не удалось сохранить изменения.';}
function dateLabel(value){if(!value)return'Ещё не входил';try{return new Intl.DateTimeFormat('ru-RU',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value));}catch{return value;}}

function TemporaryPasswordDialog({value,onClose}){
  if(!value)return null;
  return <Dialog open onOpenChange={(open)=>!open&&onClose()}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{value.title}</DialogTitle></DialogHeader><p className="text-sm text-muted-foreground">Передайте временный пароль пользователю. После первого входа Garden попросит его сменить.</p><div className="mt-2 rounded-lg bg-muted/60 px-4 py-3"><div className="text-xs text-muted-foreground">@{value.user.username}</div><div className="mt-1 font-mono text-lg font-semibold tracking-wide">{value.password}</div></div><DialogFooter><Button variant="outline" onClick={async()=>{try{await navigator.clipboard.writeText(value.password);}catch{}}}><Copy className="h-4 w-4"/>Копировать</Button><Button onClick={onClose}>Готово</Button></DialogFooter></DialogContent></Dialog>;
}

function UserDialog({user,users,people,currentUserId,schema,onClose,onSaved,onTemp}){
  const linked=new Set(users.filter((item)=>item.active&&item.id!==user?.id&&item.personId).map((item)=>item.personId));
  const isEdit = Boolean(user?.id);
  const { draft, field, saving, error, save, confirmOpen, setConfirmOpen } = useCrudDialogForm({
    resource: 'admin/users', open: true, item: user,
    onOpenChange: (next) => !next && onClose(),
    buildDraft: (current) => ({
      name: current?.displayName || '',
      username: current?.username || '',
      roles: new Set(rolesOf(current)),
      personId: current?.personId || 'none',
      active: current?.active !== false,
    }),
    validate: (d) => (!d.roles.size ? 'Выберите хотя бы одну роль.' : null),
    buildPayload: (d) => {
      const payload = { displayName: d.name.trim(), username: d.username.trim(), roles: [...d.roles], personId: d.personId === 'none' ? null : d.personId };
      if (isEdit) payload.active = d.active;
      return payload;
    },
    onSaved: async (result) => { await onSaved(); if (!isEdit) onTemp({ title: 'Учётная запись создана', user: result.user, password: result.temporaryPassword }); },
    mapSaveError: (e) => adminError(e),
  });
  const toggleRole = (role) => { const next = new Set(draft.roles || []); next.has(role) ? next.delete(role) : next.add(role); field('roles', next); };
  const [actionBusy, setActionBusy] = React.useState(false);
  const [actionError, setActionError] = React.useState('');
  const reset=async()=>{setActionBusy(true);try{const result=await api.post(`/api/admin/users/${user.id}/reset-password`,{});onTemp({title:'Пароль сброшен',user:result.user,password:result.temporaryPassword});}catch(err){setActionError(adminError(err));}finally{setActionBusy(false)}};
  const remove=async()=>{setActionBusy(true);try{await api.del(`/api/admin/users/${user.id}`);await onSaved();onClose();}catch(err){setActionError(adminError(err));}finally{setActionBusy(false);setConfirmOpen(false);}};
  const busy = saving || actionBusy;
  const displayError = error || actionError;
  return <Dialog open onOpenChange={(open)=>!open&&onClose()}><DialogContent className="max-w-xl"><DialogHeader><DialogTitle>{user ? 'Редактировать учётную запись' : 'Добавить учётную запись'}</DialogTitle></DialogHeader><div className="space-y-4">
    <div><Label>Имя</Label><Input value={draft.name||''} onChange={(e)=>field('name',e.target.value)} placeholder="Как показывать в Garden"/></div>
    <div><Label>Логин</Label><Input value={draft.username||''} onChange={(e)=>field('username',e.target.value)} placeholder="например, kirill" autoComplete="off"/></div>
    <div><Label>Роли</Label><div className="mt-2 flex flex-wrap gap-3">{ROLE_OPTIONS.map(([id,label])=><label key={id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.roles?.has(id) || false} onChange={()=>toggleRole(id)}/>{label}</label>)}</div><p className="mt-1 text-xs text-muted-foreground">Можно выбрать несколько ролей одновременно. Администратор всегда получает полный доступ.</p></div>
    <div><Label>Профиль сотрудника</Label><Select value={draft.personId||'none'} onValueChange={(value)=>field('personId',value)}><SelectTrigger className="w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">Без профиля</SelectItem>{people.filter((p)=>p.type==='team').map((p)=><SelectItem key={p.id} value={p.id} disabled={linked.has(p.id)}>{p.name}{linked.has(p.id)?' · уже связан':''}</SelectItem>)}</SelectContent></Select><p className="mt-1 text-xs text-muted-foreground">Если нет роли администратора, профиль сотрудника обязателен.</p></div>
    {user&&<div className="flex items-center justify-between rounded-lg border px-3 py-2"><div><div className="text-sm font-medium">Доступ разрешён</div><div className="text-xs text-muted-foreground">Отключение завершит активные сессии пользователя.</div></div><Switch checked={draft.active} onCheckedChange={(value)=>field('active',value)}/></div>}
    {displayError&&<div className="text-sm text-destructive">{displayError}</div>}
  </div><DialogFooter className="mt-4 justify-between sm:justify-between"><div>{user&&user.id!==currentUserId&&<Button variant="destructive" onClick={()=>setConfirmOpen(true)} disabled={busy}><Trash2 className="h-4 w-4"/>Удалить</Button>}</div><div className="flex gap-2">{user&&<Button variant="outline" onClick={reset} disabled={busy}><KeyRound className="h-4 w-4"/>Сбросить пароль</Button>}<Button variant="outline" onClick={onClose}>Отмена</Button><Button onClick={save} disabled={busy}>{user?'Сохранить':'Создать'}</Button></div></DialogFooter></DialogContent>
    <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen} title={`Удалить учётную запись «${user?.displayName}»? Рабочие данные Garden удалены не будут.`} onConfirm={remove} busy={busy}/>
  </Dialog>;
}

function PermissionsDialog({user,schema,onClose,onSaved}){
  const [permissions,setPermissions]=React.useState(()=>({...user.permissions}));const [busy,setBusy]=React.useState(false);
  const admin=rolesOf(user).includes('admin');
  const save=async()=>{setBusy(true);try{await api.put(`/api/admin/users/${user.id}`,{permissions});await onSaved();onClose();}finally{setBusy(false)}};
  return <Dialog open onOpenChange={(open)=>!open&&onClose()}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Права доступа — {user.displayName}</DialogTitle></DialogHeader><p className="text-sm text-muted-foreground">Роли задают базовый доступ. Здесь можно выдать дополнительные права конкретной учётной записи.</p>{admin&&<div className="rounded-lg bg-muted/60 p-3 text-sm">Роль «Администратор» уже даёт полный доступ. Дополнительные настройки сохраняются, но не ограничивают администратора.</div>}<div className="max-h-[48vh] space-y-2 overflow-auto py-2">{(schema?.permissions||[]).map((perm)=><label key={perm.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50"><input type="checkbox" checked={Boolean(permissions[perm.id])} onChange={(e)=>setPermissions((p)=>({...p,[perm.id]:e.target.checked}))}/><span>{perm.label}</span></label>)}</div><DialogFooter><Button variant="outline" onClick={onClose}>Отмена</Button><Button onClick={save} disabled={busy}>Сохранить</Button></DialogFooter></DialogContent></Dialog>;
}

export function AdminPage(){
  const users=useEndpoint('/api/admin/users'); const schema=useEndpoint('/api/admin/access-schema'); const me=useEndpoint('/api/auth/me'); const people=useResource('people'); const navigate=useNavigate();
  const [editing,setEditing]=React.useState(null); const [permissionsFor,setPermissionsFor]=React.useState(null); const [temp,setTemp]=React.useState(null);
  if(users.error?.status===403)return <Page narrow><EmptyState icon={ShieldCheck} title="Нет доступа" description="Администрирование доступно только администраторам."/></Page>;
  return <Page><PageHeader title="Учётные записи" actions={<div className="flex gap-2"><Button variant="outline" onClick={()=>navigate('/admin/roles')}><ShieldCheck className="h-4 w-4"/>Права ролей</Button><Button onClick={()=>setEditing({__new:true})}><Plus className="h-4 w-4"/>Добавить пользователя</Button></div>}/>
    <div className="mb-5 text-sm leading-6 text-muted-foreground">Роли задают область видимости и уровень управления для разделов. Индивидуальные права могут дополнительно расширить доступ конкретной учётной записи.</div>
    {users.loading?<Skeleton className="h-64"/>:<div className="divide-y border-y">{(users.data||[]).map((u)=>{const person=people.data.find((p)=>p.id===u.personId);return <div key={u.id} className={`grid grid-cols-[minmax(0,1fr)_160px_130px_auto] items-center gap-4 py-3 ${u.active?'':'opacity-60'}`}><div className="flex min-w-0 items-center gap-3"><Avatar person={{name:u.displayName}} size="sm"/><div className="min-w-0"><div className="truncate text-sm font-medium">{u.displayName}</div><div className="truncate text-xs text-muted-foreground">@{u.username} · {rolesOf(u).map((r)=>ROLE_OPTIONS.find(([id])=>id===r)?.[1]||r).join(', ')}{person?` · ${person.name}`:''}{u.mustChangePassword?' · временный пароль':''}</div></div></div><div className="text-xs text-muted-foreground">{dateLabel(u.lastLoginAt)}</div><Badge variant={u.active?'success':'muted'}>{u.active?'Активен':'Отключён'}</Badge><div className="flex gap-1"><Button variant="ghost" size="sm" onClick={()=>setPermissionsFor(u)}><UserCog className="h-4 w-4"/>Права</Button><Button variant="ghost" size="sm" onClick={()=>setEditing(u)}><Pencil className="h-4 w-4"/>Изменить</Button></div></div>})}</div>}
    {editing&&<UserDialog user={editing.__new?null:editing} users={users.data||[]} people={people.data} currentUserId={me.data?.user?.id} schema={schema.data} onClose={()=>setEditing(null)} onSaved={users.reload} onTemp={setTemp}/>} 
    {permissionsFor&&<PermissionsDialog user={permissionsFor} schema={schema.data} onClose={()=>setPermissionsFor(null)} onSaved={users.reload}/>}<TemporaryPasswordDialog value={temp} onClose={()=>setTemp(null)}/>
  </Page>;
}

export function AdminRoleAccessPage(){
  const schemaState=useEndpoint('/api/admin/access-schema'); const navigate=useNavigate(); const [role,setRole]=React.useState('member'); const [draft,setDraft]=React.useState(null); const [saving,setSaving]=React.useState(false);
  React.useEffect(()=>{if(schemaState.data&&!draft){setDraft(structuredClone(schemaState.data.rolePolicies||{}));if(!schemaState.data.roles?.some((r)=>r.id===role))setRole(schemaState.data.roles?.[0]?.id||'member');}},[schemaState.data]);
  if(schemaState.error?.status===403)return <Page narrow><EmptyState icon={ShieldCheck} title="Нет доступа" description="Администрирование доступно только администраторам."/></Page>;
  if(schemaState.loading||!draft)return <Page><Skeleton className="h-72"/></Page>;
  const schema=schemaState.data; const isAdmin=role==='admin'; const policy=draft[role]||{};
  const patchArea=(areaId,field,value)=>setDraft((current)=>{const next=structuredClone(current);const controls={...LEVEL_CONTROLS[(next[role]||{})[areaId]||'none']};controls[field]=value;if(field==='available'&&!value){controls.own='read';controls.foreign='none';}if(controls.foreign==='edit')controls.own='edit';next[role]=next[role]||{};next[role][areaId]=levelFromControls(controls);return next;});
  const save=async()=>{setSaving(true);try{const saved=await api.put('/api/admin/role-policies',{rolePolicies:draft});setDraft(structuredClone(saved.rolePolicies||draft));}finally{setSaving(false)}};
  return <Page><PageHeader title="Права ролей" actions={<div className="flex gap-2"><Button variant="outline" onClick={()=>navigate('/admin')}>Назад</Button><Button onClick={save} disabled={saving}>Сохранить</Button></div>}/><div className="mb-5 max-w-xs"><Label>Роль</Label><Select value={role} onValueChange={setRole}><SelectTrigger className="w-full"><SelectValue/></SelectTrigger><SelectContent>{schema.roles.map((r)=><SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>)}</SelectContent></Select></div><p className="mb-5 text-sm text-muted-foreground">«Свои записи» определяются по авторству и связи с сотрудником. Администратор всегда имеет полный доступ.</p><div className="overflow-x-auto border-y"><table className="w-full min-w-[760px] text-sm"><thead className="text-left text-xs text-muted-foreground"><tr><th className="py-3 pr-4">Раздел</th><th className="px-3 py-3">Доступ</th><th className="px-3 py-3">Свои записи</th><th className="px-3 py-3">Чужие записи</th></tr></thead><tbody className="divide-y">{schema.areas.map((area)=>{const controls=LEVEL_CONTROLS[isAdmin?'all_manage':policy[area.id]||'none'];return <tr key={area.id}><td className="py-3 pr-4 font-medium">{area.label}</td><td className="px-3 py-2"><select className="h-9 rounded-md border bg-background px-2" disabled={isAdmin} value={controls.available?'1':'0'} onChange={(e)=>patchArea(area.id,'available',e.target.value==='1')}><option value="1">Доступен</option><option value="0">Недоступен</option></select></td><td className="px-3 py-2"><select className="h-9 rounded-md border bg-background px-2" disabled={isAdmin||!controls.available} value={controls.own} onChange={(e)=>patchArea(area.id,'own',e.target.value)}><option value="read">Только просмотр</option><option value="edit">Редактирование</option></select></td><td className="px-3 py-2"><select className="h-9 rounded-md border bg-background px-2" disabled={isAdmin||!controls.available} value={controls.foreign} onChange={(e)=>patchArea(area.id,'foreign',e.target.value)}><option value="none">Недоступно</option><option value="read">Только просмотр</option><option value="edit">Редактирование</option></select></td></tr>})}</tbody></table></div>{isAdmin&&<div className="mt-4 rounded-lg bg-muted/60 p-3 text-sm">Администратор всегда имеет полный доступ ко всем разделам. Эти настройки нельзя ограничить.</div>}</Page>;
}
