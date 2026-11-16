(() => {
  const TAG_PALETTE = [
    '#6366f1', '#ec4899', '#10b981', '#f59e0b',
    '#06b6d4', '#8b5cf6', '#ef4444', '#84cc16',
    '#f97316', '#14b8a6',
  ];

  const state = {
    currentFolder: '',
    recursive: false,
    recentFolders: [],
    images: [],
    tags: [],
    groups: [],
    collections: [],
    imageTags: {},

    // Active view & dynamic filter
    view: 'all', // 'all' | 'untagged'
    activeCollectionId: null,
    mode: 'AND', // 'AND' | 'OR'
    includeTags: [],
    excludeTags: [],
    search: '',
    sortField: 'name', // 'name' | 'date' | 'size' | 'tags'
    sortDir: 'asc',    // 'asc' | 'desc'

    // Selection & UI
    tagsViewMode: 'flat', // 'flat' | 'grouped'
    collapsedSidebarGroups: new Set(),
    expandedCardGroups: new Set(),
    expandedLightboxGroups: new Set(),
    editingTagId: null,
    draggedTagId: null,
    selectedPaths: new Set(),
    lastSelectedIndex: null,
    lightboxIndex: -1,
    lightboxList: [],
    popoverImagePath: null,

    // Folder browser modal state
    browserPath: '',
    browserParentPath: '',
  };

  // DOM helpers
  const $ = (id) => document.getElementById(id);

  const els = {
    btnOpenFolder: $('btn-open-folder'),
    btnEmptyChoose: $('btn-empty-choose'),
    currentFolderText: $('current-folder-text'),
    chkRecursive: $('chk-recursive'),
    searchInput: $('search-input'),
    btnClearSearch: $('btn-clear-search'),
    thumbSize: $('thumb-size'),
    btnShutdown: $('btn-shutdown'),

    navAll: $('nav-all'),
    navUntagged: $('nav-untagged'),
    countAll: $('count-all'),
    countUntagged: $('count-untagged'),

    collectionsList: $('collections-list'),
    collectionsEmpty: $('collections-empty'),
    btnNewCollection: $('btn-new-collection'),

    btnTagsFlat: $('btn-tags-flat'),
    btnTagsGrouped: $('btn-tags-grouped'),
    createTagForm: $('create-tag-form'),
    newTagColor: $('new-tag-color'),
    newTagName: $('new-tag-name'),
    createGroupForm: $('create-group-form'),
    newGroupName: $('new-group-name'),
    tagGroupsDatalist: $('tag-groups-datalist'),
    tagsList: $('tags-list'),
    tagsEmpty: $('tags-empty'),

    btnModeAnd: $('btn-mode-and'),
    btnModeOr: $('btn-mode-or'),
    activeFilterChips: $('active-filter-chips'),
    resultsCount: $('results-count'),
    sortField: $('sort-field'),
    btnSortDir: $('btn-sort-dir'),
    btnRandomAll: $('btn-random-all'),
    btnRandomFiltered: $('btn-random-filtered'),
    btnSelectAll: $('btn-select-all'),
    btnSaveCollection: $('btn-save-collection'),
    btnResetFilter: $('btn-reset-filter'),

    batchBar: $('batch-bar'),
    selectedCount: $('selected-count'),
    btnClearSelection: $('btn-clear-selection'),
    batchTagSelect: $('batch-tag-select'),
    btnBatchAddTag: $('btn-batch-add-tag'),
    btnBatchRemoveTag: $('btn-batch-remove-tag'),
    batchQuickTagForm: $('batch-quick-tag-form'),
    batchNewTagInput: $('batch-new-tag-input'),

    emptyState: $('empty-state'),
    galleryGrid: $('gallery-grid'),

    popover: $('quick-tag-popover'),
    popoverInput: $('popover-tag-input'),
    popoverList: $('popover-tag-list'),

    folderModal: $('folder-modal'),
    folderPathInput: $('folder-path-input'),
    btnGoPath: $('btn-go-path'),
    btnNativePick: $('btn-native-pick'),
    btnFolderUp: $('btn-folder-up'),
    folderBrowserCurrent: $('folder-browser-current'),
    folderBrowserList: $('folder-browser-list'),
    recentFoldersList: $('recent-folders-list'),
    modalChkRecursive: $('modal-chk-recursive'),
    btnConfirmFolder: $('btn-confirm-folder'),

    collectionModal: $('collection-modal'),
    collectionForm: $('collection-form'),
    collectionNameInput: $('collection-name-input'),
    collectionSummary: $('collection-summary'),

    lightboxModal: $('lightbox-modal'),
    lightboxClose: $('lightbox-close'),
    lightboxPrev: $('lightbox-prev'),
    lightboxNext: $('lightbox-next'),
    lightboxImg: $('lightbox-img'),
    lightboxFilename: $('lightbox-filename'),
    lightboxPath: $('lightbox-path'),
    lightboxDimensions: $('lightbox-dimensions'),
    lightboxSize: $('lightbox-size'),
    lightboxAddTagForm: $('lightbox-add-tag-form'),
    lightboxTagInput: $('lightbox-tag-input'),
    lightboxTagsList: $('lightbox-tags-list'),

    tagEditModal: $('tag-edit-modal'),
    tagEditForm: $('tag-edit-form'),
    editTagName: $('edit-tag-name'),
    editTagGroup: $('edit-tag-group'),
    editTagColor: $('edit-tag-color'),

    confirmModal: $('confirm-modal'),
    confirmTitle: $('confirm-title'),
    confirmMessage: $('confirm-message'),
    btnConfirmCancel: $('btn-confirm-cancel'),
    btnConfirmOk: $('btn-confirm-ok'),

    toastContainer: $('toast-container'),
  };

  async function api(url, options = {}) {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `Ошибка сервера (${res.status})`);
    }
    return data;
  }

  function showToast(message, isError = false) {
    const toast = document.createElement('div');
    toast.className = `toast${isError ? ' error' : ''}`;
    toast.textContent = message;
    els.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.remove();
    }, 3200);
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 Б';
    const units = ['Б', 'КБ', 'МБ', 'ГБ'];
    let idx = 0;
    let val = bytes;
    while (val >= 1024 && idx < units.length - 1) {
      val /= 1024;
      idx++;
    }
    return `${val.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
  }

  function getTagMap() {
    const map = new Map();
    for (const tag of state.tags) {
      map.set(tag.id, tag);
    }
    return map;
  }

  function getImageTagIds(imgPath) {
    return state.imageTags[imgPath] || [];
  }

  function matchesRule(img, rule) {
    const tagIds = getImageTagIds(img.path);
    const tagSet = new Set(tagIds);

    if (rule.view === 'untagged' && tagIds.length > 0) {
      return false;
    }

    const include = rule.includeTags || [];
    const exclude = rule.excludeTags || [];

    if (exclude.some((id) => tagSet.has(id))) {
      return false;
    }

    if (include.length > 0) {
      if (rule.mode === 'OR') {
        if (!include.some((id) => tagSet.has(id))) return false;
      } else {
        if (!include.every((id) => tagSet.has(id))) return false;
      }
    }

    if (rule.search && rule.search.trim()) {
      const q = rule.search.trim().toLowerCase();
      if (!img.name.toLowerCase().includes(q) && !(img.relativePath || '').toLowerCase().includes(q)) {
        return false;
      }
    }

    return true;
  }

  function getFilteredImages() {
    const list = state.images.filter((img) => matchesRule(img, state));
    const dir = state.sortDir === 'desc' ? -1 : 1;

    list.sort((a, b) => {
      let cmp = 0;
      if (state.sortField === 'date') {
        cmp = (a.mtimeMs || 0) - (b.mtimeMs || 0);
      } else if (state.sortField === 'size') {
        cmp = (a.size || 0) - (b.size || 0);
      } else if (state.sortField === 'tags') {
        cmp = getImageTagIds(a.path).length - getImageTagIds(b.path).length;
      } else {
        cmp = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
      }

      if (cmp !== 0) return cmp * dir;
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    });

    return list;
  }

  function nextPaletteColor() {
    const idx = state.tags.length % TAG_PALETTE.length;
    return TAG_PALETTE[idx];
  }

  // --- Mutations ---

  async function selectFolder(folderPath, recursive = state.recursive) {
    try {
      const data = await api('/api/folder/select', {
        method: 'POST',
        body: JSON.stringify({ path: folderPath, recursive }),
      });
      state.currentFolder = data.currentFolder;
      state.recursive = data.recursive;
      state.recentFolders = data.recentFolders;
      state.images = data.images;
      state.tags = data.tags;
      state.groups = data.groups || [];
      state.collections = data.collections;
      state.imageTags = data.imageTags;
      state.selectedPaths.clear();
      state.lastSelectedIndex = null;
      closeModal('folder-modal');
      renderAll();
      showToast(`Загружено изображений: ${data.images.length}`);
    } catch (err) {
      showToast(err.message, true);
    }
  }

  function getTagGroups() {
    const groups = new Set(state.groups || []);
    for (const tag of state.tags) {
      if (tag.group && tag.group.trim()) {
        groups.add(tag.group.trim());
      }
    }
    return Array.from(groups).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  }

  function updateTagGroupsDatalist() {
    if (!els.tagGroupsDatalist) return;
    els.tagGroupsDatalist.innerHTML = '';
    for (const g of getTagGroups()) {
      const opt = document.createElement('option');
      opt.value = g;
      els.tagGroupsDatalist.appendChild(opt);
    }
  }

  async function createGroup(name) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const data = await api('/api/groups', {
      method: 'POST',
      body: JSON.stringify({ name: trimmed }),
    });
    state.groups = data.groups || [];
    state.tagsViewMode = 'grouped';
    state.collapsedSidebarGroups.delete(trimmed);
    renderSidebar();
    showToast(`Группа «${trimmed}» создана`);
  }

  async function assignTagGroup(tagId, groupName) {
    const tag = state.tags.find((t) => t.id === tagId);
    const nextGroup = (groupName || '').trim();
    if (!tag || (tag.group || '') === nextGroup) return;
    try {
      const data = await api(`/api/tags/${encodeURIComponent(tagId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ group: nextGroup }),
      });
      state.tags = data.tags;
      state.groups = data.groups || state.groups;
      renderAll();
      if (state.lightboxIndex >= 0) renderLightboxSidebar();
      showToast(nextGroup ? `Тэг «${tag.name}» добавлен в группу «${nextGroup}»` : `Тэг «${tag.name}» убран из группы`);
    } catch (err) {
      showToast(err.message, true);
    }
  }

  async function createTag(name, color, group = '') {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const existing = state.tags.find((t) => t.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) return existing;

    const data = await api('/api/tags', {
      method: 'POST',
      body: JSON.stringify({
        name: trimmed,
        color: color || nextPaletteColor(),
        group: typeof group === 'string' ? group.trim() : '',
      }),
    });
    state.tags = data.tags;
    state.groups = data.groups || state.groups;
    els.newTagColor.value = nextPaletteColor();
    return data.tag;
  }

  function openTagEditModal(tag) {
    state.editingTagId = tag.id;
    els.editTagName.value = tag.name;
    els.editTagGroup.value = tag.group || '';
    els.editTagColor.value = tag.color || '#6366f1';
    updateTagGroupsDatalist();
    openModal('tag-edit-modal');
    els.editTagName.focus();
    els.editTagName.select();
  }

  async function saveTagEdit() {
    const id = state.editingTagId;
    if (!id) return;
    try {
      const data = await api(`/api/tags/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: els.editTagName.value.trim(),
          group: els.editTagGroup.value.trim(),
          color: els.editTagColor.value,
        }),
      });
      state.tags = data.tags;
      state.groups = data.groups || state.groups;
      state.editingTagId = null;
      closeModal('tag-edit-modal');
      renderAll();
      if (state.lightboxIndex >= 0) renderLightboxSidebar();
      if (state.popoverImagePath) renderPopoverList();
      showToast(`Тэг «${data.tag.name}» обновлён`);
    } catch (err) {
      showToast(err.message, true);
    }
  }

  async function renameTag(tagId, newName) {
    const trimmed = newName.trim();
    if (!trimmed) {
      renderAll();
      return;
    }
    const existing = state.tags.find((t) => t.id === tagId);
    if (!existing || existing.name === trimmed) {
      renderAll();
      return;
    }
    try {
      const data = await api(`/api/tags/${encodeURIComponent(tagId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: trimmed }),
      });
      state.tags = data.tags;
      renderAll();
      if (state.lightboxIndex >= 0) renderLightboxSidebar();
      if (state.popoverImagePath) renderPopoverList();
      showToast(`Тэг переименован в «${trimmed}»`);
    } catch (err) {
      renderAll();
      showToast(err.message, true);
    }
  }

  function startTagRename(tag, leftContainer, nameEl) {
    if (leftContainer.querySelector('.tag-rename-input')) return;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'tag-rename-input';
    input.value = tag.name;

    let cancelled = false;
    let finished = false;
    const finish = (save) => {
      if (finished) return;
      finished = true;
      if (save && !cancelled) {
        renameTag(tag.id, input.value);
      } else {
        renderAll();
      }
    };

    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        finish(true);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelled = true;
        finish(false);
      }
    });
    input.addEventListener('blur', () => finish(true));

    nameEl.replaceWith(input);
    input.focus();
    input.select();
  }

  async function deleteTag(tagId) {
    try {
      const data = await api(`/api/tags/${encodeURIComponent(tagId)}`, { method: 'DELETE' });
      state.tags = data.tags;
      state.imageTags = data.imageTags;
      state.collections = data.collections;
      state.includeTags = state.includeTags.filter((id) => id !== tagId);
      state.excludeTags = state.excludeTags.filter((id) => id !== tagId);
      renderAll();
      showToast('Тэг удалён');
    } catch (err) {
      showToast(err.message, true);
    }
  }

  async function updateImagesTags(paths, addTagIds = [], removeTagIds = []) {
    if (!paths.length) return;
    try {
      const data = await api('/api/images/tags', {
        method: 'POST',
        body: JSON.stringify({ paths, addTagIds, removeTagIds }),
      });
      state.imageTags = data.imageTags;
      renderAll();
      if (state.lightboxIndex >= 0) {
        renderLightboxSidebar();
      }
      if (state.popoverImagePath) {
        renderPopoverList();
      }
    } catch (err) {
      showToast(err.message, true);
    }
  }

  async function saveCollection(name) {
    try {
      const data = await api('/api/collections', {
        method: 'POST',
        body: JSON.stringify({
          name,
          mode: state.mode,
          includeTags: state.includeTags,
          excludeTags: state.excludeTags,
          search: state.search,
        }),
      });
      state.collections = data.collections;
      state.activeCollectionId = data.collection.id;
      closeModal('collection-modal');
      renderAll();
      showToast(`Коллекция «${data.collection.name}» сохранена`);
    } catch (err) {
      showToast(err.message, true);
    }
  }

  async function deleteCollection(id) {
    try {
      const data = await api(`/api/collections/${encodeURIComponent(id)}`, { method: 'DELETE' });
      state.collections = data.collections;
      if (state.activeCollectionId === id) {
        state.activeCollectionId = null;
      }
      renderAll();
      showToast('Коллекция удалена');
    } catch (err) {
      showToast(err.message, true);
    }
  }

  // --- Filter helpers ---

  function toggleIncludeTag(tagId) {
    state.activeCollectionId = null;
    state.view = 'all';
    state.excludeTags = state.excludeTags.filter((id) => id !== tagId);
    if (state.includeTags.includes(tagId)) {
      state.includeTags = state.includeTags.filter((id) => id !== tagId);
    } else {
      state.includeTags = [...state.includeTags, tagId];
    }
    renderAll();
  }

  function toggleExcludeTag(tagId) {
    state.activeCollectionId = null;
    state.view = 'all';
    state.includeTags = state.includeTags.filter((id) => id !== tagId);
    if (state.excludeTags.includes(tagId)) {
      state.excludeTags = state.excludeTags.filter((id) => id !== tagId);
    } else {
      state.excludeTags = [...state.excludeTags, tagId];
    }
    renderAll();
  }

  function resetFilters() {
    state.view = 'all';
    state.activeCollectionId = null;
    state.includeTags = [];
    state.excludeTags = [];
    state.search = '';
    els.searchInput.value = '';
    els.btnClearSearch.classList.add('hidden');
    renderAll();
  }

  function applyCollection(col) {
    state.view = 'all';
    state.activeCollectionId = col.id;
    state.mode = col.mode === 'OR' ? 'OR' : 'AND';
    state.includeTags = [...(col.includeTags || [])];
    state.excludeTags = [...(col.excludeTags || [])];
    state.search = col.search || '';
    els.searchInput.value = state.search;
    els.btnClearSearch.classList.toggle('hidden', !state.search);
    renderAll();
  }

  // --- Renderers ---

  function renderTopbar() {
    els.currentFolderText.textContent = state.currentFolder || 'Папка не выбрана';
    els.currentFolderText.title = state.currentFolder || '';
    els.chkRecursive.checked = state.recursive;
  }

  function renderSidebar() {
    // Counts
    els.countAll.textContent = state.images.length;
    let untaggedCount = 0;
    const tagCounts = new Map();
    for (const img of state.images) {
      const ids = getImageTagIds(img.path);
      if (ids.length === 0) untaggedCount++;
      for (const id of ids) {
        tagCounts.set(id, (tagCounts.get(id) || 0) + 1);
      }
    }
    els.countUntagged.textContent = untaggedCount;

    els.navAll.classList.toggle('active', state.view === 'all' && !state.activeCollectionId);
    els.navUntagged.classList.toggle('active', state.view === 'untagged');

    // Dynamic Collections
    els.collectionsList.innerHTML = '';
    els.collectionsEmpty.classList.toggle('hidden', state.collections.length > 0);
    for (const col of state.collections) {
      const matchCount = state.images.filter((img) =>
        matchesRule(img, {
          view: 'all',
          mode: col.mode,
          includeTags: col.includeTags,
          excludeTags: col.excludeTags,
          search: col.search,
        })
      ).length;

      const item = document.createElement('div');
      item.className = `collection-item${state.activeCollectionId === col.id ? ' active' : ''}`;
      item.addEventListener('click', () => applyCollection(col));

      const main = document.createElement('div');
      main.className = 'collection-item-main';

      const modeBadge = document.createElement('span');
      modeBadge.className = 'collection-mode';
      modeBadge.textContent = col.mode === 'OR' ? 'ИЛИ' : 'И';

      const nameEl = document.createElement('span');
      nameEl.className = 'collection-name';
      nameEl.textContent = col.name;
      nameEl.title = col.name;

      main.append(modeBadge, nameEl);

      const actions = document.createElement('div');
      actions.className = 'collection-actions';

      const countBadge = document.createElement('span');
      countBadge.className = 'badge';
      countBadge.textContent = matchCount;

      const delBtn = document.createElement('button');
      delBtn.className = 'icon-btn collection-delete';
      delBtn.textContent = '✕';
      delBtn.title = 'Удалить коллекцию';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteCollection(col.id);
      });

      actions.append(countBadge, delBtn);
      item.append(main, actions);
      els.collectionsList.appendChild(item);
    }

    // Tags List
    updateTagGroupsDatalist();
    els.btnTagsFlat.classList.toggle('active', state.tagsViewMode === 'flat');
    els.btnTagsGrouped.classList.toggle('active', state.tagsViewMode === 'grouped');
    els.tagsList.innerHTML = '';
    const allGroups = getTagGroups();
    els.tagsEmpty.classList.toggle('hidden', state.tags.length > 0 || (state.tagsViewMode === 'grouped' && allGroups.length > 0));

    const buildTagRow = (tag, showGroupBadge) => {
      const isIncluded = state.includeTags.includes(tag.id);
      const isExcluded = state.excludeTags.includes(tag.id);

      const row = document.createElement('div');
      row.className = `tag-row${isIncluded ? ' included' : ''}${isExcluded ? ' excluded' : ''}`;
      row.draggable = true;
      row.addEventListener('dragstart', (e) => {
        state.draggedTagId = tag.id;
        row.classList.add('dragging');
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', tag.id);
        }
      });
      row.addEventListener('dragend', () => {
        state.draggedTagId = null;
        row.classList.remove('dragging');
        document.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'));
      });
      row.addEventListener('click', () => toggleIncludeTag(tag.id));

      const left = document.createElement('div');
      left.className = 'tag-row-left';

      const dot = document.createElement('span');
      dot.className = 'tag-dot';
      dot.style.background = tag.color;

      const nameEl = document.createElement('span');
      nameEl.className = 'tag-row-name';
      nameEl.textContent = tag.name;
      nameEl.title = 'Двойной клик — переименовать';
      nameEl.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        startTagRename(tag, left, nameEl);
      });

      left.append(dot, nameEl);
      if (showGroupBadge && tag.group) {
        const gBadge = document.createElement('span');
        gBadge.className = 'tag-group-badge';
        gBadge.textContent = tag.group;
        gBadge.title = `Группа: ${tag.group}`;
        left.appendChild(gBadge);
      }

      const right = document.createElement('div');
      right.className = 'tag-row-right';

      const excludeBtn = document.createElement('button');
      excludeBtn.className = 'tag-action-btn tag-exclude-btn';
      excludeBtn.textContent = '−';
      excludeBtn.title = 'Исключить этот тэг из фильтра';
      excludeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleExcludeTag(tag.id);
      });

      const editBtn = document.createElement('button');
      editBtn.className = 'tag-action-btn';
      editBtn.textContent = '✎';
      editBtn.title = 'Редактировать тэг (имя, группа, цвет)';
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openTagEditModal(tag);
      });

      const delBtn = document.createElement('button');
      delBtn.className = 'tag-action-btn';
      delBtn.textContent = '✕';
      delBtn.title = 'Удалить тэг';
      delBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const usedCount = tagCounts.get(tag.id) || 0;
        const msg = usedCount > 0
          ? `Вы уверены, что хотите удалить тэг «${tag.name}»? Он будет снят с ${usedCount} изображений.`
          : `Вы уверены, что хотите удалить тэг «${tag.name}»?`;
        const confirmed = await askConfirm({
          title: 'Удаление тэга',
          message: msg,
          okText: 'Удалить',
        });
        if (confirmed) {
          deleteTag(tag.id);
        }
      });

      const countBadge = document.createElement('span');
      countBadge.className = 'badge';
      countBadge.textContent = tagCounts.get(tag.id) || 0;

      right.append(excludeBtn, editBtn, delBtn, countBadge);
      row.append(left, right);
      return row;
    };

    if (state.tagsViewMode === 'grouped') {
      const groupedMap = new Map();
      for (const g of allGroups) {
        groupedMap.set(g, []);
      }
      const ungrouped = [];
      for (const tag of state.tags) {
        const g = (tag.group || '').trim();
        if (!g) {
          ungrouped.push(tag);
        } else {
          if (!groupedMap.has(g)) groupedMap.set(g, []);
          groupedMap.get(g).push(tag);
        }
      }

      const sortedGroups = Array.from(groupedMap.keys()).sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
      );

      for (const groupName of sortedGroups) {
        const groupTags = groupedMap.get(groupName);
        const isCollapsed = state.collapsedSidebarGroups.has(groupName);

        const block = document.createElement('div');
        block.className = 'tag-group-block';

        block.addEventListener('dragover', (e) => {
          if (!state.draggedTagId) return;
          e.preventDefault();
          block.classList.add('drag-over');
        });
        block.addEventListener('dragleave', (e) => {
          if (!block.contains(e.relatedTarget)) {
            block.classList.remove('drag-over');
          }
        });
        block.addEventListener('drop', (e) => {
          e.preventDefault();
          block.classList.remove('drag-over');
          const draggedId = state.draggedTagId || e.dataTransfer?.getData('text/plain');
          if (draggedId) {
            assignTagGroup(draggedId, groupName);
          }
        });

        const header = document.createElement('button');
        header.type = 'button';
        header.className = 'tag-group-header';
        header.addEventListener('click', () => {
          if (state.collapsedSidebarGroups.has(groupName)) {
            state.collapsedSidebarGroups.delete(groupName);
          } else {
            state.collapsedSidebarGroups.add(groupName);
          }
          renderSidebar();
        });

        const titleSpan = document.createElement('span');
        titleSpan.textContent = `${isCollapsed ? '▸' : '▾'} ${groupName}`;

        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = groupTags.length;

        header.append(titleSpan, badge);
        block.appendChild(header);

        if (!isCollapsed) {
          const itemsWrap = document.createElement('div');
          itemsWrap.className = 'tag-group-items';
          for (const tag of groupTags) {
            itemsWrap.appendChild(buildTagRow(tag, false));
          }
          block.appendChild(itemsWrap);
        }

        els.tagsList.appendChild(block);
      }

      const ungroupedZone = document.createElement('div');
      ungroupedZone.className = 'ungrouped-dropzone';
      ungroupedZone.addEventListener('dragover', (e) => {
        if (!state.draggedTagId) return;
        e.preventDefault();
        ungroupedZone.classList.add('drag-over');
      });
      ungroupedZone.addEventListener('dragleave', (e) => {
        if (!ungroupedZone.contains(e.relatedTarget)) {
          ungroupedZone.classList.remove('drag-over');
        }
      });
      ungroupedZone.addEventListener('drop', (e) => {
        e.preventDefault();
        ungroupedZone.classList.remove('drag-over');
        const draggedId = state.draggedTagId || e.dataTransfer?.getData('text/plain');
        if (draggedId) {
          assignTagGroup(draggedId, '');
        }
      });

      for (const tag of ungrouped) {
        ungroupedZone.appendChild(buildTagRow(tag, false));
      }
      els.tagsList.appendChild(ungroupedZone);
    } else {
      for (const tag of state.tags) {
        els.tagsList.appendChild(buildTagRow(tag, true));
      }
    }

    // Update batch tag dropdown
    const prevVal = els.batchTagSelect.value;
    els.batchTagSelect.innerHTML = '<option value="">— Выберите тэг —</option>';
    for (const tag of state.tags) {
      const opt = document.createElement('option');
      opt.value = tag.id;
      opt.textContent = tag.name;
      els.batchTagSelect.appendChild(opt);
    }
    if (prevVal && state.tags.some((t) => t.id === prevVal)) {
      els.batchTagSelect.value = prevVal;
    }
  }

  function renderFilterBar(filteredImages) {
    els.btnModeAnd.classList.toggle('active', state.mode === 'AND');
    els.btnModeOr.classList.toggle('active', state.mode === 'OR');

    const tagMap = getTagMap();
    els.activeFilterChips.innerHTML = '';

    const hasRules =
      state.includeTags.length > 0 ||
      state.excludeTags.length > 0 ||
      state.search.trim().length > 0 ||
      state.view === 'untagged';

    if (!hasRules) {
      const placeholder = document.createElement('span');
      placeholder.className = 'filter-placeholder';
      placeholder.textContent = 'Выберите тэги слева для динамической фильтрации';
      els.activeFilterChips.appendChild(placeholder);
    } else {
      if (state.view === 'untagged') {
        const chip = document.createElement('span');
        chip.className = 'filter-chip';
        chip.textContent = 'Без тэгов';
        els.activeFilterChips.appendChild(chip);
      }

      for (const id of state.includeTags) {
        const tag = tagMap.get(id);
        if (!tag) continue;
        const chip = document.createElement('span');
        chip.className = 'filter-chip include';

        const dot = document.createElement('span');
        dot.className = 'tag-dot';
        dot.style.background = tag.color;

        const label = document.createElement('span');
        label.textContent = `+ ${tag.name}`;

        const btn = document.createElement('button');
        btn.textContent = '✕';
        btn.addEventListener('click', () => toggleIncludeTag(id));

        chip.append(dot, label, btn);
        els.activeFilterChips.appendChild(chip);
      }

      for (const id of state.excludeTags) {
        const tag = tagMap.get(id);
        if (!tag) continue;
        const chip = document.createElement('span');
        chip.className = 'filter-chip exclude';

        const dot = document.createElement('span');
        dot.className = 'tag-dot';
        dot.style.background = tag.color;

        const label = document.createElement('span');
        label.textContent = `− ${tag.name}`;

        const btn = document.createElement('button');
        btn.textContent = '✕';
        btn.addEventListener('click', () => toggleExcludeTag(id));

        chip.append(dot, label, btn);
        els.activeFilterChips.appendChild(chip);
      }
    }

    els.resultsCount.textContent = `${filteredImages.length} из ${state.images.length}`;
    const canSave = (state.includeTags.length > 0 || state.excludeTags.length > 0 || state.search.trim().length > 0) && !state.activeCollectionId;
    els.btnSaveCollection.classList.toggle('hidden', !canSave);
    els.btnResetFilter.classList.toggle('hidden', !hasRules);
  }

  function renderBatchBar() {
    const count = state.selectedPaths.size;
    els.selectedCount.textContent = count;
    els.batchBar.classList.toggle('hidden', count === 0);
  }

  function renderGallery(filteredImages) {
    els.galleryGrid.innerHTML = '';

    if (!state.currentFolder) {
      els.emptyState.classList.remove('hidden');
      els.emptyState.querySelector('h2').textContent = 'Выберите папку с картинками';
      els.emptyState.querySelector('p').textContent =
        'Нажмите «Выбрать папку» вверху, чтобы загрузить изображения и начать расставлять тэги.';
      els.btnEmptyChoose.classList.remove('hidden');
      return;
    }

    if (filteredImages.length === 0) {
      els.emptyState.classList.remove('hidden');
      els.emptyState.querySelector('h2').textContent =
        state.images.length === 0 ? 'В этой папке нет изображений' : 'Нет совпадений по фильтру';
      els.emptyState.querySelector('p').textContent =
        state.images.length === 0
          ? 'Поддерживаются форматы JPG, PNG, WebP, GIF, BMP, SVG, AVIF.'
          : 'Попробуйте изменить выбранные тэги, режим И/ИЛИ или строку поиска.';
      els.btnEmptyChoose.classList.toggle('hidden', state.images.length > 0);
      return;
    }

    els.emptyState.classList.add('hidden');
    const tagMap = getTagMap();
    const frag = document.createDocumentFragment();

    filteredImages.forEach((img, idx) => {
      const isSelected = state.selectedPaths.has(img.path);
      const card = document.createElement('div');
      card.className = `image-card${isSelected ? ' selected' : ''}`;

      const thumbWrap = document.createElement('div');
      thumbWrap.className = 'card-thumb-wrap';
      thumbWrap.addEventListener('click', () => openLightbox(idx));

      const imageEl = document.createElement('img');
      imageEl.loading = 'lazy';
      imageEl.alt = img.name;
      imageEl.src = `/api/image?path=${encodeURIComponent(img.path)}`;

      const selectBtn = document.createElement('button');
      selectBtn.className = 'card-select-btn';
      selectBtn.textContent = isSelected ? '✓' : '';
      selectBtn.title = 'Выбрать (Shift+клик — диапазон)';
      selectBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleSelectCard(idx, filteredImages, e.shiftKey);
      });

      thumbWrap.append(imageEl, selectBtn);

      const body = document.createElement('div');
      body.className = 'card-body';

      const title = document.createElement('div');
      title.className = 'card-title';
      title.textContent = img.name;
      title.title = img.relativePath || img.name;

      const tagsWrap = document.createElement('div');
      tagsWrap.className = 'card-tags';

      const imgTagIds = getImageTagIds(img.path);
      const imgTagSet = new Set(imgTagIds);
      const ungroupedTags = [];
      const assignedGroups = new Map();

      for (const tid of imgTagIds) {
        const tag = tagMap.get(tid);
        if (!tag) continue;
        const g = (tag.group || '').trim();
        if (!g) {
          ungroupedTags.push(tag);
        } else {
          if (!assignedGroups.has(g)) assignedGroups.set(g, []);
          assignedGroups.get(g).push(tag);
        }
      }

      // Render grouped tags on card (collapsible/expandable)
      for (const [groupName, assignedInGroup] of assignedGroups.entries()) {
        const expandKey = `${img.path}::${groupName}`;
        const isExpanded = state.expandedCardGroups.has(expandKey);

        if (!isExpanded) {
          const gPill = document.createElement('button');
          gPill.type = 'button';
          gPill.className = 'group-pill';
          gPill.title = `Раскрыть группу «${groupName}»`;
          gPill.textContent = `▸ ${groupName} (${assignedInGroup.length})`;
          gPill.addEventListener('click', (e) => {
            e.stopPropagation();
            state.expandedCardGroups.add(expandKey);
            renderAll();
          });
          tagsWrap.appendChild(gPill);
        } else {
          const box = document.createElement('div');
          box.className = 'card-group-expanded';

          const header = document.createElement('div');
          header.className = 'card-group-expanded-header';
          header.textContent = `▾ ${groupName}`;
          header.title = 'Свернуть группу';
          header.addEventListener('click', (e) => {
            e.stopPropagation();
            state.expandedCardGroups.delete(expandKey);
            renderAll();
          });

          const listEl = document.createElement('div');
          listEl.className = 'card-group-expanded-tags';
          const allGroupTags = state.tags.filter((t) => (t.group || '').trim() === groupName);
          for (const gTag of allGroupTags) {
            const active = imgTagSet.has(gTag.id);
            const tBtn = document.createElement('button');
            tBtn.type = 'button';
            tBtn.className = `card-group-tag-btn${active ? ' active' : ''}`;
            tBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              if (active) {
                updateImagesTags([img.path], [], [gTag.id]);
              } else {
                updateImagesTags([img.path], [gTag.id], []);
              }
            });

            const dot = document.createElement('span');
            dot.className = 'tag-dot';
            dot.style.background = gTag.color;
            const label = document.createElement('span');
            label.textContent = gTag.name;
            tBtn.append(dot, label);
            listEl.appendChild(tBtn);
          }

          box.append(header, listEl);
          tagsWrap.appendChild(box);
        }
      }

      // Render ungrouped tags as before
      for (const tag of ungroupedTags) {
        const pill = document.createElement('span');
        pill.className = 'tag-pill';
        pill.style.borderColor = `${tag.color}66`;

        const dot = document.createElement('span');
        dot.className = 'tag-dot';
        dot.style.background = tag.color;

        const nameSpan = document.createElement('span');
        nameSpan.className = 'tag-pill-name';
        nameSpan.textContent = tag.name;

        const remBtn = document.createElement('button');
        remBtn.className = 'tag-pill-remove';
        remBtn.textContent = '✕';
        remBtn.title = 'Убрать тэг';
        remBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          updateImagesTags([img.path], [], [tag.id]);
        });

        pill.append(dot, nameSpan, remBtn);
        tagsWrap.appendChild(pill);
      }

      const addBtn = document.createElement('button');
      addBtn.className = 'card-add-tag-btn';
      addBtn.textContent = '+';
      addBtn.title = 'Добавить / снять тэг';
      addBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openQuickTagPopover(img.path, addBtn);
      });

      tagsWrap.appendChild(addBtn);
      body.append(title, tagsWrap);
      card.append(thumbWrap, body);
      frag.appendChild(card);
    });

    els.galleryGrid.appendChild(frag);
  }

  function renderAll() {
    const filtered = getFilteredImages();
    renderTopbar();
    renderSidebar();
    renderFilterBar(filtered);
    renderBatchBar();
    renderGallery(filtered);
  }

  function toggleSelectCard(index, filteredImages, isShift) {
    const targetPath = filteredImages[index].path;
    if (isShift && state.lastSelectedIndex !== null) {
      const start = Math.min(state.lastSelectedIndex, index);
      const end = Math.max(state.lastSelectedIndex, index);
      for (let i = start; i <= end; i++) {
        state.selectedPaths.add(filteredImages[i].path);
      }
    } else {
      if (state.selectedPaths.has(targetPath)) {
        state.selectedPaths.delete(targetPath);
      } else {
        state.selectedPaths.add(targetPath);
      }
      state.lastSelectedIndex = index;
    }
    renderAll();
  }

  // --- Quick Tag Popover ---

  function openQuickTagPopover(imagePath, anchorEl) {
    state.popoverImagePath = imagePath;
    els.popoverInput.value = '';
    els.popover.classList.remove('hidden');

    const rect = anchorEl.getBoundingClientRect();
    const popW = 230;
    const popH = 260;
    let left = rect.left;
    let top = rect.bottom + 6;
    if (left + popW > window.innerWidth - 12) {
      left = window.innerWidth - popW - 12;
    }
    if (top + popH > window.innerHeight - 12) {
      top = Math.max(12, rect.top - popH - 6);
    }
    els.popover.style.left = `${left}px`;
    els.popover.style.top = `${top}px`;

    renderPopoverList();
    els.popoverInput.focus();
  }

  function closeQuickTagPopover() {
    state.popoverImagePath = null;
    els.popover.classList.add('hidden');
  }

  function renderPopoverList() {
    if (!state.popoverImagePath) return;
    const query = els.popoverInput.value.trim().toLowerCase();
    const assigned = new Set(getImageTagIds(state.popoverImagePath));

    els.popoverList.innerHTML = '';
    const matching = state.tags.filter((t) => !query || t.name.toLowerCase().includes(query));

    for (const tag of matching) {
      const hasTag = assigned.has(tag.id);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'popover-item';
      btn.addEventListener('click', () => {
        if (hasTag) {
          updateImagesTags([state.popoverImagePath], [], [tag.id]);
        } else {
          updateImagesTags([state.popoverImagePath], [tag.id], []);
        }
      });

      const left = document.createElement('span');
      left.className = 'popover-item-left';
      const dot = document.createElement('span');
      dot.className = 'tag-dot';
      dot.style.background = tag.color;
      const name = document.createElement('span');
      name.textContent = tag.name;
      left.append(dot, name);

      const check = document.createElement('span');
      check.textContent = hasTag ? '✓' : '';
      btn.append(left, check);
      els.popoverList.appendChild(btn);
    }

    if (query && !state.tags.some((t) => t.name.toLowerCase() === query)) {
      const createBtn = document.createElement('button');
      createBtn.type = 'button';
      createBtn.className = 'popover-item';
      createBtn.textContent = `＋ Создать «${els.popoverInput.value.trim()}»`;
      createBtn.addEventListener('click', async () => {
        try {
          const newTag = await createTag(els.popoverInput.value.trim());
          if (newTag) {
            await updateImagesTags([state.popoverImagePath], [newTag.id], []);
            els.popoverInput.value = '';
          }
        } catch (err) {
          showToast(err.message, true);
        }
      });
      els.popoverList.appendChild(createBtn);
    }
  }

  // --- Modals ---

  function openModal(id) {
    $(id).classList.remove('hidden');
  }

  function closeModal(id) {
    $(id).classList.add('hidden');
  }

  function askConfirm({ title = 'Подтверждение', message = 'Вы уверены?', okText = 'Удалить' } = {}) {
    return new Promise((resolve) => {
      els.confirmTitle.textContent = title;
      els.confirmMessage.textContent = message;
      els.btnConfirmOk.textContent = okText;
      openModal('confirm-modal');

      const cleanup = (result) => {
        els.btnConfirmOk.removeEventListener('click', onOk);
        els.btnConfirmCancel.removeEventListener('click', onCancel);
        els.confirmModal.querySelector('.modal-backdrop').removeEventListener('click', onCancel);
        els.confirmModal.querySelector('[data-close="confirm-modal"]').removeEventListener('click', onCancel);
        document.removeEventListener('keydown', onKey);
        closeModal('confirm-modal');
        resolve(result);
      };

      const onOk = () => cleanup(true);
      const onCancel = () => cleanup(false);
      const onKey = (e) => {
        if (e.key === 'Escape') cleanup(false);
        if (e.key === 'Enter') cleanup(true);
      };

      els.btnConfirmOk.addEventListener('click', onOk);
      els.btnConfirmCancel.addEventListener('click', onCancel);
      els.confirmModal.querySelector('.modal-backdrop').addEventListener('click', onCancel);
      els.confirmModal.querySelector('[data-close="confirm-modal"]').addEventListener('click', onCancel);
      document.addEventListener('keydown', onKey);
      els.btnConfirmOk.focus();
    });
  }

  // --- Folder Browser Modal ---

  async function loadBrowserDir(targetPath = '') {
    try {
      const data = await api(`/api/fs/list?path=${encodeURIComponent(targetPath)}`);
      state.browserPath = data.currentPath;
      state.browserParentPath = data.parentPath;
      els.folderPathInput.value = data.currentPath;
      els.folderBrowserCurrent.textContent = data.currentPath || 'Компьютер (Диски)';
      els.btnFolderUp.disabled = data.isRoot;
      els.btnConfirmFolder.disabled = !data.currentPath;

      els.folderBrowserList.innerHTML = '';
      for (const dir of data.directories) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'folder-entry';
        btn.textContent = `📁 ${dir.name}`;
        btn.addEventListener('click', () => loadBrowserDir(dir.path));
        els.folderBrowserList.appendChild(btn);
      }
      if (data.directories.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty-hint';
        empty.textContent = 'Нет подпапок';
        els.folderBrowserList.appendChild(empty);
      }
    } catch (err) {
      showToast(err.message, true);
    }
  }

  function openFolderBrowser() {
    els.modalChkRecursive.checked = state.recursive;
    els.recentFoldersList.innerHTML = '';
    if (state.recentFolders.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-hint';
      empty.textContent = 'Пока нет недавних папок';
      els.recentFoldersList.appendChild(empty);
    } else {
      for (const folder of state.recentFolders) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'folder-entry';
        btn.textContent = `🕘 ${folder}`;
        btn.title = folder;
        btn.addEventListener('click', () => selectFolder(folder, els.modalChkRecursive.checked));
        els.recentFoldersList.appendChild(btn);
      }
    }
    openModal('folder-modal');
    loadBrowserDir(state.currentFolder || '');
  }

  // --- Lightbox ---

  function openLightbox(index, customList = null) {
    const list = customList || getFilteredImages();
    if (index < 0 || index >= list.length) return;
    state.lightboxList = list;
    state.lightboxIndex = index;
    const img = list[index];

    els.lightboxImg.src = `/api/image?path=${encodeURIComponent(img.path)}`;
    els.lightboxFilename.textContent = img.name;
    els.lightboxPath.textContent = img.relativePath || img.path;
    els.lightboxSize.textContent = formatBytes(img.size);
    els.lightboxDimensions.textContent = 'Загрузка...';
    els.lightboxImg.onload = () => {
      els.lightboxDimensions.textContent = `${els.lightboxImg.naturalWidth} × ${els.lightboxImg.naturalHeight}`;
    };

    els.lightboxPrev.disabled = index === 0;
    els.lightboxNext.disabled = index === list.length - 1;
    renderLightboxSidebar();
    openModal('lightbox-modal');
  }

  function openRandomImage(list, emptyMessage) {
    if (!list || list.length === 0) {
      showToast(emptyMessage, true);
      return;
    }
    const randIndex = Math.floor(Math.random() * list.length);
    openLightbox(randIndex, list);
  }

  function renderLightboxSidebar() {
    const img = state.lightboxList[state.lightboxIndex];
    if (!img) return;
    const assigned = new Set(getImageTagIds(img.path));

    els.lightboxTagsList.innerHTML = '';
    if (state.tags.length === 0) {
      const hint = document.createElement('div');
      hint.className = 'empty-hint';
      hint.textContent = 'Создайте первый тэг выше';
      els.lightboxTagsList.appendChild(hint);
      return;
    }

    const buildToggleBtn = (tag) => {
      const isActive = assigned.has(tag.id);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `lightbox-tag-toggle${isActive ? ' active' : ''}`;
      btn.addEventListener('click', () => {
        if (isActive) {
          updateImagesTags([img.path], [], [tag.id]);
        } else {
          updateImagesTags([img.path], [tag.id], []);
        }
      });

      const left = document.createElement('span');
      left.className = 'popover-item-left';
      const dot = document.createElement('span');
      dot.className = 'tag-dot';
      dot.style.background = tag.color;
      const label = document.createElement('span');
      label.textContent = tag.name;
      left.append(dot, label);

      const mark = document.createElement('span');
      mark.textContent = isActive ? '✓' : '+';
      btn.append(left, mark);
      return btn;
    };

    const groupedMap = new Map();
    const ungrouped = [];
    for (const tag of state.tags) {
      const g = (tag.group || '').trim();
      if (!g) {
        ungrouped.push(tag);
      } else {
        if (!groupedMap.has(g)) groupedMap.set(g, []);
        groupedMap.get(g).push(tag);
      }
    }

    const sortedGroups = Array.from(groupedMap.keys()).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
    );

    for (const groupName of sortedGroups) {
      const groupTags = groupedMap.get(groupName);
      const assignedCount = groupTags.filter((t) => assigned.has(t.id)).length;
      const isExpanded = state.expandedLightboxGroups.has(groupName);

      const block = document.createElement('div');
      block.className = 'tag-group-block';

      const header = document.createElement('button');
      header.type = 'button';
      header.className = 'tag-group-header';
      header.addEventListener('click', () => {
        if (state.expandedLightboxGroups.has(groupName)) {
          state.expandedLightboxGroups.delete(groupName);
        } else {
          state.expandedLightboxGroups.add(groupName);
        }
        renderLightboxSidebar();
      });

      const titleSpan = document.createElement('span');
      titleSpan.textContent = `${isExpanded ? '▾' : '▸'} ${groupName}`;

      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = `${assignedCount}/${groupTags.length}`;

      header.append(titleSpan, badge);
      block.appendChild(header);

      if (isExpanded) {
        const itemsWrap = document.createElement('div');
        itemsWrap.className = 'tag-group-items';
        for (const tag of groupTags) {
          itemsWrap.appendChild(buildToggleBtn(tag));
        }
        block.appendChild(itemsWrap);
      }

      els.lightboxTagsList.appendChild(block);
    }

    for (const tag of ungrouped) {
      els.lightboxTagsList.appendChild(buildToggleBtn(tag));
    }
  }

  function closeLightbox() {
    state.lightboxIndex = -1;
    state.lightboxList = [];
    els.lightboxImg.src = '';
    closeModal('lightbox-modal');
  }

  function openCollectionModal() {
    const tagMap = getTagMap();
    const parts = [];
    parts.push(`Логика: ${state.mode === 'OR' ? 'ИЛИ (любой из выбранных)' : 'И (все выбранные)'}`);
    if (state.includeTags.length) {
      const names = state.includeTags.map((id) => tagMap.get(id)?.name).filter(Boolean);
      parts.push(`Включить: ${names.join(', ')}`);
    }
    if (state.excludeTags.length) {
      const names = state.excludeTags.map((id) => tagMap.get(id)?.name).filter(Boolean);
      parts.push(`Исключить: ${names.join(', ')}`);
    }
    if (state.search.trim()) {
      parts.push(`Поиск: «${state.search.trim()}»`);
    }
    els.collectionSummary.textContent = parts.join(' • ');
    els.collectionNameInput.value = '';
    openModal('collection-modal');
    els.collectionNameInput.focus();
  }

  // --- Event Bindings ---

  function bindEvents() {
    els.btnOpenFolder.addEventListener('click', openFolderBrowser);
    els.btnEmptyChoose.addEventListener('click', openFolderBrowser);

    els.chkRecursive.addEventListener('change', () => {
      if (state.currentFolder) {
        selectFolder(state.currentFolder, els.chkRecursive.checked);
      } else {
        state.recursive = els.chkRecursive.checked;
      }
    });

    els.searchInput.addEventListener('input', () => {
      state.activeCollectionId = null;
      state.search = els.searchInput.value;
      els.btnClearSearch.classList.toggle('hidden', !state.search);
      renderAll();
    });

    els.btnClearSearch.addEventListener('click', () => {
      state.search = '';
      els.searchInput.value = '';
      els.btnClearSearch.classList.add('hidden');
      renderAll();
    });

    els.thumbSize.addEventListener('input', () => {
      document.documentElement.style.setProperty('--thumb-size', `${els.thumbSize.value}px`);
    });

    els.btnShutdown.addEventListener('click', async () => {
      const confirmed = await askConfirm({
        title: 'Завершение работы',
        message: 'Остановить локальный сервер PictureTagger? Несохранённых изменений нет — все тэги уже записаны.',
        okText: 'Завершить',
      });
      if (!confirmed) return;
      try {
        await api('/api/shutdown', { method: 'POST' });
        document.body.innerHTML =
          '<div class="empty-state" style="height:100vh">' +
          '<div class="empty-state-icon">⏻</div>' +
          '<h2>PictureTagger остановлен</h2>' +
          '<p>Локальный сервер завершил работу. Эту вкладку можно закрыть.</p>' +
          '</div>';
      } catch (err) {
        showToast(err.message, true);
      }
    });

    els.navAll.addEventListener('click', () => {
      state.view = 'all';
      state.activeCollectionId = null;
      renderAll();
    });

    els.navUntagged.addEventListener('click', () => {
      state.view = 'untagged';
      state.activeCollectionId = null;
      state.includeTags = [];
      state.excludeTags = [];
      renderAll();
    });

    els.btnTagsFlat.addEventListener('click', () => {
      state.tagsViewMode = 'flat';
      renderSidebar();
    });

    els.btnTagsGrouped.addEventListener('click', () => {
      state.tagsViewMode = 'grouped';
      renderSidebar();
    });

    els.tagEditForm.addEventListener('submit', (e) => {
      e.preventDefault();
      saveTagEdit();
    });

    els.createTagForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const tag = await createTag(els.newTagName.value, els.newTagColor.value);
        if (tag) {
          els.newTagName.value = '';
          renderAll();
          showToast(`Тэг «${tag.name}» создан`);
        }
      } catch (err) {
        showToast(err.message, true);
      }
    });

    els.createGroupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await createGroup(els.newGroupName.value);
        els.newGroupName.value = '';
      } catch (err) {
        showToast(err.message, true);
      }
    });

    els.btnModeAnd.addEventListener('click', () => {
      state.activeCollectionId = null;
      state.mode = 'AND';
      renderAll();
    });

    els.btnModeOr.addEventListener('click', () => {
      state.activeCollectionId = null;
      state.mode = 'OR';
      renderAll();
    });

    els.sortField.addEventListener('change', () => {
      state.sortField = els.sortField.value;
      renderAll();
    });

    els.btnSortDir.addEventListener('click', () => {
      state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
      const isAsc = state.sortDir === 'asc';
      els.btnSortDir.textContent = isAsc ? '↑' : '↓';
      els.btnSortDir.title = isAsc
        ? 'Направление сортировки: по возрастанию'
        : 'Направление сортировки: по убыванию';
      renderAll();
    });

    els.btnResetFilter.addEventListener('click', resetFilters);
    els.btnSaveCollection.addEventListener('click', openCollectionModal);
    els.btnNewCollection.addEventListener('click', () => {
      if (state.includeTags.length === 0 && state.excludeTags.length === 0 && !state.search.trim()) {
        showToast('Сначала выберите хотя бы один тэг для фильтрации', true);
        return;
      }
      openCollectionModal();
    });

    els.collectionForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = els.collectionNameInput.value.trim();
      if (name) saveCollection(name);
    });

    // Random image buttons
    els.btnRandomAll.addEventListener('click', () => {
      openRandomImage(state.images, 'В текущей папке нет изображений');
    });

    els.btnRandomFiltered.addEventListener('click', () => {
      const hasTagFilter = state.includeTags.length > 0 || state.excludeTags.length > 0 || state.view === 'untagged';
      if (!hasTagFilter) {
        showToast('Сначала выберите тэги в фильтре слева', true);
        return;
      }
      openRandomImage(getFilteredImages(), 'Нет картинок с выбранными тэгами');
    });

    // Selection & Batch
    els.btnSelectAll.addEventListener('click', () => {
      const filtered = getFilteredImages();
      for (const img of filtered) {
        state.selectedPaths.add(img.path);
      }
      renderAll();
    });

    els.btnClearSelection.addEventListener('click', () => {
      state.selectedPaths.clear();
      state.lastSelectedIndex = null;
      renderAll();
    });

    els.btnBatchAddTag.addEventListener('click', () => {
      const tagId = els.batchTagSelect.value;
      if (!tagId) return;
      updateImagesTags(Array.from(state.selectedPaths), [tagId], []);
    });

    els.btnBatchRemoveTag.addEventListener('click', () => {
      const tagId = els.batchTagSelect.value;
      if (!tagId) return;
      updateImagesTags(Array.from(state.selectedPaths), [], [tagId]);
    });

    els.batchQuickTagForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = els.batchNewTagInput.value.trim();
      if (!name || state.selectedPaths.size === 0) return;
      try {
        const tag = await createTag(name);
        if (tag) {
          els.batchNewTagInput.value = '';
          await updateImagesTags(Array.from(state.selectedPaths), [tag.id], []);
        }
      } catch (err) {
        showToast(err.message, true);
      }
    });

    // Popover events
    els.popoverInput.addEventListener('input', renderPopoverList);
    els.popoverInput.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const name = els.popoverInput.value.trim();
        if (!name || !state.popoverImagePath) return;
        try {
          const tag = await createTag(name);
          if (tag) {
            await updateImagesTags([state.popoverImagePath], [tag.id], []);
            els.popoverInput.value = '';
          }
        } catch (err) {
          showToast(err.message, true);
        }
      } else if (e.key === 'Escape') {
        closeQuickTagPopover();
      }
    });

    document.addEventListener('click', (e) => {
      if (
        !els.popover.classList.contains('hidden') &&
        !els.popover.contains(e.target) &&
        !e.target.classList.contains('card-add-tag-btn')
      ) {
        closeQuickTagPopover();
      }
    });

    // Folder Modal events
    els.btnGoPath.addEventListener('click', () => {
      loadBrowserDir(els.folderPathInput.value.trim());
    });
    els.folderPathInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        loadBrowserDir(els.folderPathInput.value.trim());
      }
    });
    els.btnFolderUp.addEventListener('click', () => {
      loadBrowserDir(state.browserParentPath);
    });
    els.btnConfirmFolder.addEventListener('click', () => {
      if (state.browserPath) {
        selectFolder(state.browserPath, els.modalChkRecursive.checked);
      }
    });
    els.btnNativePick.addEventListener('click', async () => {
      try {
        const data = await api('/api/fs/pick', {
          method: 'POST',
          body: JSON.stringify({ initialDir: state.browserPath || state.currentFolder }),
        });
        if (!data.cancelled && data.path) {
          selectFolder(data.path, els.modalChkRecursive.checked);
        }
      } catch (err) {
        showToast(err.message, true);
      }
    });

    // Modal close buttons & backdrops
    document.querySelectorAll('[data-close]').forEach((btn) => {
      btn.addEventListener('click', () => closeModal(btn.dataset.close));
    });
    document.querySelectorAll('.modal-backdrop').forEach((backdrop) => {
      backdrop.addEventListener('click', () => {
        const modal = backdrop.closest('.modal');
        if (modal.id === 'lightbox-modal') {
          closeLightbox();
        } else {
          modal.classList.add('hidden');
        }
      });
    });

    // Lightbox events
    els.lightboxClose.addEventListener('click', closeLightbox);
    els.lightboxPrev.addEventListener('click', () => openLightbox(state.lightboxIndex - 1, state.lightboxList));
    els.lightboxNext.addEventListener('click', () => openLightbox(state.lightboxIndex + 1, state.lightboxList));

    els.lightboxAddTagForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const img = state.lightboxList[state.lightboxIndex];
      const name = els.lightboxTagInput.value.trim();
      if (!img || !name) return;
      try {
        const tag = await createTag(name);
        if (tag) {
          els.lightboxTagInput.value = '';
          await updateImagesTags([img.path], [tag.id], []);
        }
      } catch (err) {
        showToast(err.message, true);
      }
    });

    document.addEventListener('keydown', (e) => {
      if (state.lightboxIndex >= 0) {
        if (e.key === 'Escape') closeLightbox();
        if (e.key === 'ArrowLeft' && document.activeElement !== els.lightboxTagInput) {
          openLightbox(state.lightboxIndex - 1, state.lightboxList);
        }
        if (e.key === 'ArrowRight' && document.activeElement !== els.lightboxTagInput) {
          openLightbox(state.lightboxIndex + 1, state.lightboxList);
        }
      }
    });
  }

  async function init() {
    bindEvents();
    try {
      const data = await api('/api/state');
      state.currentFolder = data.currentFolder || '';
      state.recursive = Boolean(data.recursive);
      state.recentFolders = data.recentFolders || [];
      state.tags = data.tags || [];
      state.groups = data.groups || [];
      state.collections = data.collections || [];
      state.imageTags = data.imageTags || {};
      state.images = data.images || [];
      els.newTagColor.value = nextPaletteColor();
      renderAll();
      if (data.folderError) {
        showToast(`Не удалось открыть прошлую папку: ${data.folderError}`, true);
      }
    } catch (err) {
      showToast(err.message, true);
    }
  }

  init();
})();
