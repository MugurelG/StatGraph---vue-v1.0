<script setup>
import { ref, onMounted, computed, nextTick } from 'vue';
import { supabase } from '../supabaseClient';
import html2pdf from 'html2pdf.js';
import { useAuth } from '../composables/useAuth';

// Auth
const { userRole } = useAuth();

// 1. Datele principale
const educatieData = ref([]);

const fetchEducatie = async () => {
  const { data, error } = await supabase
    .from('educatie')
    .select('*')
    .order('titlu');
  
  if (!error && data) {
    educatieData.value = data;
  }
};

// 2. Logica Căutare
const searchTerm = ref('');
const activeTab = ref('glosar');
const sortOrder = ref('default');
const selectedIds = ref([]);

const selectedGlosarCount = computed(() => glosar.value.filter(i => selectedIds.value.includes(i.id)).length);
const selectedFiseCount = computed(() => fise.value.filter(i => selectedIds.value.includes(i.id)).length);
const selectedGhiduriCount = computed(() => ghiduri.value.filter(i => selectedIds.value.includes(i.id)).length);

const toggleSelect = (id, event) => {
  event.stopPropagation(); // Previne deschiderea pop-up-ului când dai click pe checkbox
  const index = selectedIds.value.indexOf(id);
  if (index > -1) {
    selectedIds.value.splice(index, 1);
  } else {
    selectedIds.value.push(id);
  }
};

const selectAll = (items) => {
  const allSelected = items.every(i => selectedIds.value.includes(i.id));
  if (allSelected) {
    items.forEach(i => {
      const index = selectedIds.value.indexOf(i.id);
      if (index > -1) selectedIds.value.splice(index, 1);
    });
  } else {
    items.forEach(i => {
      if (!selectedIds.value.includes(i.id)) selectedIds.value.push(i.id);
    });
  }
};

const isSearchOpen = ref(false);
const searchInputRef = ref(null);

const filteredSuggestions = computed(() => {
  if (!searchTerm.value || searchTerm.value.length < 2) return [];
  const term = searchTerm.value.toLowerCase();
  return educatieData.value.filter(d => 
    d.titlu.toLowerCase().includes(term) || d.cuvant_cheie?.toLowerCase().includes(term)
  ).slice(0, 5);
});

const selectItem = (item) => {
  searchTerm.value = item.titlu;
  isSearchOpen.value = false;
  activeTab.value = item.tip; // Navighează automat la tab-ul corect
};

const toggleSearch = () => {
  isSearchOpen.value = !isSearchOpen.value;
  if (isSearchOpen.value && searchInputRef.value) {
    nextTick(() => searchInputRef.value.focus());
  }
};

const closeSearch = () => {
  setTimeout(() => {
    if (!searchTerm.value) {
      isSearchOpen.value = false;
    }
  }, 200);
};

// 3. Filtrele principale din pagină

// Funcție pentru a determina tipul de badge în funcție de cuvântul cheie
const getBadge = (item) => {
  const k = item.cuvant_cheie?.toLowerCase() || '';
  if (k.includes('paradox') || k.includes('efect')) return { text: 'Paradox', class: 'badge-paradox' };
  if (k.includes('lege')) return { text: 'Lege', class: 'badge-lege' };
  if (k.includes('distincție') || k.includes('eroare')) return { text: 'Distincție', class: 'badge-distinctie' };
  return { text: 'Termen', class: 'badge-teren' }; // Default
};
const filterAndSort = (tip) => {
  let items = educatieData.value.filter(d => d.tip === tip);
  
  if (searchTerm.value) {
    const term = searchTerm.value.toLowerCase();
    items = items.filter(d => d.titlu.toLowerCase().includes(term) || d.cuvant_cheie?.toLowerCase().includes(term));
  }

  if (sortOrder.value === 'az') return items.sort((a, b) => a.titlu.localeCompare(b.titlu));
  if (sortOrder.value === 'za') return items.sort((a, b) => b.titlu.localeCompare(a.titlu));
  
  return items;
};

const glosar = computed(() => filterAndSort('glosar'));
const fise = computed(() => filterAndSort('fisa'));
const ghiduri = computed(() => filterAndSort('ghid'));

// 4. Logica Admin: Adăugare/Editare Card
const showForm = ref(false);
const currentEditId = ref(null);
const newCard = ref({ tip: 'glosar', titlu: '', continut: '', cuvant_cheie: '' });

const resetForm = () => {
  newCard.value = { tip: 'glosar', titlu: '', continut: '', cuvant_cheie: '' };
  currentEditId.value = null;
};

const saveCard = async () => {
  if (!newCard.value.titlu.trim() || !newCard.value.continut.trim()) {
    alert('Titlul și conținutul sunt obligatorii!');
    return;
  }
  let result;
  if (currentEditId.value) {
    result = await supabase.from('educatie').update(newCard.value).eq('id', currentEditId.value).select();
  } else {
    result = await supabase.from('educatie').insert([newCard.value]).select();
  }

  const { data, error } = result;
  if (!error && data) {
    if (currentEditId.value) {
      const index = educatieData.value.findIndex(i => i.id === data[0].id);
      if (index !== -1) educatieData.value[index] = data[0];
    } else {
       educatieData.value = [...educatieData.value, data[0]];
    }
    resetForm();
    showForm.value = false;
  } else {
    alert('Eroare la salvare: ' + error.message);
  }
};

const editCard = (item, event) => {
  event.stopPropagation();
  currentEditId.value = item.id;
  newCard.value = { tip: item.tip, titlu: item.titlu, continut: item.continut, cuvant_cheie: item.cuvant_cheie };
  showForm.value = true;
};

const deleteCard = async (id, event) => {
  event.stopPropagation();
  if (!confirm('Ești sigur că vrei să ștergi acest element?')) return;
  const { error } = await supabase.from('educatie').delete().eq('id', id);
  if (error) {
    alert('Eroare la ștergere: ' + error.message);
  } else {
    educatieData.value = educatieData.value.filter(item => item.id !== id);
  }
};

// --- POP-UP CITIRE (VIEW) - MULTIPLU ---
const openViewItems = ref([]); // Array care ține minte toate cardurile deschise
const popupFontSize = ref(16);
const draggingId = ref(null); // Ține minte ID-ul cardului care se mută acum
const dragOffsetView = ref({ x: 0, y: 0 });

const changeFontSize = (amount) => {
  let newSize = popupFontSize.value + amount;
  if (newSize >= 12 && newSize <= 28) {
    popupFontSize.value = newSize;
  }
};

const openViewPopup = (item) => {
  // 1. Limita de 25 de carduri
  if (openViewItems.value.length >= 25) {
    alert('Ai atins limita maximă de 25 de carduri deschise simultan.');
    return;
  }
  
  // 2. Verificăm dacă nu este deja deschis
  if (openViewItems.value.find(i => i.id === item.id)) return;

  // 3. Îl adăugăm în listă, cu o poziție ușor decalată
  const offset = openViewItems.value.length * 30; 
  openViewItems.value.push({
    ...item, // Păstrăm datele cardului
    posX: 150 + offset, // Calculăm poziția pe X
    posY: 100 + offset  // Calculăm poziția pe Y
  });
};

const closeViewPopup = (id) => {
  // Îl scoatem din listă doar pe cel care are ID-ul respectiv
  openViewItems.value = openViewItems.value.filter(item => item.id !== id);
};

const startDragView = (e, id) => {
  e.preventDefault(); // Previne selectarea textului când tragi
  draggingId.value = id;
  const item = openViewItems.value.find(i => i.id === id);
  if (!item) return;
  
  const rect = e.currentTarget.getBoundingClientRect();
  dragOffsetView.value = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  
  document.addEventListener('mousemove', onDragView);
  document.addEventListener('mouseup', stopDragView);
};

const onDragView = (e) => {
  if (!draggingId.value) return;
  const item = openViewItems.value.find(i => i.id === draggingId.value);
  if (!item) return;
  
  item.posX = e.clientX - dragOffsetView.value.x;
  item.posY = e.clientY - dragOffsetView.value.y;
};

const stopDragView = () => {
  draggingId.value = null;
  document.removeEventListener('mousemove', onDragView);
  document.removeEventListener('mouseup', stopDragView);
};

// 6. Pop-up Admin (FORM) - Drag & Drop
const formPopupPos = ref({ x: 150, y: 150 });
const isDraggingForm = ref(false);
const dragOffsetForm = ref({ x: 0, y: 0 });

const startDragForm = (e) => {
  isDraggingForm.value = true;
  const rect = e.currentTarget.getBoundingClientRect();
  dragOffsetForm.value = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  document.addEventListener('mousemove', onDragForm);
  document.addEventListener('mouseup', stopDragForm);
};

const onDragForm = (e) => {
  if (!isDraggingForm.value) return;
  formPopupPos.value = { x: e.clientX - dragOffsetForm.value.x, y: e.clientY - dragOffsetForm.value.y };
};

const stopDragForm = () => {
  isDraggingForm.value = false;
  document.removeEventListener('mousemove', onDragForm);
  document.removeEventListener('mouseup', stopDragForm);
};

// 7. Export PDF
const exportEducatiePDF = () => {
  let itemsToExport;
  let pdfTitle = 'Modul_Educatie';

  if (selectedIds.value.length > 0) {
    itemsToExport = educatieData.value.filter(i => selectedIds.value.includes(i.id));
    pdfTitle += `_Selectie`;
  } else {
    itemsToExport = educatieData.value;
  }

  if (itemsToExport.length === 0) {
    alert('Nu există date de exportat.');
    return;
  }

  const glosarItems = itemsToExport.filter(i => i.tip === 'glosar');
  const fisaItems = itemsToExport.filter(i => i.tip === 'fisa');
  const ghiduriItems = itemsToExport.filter(i => i.tip === 'ghid');

  let htmlContent = `<div style="font-family: Arial, sans-serif; padding: 20px; color: #1e293b;"><h1 style="text-align: center; color: #0f172a; margin-bottom: 30px;">Modul Educațional StatGraph</h1>`;

  if (glosarItems.length > 0) {
    htmlContent += `<h2 style="color: #334155; border-bottom: 2px solid #e2e8f0; padding-bottom: 5px;">Glosar de Termeni</h2>`;
    glosarItems.forEach(item => { htmlContent += `<div style="margin-bottom: 15px; page-break-inside: avoid;"><h3 style="color: #1e293b; margin: 0 0 5px 0;">${item.titlu}</h3><p style="font-size: 14px; line-height: 1.5; color: #475569; margin: 0; white-space: pre-wrap;">${item.continut}</p></div>`; });
  }
  if (ghiduriItems.length > 0) {
    htmlContent += `<h2 style="color: #334155; border-bottom: 2px solid #e2e8f0; padding-bottom: 5px; margin-top: 30px;">Ghiduri / Procese</h2>`;
    ghiduriItems.forEach(item => { htmlContent += `<div style="margin-bottom: 15px; page-break-inside: avoid;"><h3 style="color: #1e293b; margin: 0 0 5px 0;">${item.titlu}</h3><p style="font-size: 14px; line-height: 1.5; color: #475569; margin: 0; white-space: pre-wrap;">${item.continut}</p></div>`; });
  }
  if (fisaItems.length > 0) {
    htmlContent += `<h2 style="color: #334155; border-bottom: 2px solid #e2e8f0; padding-bottom: 5px; margin-top: 30px;">Fișe de Instituții / Autorități</h2>`;
    fisaItems.forEach(item => { htmlContent += `<div style="margin-bottom: 15px; page-break-inside: avoid;"><h3 style="color: #1e293b; margin: 0 0 5px 0;">${item.titlu}</h3><p style="font-size: 14px; line-height: 1.5; color: #475569; margin: 0; white-space: pre-wrap;">${item.continut}</p></div>`; });
  }
  htmlContent += `</div>`;

  html2pdf().set({ margin: 10, filename: `${pdfTitle}.pdf`, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2, useCORS: true }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } }).from(htmlContent).save();
};

onMounted(() => { fetchEducatie(); });
</script>

<template>
  <div class="dashboard-layout">
    
    <!-- ZONA PRINCIPALA (STANGA) -->
    <div class="main-area">
      
      <!-- CONTROALE SUPERIOARE -->
      <div class="top-controls">
        <button class="back-btn" @click="$router.push('/dashboard')">⬅ Înapoi</button>
        
        <div class="search-container">
          <div :class="['search-wrapper', { 'is-open': isSearchOpen }]">
            <input type="text" v-model="searchTerm" placeholder="Caută..." class="search-input" @blur="closeSearch" ref="searchInputRef" />
            <button class="search-icon-btn" @click="toggleSearch">C</button>
          </div>
          <div class="search-dropdown" v-if="isSearchOpen && filteredSuggestions.length > 0">
            <div class="dropdown-item" @mousedown.prevent="selectItem(item)" v-for="item in filteredSuggestions" :key="item.id">{{ item.titlu }}</div>
          </div>
        </div>

        <select v-model="sortOrder" class="sort-select">
          <option value="default">Ordinea implicită</option>
          <option value="az">A - Z</option>
          <option value="za">Z - A</option>
        </select>

        <div class="control-separator"></div>

        <div class="bulk-actions" v-if="userRole !== 'vizitator'">
          <div class="select-group">
            <button class="mini-btn" @click="selectAll(glosar)">Tot Glosar</button>
            <span class="red-badge" v-if="selectedGlosarCount > 0">{{ selectedGlosarCount }}</span>
          </div>
          <div class="select-group">
            <button class="mini-btn" @click="selectAll(fise)">Tot Fișe</button>
            <span class="red-badge" v-if="selectedFiseCount > 0">{{ selectedFiseCount }}</span>
          </div>
          <div class="select-group">
            <button class="mini-btn" @click="selectAll(ghiduri)">Tot Ghid</button>
            <span class="red-badge" v-if="selectedGhiduriCount > 0">{{ selectedGhiduriCount }}</span>
          </div>
        </div>

        <button class="export-btn" @click="exportEducatiePDF">📥 Export PDF {{ selectedIds.length > 0 ? `(${selectedIds.length})` : '(Tot)' }}</button>
        
        <button v-if="userRole === 'admin'" class="add-card-btn" @click="resetForm(); showForm = !showForm">
          {{ showForm ? '✕ Închide Formular' : '+ Adaugă' }}
        </button>
      </div>

           <!-- GRID-UL DE CARDURI -->
      <div class="content-grid">
        
        <!-- 1. GLOSAR -->
        <template v-if="activeTab === 'glosar'">
          <div class="mini-card" v-for="item in glosar" :key="item.id" @click="openViewPopup(item)">
            <div class="card-top-row">
              <input v-if="userRole !== 'vizitator'" type="checkbox" :checked="selectedIds.includes(item.id)" @change="toggleSelect(item.id, $event)" class="card-checkbox" />
              <button v-if="userRole === 'admin'" class="delete-card-btn" @click="deleteCard(item.id, $event)">✕</button>
            </div>
            <h3>{{ item.titlu }}</h3>
            <p class="card-preview">{{ item.continut }}</p>
            <!-- BADGE-UL NOU -->
            <div class="card-badge" :class="getBadge(item).class">{{ getBadge(item).text }}</div>
          </div>
          <p v-if="glosar.length === 0" class="no-results">Nu s-au găsit termeni.</p>
        </template>

        <!-- 2. FISE -->
        <template v-if="activeTab === 'fisa'">
          <div class="mini-card" v-for="item in fise" :key="item.id" @click="openViewPopup(item)">
            <div class="card-top-row">
              <input v-if="userRole !== 'vizitator'" type="checkbox" :checked="selectedIds.includes(item.id)" @change="toggleSelect(item.id, $event)" class="card-checkbox" />
              <button v-if="userRole === 'admin'" class="delete-card-btn" @click="deleteCard(item.id, $event)">✕</button>
            </div>
            <h3>{{ item.titlu }}</h3>
            <p class="card-preview">{{ item.continut }}</p>
            <!-- BADGE-UL NOU -->
            <div class="card-badge" :class="getBadge(item).class">{{ getBadge(item).text }}</div>
          </div>
          <p v-if="fise.length === 0" class="no-results">Nu s-au găsit fișe.</p>
        </template>

        <!-- 3. GHIDURI -->
        <template v-if="activeTab === 'ghid'">
          <div class="mini-card" v-for="item in ghiduri" :key="item.id" @click="openViewPopup(item)">
            <div class="card-top-row">
              <input v-if="userRole !== 'vizitator'" type="checkbox" :checked="selectedIds.includes(item.id)" @change="toggleSelect(item.id, $event)" class="card-checkbox" />
              <button v-if="userRole === 'admin'" class="delete-card-btn" @click="deleteCard(item.id, $event)">✕</button>
            </div>
            <h3>{{ item.titlu }}</h3>
            <p class="card-preview">{{ item.continut }}</p>
            <!-- BADGE-UL NOU -->
            <div class="card-badge" :class="getBadge(item).class">{{ getBadge(item).text }}</div>
          </div>
          <p v-if="ghiduri.length === 0" class="no-results">Nu au fost adăugate ghiduri.</p>
        </template>

      </div>
    </div>

    <!-- SIDEBAR DREAPTA (FIXAT PE ECRAN) -->
    <div class="right-sidebar">
      <button :class="['sidebar-btn', { active: activeTab === 'glosar' }]" @click="activeTab = 'glosar'">📘 Glosar</button>
      <button :class="['sidebar-btn', { active: activeTab === 'fisa' }]" @click="activeTab = 'fisa'">🏢 Fișe</button>
      <button :class="['sidebar-btn', { active: activeTab === 'ghid' }]" @click="activeTab = 'ghid'">📋 Ghiduri</button>
      
      <div class="sidebar-footer">
        <span class="footer-label">Total vizibile:</span>
        <span class="footer-number">
          <span v-if="activeTab === 'glosar'">{{ glosar.length }}</span>
          <span v-if="activeTab === 'fisa'">{{ fise.length }}</span>
          <span v-if="activeTab === 'ghid'">{{ ghiduri.length }}</span>
        </span>
      </div>
    </div>

     <!-- POP-UP CITIRE (VIEW) - MULTIPLU -->
    <!-- Folosim v-for pentru a crea un pop-up fizic pentru fiecare card din array-ul openViewItems -->
    <div v-for="item in openViewItems" :key="'popup-' + item.id" class="popup-overlay">
      <div class="popup-view" :style="{ left: item.posX + 'px', top: item.posY + 'px' }">
        <div class="popup-header-view" @mousedown="startDragView($event, item.id)">
          <h3>{{ item.titlu }}</h3>
          <div class="popup-header-actions">
            <div class="font-controls">
              <button @click="changeFontSize(-2)" title="Micșorează textul">A-</button>
              <button @click="changeFontSize(2)" title="Mărește textul">A+</button>
            </div>
            <!-- La închidere, transmitem ID-ul cardului respectiv -->
            <button class="close-btn-red" @click="closeViewPopup(item.id)">✕</button>
          </div>
        </div>
        <div class="popup-content-view" :style="{ fontSize: popupFontSize + 'px' }">
          {{ item.continut }}
        </div>
      </div>
    </div>

    <!-- POP-UP ADMIN (FORMULAR) -->
    <div v-if="showForm" class="popup-overlay" style="z-index: 1100;">
      <div class="popup-form" :style="{ left: formPopupPos.x + 'px', top: formPopupPos.y + 'px' }">
        <div class="popup-header-form" @mousedown="startDragForm">
          <span>Adaugă / Editează conținut</span>
          <button class="popup-close-btn" @click="showForm = false; resetForm()">✕</button>
        </div>
        <div class="popup-body-form">
          <div class="form-row">
            <label>Tip</label>
            <select v-model="newCard.tip">
              <option value="glosar">Glosar de Termeni</option>
              <option value="fisa">Fisă Instituție</option>
              <option value="ghid">Ghid / Proces</option>
            </select>
          </div>
          <div class="form-row">
            <label>Titlu *</label>
            <input type="text" v-model="newCard.titlu" placeholder="ex: Ordonator de credite" />
          </div>
          <div class="form-row">
            <label>Conținut *</label>
            <textarea v-model="newCard.continut" rows="6" placeholder="Scrie aici..."></textarea>
          </div>
          <div class="form-row">
            <label>Cuvânt cheie</label>
            <input type="text" v-model="newCard.cuvant_cheie" placeholder="ex: buget, fonduri" />
          </div>
          <div class="form-actions">
            <button class="btn-save" @click="saveCard">Salvează</button>
            <button class="btn-cancel" @click="showForm = false; resetForm()">Anulează</button>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>

<style lang="scss" scoped>
// LAYOUT PRINCIPAL (Fără flex, se bazează pe sidebar fix)
.dashboard-layout {
  position: relative;
  min-height: 100vh;
  background: #f1f5f9;
  font-family: inherit;
  color: #1e293b;
}

.main-area {
  // Mutăm conținutul principal la stânga cu 220px pentru a face loc sidebar-ului fix
  margin-right: 80px; 
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

// CONTROLERE SUPERIOARE
.top-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 15px 25px;
  background: white;
  border-bottom: 1px solid #e2e8f0;
  flex-wrap: wrap;
  flex-shrink: 0;
}

.back-btn {
  background: #ffffff; color: #000000; border: 2px solid #dc2626; padding: 8px 18px; border-radius: 50px; font-size: 0.85rem; font-weight: 800; cursor: pointer; transition: all 0.1s;
  &:hover { color: #dc2626; box-shadow: 0 4px 0 #b91c1c; }
  &:active { transform: translateY(4px); box-shadow: 0 0 0 #b91c1c; }
}

.control-separator { width: 1px; height: 30px; background: #e2e8f0; }

.search-container { position: relative; }
.search-wrapper { display: flex; align-items: center; background: transparent; border-radius: 30px; border: 1px solid transparent; overflow: visible; transition: all 0.3s ease; width: 40px; height: 40px; }
.search-wrapper.is-open { width: 250px; background: #f8fafc; border: 1px solid #e2e8f0; }
.search-input { width: 100%; padding: 0 15px; border: none; outline: none; background: transparent; font-size: 0.85rem; opacity: 0; pointer-events: none; transition: opacity 0.2s ease 0.1s; font-family: inherit; }
.search-wrapper.is-open .search-input { opacity: 1; pointer-events: auto; }
.search-icon-btn { width: 40px; height: 40px; flex-shrink: 0; background: #ffffff; border: 2px solid #dc2626; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; color: #000; font-size: 1rem; font-weight: 800; transition: 0.2s; }
.search-icon-btn:hover { background: #dc2626; color: #fff; }
.search-dropdown { position: absolute; top: 50px; left: 0; width: 250px; background: white; border-radius: 8px; box-shadow: 0 10px 25px rgba(0,0,0,0.15); border: 1px solid #e2e8f0; z-index: 50; }
.dropdown-item { padding: 10px 15px; font-size: 0.85rem; cursor: pointer; border-bottom: 1px solid #f1f5f9; &:hover { background: #f8fafc; color: #2563eb; } }

.sort-select { 
  margin-left: 25px; /* <-- Am adăugat asta pentru spațiu față de căutare */
  padding: 8px 12px; 
  border: 1px solid #cbd5e1; 
  border-radius: 6px; 
  font-size: 0.85rem; 
  font-family: inherit; 
  background: white; 
  cursor: pointer; 
  outline: none; 
}
.bulk-actions { display: flex; gap: 10px; align-items: center; }
.select-group { display: flex; align-items: center; gap: 5px; }
.mini-btn { background: #f8fafc; border: 1px solid #e2e8f0; padding: 6px 10px; border-radius: 6px; font-size: 0.75rem; cursor: pointer; font-family: inherit; font-weight: 600; transition: 0.2s; &:hover { background: #e2e8f0; } }
.red-badge { background: #dc2626; color: white; border-radius: 10px; padding: 2px 6px; font-size: 0.7rem; font-weight: 700; }
.export-btn { background: #f97316; color: white; border: none; padding: 8px 16px; border-radius: 6px; font-size: 0.85rem; font-weight: 700; cursor: pointer; transition: 0.2s; font-family: inherit; &:hover { background: #ea580c; } }
.add-card-btn { background: #16a34a; color: white; border: none; padding: 8px 16px; border-radius: 6px; font-size: 0.85rem; font-weight: 700; cursor: pointer; transition: 0.2s; font-family: inherit; &:hover { background: #15803d; } }

// GRID CARDURI
.content-grid {
  flex: 1;
  overflow-y: auto;
  padding: 25px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 15px;
  align-content: start; // Important ca primele randuri sa fie sus
  
  &::-webkit-scrollbar { width: 8px; }
  &::-webkit-scrollbar-track { background: #f1f5f9; }
  &::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
}

.mini-card {
  background: white;
  border-radius: 12px;
  padding: 15px;
  border: 1px solid #e2e8f0;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  flex-direction: column;
  position: relative;
  box-shadow: 0 1px 3px rgba(0,0,0,0.03);
  
  &:hover { box-shadow: 0 8px 16px rgba(0,0,0,0.08); transform: translateY(-2px); border-color: #cbd5e1; }
  
  h3 { font-size: 0.95rem; margin: 10px 0; color: #0f172a; }
}

.card-top-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  position: absolute;
  top: 10px;
  right: 10px;
  left: 10px;
}

.card-checkbox { width: 16px; height: 16px; cursor: pointer; accent-color: #2563eb; }
.delete-card-btn { background: none; border: none; color: #94a3b8; font-size: 0.9rem; cursor: pointer; opacity: 0; transition: 0.2s; padding: 0 2px; }
.mini-card:hover .delete-card-btn { opacity: 1; }
.delete-card-btn:hover { color: #dc2626; }

// TRUCUL PENTRU TAIEREA TEXTULUI LA 3 RANDURI
.card-preview {
  margin: 0;
  font-size: 0.8rem;
  line-height: 1.4;
  color: #64748b;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  flex-grow: 1;
}

.card-preview {
  margin: 0;
  font-size: 0.8rem;
  line-height: 1.4;
  color: #64748b;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  flex-grow: 1;
}

// --- NOU: STILURILE PENTRU BADGES ---
.card-badge {
  position: absolute;
  bottom: 12px;
  right: 12px;
  font-size: 0.6rem;
  padding: 3px 8px;
  border-radius: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}

.badge-teren { background: #dbeafe; color: #1e40af; } // Albastru
.badge-paradox { background: #fee2e2; color: #991b1b; } // Roșu
.badge-lege { background: #ffedd5; color: #9a3412; } // Portocaliu
.badge-distinctie { background: #dcfce7; color: #166534; } // Verde

.no-results { grid-column: 1 / -1; text-align: center; color: #94a3b8; font-style: italic; margin-top: 50px; }

// SIDEBAR DREAPTA (FIXAT PE ECRAN)
.right-sidebar {
  position: fixed;
  right: 0;
  top: 0;
  width: 80px;
  height: 100vh;
  background: #ffffff;
  border-left: 1px solid #e2e8f0;
  padding: 30px 0;
  display: flex;
  flex-direction: column;
  box-shadow: -4px 0 15px rgba(0,0,0,0.05);
  z-index: 50;
  box-sizing: border-box;
}

.sidebar-btn {
  background: transparent;
  border: none;
  border-left: 4px solid transparent;
  padding: 16px 20px;
  font-size: 0.95rem;
  font-weight: 600;
  color: #64748b;
  cursor: pointer;
  text-align: left;
  border-radius: 0;
  margin-bottom: 5px;
  transition: all 0.2s ease;
  font-family: inherit;
  width: 100%;
  box-sizing: border-box;
  display: flex;
  align-items: center;

  &:hover {
    background: #f8fafc;
    color: #0f172a;
    border-left-color: #cbd5e1;
  }

  &.active {
    background: #f1f5f9;
    border-left-color: #2563eb;
    color: #0f172a;
    font-weight: 700;
  }
}

.sidebar-footer {
  margin-top: auto;
  padding: 20px;
  border-top: 1px solid #f1f5f9;
  text-align: center;
}

.footer-label {
  font-size: 0.75rem;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  display: block;
  margin-bottom: 5px;
}

.footer-number {
  font-size: 1.5rem;
  font-weight: 800;
  color: #0f172a;
  display: block;
}

// POP-UP-uri (OVERLAY SHARED)
.popup-overlay {
  position: fixed;
  top: 0; left: 0; width: 100%; height: 100%;
  z-index: 1000;
  pointer-events: none; // Permite click prin spate daca nu atingi pop-upul
}

// POP-UP CITIRE
.popup-view {
  position: absolute;
  width: 500px;
  max-width: 90vw;
  background: white;
  border-radius: 16px;
  box-shadow: 0 20px 50px rgba(0,0,0,0.25);
  pointer-events: auto;
  overflow: hidden;
  border: 1px solid #e2e8f0;
}


.popup-header-view {
  background: #f8fafc;
  padding: 15px 20px;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: grab;
  
  &:active { cursor: grabbing; }
  h3 { margin: 0; font-size: 1.1rem; color: #0f172a; padding-right: 20px; flex-grow: 1; } // Am adăugat flex-grow
}

// NOU: Gruparea butoanelor din header
.popup-header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.font-controls {
  display: flex;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  overflow: hidden;
  background: white;
}

.font-controls button {
  background: white;
  border: none;
  padding: 4px 10px;
  font-size: 0.85rem;
  font-weight: bold;
  cursor: pointer;
  transition: 0.2s;
  color: #475569;
  font-family: inherit;
  
  &:hover { background: #f1f5f9; color: #0f172a; }
  // Linie de separare intre A- si A+
  &:not(:last-child) { border-right: 1px solid #e2e8f0; } 
}

.popup-content-view {
  padding: 25px;
  line-height: 1.7;
  color: #334155;
  max-height: 65vh;
  overflow-y: auto;
  white-space: pre-wrap;
  transition: font-size 0.2s ease; // ANIMAȚIE: Textul se mărește/micșorează fin
}

// POP-UP FORMULAR (ADMIN)
.popup-form {
  position: absolute;
  width: 450px;
  background: white;
  border-radius: 16px;
  box-shadow: 0 20px 50px rgba(0,0,0,0.3);
  border: 2px solid #16a34a; // Verde pentru a-l diferentia
  pointer-events: auto;
  overflow: hidden;
}
.popup-header-form {
  background: #f0fdf4; // Verde deschis
  padding: 14px 20px;
  border-bottom: 1px solid #bbf7d0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: grab;
  font-weight: 700;
  color: #15803d;
  
  &:active { cursor: grabbing; }
}
.popup-close-btn { background: #dc2626; color: white; border: none; width: 28px; height: 28px; border-radius: 6px; font-size: 0.9rem; cursor: pointer; transition: 0.2s; &:hover { background: #b91c1c; } }
.popup-body-form { padding: 24px; display: flex; flex-direction: column; gap: 16px; }
.form-row { display: flex; flex-direction: column; gap: 6px; 
  label { font-size: 0.8rem; font-weight: 700; color: #64748b; text-transform: uppercase; }
  input, select, textarea { width: 100%; padding: 10px 14px; border: 1.5px solid #cbd5e1; border-radius: 8px; font-size: 0.9rem; font-family: inherit; outline: none; box-sizing: border-box; color: #0f172a; transition: 0.2s; &:focus { border-color: #16a34a; box-shadow: 0 0 0 3px rgba(22, 163, 74, 0.15); } }
  textarea { resize: vertical; }
}
.form-actions { display: flex; gap: 12px; justify-content: flex-end; margin-top: 8px; }
.btn-save { background: #16a34a; color: white; border: none; padding: 10px 24px; border-radius: 8px; font-weight: 700; font-family: inherit; cursor: pointer; transition: 0.2s; &:hover { background: #15803d; } }
.btn-cancel { background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0; padding: 10px 24px; border-radius: 8px; font-weight: 700; font-family: inherit; cursor: pointer; transition: 0.2s; &:hover { background: #e2e8f0; } }
</style>