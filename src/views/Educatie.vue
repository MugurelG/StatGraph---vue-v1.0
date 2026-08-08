
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

const toggleSelect = (id) => {
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
const glosar = computed(() => {
  let items = educatieData.value.filter(d => d.tip === 'glosar');
  
  if (searchTerm.value) {
    const term = searchTerm.value.toLowerCase();
    items = items.filter(d => d.titlu.toLowerCase().includes(term) || d.cuvant_cheie?.toLowerCase().includes(term));
  }

  if (sortOrder.value === 'az') {
    return items.sort((a, b) => a.titlu.localeCompare(b.titlu));
  } else if (sortOrder.value === 'za') {
    return items.sort((a, b) => b.titlu.localeCompare(a.titlu));
  }
  
  return items;
});

const fise = computed(() => {
  let items = educatieData.value.filter(d => d.tip === 'fisa');
  
  if (searchTerm.value) {
    const term = searchTerm.value.toLowerCase();
    items = items.filter(d => d.titlu.toLowerCase().includes(term) || d.cuvant_cheie?.toLowerCase().includes(term));
  }

  if (sortOrder.value === 'az') {
    return items.sort((a, b) => a.titlu.localeCompare(b.titlu));
  } else if (sortOrder.value === 'za') {
    return items.sort((a, b) => b.titlu.localeCompare(a.titlu));
  }
  
  return items;
});


const ghiduri = computed(() => {
  let items = educatieData.value.filter(d => d.tip === 'ghid');
  
  if (searchTerm.value) {
    const term = searchTerm.value.toLowerCase();
    items = items.filter(d => d.titlu.toLowerCase().includes(term) || d.cuvant_cheie?.toLowerCase().includes(term));
  }

  if (sortOrder.value === 'az') {
    return items.sort((a, b) => a.titlu.localeCompare(b.titlu));
  } else if (sortOrder.value === 'za') {
    return items.sort((a, b) => b.titlu.localeCompare(a.titlu));
  }
  
  return items;
});
// 4. Logica Admin: Adăugare Card Nou
const showForm = ref(false);
const currentEditId = ref(null);
const newCard = ref({
  tip: 'glosar',
  titlu: '',
  continut: '',
  cuvant_cheie: ''
});

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
    // Dacă avem ID, facem UPDATE
    result = await supabase.from('educatie').update(newCard.value).eq('id', currentEditId.value).select();
  } else {
    // Dacă nu avem ID, facem INSERT
    result = await supabase.from('educatie').insert([newCard.value]).select();
  }

  const { data, error } = result;
  
  if (!error && data) {
    if (currentEditId.value) {
      // Actualizăm local în array
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

 // 5. Logica Admin: Ștergere Card

const editCard = (item) => {
  currentEditId.value = item.id;
  newCard.value = { 
    tip: item.tip, 
    titlu: item.titlu, 
    continut: item.continut, 
    cuvant_cheie: item.cuvant_cheie 
  };
  showForm.value = true;
};

const moveCard = async (item) => {
  const newTip = item.tip === 'glosar' ? 'fisa' : 'glosar';
  const newTipName = newTip === 'glosar' ? 'Glosar de Termeni' : 'Fișă Instituție';
  
  if (!confirm(`Muți "${item.titlu}" la ${newTipName}?`)) return;

  const { data, error } = await supabase
    .from('educatie')
    .update({ tip: newTip })
    .eq('id', item.id)
    .select();

  if (error) {
    alert('Eroare la mutare: ' + error.message);
  } else if (data) {
    const index = educatieData.value.findIndex(i => i.id === item.id);
    if (index !== -1) {
      educatieData.value[index] = { ...educatieData.value[index], tip: newTip };
    }
  }
};
const deleteCard = async (id) => {
  if (!confirm('Ești sigur că vrei să ștergi acest element?')) return;

  const { error } = await supabase.from('educatie').delete().eq('id', id);

  if (error) {
    alert('Eroare la ștergere: ' + error.message);
  } else {
    educatieData.value = educatieData.value.filter(item => item.id !== id);
  }
};


// 6. Drag & Drop Pop-up
const popupPos = ref({ x: 150, y: 150 });
const isDragging = ref(false);
const dragOffset = ref({ x: 0, y: 0 });

const startDrag = (e) => {
  isDragging.value = true;
  const rect = e.currentTarget.getBoundingClientRect();
  dragOffset.value = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  document.addEventListener('mousemove', onDrag);
  document.addEventListener('mouseup', stopDrag);
};

const onDrag = (e) => {
  if (!isDragging.value) return;
  popupPos.value = { x: e.clientX - dragOffset.value.x, y: e.clientY - dragOffset.value.y };
};

const stopDrag = () => {
  isDragging.value = false;
  document.removeEventListener('mousemove', onDrag);
  document.removeEventListener('mouseup', stopDrag);
};

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

  let htmlContent = `
    <div style="font-family: Arial, sans-serif; padding: 20px; color: #1e293b;">
      <h1 style="text-align: center; color: #0f172a; margin-bottom: 30px;">Modul Educațional StatGraph</h1>
  `;

  if (glosarItems.length > 0) {
    htmlContent += `<h2 style="color: #334155; border-bottom: 2px solid #e2e8f0; padding-bottom: 5px;">Glosar de Termeni</h2>`;
    glosarItems.forEach(item => {
      htmlContent += `
        <div style="margin-bottom: 15px; page-break-inside: avoid;">
          <h3 style="color: #1e293b; margin: 0 0 5px 0;">${item.titlu}</h3>
          <p style="font-size: 14px; line-height: 1.5; color: #475569; margin: 0; white-space: pre-wrap;">${item.continut}</p>
        </div>`;
    });
  }

  if (ghiduriItems.length > 0) {
    htmlContent += `<h2 style="color: #334155; border-bottom: 2px solid #e2e8f0; padding-bottom: 5px; margin-top: 30px;">Ghiduri / Procese</h2>`;
    ghiduriItems.forEach(item => {
      htmlContent += `
        <div style="margin-bottom: 15px; page-break-inside: avoid;">
          <h3 style="color: #1e293b; margin: 0 0 5px 0;">${item.titlu}</h3>
          <p style="font-size: 14px; line-height: 1.5; color: #475569; margin: 0; white-space: pre-wrap;">${item.continut}</p>
        </div>`;
    });
  }

  if (fisaItems.length > 0) {
    htmlContent += `<h2 style="color: #334155; border-bottom: 2px solid #e2e8f0; padding-bottom: 5px; margin-top: 30px;">Fișe de Instituții / Autorități</h2>`;
    fisaItems.forEach(item => {
      htmlContent += `
        <div style="margin-bottom: 15px; page-break-inside: avoid;">
          <h3 style="color: #1e293b; margin: 0 0 5px 0;">${item.titlu}</h3>
          <p style="font-size: 14px; line-height: 1.5; color: #475569; margin: 0; white-space: pre-wrap;">${item.continut}</p>
        </div>`;
    });
  }

  htmlContent += `</div>`;

  // Trimitem direct string-ul HTML, fără să îl mai punem în DOM
  html2pdf().set({ 
    margin: 10, 
    filename: `${pdfTitle}.pdf`, 
    image: { type: 'jpeg', quality: 0.98 }, 
    html2canvas: { scale: 2, useCORS: true }, 
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  }).from(htmlContent).save();
};

// 7. Inițializare
onMounted(() => {
  fetchEducatie();
});
</script>

<template>
  <div class="educatie-container">
    <!-- 1. Buton Înapoi -->
    <button class="back-btn" @click="$router.push('/dashboard')">
      ⬅ Înapoi la Organigrame
    </button>
    
    <!-- 2. Titlu + Controlere -->
    <div class="header-row">
      <h1>Modul Educațional</h1>
      <div class="header-controls">
             <div class="select-stacked-group">
          <div class="select-group">
            <button class="export-btn" @click="selectAll(glosar)">Selectează tot Glosar</button>
            <span class="red-badge" v-if="selectedGlosarCount > 0">{{ selectedGlosarCount }}</span>
          </div>

          <div class="select-group">
            <button class="export-btn" @click="selectAll(fise)">Selectează tot Fișe</button>
            <span class="red-badge" v-if="selectedFiseCount > 0">{{ selectedFiseCount }}</span>
          </div>

          <div class="select-group">
            <button class="export-btn" @click="selectAll(ghiduri)">Selectează tot Ghid</button>
            <span class="red-badge" v-if="selectedGhiduriCount > 0">{{ selectedGhiduriCount }}</span>
          </div>
        </div>

        <button class="export-btn" @click="exportEducatiePDF" style="background: #f97316; color: white; border-color: #f97316;">
          📥 Export PDF {{ selectedIds.length > 0 ? '(Selectate)' : '(Tot)' }}
        </button>

        <div class="add-sort-group">
          <button class="add-card-btn" @click="resetForm(); showForm = !showForm">
            {{ showForm ? '✕ Închide' : '+ Adaugă Termen / Instituție' }}
          </button>
          <select v-model="sortOrder" class="sort-select">
            <option value="default">Ordinea implicită</option>
            <option value="az">A - Z</option>
            <option value="za">Z - A</option>
          </select>
        </div>
      </div>
    </div>

    <!-- 3. Căutare -->
    <div class="search-container">
      <div :class="['search-wrapper', { 'is-open': isSearchOpen }]">
        <input 
          type="text" 
          v-model="searchTerm" 
          placeholder="Caută un termen sau o instituție..." 
          class="search-input"
          @blur="closeSearch" 
          ref="searchInputRef"
        />
        <button class="search-icon-btn" @click="toggleSearch">C</button>
      </div>
      
      <div class="search-dropdown" v-if="isSearchOpen && filteredSuggestions.length > 0">
        <div 
          class="dropdown-item" 
          @mousedown.prevent="selectItem(item)"
          v-for="item in filteredSuggestions" 
          :key="item.id"
        >
          {{ item.titlu }}
        </div>
      </div>
    </div>

    <!-- 4. Pop-up Admin (Draggable) -->
    <div 
      v-if="showForm" 
      class="educatie-popup"
      :style="{ left: popupPos.x + 'px', top: popupPos.y + 'px' }"
    >
      <div class="popup-header" @mousedown="startDrag">
        <span>Adaugă conținut nou</span>
        <button class="popup-close-btn" @click="showForm = false; resetForm()">✕</button>
      </div>

      <div class="popup-body">
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
          <textarea v-model="newCard.continut" rows="4" placeholder="Scrie aici definiția sau descrierea..."></textarea>
        </div>

        <div class="form-row">
          <label>Cuvânt cheie</label>
          <input type="text" v-model="newCard.cuvant_cheie" placeholder="ex: buget, fonduri, bani" />
        </div>

        <div class="form-actions">
          <button class="btn-save" @click="saveCard">Salvează</button>
          <button class="btn-cancel" @click="showForm = false; resetForm()">Anulează</button>
        </div>
      </div>
    </div>

       <!-- 5. Taburi de navigare -->
    <div class="tabs-container">
      <button :class="['tab-btn', { active: activeTab === 'glosar' }]" @click="activeTab = 'glosar'">Glosar de Termeni</button>
      <button :class="['tab-btn', { active: activeTab === 'fisa' }]" @click="activeTab = 'fisa'">Fișe Instituții</button>
      <button :class="['tab-btn', { active: activeTab === 'ghid' }]" @click="activeTab = 'ghid'">Ghiduri / Procese</button>
    </div>

    <!-- 6. Conținut principal (Carduri) -->
    <div class="sections-wrapper-single">
      <div v-if="activeTab === 'glosar'" class="section-box">
        <h2>Glosar de Termeni</h2>
        <div class="card" v-for="item in glosar" :key="item.id">
          <div class="card-header">
            <div class="card-title-row" v-if="userRole !== 'vizitator'">
              <input type="checkbox" :checked="selectedIds.includes(item.id)" @change="toggleSelect(item.id)" class="card-checkbox" />
              <h3>{{ item.titlu }}</h3>
            </div>
            <h3 v-else>{{ item.titlu }}</h3>
            <div class="card-actions">
              <button v-if="userRole === 'admin'" class="card-action-btn edit" @click="editCard(item)">✏️</button>
              <button v-if="userRole === 'admin'" class="card-action-btn move" @click="moveCard(item)">↕️</button>
              <button v-if="userRole === 'admin'" class="card-action-btn delete" @click="deleteCard(item.id)">✕</button>
            </div>
          </div>
          <p>{{ item.continut }}</p>
        </div>
        <p v-if="glosar.length === 0" class="no-results">Nu s-au găsit termeni.</p>
      </div>

      <div v-if="activeTab === 'fisa'" class="section-box">
        <h2>Fișe de Instituții / Autorități</h2>
        <div class="card" v-for="item in fise" :key="item.id">
          <div class="card-header">
            <div class="card-title-row" v-if="userRole !== 'vizitator'">
              <input type="checkbox" :checked="selectedIds.includes(item.id)" @change="toggleSelect(item.id)" class="card-checkbox" />
              <h3>{{ item.titlu }}</h3>
            </div>
            <h3 v-else>{{ item.titlu }}</h3>
            <div class="card-actions">
              <button v-if="userRole === 'admin'" class="card-action-btn edit" @click="editCard(item)">✏️</button>
              <button v-if="userRole === 'admin'" class="card-action-btn move" @click="moveCard(item)">↕️</button>
              <button v-if="userRole === 'admin'" class="card-action-btn delete" @click="deleteCard(item.id)">✕</button>
            </div>
          </div>
          <p>{{ item.continut }}</p>
        </div>
        <p v-if="fise.length === 0" class="no-results">Nu s-au găsit fișe.</p>
      </div>

      <div v-if="activeTab === 'ghid'" class="section-box">
        <h2>Ghiduri / Procese</h2>
        <div class="card" v-for="item in ghiduri" :key="item.id">
          <div class="card-header">
            <div class="card-title-row" v-if="userRole !== 'vizitator'">
              <input type="checkbox" :checked="selectedIds.includes(item.id)" @change="toggleSelect(item.id)" class="card-checkbox" />
              <h3>{{ item.titlu }}</h3>
            </div>
            <h3 v-else>{{ item.titlu }}</h3>
            <div class="card-actions">
              <button v-if="userRole === 'admin'" class="card-action-btn edit" @click="editCard(item)">✏️</button>
              <button v-if="userRole === 'admin'" class="card-action-btn move" @click="moveCard(item)">↕️</button>
              <button v-if="userRole === 'admin'" class="card-action-btn delete" @click="deleteCard(item.id)">✕</button>
            </div>
          </div>
          <p>{{ item.continut }}</p>
        </div>
        <p v-if="ghiduri.length === 0" class="no-results">Nu au fost adăugate ghiduri.</p>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.educatie-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 30px;
  font-family: inherit;
  color: #1e293b;
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  box-sizing: border-box;
}

h1 {
  font-size: 1.8rem;
  font-weight: 800;
  margin: 0;
  color: #0f172a;
}

.search-container {
  position: relative;
  margin-bottom: 20px;
  max-width: 350px;
  flex-shrink: 0;
}

.search-wrapper {
  display: flex;
  align-items: center;
  background: transparent;
  border-radius: 30px;
  border: 1px solid transparent;
  box-shadow: none;
  overflow: visible;
  transition: all 0.3s ease;
  width: 45px;
  height: 45px;
}

.search-wrapper.is-open {
  width: 100%;
  max-width: 350px;
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid #e2e8f0;
  box-shadow: 0 8px 20px rgba(0,0,0,0.1);
}

.search-input {
  width: 100%;
  padding: 0 15px;
  border: none;
  outline: none;
  background: transparent;
  font-size: 0.9rem;
  color: #0f172a;
  font-family: inherit;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s ease 0.1s;
}

.search-wrapper.is-open .search-input {
  opacity: 1;
  pointer-events: auto;
}

.search-icon-btn {
  width: 45px;
  height: 45px;
  flex-shrink: 0;
  background: #ffffff;
  border: 2px solid #dc2626;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #0f172a;
  font-size: 1.1rem;
  font-weight: 800;
  font-family: inherit;
  transition: all 0.2s;

  &:hover {
    background: #dc2626;
    color: #ffffff;
  }
}

.search-dropdown {
  position: absolute;
  top: 55px;
  left: 0;
  width: 100%;
  max-width: 350px;
  max-height: 250px;
  overflow-y: auto;
  background: rgba(255, 255, 255, 0.98);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  box-shadow: 0 10px 25px rgba(0,0,0,0.15);
  border: 1px solid #e2e8f0;
  z-index: 100;
}

.dropdown-item {
  padding: 12px 16px;
  font-size: 0.9rem;
  color: #1e293b;
  cursor: pointer;
  transition: 0.2s;
  border-bottom: 1px solid #f1f5f9;
  
  &:hover {
    background: #f8fafc;
    color: #2563eb;
  }
}

.back-btn {
  background: #ffffff;
  color: #000000;
  border: 2px solid #dc2626;
  padding: 10px 24px;
  border-radius: 50px;
  font-size: 0.9rem;
  font-weight: 800;
  font-family: inherit;
  cursor: pointer;
  margin-bottom: 20px;
  transition: all 0.1s ease;
  flex-shrink: 0;

  &:hover {
    color: #dc2626;
    box-shadow: 0 4px 0 #b91c1c, 0 6px 12px rgba(0,0,0,0.15);
  }

  &:active {
    transform: translateY(4px);
    box-shadow: 0 0 0 #b91c1c;
  }
}

.header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  flex-wrap: wrap;
  gap: 10px;
  flex-shrink: 0;
}

.header-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.select-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.select-stacked-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.red-badge {
  width: 24px;
  height: 24px;
  background: #ffffff;
  border: 2px solid #dc2626;
  border-radius: 50%;
  color: #000000;
  font-size: 0.75rem;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.export-btn {
  background: #f1f5f9;
  color: #475569;
  border: 1px solid #e2e8f0;
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 0.8rem;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: 0.2s;
  white-space: nowrap;

  &:hover {
    background: #e2e8f0;
    color: #1e293b;
  }
}

.add-sort-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: stretch;
}

.add-card-btn {
  background: #16a34a;
  color: white;
  border: none;
  padding: 12px 20px;
  border-radius: 8px;
  font-size: 0.9rem;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
  transition: 0.2s;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  white-space: nowrap;

  &:hover {
    background: #15803d;
  }
}

.sort-select {
  padding: 10px 14px;
  border: 2px solid #e2e8f0;
  border-radius: 8px;
  font-size: 0.85rem;
  font-family: inherit;
  outline: none;
  cursor: pointer;
  background: white;
  color: #1e293b;

  &:focus {
    border-color: #3b82f6;
  }
}

/* --- NOU: Tab-uri de navigare --- */
.tabs-container {
  display: flex;
  gap: 0;
  margin-bottom: 20px;
  border-bottom: 2px solid #e2e8f0;
  flex-shrink: 0;
}

.tab-btn {
  background: transparent;
  border: none;
  padding: 12px 24px;
  font-size: 0.95rem;
  font-weight: 600;
  font-family: inherit;
  color: #64748b;
  cursor: pointer;
  border-bottom: 3px solid transparent;
  margin-bottom: -2px;
  transition: all 0.2s;

  &.active {
    color: #1e293b;
    border-bottom-color: #2563eb;
  }

  &:hover:not(.active) {
    color: #334155;
    background: #f8fafc;
  }
}

/* --- NOU: Container pentru carduri (o singură coloană) --- */
.sections-wrapper-single {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  margin-top: 0;
}

.section-box {
  height: 100%;
  overflow-y: auto;
  padding-right: 10px;
  box-sizing: border-box;

  &::-webkit-scrollbar {
    width: 8px;
  }
  &::-webkit-scrollbar-track {
    background: #f1f5f9;
    border-radius: 4px;
  }
  &::-webkit-scrollbar-thumb {
    background: #cbd5e1;
    border-radius: 4px;
    &:hover {
      background: #94a3b8;
    }
  }

  h2 {
    font-size: 1.2rem;
    font-weight: 700;
    margin-bottom: 20px;
    padding-bottom: 10px;
    border-bottom: 3px solid #e2e8f0;
    color: #334155;
    position: sticky;
    top: 0;
    background: white;
    z-index: 10;
    margin-top: 0;
  }
}

.card {
  background: #ffffff;
  padding: 20px;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  box-shadow: 0 2px 4px rgba(0,0,0,0.03);
  margin-bottom: 16px;
  transition: box-shadow 0.2s;

  &:hover {
    box-shadow: 0 4px 12px rgba(0,0,0,0.06);
  }

  h3 {
    font-size: 1.05rem;
    font-weight: 700;
    color: #1e293b;
    margin: 0 0 10px 0;
  }

  p {
    font-size: 0.9rem;
    line-height: 1.6;
    color: #475569;
    margin: 0;
    white-space: pre-wrap; 
  }
}

.no-results {
  font-size: 0.9rem;
  color: #94a3b8;
  font-style: italic;
}

.educatie-popup {
  position: fixed;
  width: 450px;
  background: #ffffff;
  border-radius: 16px;
  box-shadow: 0 20px 50px rgba(0,0,0,0.25);
  border: 1px solid #e2e8f0;
  z-index: 1100;
  user-select: none;
  overflow: hidden;
}

.popup-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  cursor: grab;
  font-weight: 700;
  color: #1e293b;

  &:active { cursor: grabbing; }
}

.popup-close-btn {
  background: #e2e8f0;
  border: none;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  font-size: 0.9rem;
  cursor: pointer;
  color: #64748b;
  transition: 0.2s;

  &:hover { background: #dc2626; color: white; }
}

.popup-body {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-row {
  display: flex;
  flex-direction: column;
  gap: 6px;

  label {
    font-size: 0.8rem;
    font-weight: 700;
    color: #64748b;
    text-transform: uppercase;
  }

  input, select, textarea {
    width: 100%;
    padding: 10px 14px;
    border: 1.5px solid #cbd5e1;
    border-radius: 8px;
    font-size: 0.9rem;
    font-family: inherit;
    outline: none;
    box-sizing: border-box;
    color: #0f172a;
    transition: 0.2s;

    &:focus {
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
    }
  }

  textarea { resize: vertical; }
}

.form-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 8px;
}

.btn-save {
  background: #16a34a;
  color: white;
  border: none;
  padding: 10px 24px;
  border-radius: 8px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
  transition: 0.2s;

  &:hover { background: #15803d; }
}

.btn-cancel {
  background: #f1f5f9;
  color: #475569;
  border: 1px solid #e2e8f0;
  padding: 10px 24px;
  border-radius: 8px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
  transition: 0.2s;

  &:hover { background: #e2e8f0; }
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  
  h3 {
    margin: 0;
    flex-grow: 1;
  }
}

.card-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
  margin-left: 10px;
}

.card-action-btn {
  background: #e2e8f0;
  border: none;
  width: 26px;
  height: 26px;
  border-radius: 6px;
  font-size: 0.85rem;
  cursor: pointer;
  color: #64748b;
  transition: 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;

  &.delete:hover { background: #dc2626; color: white; }
  &.edit:hover { background: #2563eb; color: white; }
  &.move:hover { background: #f59e0b; color: white; }
}

.card-title-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  flex-grow: 1;
}

.card-checkbox {
  width: 18px;
  height: 18px;
  margin-top: 4px;
  cursor: pointer;
  flex-shrink: 0;
}

</style>
