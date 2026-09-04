// Общая механика папок для каталогов Документы и Инструменты.
function resourceFolderConfig(kind) {
  return kind === 'documents'
    ? { resource:Resources.docFolders, items:Resources.documents, state:'_documentsFolder', render:()=>Views.documents(), label:'Документы' }
    : { resource:Resources.toolFolders, items:Resources.tools, state:'_toolsFolder', render:()=>Views.tools(), label:'Инструменты' };
}
function resourceFolderOptionsHtml(folders, selected, parentId = null, depth = 0) {
  return folders.filter((f)=>(f.parentId||null)===(parentId||null)).sort((a,b)=>a.title.localeCompare(b.title,'ru')).map((f)=>`<option value="${f.id}" ${f.id===selected?'selected':''}>${'— '.repeat(depth)}${escapeHtml(f.title)}</option>${resourceFolderOptionsHtml(folders, selected, f.id, depth+1)}`).join('');
}
function resourceFolderTreeHtml(kind, folders, items, selected, parentId = null, depth = 0) {
  const cfg=resourceFolderConfig(kind);
  return folders.filter((f)=>(f.parentId||null)===(parentId||null)).sort((a,b)=>a.title.localeCompare(b.title,'ru')).map((f)=>{
    const count=items.filter((x)=>x.folderId===f.id).length;
    return `<div class="kb-tree-node"><button class="ui-row ui-row--tree kb-tree-row ${selected===f.id?'active':''}" style="--kb-depth:${depth}" data-view-state="${cfg.state}" data-view-value="${f.id}" data-view-render="${kind==='documents'?'documents':'tools'}"><span class="kb-folder-mark">${icon('projects',13)}</span><span class="kb-tree-title">${escapeHtml(f.title)}</span><span>${count||''}</span></button>${resourceFolderTreeHtml(kind,folders,items,selected,f.id,depth+1)}</div>`;
  }).join('');
}
function resourceFolderLayoutHtml(kind, folders, items, selected, selectedFolder, filtered, rowRenderer, one, two, five) {
  const cfg=resourceFolderConfig(kind);
  return `<div class="kb-layout"><aside class="kb-tree-panel">
    <button class="ui-row ui-row--tree kb-tree-row kb-tree-all ${selected==='all'?'active':''}" data-view-state="${cfg.state}" data-view-value="all" data-view-render="${kind==='documents'?'documents':'tools'}">Все <span>${items.length}</span></button>
    <div class="kb-tree">${resourceFolderTreeHtml(kind,folders,items,selected)}</div>
  </aside><section class="kb-main"><div class="kb-section-head"><div><h2>${escapeHtml(selectedFolder?.title||cfg.label)}</h2><div class="tiny">${filtered.length} ${pluralRu(filtered.length,one,two,five)}</div></div>${selectedFolder?`<button class="ui-button ui-button--sm btn btn-sm" data-command="openResourceFolderModal" data-command-arg="${kind}" data-command-arg2="${selectedFolder.id}">${icon('edit',13)} Редактировать папку</button>`:''}</div>
    <div>${filtered.length?filtered.map(rowRenderer).join(''):`<div class="zen-empty">В этой папке пока ничего нет</div>`}</div>
  </section></div>`;
}
function resourceDescendantIds(folders,parentId,out=new Set()){for(const f of folders.filter((x)=>x.parentId===parentId)){if(out.has(f.id))continue;out.add(f.id);resourceDescendantIds(folders,f.id,out);}return out;}
async function openResourceFolderModal(kind,id){
  const cfg=resourceFolderConfig(kind); const [folders,items]=await Promise.all([cfg.resource.list(),cfg.items.list()]); const current=id?folders.find((f)=>f.id===id):null;
  const blocked=current?resourceDescendantIds(folders,current.id):new Set(); if(current)blocked.add(current.id);
  Modal.open(`<h2>${current?'Редактировать папку':'Новая папка'}</h2><div class="ui-field field"><label class="ui-field-label field-label" for="rf-title">Название</label><input id="rf-title" value="${escapeHtml(current?.title||'')}" autofocus /></div><div class="ui-field field"><label class="ui-field-label field-label" for="rf-parent">Родительская папка</label><select id="rf-parent"><option value="">Корень</option>${folders.filter((f)=>!blocked.has(f.id)).map((f)=>`<option value="${f.id}" ${current?.parentId===f.id?'selected':''}>${escapeHtml(f.title)}</option>`).join('')}</select></div><div class="ui-modal-actions modal-actions">${current?`<button class="ui-button ui-button--danger btn btn-danger btn-push-left" id="rf-delete">${icon('trash',14)} Удалить</button>`:''}<button class="ui-button btn" data-modal-close>Отмена</button><button class="ui-button ui-button--primary btn btn-primary" id="rf-save">Сохранить</button></div>`);
  document.getElementById('rf-save').onclick=async()=>{const title=document.getElementById('rf-title').value.trim();if(!title){toast('Укажите название папки');return;}const body={title,parentId:document.getElementById('rf-parent').value||null};if(current)await cfg.resource.update(current.id,body);else await cfg.resource.create(body);Modal.close();cfg.render();};
  if(current)document.getElementById('rf-delete').onclick=async()=>{if(folders.some((f)=>f.parentId===current.id)||items.some((x)=>x.folderId===current.id)){toast('Сначала переместите содержимое и вложенные папки');return;}if(!(await confirmAction('Удалить папку?')))return;await cfg.resource.remove(current.id);Views[cfg.state]='all';Modal.close();cfg.render();};
}

