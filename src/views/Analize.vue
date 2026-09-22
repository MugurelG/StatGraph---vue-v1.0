<template>
  <div class="analize-container">
    
    <button class="back-to-dashboard-btn" @click="goBackToDashboard">
      ⬅ Înapoi la Dashboard
    </button>

    <div class="analize-header">
      <h1>Suite de Analize Premium</h1>
      <p>Generați rapoarte avansate, simulări statistice și comparații instituționale profunde.</p>
    </div>
    
    <div class="tools-grid">
      <div class="tool-card" @click="openComparator">
        <div class="tool-icon">⚖️</div>
        <h3>Comparator Organigrame</h3>
        <p>Selectează instituții folosind filtre ierarhice și compară vizual structurile HR și bugetele.</p>
        <button class="tool-btn">Deschide Instrumentul</button>
      </div>
      <div class="tool-card">
        <div class="tool-icon">📊</div>
        <h3>Simulator Bugetar (What-If)</h3>
        <p>Simulează impactul financiar al creării de posturi noi sau al reorganizării departamentelor.</p>
        <button class="tool-btn" disabled>În curând</button>
      </div>
      <div class="tool-card">
        <div class="tool-icon">⭕</div>
        <h3>Grafice Euler-Venn</h3>
        <p>Vizualizează intersecții de seturi de date pentru analize statistice complexe.</p>
        <button class="tool-btn" disabled>În curând</button>
      </div>
    </div>

    <!-- MODAL COMPARATOR CU FILTRE ȘI ARBORE -->
    <div v-if="showComparatorModal" class="comparator-overlay" @click.self="showComparatorModal = false">
      <div class="comparator-modal-box">
        <div class="comparator-header">
          <h2>Comparator Multiplu</h2>
          <button class="comparator-close" @click="showComparatorModal = false">✕</button>
        </div>

        <div class="setup-zone">
          <!-- STÂNGA: FILTRE ÎN CASCADĂ -->
          <div class="selection-panel">
            <h4>1. Filtrează Instituțiile</h4>
            
            <div class="filter-group">
              <label>Nivel:</label>
              <select v-model="filterLevel" @change="resetFilters" class="filter-select">
                <option value="national">Național</option>
                <option value="judetean">Județean</option>
                <option value="local">Local</option>
              </select>
            </div>

            <div v-if="filterLevel === 'national'" class="filter-group">
              <label>Categorie:</label>
              <div class="btn-chips">
                <button v-for="cat in ['Presedintie', 'Guvern', 'Parlament', 'Justitie', 'C.S.A.T.']" :key="cat" 
                        @click="fetchInstitutions({ numeNode: cat })" 
                        :class="['chip', { active: activeCategory === cat }]">
                  {{ cat }}
                </button>
              </div>
            </div>

            <div v-if="filterLevel === 'judetean'">
              <div class="filter-group">
                <label>Județ:</label>
                <select v-model="selectedJudet" @change="fetchInstitutions()" class="filter-select">
                  <option value="">Selectează...</option>
                  <option v-for="j in judete" :key="j.id" :value="j.id">{{ j.nume }}</option>
                </select>
              </div>
              <div class="filter-group" v-if="selectedJudet">
                <label>Categorie:</label>
                <div class="btn-chips">
                  <button v-for="cat in ['Consilii', 'Prefecturi', 'Deconcentrate', 'Siguranta']" :key="cat" 
                          @click="fetchInstitutions({ tipInstitutie: cat })" 
                          :class="['chip', { active: activeCategory === cat }]">
                    {{ cat }}
                  </button>
                </div>
              </div>
            </div>

            <div v-if="filterLevel === 'local'">
              <div class="filter-group">
                <label>Județ:</label>
                <select v-model="selectedJudet" @change="fetchLocalities()" class="filter-select">
                  <option value="">Selectează...</option>
                  <option v-for="j in judete" :key="j.id" :value="j.id">{{ j.nume }}</option>
                </select>
              </div>
              <div class="filter-group" v-if="selectedJudet">
                <label>Tip Localitate:</label>
                <select v-model="selectedTip" @change="fetchLocalities()" class="filter-select">
                  <option value="">Selectează...</option>
                  <option value="Municipii">Municipii</option>
                  <option value="Orașe">Orașe</option>
                  <option value="Comune">Comune</option>
                </select>
              </div>
              <div class="filter-group" v-if="localitati.length > 0">
                <label>Localitate:</label>
                <select v-model="selectedLocalitate" @change="fetchInstitutions()" class="filter-select">
                  <option value="">Selectează...</option>
                  <option v-for="loc in localitati" :key="loc.id" :value="loc">{{ loc.nume }}</option>
                </select>
              </div>
              <div class="filter-group" v-if="selectedLocalitate">
                <label>Entitate:</label>
                <div class="btn-chips">
                  <button v-for="cat in ['Primărie', 'Consiliu Local', 'Servicii']" :key="cat" 
                          @click="fetchInstitutions({ tipInstitutie: cat })" 
                          :class="['chip', { active: activeCategory === cat }]">
                    {{ cat }}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- DREAPTA: LISTĂ ARBORESCENTĂ (BIFARE) -->
          <div class="selection-panel">
            <div class="tree-header">
              <h4>2. Selectează pentru comparare ({{ selectedInstitutions.length }} selectate)</h4>
              <button v-if="nodePath.length > 0" class="tree-back-btn" @click="goBackLevel">
                ⬅ Înapoi
              </button>
            </div>

            <div class="breadcrumb-tree" v-if="nodePath.length > 0">
              <span v-for="(p, i) in nodePath" :key="i">{{ p.nume }} /</span>
            </div>

            <div class="checkbox-list" v-if="displayList.length > 0">
              <div v-for="inst in displayList" :key="inst.id" class="tree-item">
                <label class="checkbox-item">
                  <input type="checkbox" :value="inst" v-model="selectedInstitutions" />
                  <span>{{ inst.nume }}</span>
                </label>
                <button class="expand-btn" @click="expandNode(inst)" :disabled="isFetching" title="Vezi subordonatele">
                  ➔
                </button>
              </div>
            </div>
            <div v-else class="empty-state">
              Folosește filtrele din stânga pentru a afișa instituțiile.<br>
              <span v-if="isFetching">Caut...</span>
            </div>
          </div>
        </div>

        <div class="metrics-zone">
          <h4>3. Metrici de comparat:</h4>
          <div class="btn-chips">
            <label v-for="metric in availableMetrics" :key="metric.key" class="chip-toggle">
              <input type="checkbox" :value="metric.key" v-model="selectedMetrics" />
              {{ metric.label }}
            </label>
          </div>
        </div>

        <button class="run-compare-btn" @click="runComparison" :disabled="selectedInstitutions.length < 2 || selectedMetrics.length === 0 || isComparing">
          {{ isComparing ? 'Calculez...' : `Compară ${selectedInstitutions.length} Instituții` }}
        </button>

        <!-- REZULTATELE -->
        <div v-if="comparisonMatrix" class="comparison-results" id="comparator-pdf-section">
          <table class="comparison-table">
            <thead>
              <tr>
                <th>Metrică</th>
                <th v-for="inst in selectedInstitutions" :key="inst.id">{{ inst.nume }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="metric in availableMetrics.filter(m => selectedMetrics.includes(m.key))" :key="metric.key">
                <td class="metric-name">{{ metric.label }}</td>
                <td v-for="inst in selectedInstitutions" :key="inst.id">
                  {{ comparisonMatrix[inst.id] ? comparisonMatrix[inst.id][metric.key] : '-' }}
                </td>
              </tr>
            </tbody>
          </table>
          <button class="tool-btn" style="margin-top: 20px;" @click="exportComparatorPDF">📥 Descarcă Raport PDF</button>
        </div>

      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { supabase } from '../supabaseClient';
import html2pdf from 'html2pdf.js';

const router = useRouter();
const goBackToDashboard = () => router.push('/dashboard');

const showComparatorModal = ref(false);
const isFetching = ref(false);
const isComparing = ref(false);
const comparisonMatrix = ref(null);

// Stări Filtrare
const filterLevel = ref('national');
const judete = ref([]);
const localitati = ref([]);
const selectedJudet = ref('');
const selectedTip = ref('');
const selectedLocalitate = ref('');
const activeCategory = ref('');
const filteredInstitutions = ref([]);
const selectedInstitutions = ref([]);

// Stări Navigare Arbore
const displayList = ref([]);
const nodePath = ref([]);
const listHistory = ref([]);

// Metrici
const availableMetrics = ref([
  { key: 'totalPosts', label: 'Total Posturi' },
  { key: 'ocupate', label: 'Ocupate' },
  { key: 'vacante', label: 'Vacante' },
  { key: 'budget', label: 'Buget Estimat (RON)' }
]);
const selectedMetrics = ref(['totalPosts', 'budget']);

// --- FUNCȚII FETCH ---
const fetchJudete = async () => {
  const { data } = await supabase.from('judete').select('id, nume').order('nume', { ascending: true });
  if (data) judete.value = data;
};

const fetchLocalities = async () => {
  localitati.value = [];
  selectedLocalitate.value = '';
  if (!selectedJudet.value || !selectedTip.value) return;
  
  const { data, error } = await supabase
    .from('localitati')
    .select('nume, id')
    .eq('judet_id', selectedJudet.value)
    .eq('tip', selectedTip.value) 
    .order('nume');
    
  if (error) console.error('Eroare Supabase:', error);
  else localitati.value = data || [];
};

const resetFilters = () => {
  selectedJudet.value = '';
  selectedTip.value = '';
  selectedLocalitate.value = '';
  activeCategory.value = '';
  filteredInstitutions.value = [];
  displayList.value = [];
  nodePath.value = [];
  listHistory.value = [];
};

const fetchInstitutions = async (extraParams = {}) => {
  isFetching.value = true;
  filteredInstitutions.value = [];
  
  if (extraParams.numeNode) activeCategory.value = extraParams.numeNode;
  if (extraParams.tipInstitutie) activeCategory.value = extraParams.tipInstitutie;

  let query = supabase.from('institutii').select('id, nume').eq('context_tip', filterLevel.value);

  if (filterLevel.value === 'national') {
    if (extraParams.numeNode) query = query.eq('nume', extraParams.numeNode);
  } else if (filterLevel.value === 'judetean') {
    if (!selectedJudet.value) { isFetching.value = false; return; }
    const judetNume = judete.value.find(j => j.id === selectedJudet.value)?.nume;
    if (judetNume) query = query.eq('judet', judetNume);
    if (extraParams.tipInstitutie) query = query.eq('tip_institutie', extraParams.tipInstitutie);
  } else if (filterLevel.value === 'local') {
    if (!selectedLocalitate.value) { isFetching.value = false; return; }
    query = query.eq('localitate_id', selectedLocalitate.value.id);
    if (extraParams.tipInstitutie) query = query.ilike('nume', `%${extraParams.tipInstitutie}%`);
  }

  const { data, error } = await query.order('nume');
  if (!error && data) {
    filteredInstitutions.value = data;
    displayList.value = data; // Afișăm rădăcinile
    nodePath.value = []; // Resetăm calea arborelui
    listHistory.value = []; // Resetăm istoricul
  }
  isFetching.value = false;
};

// --- LOGICĂ ARBORE (DRILL-DOWN) ---
const expandNode = async (node) => {
  isFetching.value = true;
  
  // Căutăm copiii în tabela organograms
  const { data: children, error } = await supabase
    .from('organograms')
    .select('id, node_name')
    .eq('parent_id', node.id);
    
  if (error) {
    console.error('Eroare fetch copii:', error);
    isFetching.value = false;
    return;
  }
  
  if (children && children.length > 0) {
    // Salvăm lista curentă în istoric pentru a ne putea întoarce
    listHistory.value.push({ list: [...displayList.value], path: [...nodePath.value] });
    
    // Adăugăm nodul curent în path (breadcrumb)
    nodePath.value.push(node);
    
    // Mapăm copiii să aibă aceeași structură (id, nume)
    displayList.value = children.map(c => ({ id: c.id, nume: c.node_name }));
  } else {
    alert('Această instituție nu are subordonate directe în baza de date.');
  }
  
  isFetching.value = false;
};

const goBackLevel = () => {
  if (listHistory.value.length === 0) return;
  
  const prevState = listHistory.value.pop();
  displayList.value = prevState.list;
  nodePath.value = prevState.path;
};

const openComparator = async () => {
  showComparatorModal.value = true;
  comparisonMatrix.value = null;
  selectedInstitutions.value = [];
  resetFilters();
  filterLevel.value = 'national';
  if (judete.value.length === 0) fetchJudete();
};

// --- CALCULE COMPARAȚIE (Cu agregare recursivă) ---
const getInstitutionMetrics = async (node) => {
  let allIds = [node.id];
  let stack = [node.id];

  // 1. Urcăm toți descendenții pentru a calcula bugetul total
  while (stack.length > 0) {
    const currentId = stack.pop();
    const { data: children } = await supabase.from('organograms').select('id').eq('parent_id', currentId);
    if (children && children.length > 0) {
      const childIds = children.map(c => c.id);
      allIds = [...allIds, ...childIds];
      stack = [...stack, ...childIds];
    }
  }

  // 2. Aducem datele HR pentru toate nodurile găsite
  const { data: hrData } = await supabase.from('date_joburi').select('*').in('organogram_node_id', allIds);
  
  let totalPosts = 0, ocupate = 0, vacante = 0, budget = 0;
  
  if (hrData && hrData.length > 0) {
    hrData.forEach(row => {
      const occ = row.pozitii_ocupate || 0;
      const vac = row.pozitii_vacante || 0;
      ocupate += occ;
      vacante += vac;
      totalPosts += (occ + vac);
      if (row.fin_columns && Array.isArray(row.fin_columns)) {
        const baseCol = row.fin_columns.find(c => c.type === 'valoare');
        if (baseCol) budget += (parseFloat(baseCol.value) || 0) * occ;
      }
    });
  }
  return { totalPosts, ocupate, vacante, budget };
};

const runComparison = async () => {
  isComparing.value = true;
  comparisonMatrix.value = null;
  try {
    const promises = selectedInstitutions.value.map(inst => getInstitutionMetrics(inst));
    const results = await Promise.all(promises);
    const matrix = {};
    selectedInstitutions.value.forEach((inst, index) => { matrix[inst.id] = results[index]; });
    comparisonMatrix.value = matrix;
  } catch (err) {
    alert('Eroare la comparare.');
  } finally {
    isComparing.value = false;
  }
};

const exportComparatorPDF = () => {
  const element = document.getElementById('comparator-pdf-section');
  if (!element) return;
  const opt = { margin: 10, filename: `Raport_Comparativ.pdf`, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2 }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' } };
  html2pdf().set(opt).from(element).save();
};

onMounted(() => {
  fetchJudete();
});
</script>

<style scoped>
.analize-container { background-color: #0f172a; color: #e2e8f0; min-height: 100vh; padding: 60px 20px; font-family: 'Segoe UI', sans-serif; position: relative; }
.back-to-dashboard-btn { position: absolute; top: 30px; left: 30px; background: transparent; border: 1px solid #475569; color: #cbd5e1; padding: 10px 20px; border-radius: 8px; font-weight: 600; cursor: pointer; }
.back-to-dashboard-btn:hover { background: #1e293b; border-color: #94a3b8; }
.analize-header { text-align: center; margin-bottom: 60px; margin-top: 40px; }
.analize-header h1 { font-size: 2.5rem; background: linear-gradient(to right, #facc15, #f59e0b); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
.analize-header p { color: #94a3b8; }
.tools-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 30px; max-width: 1200px; margin: 0 auto; }
.tool-card { background: #1e293b; border: 1px solid #334155; border-radius: 16px; padding: 30px; text-align: center; cursor: pointer; transition: 0.2s; }
.tool-card:hover { border-color: #facc15; transform: translateY(-5px); }
.tool-icon { font-size: 3rem; margin-bottom: 15px; }
.tool-card h3 { color: #fff; }
.tool-card p { color: #94a3b8; font-size: 0.9rem; min-height: 60px; }
.tool-btn { background: linear-gradient(145deg, #facc15, #d97706); color: #0f172a; border: none; padding: 10px; border-radius: 6px; font-weight: 700; width: 100%; cursor: pointer; }

/* MODAL */
.comparator-overlay { position: fixed; top:0; left:0; right:0; bottom:0; background: rgba(0,0,0,0.8); z-index:100; display: flex; justify-content: center; align-items: center; padding: 20px; }
.comparator-modal-box { background: #1e293b; border-radius: 16px; width: 100%; max-width: 1100px; max-height: 90vh; overflow-y: auto; padding: 30px; border: 1px solid #475569; }
.comparator-header { display: flex; justify-content: space-between; border-bottom: 1px solid #334155; padding-bottom: 15px; margin-bottom: 20px; }
.comparator-header h2 { margin:0; color: #facc15; }
.comparator-close { background: #334155; color: #fff; border: none; width: 32px; height: 32px; border-radius: 8px; cursor: pointer; }

.setup-zone { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
.selection-panel { background: #0f172a; padding: 20px; border-radius: 12px; border: 1px solid #334155; display: flex; flex-direction: column; }
.tree-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.tree-header h4 { margin: 0; color: #94a3b8; font-size: 0.9rem; text-transform: uppercase; }
.tree-back-btn { background: #334155; color: #e2e8f0; border: none; padding: 4px 10px; border-radius: 6px; cursor: pointer; font-size: 0.8rem; }

.breadcrumb-tree { font-size: 0.75rem; color: #64748b; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px dashed #334155; word-break: break-all; }

.filter-group { margin-bottom: 15px; }
.filter-group label { display: block; font-size: 0.8rem; color: #94a3b8; margin-bottom: 5px; }
.filter-select { width: 100%; padding: 8px; background: #1e293b; border: 1px solid #475569; color: #fff; border-radius: 6px; box-sizing: border-box; }

.btn-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.chip { background: #334155; color: #e2e8f0; border: none; padding: 6px 12px; border-radius: 20px; font-size: 0.8rem; cursor: pointer; }
.chip.active { background: #facc15; color: #0f172a; font-weight: bold; }
.chip-toggle { display: flex; align-items: center; gap: 5px; background: #334155; padding: 6px 12px; border-radius: 20px; cursor: pointer; font-size: 0.8rem; }
.chip-toggle input { accent-color: #facc15; }

.checkbox-list { flex-grow: 1; max-height: 300px; overflow-y: auto; display: flex; flex-direction: column; gap: 5px; }
.tree-item { display: flex; justify-content: space-between; align-items: center; padding: 5px; border-radius: 4px; }
.tree-item:hover { background: #1e293b; }
.checkbox-item { display: flex; align-items: center; gap: 8px; font-size: 0.9rem; cursor: pointer; flex: 1; }
.checkbox-item input { width: 16px; height: 16px; accent-color: #facc15; }
.expand-btn { background: transparent; border: 1px solid #475569; color: #94a3b8; width: 24px; height: 24px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 0.8rem; flex-shrink: 0; }
.expand-btn:hover { background: #334155; color: #facc15; border-color: #facc15; }

.empty-state { color: #64748b; font-size: 0.9rem; text-align: center; padding: 40px 0; }

.metrics-zone { background: #0f172a; padding: 15px; border-radius: 12px; border: 1px solid #334155; margin-bottom: 20px; }
.metrics-zone h4 { margin: 0 0 10px 0; color: #94a3b8; font-size: 0.9rem; text-transform: uppercase; }

.run-compare-btn { width: 100%; padding: 14px; background: #3b82f6; color: white; border: none; border-radius: 8px; font-weight: 700; font-size: 1.1rem; cursor: pointer; margin-bottom: 20px; }
.run-compare-btn:disabled { background: #1e3a8a; cursor: not-allowed; opacity: 0.5; }

.comparison-results { background: #0f172a; padding: 20px; border-radius: 12px; border: 1px solid #334155; overflow-x: auto; }
.comparison-table { width: 100%; border-collapse: collapse; min-width: 600px; }
.comparison-table th { padding: 12px; border-bottom: 2px solid #475569; color: #facc15; text-align: left; }
.comparison-table td { padding: 12px; border-bottom: 1px solid #334155; color: #e2e8f0; }
.metric-name { font-weight: bold; }
</style>