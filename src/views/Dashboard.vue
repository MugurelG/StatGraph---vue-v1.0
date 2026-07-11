<script setup>
import { ref, onMounted, watch, nextTick, computed } from 'vue';
import { supabase } from '../supabaseClient';
import { useRouter } from 'vue-router'; // ADAUGAT: Pentru redirect la pagina de start
import { useAuth } from '../composables/useAuth'; // ADAUGAT: Pentru acces la funcția logout
import { VueFlow, useVueFlow } from '@vue-flow/core';
import SunburstChart from '../components/SunburstChart.vue';
import TreemapChart from '../components/TreemapChart.vue';
import AuthModal from '../components/auth/AuthModal.vue';
import html2pdf from 'html2pdf.js';
import { Home, Landmark, MapPin, Building, LogOut, Trash2, User, Pencil, Plus, Edit3, Move, Search } from 'lucide-vue-next';
// ADAUGAT: Inițializăm Router-ul și funcțiile de Autentificare
const router = useRouter();
const { user, userRole, logout } = useAuth();

// 1. Inițializăm VueFlow o singură dată
const { fitView, onConnect, addEdges } = useVueFlow();
onConnect((params) => addEdges(params));

// 2. Definim stările reactive
const columnCount = ref(3);
const elements = ref([]);
const allNodesList = ref([]);
const currentRootId = ref(null); // Setat default null, se va popula din DB
const activePanel = ref(null);
const localStep = ref(0);
const localContext = ref(false);
const isSwitcherOpen = ref(false);
// --- CĂUTARE GLOBALĂ (Pasul 1) ---
const isSearchOpen = ref(false);
const searchTerm = ref('');
const allInstitutions = ref([]);

// Funcție ajutătoare care elimină diacriticele (ă -> a, ș -> s etc)
const removeDiacritics = (str) => {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
};

// --- ETICHETE (Pasul 3) ---
const selectedTags = ref([]);

const selectInstitution = (inst) => {
  // Evităm duplicate
  if (!selectedTags.value.find(t => t.id === inst.id)) {
    selectedTags.value.push({ id: inst.id, nume: inst.nume });
      panelTags.value.push({ id: inst.id, nume: inst.nume });
  }
  searchTerm.value = ''; // Golim input-ul
};


const getShortName = (nume) => {
  // Eliminăm spațiile multiple, luăm primele 3 litere și facem litere mari
  const clean = nume.replace(/\s+/g, ' ').trim();
  return clean.substring(0, 3).toUpperCase() + '...';
};

const removeTag = (index) => {
  selectedTags.value.splice(index, 1);
  panelTags.value.splice(index, 1);
};

const searchResultNodes = ref([]);
const panelTags = ref([]);
const showSearchPanel = ref(false);

const toggleSearchPanel = () => {
  showSearchPanel.value = !showSearchPanel.value;
  
  if (showSearchPanel.value) {
    // Când DESCHIDEM panoul: curățăm doar câmpul de sus
    isSearchOpen.value = false;
    searchTerm.value = '';
  } else {
    // Când ÎNCHIDEM panoul (apasăm ✕): curățăm lista din panou
    panelTags.value = [];
  }
};

const handlePanelLinkClick = (tag) => {
  // 1. Injectăm datele în lista principală
  allNodesList.value = searchResultNodes.value;
  
  // 2. Setăm ID-ul nodului clickuit ca rădăcină
  currentRootId.value = String(tag.id);
  
  // 3. Curățăm stiva de navigare
  navigationStack.value = [];
  
  // 4. Curățăm insignele, butonul și câmpul de sus (fără a închide panoul)
  selectedTags.value = [];
  isSearchOpen.value = false;
  searchTerm.value = '';
};
const executeSearch = async () => {
  const ids = selectedTags.value.map(tag => String(tag.id));
  if (ids.length === 0) return;

  let combinedNodes = [];

  // 1. Căutăm în instituții (rădăcinile)
  const { data: rootData, error: err1 } = await supabase
    .from('institutii')
    .select('*')
    .in('id', ids);
  if (!err1 && rootData) combinedNodes = [...rootData];

  // 2. Căutăm în organograms DOAR dacă utilizatorul a selectat un sub-nod direct
  const { data: childData, error: err2 } = await supabase
    .from('organograms')
    .select('*')
    .in('id', ids);
  if (!err2 && childData) combinedNodes = [...combinedNodes, ...childData];
  
  // 3. Căutăm sub-nodurile celor selectate
  const { data: subChildrenData, error: err3 } = await supabase
    .from('organograms')
    .select('*')
    .in('parent_id', ids);
  if (!err3 && subChildrenData) combinedNodes = [...combinedNodes, ...subChildrenData];

  // Normalizăm datele
  const normalizedNodes = combinedNodes.map(node => ({
    ...node,
    id: node.id ? String(node.id).trim() : null,
    parent_id: node.parent_id ? String(node.parent_id).trim() : null,
    nume: node.nume || node.node_name
  })).filter(n => n.id);

   // Salvăm datele pentru a fi folosite la Pasul 6
  searchResultNodes.value = normalizedNodes;
};

const filteredInstitutions = computed(() => {
  if (!searchTerm.value || searchTerm.value.length < 2) return [];
  const term = removeDiacritics(searchTerm.value);
  return allInstitutions.value.filter(inst => removeDiacritics(inst.nume).includes(term));
});
const searchInputRef = ref(null);

const toggleSearch = () => {
  isSearchOpen.value = !isSearchOpen.value;
  if (isSearchOpen.value && searchInputRef.value) {
    nextTick(() => searchInputRef.value.focus());
  }
};

const closeSearch = () => {
  // Întârziere mică ca să permită click pe iconiță dacă e deja deschis
  setTimeout(() => {
    if (!searchTerm.value) {
      isSearchOpen.value = false;
    }
  }, 200);
}; 
const localitati = ref([]);
const judete = ref([]);
const judetSelectat = ref(null);
const numeJudetSelectat = ref(null);
const tipSelectat = ref(null);
const localitateSelectata = ref(null);
const currentView = ref('flow');
const navigationStack = ref([]);
const currentContextType = ref('national'); // Ține minte ce context afișăm
const showAccountMenu = ref(false);
const showAuthModal = ref(false);
const authModalMode = ref('login');
// Admin Tools State
const showAdminTools = ref(false);
const selectedAdminNode = ref(null);
const adminPanelPos = ref({ x: 80, y: 100 }); // Poziția inițială a pop-up-ului
const isDragging = ref(false);
const dragOffset = ref({ x: 0, y: 0 });



// --- VARIABILE PENTRU DRAWER UTILIZATOR ---
const showProfilePanel = ref(false);
const selectedUserData = ref(null);
const userHrData = ref([]);
const userSourceData = ref([]);

const openUserDetails = async (node) => {
  const nodeData = allNodesList.value.find(n => String(n.id) === String(node.id));
  if (nodeData) {
    selectedUserData.value = nodeData;
    showProfilePanel.value = true;
    showHrPopup.value = false;
    
    // Aducem datele Surse pentru acest nod
    const { data: sourceData, error: sourceError } = await supabase
      .from('surse_informatii')
      .select('*')
      .eq('organogram_node_id', String(node.id));
    
    if (!sourceError && sourceData) {
      userSourceData.value = sourceData.map(row => ({
        subiect: row.subiect || '',
        link: row.link_sursa || '',
        observatii: row.observatii || ''
      }));
    } else {
      userSourceData.value = [];
    }

    // Aducem datele HR pentru acest nod
    const { data, error } = await supabase
      .from('date_joburi')
      .select('*')
      .eq('organogram_node_id', String(node.id));
    
    if (!error && data) {
      userHrData.value = data.map(row => ({
        functie: row.functie || '',
        ocupate: row.pozitii_ocupate || 0,
        vacante: row.pozitii_vacante || 0,
        total: (row.pozitii_ocupate || 0) + (row.pozitii_vacante || 0),
        statut: row.statut || 'Activ'
      }));
    } else {
      userHrData.value = [];
    }
  }
};

// --- POP-UP STRUCTURĂ H.R. (Pasul 3) ---
const showHrPopup = ref(false);
const hrPopupPos = ref({ x: 300, y: 200 }); // Poziția inițială în centru
const isHrDragging = ref(false);
const hrDragOffset = ref({ x: 0, y: 0 });

const startHrDrag = (e) => {
  isHrDragging.value = true;
  const rect = e.currentTarget.closest('.hr-popup-container').getBoundingClientRect();
  hrDragOffset.value = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  document.addEventListener('mousemove', onHrDrag);
  document.addEventListener('mouseup', stopHrDrag);
};

const onHrDrag = (e) => {
  if (!isHrDragging.value) return;
  hrPopupPos.value = { x: e.clientX - hrDragOffset.value.x, y: e.clientY - hrDragOffset.value.y };
};

const stopHrDrag = () => {
  isHrDragging.value = false;
  document.removeEventListener('mousemove', onHrDrag);
  document.removeEventListener('mouseup', stopHrDrag);
};

const closeHrPopup = () => {
  showHrPopup.value = false;
};

const closeProfilePanel = () => {
  showProfilePanel.value = false;
  selectedUserData.value = null;
  userHrData.value = [];
};

// --- FUNCȚII EXPORT PDF ---
const exportProfilePDF = () => {
  const element = document.getElementById('user-profile-pdf-section');
  const hrTable = document.getElementById('hr-table-for-pdf');
  const pdfHeader = document.getElementById('pdf-header-section'); // ADAUGAT
  
  if (!element) return;

  // 1. Facem elementele ascunse vizibile temporar pentru captură
  if (hrTable) hrTable.style.display = 'block';
  if (pdfHeader) pdfHeader.style.display = 'block'; // ADAUGAT

  const opt = { 
    margin: [10, 10, 10, 10], 
    filename: `Profil_${selectedUserData.value?.nume || 'institutie'}.pdf`, 
    image: { type: 'jpeg', quality: 0.98 }, 
    html2canvas: { scale: 2, useCORS: true }, 
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
  };

  html2pdf().set(opt).from(element).save().finally(() => {
    // 2. După ce s-a terminat generarea, le ascundem din nou
    if (hrTable) hrTable.style.display = 'none';
    if (pdfHeader) pdfHeader.style.display = 'none'; // ADAUGAT
  });
};
const exportDetailsPDF = () => {
  const element = document.getElementById('user-details-section');
  const opt = { 
    margin: 10, 
    filename: `Detalii_${selectedUserData.value?.nume || 'institutie'}.pdf`, 
    image: { type: 'jpeg', quality: 0.98 }, 
    html2canvas: { scale: 2 }, 
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } 
  };
  html2pdf().set(opt).from(element).save();
};

const exportPosturiPDF = () => {
  const element = document.getElementById('user-hr-section');
  const opt = { 
    margin: 10, 
    filename: `Posturi_${selectedUserData.value?.nume || 'institutie'}.pdf`, 
    image: { type: 'jpeg', quality: 0.98 }, 
    html2canvas: { scale: 2 }, 
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' } // Landscape pentru tabel mai lat
  };
  html2pdf().set(opt).from(element).save();
};

const adminAction = ref(null); // 'create', 'edit', sau null
const adminFormData = ref({
  nume: '', 
  tip_institutie: '',
  acronim: '',
  cui: '',
  adresa: '',
  program: '',
  telefon: '',
  email: '',
  rol: '',
  website:'',
  news: '',
  relatie: ''
});

// Tabelul de jos (Date Personal)
const hrRows = ref([]);
const addHrRow = () => {  
hrRows.value.push({ functie: '', ocupate: 1, vacante: 0, statut: 'Activ' });
};
const removeHrRow = (index) => {
  hrRows.value.splice(index, 1);
};

// Tabelul Surse Informații
const sourceRows = ref([]);
const addSourceRow = () => {
  sourceRows.value.push({ subiect: '', link: '', observatii: '' });
};
const removeSourceRow = (index) => {
  sourceRows.value.splice(index, 1);
};


// Funcție ajutătoare pentru a aduce datele HR când edităm
const fetchHrData = async (nodeId) => {
  const { data, error } = await supabase
    .from('date_joburi')
    .select('*')
    .eq('organogram_node_id', nodeId);
  
  if (!error && data) {
    hrRows.value = data.map(row => ({
      functie: row.functie || '',
      ocupate: row.pozitii_ocupate || 0,
      vacante: row.pozitii_vacante || 0,
      statut: row.statut || 'Activ'
    }));
  } else {
    hrRows.value = [];
  }
};

const fetchSourceData = async (nodeId) => {
  const { data, error } = await supabase
    .from('surse_informatii')
    .select('*')
    .eq('organogram_node_id', nodeId);
  
  if (!error && data) {
    sourceRows.value = data.map(row => ({
      subiect: row.subiect || '',
      link: row.link_sursa || '',
      observatii: row.observatii || ''
    }));
  } else {
    sourceRows.value = [];
  }
};


const isSavingNode = ref(false);
const adminMessage = ref({ text: '', type: '' });

// Upload Imagini
const selectedFile = ref(null);
const imagePreview = ref(null);
const removeImage = ref(false);

const onFileChange = (event) => {
  const file = event.target.files[0];
  if (!file) return;
  selectedFile.value = file;
  // Creăm un link temporar ca să vedem preview-ul în formular înainte să salvăm
  imagePreview.value = URL.createObjectURL(file);
};

const uploadImage = async (file) => {
  // Generăm un nume unic ca să nu suprascriem alte poze (ex: 1690000000_guvern.jpg)
  const fileName = `${Date.now()}_${file.name.replace(/\s/g, '_')}`;
  
  const { error } = await supabase.storage
    .from('poze_institutii')
    .upload(fileName, file);

  if (error) throw error;

  // Returnăm link-ul public complet
  const { data } = supabase.storage
    .from('poze_institutii')
    .getPublicUrl(fileName);

  return data.publicUrl;
};
// Lightbox pentru imagini
const showLightbox = ref(false);
const lightboxImage = ref(null);

const openLightbox = (url) => {
  lightboxImage.value = url;
  showLightbox.value = true;
};

const closeLightbox = () => {
  showLightbox.value = false;
  lightboxImage.value = null;
};

const isMoveMode = ref(false);
const moveTargetNode = ref(null);

// 3. Funcție pentru actualizarea layout-ului (curățată)
const updateLayout = () => {
  const nodes = elements.value.filter(e => !e.source); // Doar nodurile, nu edge-urile
  if (!nodes.length) return;

  const rootNode = nodes.find(n => n.id === currentRootId.value);
  const childNodes = nodes.filter(n => n.id !== currentRootId.value);

  const fixedNodeWidth = 270;
  const nodeHeight = 60;
  const gap = 30;
  const startY = 150;

  if (rootNode) {
    rootNode.position = { 
      x: (fixedNodeWidth + gap) * (columnCount.value / 2 - 0.5), 
      y: 0 
    };
  }

  childNodes.forEach((node, index) => {
    const col = index % columnCount.value;
    const row = Math.floor(index / columnCount.value);
    
    node.position = {
      x: col * (fixedNodeWidth + gap),
      y: startY + (row * (nodeHeight + gap))
    };
    
    node.style = { 
      ...node.style, 
      width: `${fixedNodeWidth}px`, 
      height: `${nodeHeight}px`,
     };
  });

  nextTick(() => {
    fitView({ duration: 500, padding: 0.2 });
  });
};

// 4. Computed pentru vizualizările alternative 
// Acesta generează arborele COMPLET
const chartData = computed(() => {
  const rootNode = allNodesList.value.find(n => String(n.id) === String(currentRootId.value));
  if (!rootNode) return { name: "Root", children: [] };

  const buildTree = (nodeId) => {
    const node = allNodesList.value.find(n => String(n.id) === String(nodeId));
    if (!node) return null;

    const children = allNodesList.value.filter(n => String(n.parent_id) === String(nodeId));
    
    return {
      name: node.nume || node.node_name || "N/A",
      children: children.length > 0 
        ? children.map(child => buildTree(child.id)).filter(Boolean) 
        : []
    };
  };

  return buildTree(currentRootId.value);
});

// NOU: Computed care filtrează datele în funcție de rolul utilizatorului
const visibleChartData = computed(() => {
  const fullTree = chartData.value;
  if (!fullTree) return null;

  // Dacă este conectat (utilizator sau admin), returnăm datele complete
  if (userRole.value !== 'vizitator') return fullTree;

  // Dacă este vizitator, "tăiem" copiii de la nivelul 1 în jos
  // Arborele va avea doar Rădăcina și Copiii direcți (fără "nepoți")
  const pruneTree = (node, currentDepth) => {
    if (!node) return null;
    
    const prunedNode = { name: node.name };
    
    // Permitem adăugarea copiilor DOAR pentru Rădăcină (depth 0)
    if (currentDepth === 0 && node.children && node.children.length > 0) {
      prunedNode.children = node.children.map(child => ({
        name: child.name // Copiem doar numele copilului, dar NU și copiii lui (fără "children" array)
      }));
    }
    
    return prunedNode;
  };

  return pruneTree(fullTree, 0);
});

const currentViewComponent = computed(() => {
  if (currentView.value === 'sunburst') return SunburstChart;
  if (currentView.value === 'treemap') return TreemapChart;
  return null;
});

// 5. Watcher pentru Graph
watch([allNodesList, currentRootId, currentView], async ([newList, newRoot, newView]) => {
  if (newView === 'flow') {
    elements.value = buildElements(newList, newRoot);
    
    // Așteptăm ca Vue Flow să pună nodurile în DOM
    await nextTick();
    
    // Apelăm automat funcția de layout ca să le despacheteze (să le pună pe coloane)
    updateLayout(); 
    
    // Facem zoom out să le încapă pe toate pe ecran
    fitView({ duration: 800, padding: 0.2 });
  }
}, { immediate: true });

// 6. Interacțiuni pe Graph
const onNodeClick = (event) => {
  // INTERCEPTARE MUTARE: Dacă suntem în modul "Muta", așteptăm click pe noul părinte
  if (isMoveMode.value) {
    moveTargetNode.value = event.node;
    executeMove();
    return; // Oprim aici, nu face drill-down
  }

  const clickedNodeId = String(event.node.id);
  const clickedNode = allNodesList.value.find(n => String(n.id) === clickedNodeId);

  // BLOCARE VIZITATOR
  if (userRole.value === 'vizitator' && event.node.data?.subCount > 0) {
    authModalMode.value = 'register';
    showAuthModal.value = true;
    return; 
  }

  // LOGICA NORMALĂ (Pentru Utilizator și Admin)
  if (clickedNode && clickedNode.parent_id !== null && clickedNodeId !== currentRootId.value) {
    navigationStack.value.push(currentRootId.value);
    currentRootId.value = clickedNodeId;
  }
};

// Selectare nod exclusiv prin Click Dreapta (pt Admin) - ACUM ESTE SEPARAT CORECT
const onNodeRightClick = (event) => {
  // Oprim meniul implicit al browserului
  event.event.preventDefault();

  // Dacă nu e admin sau panoul de unelte nu e deschis, ignoră
  if (userRole.value !== 'admin' || !showAdminTools.value) return;

  // Setăm nodul ca fiind selectat (acesta va declanșa watch-ul pentru chenarul galben)
  selectedAdminNode.value = event.node;
};

const goBack = () => {
  if (navigationStack.value.length > 0) {
    currentRootId.value = navigationStack.value.pop();
    updateLayout();
  }
};

// --- LOGICA ADMIN TOOLS ---
const toggleAdminTools = () => {
  showAdminTools.value = !showAdminTools.value;
};

const onAdminNodeClick = (event) => {
  if (userRole.value !== 'admin' || !showAdminTools.value) return;
  selectedAdminNode.value = event.node;
};

// Drag & Drop pentru fereastra pop-up
const startDrag = (e) => {
  isDragging.value = true;
  const rect = e.currentTarget.closest('.admin-tools-panel').getBoundingClientRect();
  dragOffset.value = {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top
  };
  document.addEventListener('mousemove', onDrag);
  document.addEventListener('mouseup', stopDrag);
};

const onDrag = (e) => {
  if (!isDragging.value) return;
  adminPanelPos.value = {
    x: e.clientX - dragOffset.value.x,
    y: e.clientY - dragOffset.value.y
  };
};

const stopDrag = () => {
  isDragging.value = false;
  document.removeEventListener('mousemove', onDrag);
  document.removeEventListener('mouseup', stopDrag);
};

// Evidențiază vizual nodul selectat de Admin (prin stil inline, sigur funcționează)
watch(selectedAdminNode, (newNode) => {
  const selectedId = newNode ? String(newNode.id) : null;
  
  elements.value.forEach(el => {
    if (el.source) return; // Ignorăm liniile (edge-urile)
    
    if (String(el.id) === selectedId) {
      // Dacă e nodul selectat, îi adăugăm conturul galben
      el.style = { 
        ...el.style, 
        outline: '3px solid #facc15', 
        outlineOffset: '4px', 
        filter: 'brightness(1.1)' 
      };
    } else {
      // Dacă NU e nodul selectat, ștergem conturul dacă exista
      const cleanStyle = { ...el.style };
      delete cleanStyle.outline;
      delete cleanStyle.outlineOffset;
      delete cleanStyle.filter;
      el.style = cleanStyle;
    }
  });
});

const handleAdminCreate = () => {
  if (!selectedAdminNode.value) return;
  adminAction.value = 'create';
  adminFormData.value = { nume: '', tip_institutie: '', news: '', relatie: '' };
  hrRows.value = []; // ADAUGAT: Golește rândurile vechi
    hrRows.value = []; 
  sourceRows.value = []; // ADAUGAT
  adminMessage.value = { text: '', type: '' };
};

const cancelAdminAction = () => {
  adminAction.value = null;
  adminMessage.value = { text: '', type: '' };
};

const handleAdminEdit = async () => {
  if (!selectedAdminNode.value) return;
  adminAction.value = 'edit';
  adminMessage.value = { text: '', type: '' };
  selectedFile.value = null;
  removeImage.value = false;
  
  const nodeData = allNodesList.value.find(n => String(n.id) === String(selectedAdminNode.value.id));
  if (nodeData) {
    // Preluăm datele din COLOANELE REALE (nu din metadata)
    adminFormData.value = {
      nume: nodeData.nume || nodeData.node_name || '',
      tip_institutie: nodeData.metadata?.tip || '',
      acronim: nodeData.acronim || '',
      cui: nodeData.cui || '',
      adresa: nodeData.adresa || '',
      program: nodeData.program || '',
      telefon: nodeData.telefon || '',
      email: nodeData.email || '',
      email: nodeData.email || '',
      news: nodeData.metadata?.news || '', // ADAUGAT
      rol: nodeData.rol || '',
      website: nodeData.website || '',
      relatie: (() => {
        if (!nodeData.parent_id) return nodeData.metadata?.relatie_superioara || '';
        const parentNode = allNodesList.value.find(n => String(n.id) === String(nodeData.parent_id));
        return parentNode ? (parentNode.nume || parentNode.node_name) : '';
      })()
    };
    imagePreview.value = nodeData.metadata?.imagine || null;
    
    // Aducem datele HR din tabelul date_joburi
    await fetchHrData(selectedAdminNode.value.id);
        await fetchHrData(selectedAdminNode.value.id);
    await fetchSourceData(selectedAdminNode.value.id); // ADAUGAT
  }
};

const saveAdminNode = async () => {
  if (!adminFormData.value.nume.trim()) {
    adminMessage.value = { text: 'Denumirea instituției este obligatorie.', type: 'error' };
    return;
  }

  isSavingNode.value = true;
  const nodeId = String(selectedAdminNode.value.id);
  let error = null;
  let data = null;
  let finalImageUrl = null;

  // 1. Gestionarea Imaginii (rămâne în metadata)
  if (adminAction.value === 'edit') {
    const nodeInfo = allNodesList.value.find(n => String(n.id) === nodeId);
    if (selectedFile.value) {
      try { finalImageUrl = await uploadImage(selectedFile.value); } 
      catch (e) { isSavingNode.value = false; adminMessage.value = { text: 'Eroare poză: ' + e.message, type: 'error' }; return; }
    } else if (removeImage.value) { finalImageUrl = null; } 
    else { finalImageUrl = nodeInfo?.metadata?.imagine || null; }
  }

  // 2. Logica de CREARE
  if (adminAction.value === 'create') {
    const selectedNodeData = allNodesList.value.find(n => String(n.id) === nodeId);
    const institutieId = selectedNodeData?.institutie_id || nodeId;

    const insertData = {
      node_name: adminFormData.value.nume,
      parent_id: nodeId,
      institutie_id: institutieId,
      // Salvăm în COLOANELE REALE
      acronim: adminFormData.value.acronim,
      cui: adminFormData.value.cui,
      adresa: adminFormData.value.adresa,
      program: adminFormData.value.program,
      telefon: adminFormData.value.telefon,
      email: adminFormData.value.email,
      rol: adminFormData.value.rol,
      website: adminFormData.value.website,
      // Păstrăm metadata doar pentru ce nu are coloană proprie
      metadata: { tip: adminFormData.value.tip_institutie, imagine: finalImageUrl, news: adminFormData.value.news, relatie_superioara: adminFormData.value.relatie }  
    };

    const res = await supabase.from('organograms').insert([insertData]).select();
    error = res.error; 
    data = res.data;

    // 2.1. Salvăm rândurile de HR (dacă există) folosind ID-ul nodului nou creat
    if (!error && data && data[0] && hrRows.value.length > 0) {
      const hrInserts = hrRows.value.map(row => ({
        organogram_node_id: data[0].id, // Legăm de noul nod
        functie: row.functie,
        pozitii_ocupate: row.ocupate,
        pozitii_vacante: row.vacante,
        salariu_minim: null,
        salariu_maxim: null,
        statut: row.statut
      }));
      const { error: hrErr } = await supabase.from('date_joburi').insert(hrInserts); // MODIFICAT
      if (hrErr) console.error('Eroare HR Create:', hrErr.message); // ADAUGAT
    }

        // 2.2. Salvăm rândurile de Surse (dacă există)
    if (!error && data && data[0] && sourceRows.value.length > 0) {
      const sourceInserts = sourceRows.value.map(row => ({
        organogram_node_id: data[0].id,
        subiect: row.subiect,
        link_sursa: row.link,
        observatii: row.observatii
      }));
      await supabase.from('surse_informatii').insert(sourceInserts);
    }

  // 3. Logica de EDITARE
  } else if (adminAction.value === 'edit') {
    const nodeInfo = allNodesList.value.find(n => String(n.id) === nodeId);
    
    if (!nodeInfo || nodeInfo.parent_id === null) {
      // Dacă e NOD RĂDĂCINĂ (tabelul institutii)
      const res = await supabase.from('institutii')
        .update({ 
          nume: adminFormData.value.nume,
          acronim: adminFormData.value.acronim,
          cui: adminFormData.value.cui,
          adresa: adminFormData.value.adresa,
          program: adminFormData.value.program,
          telefon: adminFormData.value.telefon,
          email: adminFormData.value.email,
          rol: adminFormData.value.rol,
          metadata: { tip: adminFormData.value.tip_institutie, imagine: finalImageUrl, news: adminFormData.value.news, relatie_superioara: adminFormData.value.relatie } 
        })
        .eq('id', nodeId)
        .select();
      error = res.error; data = res.data;
    } else {
      // Dacă e SUB-NOD (tabelul organograms)
      const res = await supabase.from('organograms')
        .update({ 
          node_name: adminFormData.value.nume,
          acronim: adminFormData.value.acronim,
          cui: adminFormData.value.cui,
          adresa: adminFormData.value.adresa,
          program: adminFormData.value.program,
          telefon: adminFormData.value.telefon,
          email: adminFormData.value.email,
          rol: adminFormData.value.rol,
          website: adminFormData.value.website,
          metadata: { tip: adminFormData.value.tip_institutie, imagine: finalImageUrl, news: adminFormData.value.news, relatie_superioara: adminFormData.value.relatie }  
        })
        .eq('id', nodeId)
        .select();
      error = res.error; data = res.data;

      // 3.1. Actualizare HR: Ștergem vechile rânduri și le inserăm pe cele noi
      // (E mai simplu decât să facem update rând cu rând la editare)
      if (!error) {
        await supabase.from('date_joburi').delete().eq('organogram_node_id', nodeId);
        
        if (hrRows.value.length > 0) {
          const hrInserts = hrRows.value.map(row => ({
            organogram_node_id: nodeId,
            functie: row.functie,
            pozitii_ocupate: row.ocupate,
            pozitii_vacante: row.vacante,
            salariu_minim: null,
            salariu_maxim: null,
            statut: row.statut
          }));
           const { error: hrErr } = await supabase.from('date_joburi').insert(hrInserts); // MODIFICAT
          if (hrErr) console.error('Eroare HR Edit:', hrErr.message); // ADAUGAT
        }
      }

          // 3.2. Actualizare Surse: Ștergem vechile și inserăm cele noi
    if (!error) {
      await supabase.from('surse_informatii').delete().eq('organogram_node_id', nodeId);
      
      if (sourceRows.value.length > 0) {
        const sourceInserts = sourceRows.value.map(row => ({
          organogram_node_id: nodeId,
          subiect: row.subiect,
          link_sursa: row.link,
          observatii: row.observatii
        }));
        await supabase.from('surse_informatii').insert(sourceInserts);
      }
    }
    }
  }

  isSavingNode.value = false;

  // 4. Finalizare UI
  if (error) {
    adminMessage.value = { text: 'Eroare la salvare: ' + error.message, type: 'error' };
  } else {
    adminMessage.value = { text: 'Salvat cu succes în baza de date!', type: 'success' };
    
    // Actualizăm lista locală ca să se vadă imediat pe ecran fără refresh
    if (data && data[0]) {
      if (adminAction.value === 'create') {
        allNodesList.value.push(data[0]);
      } else {
        const index = allNodesList.value.findIndex(n => String(n.id) === nodeId);
        if (index !== -1) {
          allNodesList.value[index] = { 
            ...allNodesList.value[index], 
            nume: adminFormData.value.nume,
            node_name: adminFormData.value.nume,
            acronim: adminFormData.value.acronim,
            cui: adminFormData.value.cui,
            adresa: adminFormData.value.adresa,
            program: adminFormData.value.program,
            telefon: adminFormData.value.telefon,
            email: adminFormData.value.email,
            rol: adminFormData.value.rol,
            website: adminFormData.value.website,
            metadata: { tip: adminFormData.value.tip_institutie, imagine: finalImageUrl, news: adminFormData.value.news, relatie_superioara: adminFormData.value.relatie } 
          };
        }
      }
      elements.value = buildElements(allNodesList.value, currentRootId.value);
      nextTick(() => updateLayout());
    }
    
    setTimeout(() => { adminAction.value = null; adminMessage.value = { text: '', type: '' }; }, 1500);
  }
};

const handleAdminDelete = async () => {
  if (!selectedAdminNode.value) return;

  const nodeInfo = allNodesList.value.find(n => String(n.id) === String(selectedAdminNode.value.id));
  if (nodeInfo && nodeInfo.parent_id === null) {
    adminMessage.value = { text: 'Nu poți șterge un nod rădăcină principală din acest meniu.', type: 'error' };
    return;
  }

  const confirmed = window.confirm("ATENȚIE!\nSe va șterge instituția integral, împreună cu toate subordonatele și datele asociate.\nEști sigur că vrei să continui?");
  if (!confirmed) return;

  const { error } = await supabase.rpc('delete_node_cascade', { 
    node_id_to_delete: String(selectedAdminNode.value.id) 
  });

  if (error) {
    adminMessage.value = { text: 'Eroare la ștergere: ' + error.message, type: 'error' };
  } else {
    adminMessage.value = { text: 'Instituție ștearsă cu succes din baza de date!', type: 'success' };

    const idsToRemove = new Set();
    const findChildrenIds = (parentId) => {
      idsToRemove.add(String(parentId));
      allNodesList.value.forEach(n => {
        if (String(n.parent_id) === String(parentId)) {
          findChildrenIds(String(n.id));
        }
      });
    };
    findChildrenIds(String(selectedAdminNode.value.id));

    allNodesList.value = allNodesList.value.filter(n => !idsToRemove.has(String(n.id)));
    elements.value = buildElements(allNodesList.value, currentRootId.value);
    nextTick(() => updateLayout());

    selectedAdminNode.value = null;

    setTimeout(() => {
      adminMessage.value = { text: '', type: '' };
    }, 2000);
  }
};

const handleAdminMove = () => {
  if (!selectedAdminNode.value) return;
  
  const nodeInfo = allNodesList.value.find(n => String(n.id) === String(selectedAdminNode.value.id));
  if (nodeInfo && nodeInfo.parent_id === null) {
    adminMessage.value = { text: 'Nu poți muta un nod rădăcină.', type: 'error' };
    return;
  }

  isMoveMode.value = true;
  moveTargetNode.value = null;
  adminMessage.value = { text: '👆 Click pe noul nod părinte în organigramă...', type: 'info' };
};

const cancelMove = () => {
  isMoveMode.value = false;
  moveTargetNode.value = null;
  adminMessage.value = { text: '', type: '' };
};

const executeMove = async () => {
  const sourceId = String(selectedAdminNode.value.id);
  const targetId = String(moveTargetNode.value.id);

  if (sourceId === targetId) {
    adminMessage.value = { text: 'Nu poți muta un nod sub el însuși.', type: 'error' };
    cancelMove();
    return;
  }

  const { error } = await supabase.from('organograms')
    .update({ parent_id: targetId })
    .eq('id', sourceId);

  if (error) {
    adminMessage.value = { text: 'Eroare la mutare: ' + error.message, type: 'error' };
  } else {
    adminMessage.value = { text: 'Instituție mutată cu succes!', type: 'success' };

    const nodeIndex = allNodesList.value.findIndex(n => String(n.id) === sourceId);
    if (nodeIndex !== -1) {
      allNodesList.value[nodeIndex].parent_id = targetId;
    }

    elements.value = buildElements(allNodesList.value, currentRootId.value);
    nextTick(() => updateLayout());

    setTimeout(() => {
      isMoveMode.value = false;
      moveTargetNode.value = null;
      adminMessage.value = { text: '', type: '' };
    }, 1500);
  }
};

// 7. Funcția de construire a elementelor
function buildElements(list, rootId) {
  const nodes = [];
  const edges = [];
  const map = {};
  const nameToIdMap = {}; 
  
  let fallbackIdCounter = 1;
  const processedList = list.map(node => {
    let cleanId = node.id ? String(node.id).trim() : null;
    if (!cleanId || cleanId === 'null' || cleanId === '') {
      cleanId = `fallback_id_${fallbackIdCounter}`;
      fallbackIdCounter++;
    }
    return { ...node, id: cleanId };
  });

  processedList.forEach(node => {
    const id = node.id;
    map[id] = { ...node, children: [] };
    const name = (node.nume || node.node_name || "").trim();
    if (name) nameToIdMap[name] = id;
  });

  processedList.forEach(node => {
    let parentId = node.parent_id ? String(node.parent_id).trim() : null;
    if (parentId && !map[parentId] && nameToIdMap[parentId]) {
      parentId = nameToIdMap[parentId]; 
    }
    if (parentId && map[parentId]) {
      map[parentId].children.push(map[node.id]);
    }
  });

  const targetId = String(rootId).trim();
  const rootNode = map[targetId];
  if (!rootNode) return [];

  const getBaseClass = (node) => {
    if (node.context_tip === 'judet') return 'node-judet';
    if (node.context_tip === 'local') return 'node-local';
    if (node.context_tip === 'national') return 'node-national';
    if (currentContextType.value === 'judet') return 'node-judet';
    if (currentContextType.value === 'local') return 'node-local';
    return 'node-national';
  };

  const rootClass = getBaseClass(rootNode);
  const rootSubCount = rootNode.children ? rootNode.children.length : 0;

  nodes.push({
    id: String(rootNode.id),
    label: rootNode.nume || rootNode.node_name,
    position: { x: 0, y: 0 }, 
    class: `${rootClass} fade-in is-visible`,
    data: { subCount: rootSubCount, imagine: rootNode.metadata?.imagine || null },
    style: { width: '270px', height: '60px' }
  });

  if (rootNode.children && rootNode.children.length > 0) {
    rootNode.children.forEach((child) => {
      const childClass = rootClass;
      const childSubCount = child.children ? child.children.length : 0;

      nodes.push({
        id: String(child.id),
        label: child.nume || child.node_name,
        position: { x: 0, y: 150 }, 
        class: `${childClass} fade-in is-visible`,
        data: { subCount: childSubCount, imagine: child.metadata?.imagine || null }, 
        style: { width: '270px', height: '60px' }
      });

            // Determinăm culoarea liniei în funcție de context
      let edgeColor = '#94a3b8'; // Gri implicit
      if (rootClass === 'node-national') edgeColor = '#ef4444'; // Roșu
      else if (rootClass === 'node-judet') edgeColor = '#f59e0b'; // Galben
      else if (rootClass === 'node-local') edgeColor = '#3b82f6'; // Albastru

      edges.push({ 
        id: `e${rootNode.id}-${child.id}`, 
        source: String(rootNode.id), 
        target: String(child.id), 
        animated: true,
        style: { stroke: edgeColor, strokeWidth: 2.5 } // Culoarea și grosimea
      });
    });
  }

  return [...nodes, ...edges];
}

// 8. Funcții de fetch
const fetchAllInstitutions = async () => {
  // 1. Aducem rădăcinile (tabelul institutii)
  const { data: roots, error: err1 } = await supabase.from('institutii').select('id, nume');
  
  // 2. Aducem copiii (tabelul organograms)
  const { data: children, error: err2 } = await supabase.from('organograms').select('id, node_name');

  let combined = [];
  
  if (!err1 && roots) {
    combined = roots.map(r => ({ id: r.id, nume: r.nume }));
  }
  
  if (!err2 && children) {
    // IMPORTANT: Redenumim 'node_name' în 'nume' ca să funcționeze template-ul fără modificări
    const normalizedChildren = children.map(c => ({ id: c.id, nume: c.node_name }));
    combined = [...combined, ...normalizedChildren];
  }

  allInstitutions.value = combined;
};
const fetchJudete = async () => {
  const { data, error } = await supabase.from('judete').select('id, nume').order('nume', { ascending: true });
  if (data) judete.value = data;
  else console.error('Eroare fetch judete:', error);
};

const fetchLocalitati = async (judetId, tip) => {
  const { data, error } = await supabase
    .from('localitati')
    .select('nume, id')
    .eq('judet_id', judetId)
    .eq('tip', tip)
    .order('nume');
  if (error) console.error('Eroare Supabase:', error);
  else localitati.value = data || [];
};

watch([judetSelectat, tipSelectat], ([newId, newTip]) => {
  if (newId && newTip) fetchLocalitati(newId, newTip);
}, { deep: true });

const loadRootNodes = async (contextType, params = {}, resetRoot = true) => {
  navigationStack.value = []; 
  currentContextType.value = contextType;
  
  let query = supabase
    .from('institutii')
    .select('*')
    .is('parent_id', null)
    .eq('context_tip', contextType);

  if (contextType === 'local' && params.localitateId) {
    query = query.eq('localitate_id', params.localitateId);
    if (params.tipInstitutie) query = query.ilike('nume', `%${params.tipInstitutie}%`);
  } else {
    if (params.numeNode) query = query.eq('nume', params.numeNode);
    if (params.judet) query = query.eq('judet', params.judet);
    if (params.tipInstitutie) query = query.eq('tip_institutie', params.tipInstitutie);
  }

  const { data: rootData, error: rootError } = await query;
  
  if (rootError || !rootData || rootData.length === 0) {
    console.error('Eroare la încărcare sau nu s-au găsit instituții:', rootError);
    allNodesList.value = [];
    return;
  }

  const { data: rawChildData, error: childError } = await supabase.from('organograms').select('*');

  if (childError) {
    console.error('Eroare la încărcare copii:', childError);
  } else {
    const childData = (rawChildData || []).map(node => ({
      ...node,
      parent_id: (node.parent_id && String(node.parent_id).trim() !== "") ? String(node.parent_id).trim() : null
    }));

    allNodesList.value = [...rootData, ...childData];
    
    if (resetRoot) {
      currentRootId.value = String(rootData[0].id);
    }
  }
};

// 9. Meniuri și acțiuni UI
const selectView = (view) => {
  currentView.value = view;
  isSwitcherOpen.value = false;
};

const loadLocalNode = async (tipInstitutie) => {
  if (!localitateSelectata.value) return;
  await loadRootNodes('local', { 
    localitateId: localitateSelectata.value.id, 
    tipInstitutie: tipInstitutie 
  });
};

const toggleSecondaryMenu = (panel) => {
  activePanel.value = activePanel.value === panel ? null : panel;
  if (panel !== 'local') localContext.value = false;
};

const openLocalMenu = () => {
  activePanel.value = 'local';
  localStep.value = 1;
  localContext.value = false;
  judetSelectat.value = null;
  tipSelectat.value = null;
  localitati.value = [];
};

const selectJudet = async (judetObj) => {
  localitati.value = [];
  judetSelectat.value = judetObj.id;
  numeJudetSelectat.value = judetObj.nume;
  
  if (activePanel.value === 'local') {
    localStep.value = 2;
  } else {
    activePanel.value = 'institutie';
  }
};

const selectTip = (t) => {
  localitati.value = []; 
  tipSelectat.value = t;
  activePanel.value = 'rezultatLocalitate';
  if (judetSelectat.value) fetchLocalitati(judetSelectat.value, t);
};

const selectLocalitate = (localitate) => {
  localitateSelectata.value = localitate;
  activePanel.value = null;
  localContext.value = true;
  setTimeout(() => { localitati.value = []; }, 300);
};

const handleLogout = async () => {
  await logout();
  router.push('/');
};

onMounted(() => {
  fetchJudete();
  fetchAllInstitutions(); // ADAUGAT
});

const handleDeleteAccount = async () => {
  const confirmed = window.confirm("Ești sigur că vrei să ștergi contul tău? Această acțiune este ireversibilă.");
  if (!confirmed) return;

  const { error } = await supabase
    .from('profiles')
    .delete()
    .eq('id', user.value.id);

  if (error) {
    console.error('Eroare la ștergerea contului:', error);
    alert('A apărut o eroare la ștergerea contului. Încearcă din nou.');
    return;
  }

  await handleLogout();
};
</script>



<template>
  <div class="dashboard-container">
    
    <!-- Switcher pentru vizualizări (Graph / Sunburst / Treemap) -->
    <div :class="['chart-switcher-container', { 'is-open': isSwitcherOpen }]">
      <button @click="isSwitcherOpen = !isSwitcherOpen" class="main-switcher-btn">
        👁️
      </button>

      <div v-if="isSwitcherOpen" class="chart-options-card">
        <button @click="selectView('flow')" :class="{ active: currentView === 'flow' }">Graph</button>
        <button @click="selectView('sunburst')" :class="{ active: currentView === 'sunburst' }">Sunburst</button>
        <button @click="selectView('treemap')" :class="{ active: currentView === 'treemap' }">Treemap</button>
      </div>
    </div>

    <!-- Buton Admin Tools (Apare doar pt Admin) -->
    <div v-if="userRole === 'admin'" class="admin-toggle-container">
      <button @click="toggleAdminTools" :class="['admin-toggle-btn', { 'is-active': showAdminTools }]">
        <Pencil style="width:20px; height:20px;" />
      </button>
    </div>
  
           <!-- CĂUTARE GLOBALĂ -->
    <div class="search-container">
      <!-- 1. BARA DE CĂUTARE -->
      <div :class="['search-wrapper', { 'is-open': isSearchOpen }]">
        <input 
          type="text" 
          v-model="searchTerm" 
          placeholder="Caută instituții..." 
          class="search-input"
          @blur="closeSearch" 
          ref="searchInputRef"
        />
        <button class="search-icon-btn" @click="toggleSearch">
          C
        </button>
      </div>

      <!-- 2. RANDUL CU INSIGNE ȘI BUTONUL VERDE -->
      <div class="search-tags-row" v-if="selectedTags.length > 0">
        <div class="search-badges-wrapper">
          <div class="search-badge" v-for="(tag, index) in selectedTags" :key="tag.id">
            {{ getShortName(tag.nume) }}
            <button class="badge-x" @click="removeTag(index)">✕</button>
          </div>
        </div>
        
        <button class="btn-see-institutions" @click="executeSearch(); toggleSearchPanel();">

                                  VEZI INSTITUȚIILE ({{ selectedTags.length }})
        </button>
      </div>

      <!-- 3. DROPDOWN (Mutat aici, să nu mai fie tăiat) -->
      <div class="search-dropdown" v-if="isSearchOpen && filteredInstitutions.length > 0">
        <div 
          class="dropdown-item" 
          @mousedown.prevent="selectInstitution(inst)"
          v-for="inst in filteredInstitutions" 
          :key="inst.id"
        >
          {{ inst.nume }}
        </div>
      </div>
    </div>
  

        <!-- Zona Principală de Vizualizare -->
        <main class="main-content">
          <div class="visual-wrapper">
            
            <!-- Indicator Nivel Utilizator -->
            <div class="role-indicator">
              Mod: <span>{{ userRole === 'admin' ? 'administrator' : userRole }}</span>
            </div>

            <!-- Controale de Navigare (Înapoi, Nivel, Coloane) -->
            <div v-if="navigationStack.length > 0 && userRole !== 'vizitator'" class="nav-controls">
              <button @click="goBack" class="back-button">
                ⬅ Înapoi
              </button>
          
          <div class="depth-indicator">
            Nivel: {{ navigationStack.length }}
          </div>

          <div class="layout-selector">
            <label for="col-select">Organizează noduri:</label>
            <select id="col-select" v-model="columnCount" @change="updateLayout">
              <option v-for="n in [2, 3, 4, 5, 6, 7]" :key="n" :value="n">{{ n }} coloane</option>
            </select>
          </div>
        </div>
        
        <!-- VueFlow (Organigrama Principală) -->
        <VueFlow 
          v-if="currentView === 'flow'" 
          :key="currentRootId"
          v-model="elements" 
          :apply-default="true" 
          :fit-view-on-init="true" 
          @node-click="onNodeClick" 
          @nodes-initialized="fitView"
          @node-context-menu="onNodeRightClick"
        >
          <template #node-default="nodeProps">
            <div class="custom-node-container">
              
              <!-- MINIATURA POZA (Apare doar dacă există URL în metadata) -->
              <img 
                v-if="nodeProps.data?.imagine" 
                :key="nodeProps.data?.imagine"
                :src="nodeProps.data?.imagine" 
                class="node-thumbnail" 
                @click.stop="openLightbox(nodeProps.data.imagine)"
                title="Click pentru a mări poza"
              />

              <div class="node-label">{{ nodeProps.label }}</div>
              
              <div v-if="nodeProps.data?.subCount > 0" class="subordinate-badge">
                {{ nodeProps.data.subCount }}
              </div>

              <div v-if="nodeProps.data?.subCount > 0 && userRole === 'vizitator'" class="lock-indicator">
                🔒 Cont necesar
              </div>
            
                         <!-- INSIGNA NOUĂ: DETALII PENTRU UTILIZATOR -->
              <div 
                class="details-badge" 
                @click.stop="openUserDetails(nodeProps)"
                title="Vezi detalii și posturi"
              >
                D
              </div>
            </div>
          </template>
        </VueFlow>
        
        <!-- Alternative de Vizualizare (Sunburst / Treemap) -->
        <div v-else class="chart-container">
          <component 
            :is="currentViewComponent" 
            v-if="currentViewComponent && visibleChartData" 
            :data="visibleChartData" 
          />
        </div>
      </div>
    </main>

    <!-- Bara de Context Local (Apare când selectezi o localitate) -->
    <div v-if="localContext" class="context-bar">
      <button class="context-btn" @click="loadLocalNode('Primărie')">Primărie</button>
      <button class="context-btn" @click="loadLocalNode('Consiliu Local')">Consiliu Local</button>
      <button class="context-btn" @click="loadLocalNode('Servicii')">Servicii și Regii</button>
    </div>

    <!-- Meniu Secundar: Nivel Național -->
    <transition name="slide">
      <aside v-if="activePanel === 'national'" class="secondary-menu national-panel">
        <div class="menu-item red-button" @click="loadRootNodes('national', { numeNode: 'Presedintie' }); toggleSecondaryMenu()">Presedintie</div>
        <div class="menu-item red-button" @click="loadRootNodes('national', { numeNode: 'Guvern' }); toggleSecondaryMenu()">Guvern</div>
        <div class="menu-item red-button" @click="loadRootNodes('national', { numeNode: 'Parlament' }); toggleSecondaryMenu()">Parlament</div>
        <div class="menu-item red-button" @click="loadRootNodes('national', { numeNode: 'Justitie' }); toggleSecondaryMenu()">Justitie</div>
        <div class="menu-item red-button" @click="loadRootNodes('national', { numeNode: 'C.S.A.T.' }); toggleSecondaryMenu()">C.S.A.T.</div>
      </aside>
    </transition>

    <!-- Meniu Secundar: Nivel Județean (Alege Județul) -->
    <transition name="slide">
      <aside v-if="activePanel === 'judet'" class="secondary-menu">
        <h3 class="panel-title">Alege judet</h3>
        <div v-for="j in judete" :key="j.id" class="yellow-button" @click="selectJudet(j)">{{ j.nume }}</div>
      </aside>
    </transition>

    <!-- Meniu Secundar: Instituții Județene -->
    <transition name="slide">
      <aside v-if="activePanel === 'institutie'" class="secondary-menu institutie-panel">
        <h3 class="panel-title">Alege institutie</h3>
        <div class="yellow-button" @click="loadRootNodes('judet', { judet: numeJudetSelectat, tipInstitutie: 'Consilii' }); activePanel = null;">Consilii</div>
        <div class="yellow-button" @click="loadRootNodes('judet', { judet: numeJudetSelectat, tipInstitutie: 'Prefecturi' }); activePanel = null;">Prefecturi</div>
        <div class="yellow-button" @click="loadRootNodes('judet', { judet: numeJudetSelectat, tipInstitutie: 'Deconcentrate' }); activePanel = null;">Deconcentrate</div>
        <div class="yellow-button" @click="loadRootNodes('judet', { judet: numeJudetSelectat, tipInstitutie: 'Siguranta' }); activePanel = null;">Siguranta</div>
      </aside>
    </transition>

    <!-- Meniu Secundar: Nivel Local -->
    <transition name="slide">
      <aside v-if="activePanel === 'local' || activePanel === 'rezultatLocalitate'" class="secondary-menu local-style">
        <div v-if="activePanel === 'local' && localStep === 1">
          <h3 class="panel-title">Alege județ (Local)</h3>
          <div v-for="j in judete" :key="j.id" class="yellow-button" @click="selectJudet(j)">{{ j.nume }}</div>
        </div>
        
        <div v-if="activePanel === 'local' && localStep === 2">
          <h3 class="panel-title">Tip localitate</h3>
          <div class="yellow-button" @click="selectTip('Municipii')">Municipiu</div>
          <div class="yellow-button" @click="selectTip('Orașe')">Oraș</div>
          <div class="yellow-button" @click="selectTip('Comune')">Comună</div>
        </div>

        <div v-if="activePanel === 'rezultatLocalitate'">
          <h3 class="panel-title">Localități: {{ tipSelectat }}</h3>
          <div v-for="loc in localitati" :key="loc.id" class="yellow-button" @click="selectLocalitate(loc)">{{ loc.nume }}</div>
        </div>
      </aside>
    </transition>

    <!-- Meniu Principal Dreapta -->
    <aside class="right-menu">
      <div class="menu-item" @click="$router.push('/')">
        <Home class="icon" />
        <span class="label">Acasa</span>
      </div>
      <div class="menu-item" @click="activePanel = 'national'; localContext = false;">
        <Landmark class="icon" />
        <span class="label">National</span>
      </div>
      <div class="menu-item" @click="activePanel = 'judet'; localContext = false;">
        <MapPin class="icon" />
        <span class="label">Judetean</span>
      </div>
      <div class="menu-item" @click="openLocalMenu">
        <Building class="icon" />
        <span class="label">Local</span>
      </div>

      <!-- MODIFICAT: Buton Contul meu (doar pentru utilizator) -->
      <div v-if="userRole === 'utilizator'" class="menu-item account-btn" @click="showAccountMenu = !showAccountMenu">
        <User class="icon" />
        <span class="label">Contul meu</span>
      </div>

      <!-- Butonul de Deconectare (Logout) -->
      <div v-if="user" class="menu-item logout-btn" @click="handleLogout">
        <LogOut class="icon" />
        <span class="label">Ieși din cont</span>
      </div>
    </aside>

    <!-- Dropdown ascuns pentru ștergerea contului -->
    <transition name="fade">
      <div v-if="showAccountMenu && userRole === 'utilizator'" class="account-dropdown">
        <div class="dropdown-header">
          <span class="dropdown-email">{{ user?.email }}</span>
        </div>
        <div class="dropdown-divider"></div>
        <button class="dropdown-delete-btn" @click="handleDeleteAccount">
          <Trash2 style="width:14px; height:14px;" />
          Șterge contul definitiv
        </button>
      </div>
    </transition>
    
        <!-- Pop-up Instrumente Admin (Draggable) -->
    <div 
      v-if="showAdminTools && userRole === 'admin'" 
      class="admin-tools-panel"
      :style="{ left: adminPanelPos.x + 'px', top: adminPanelPos.y + 'px' }"
    >
      <!-- Header-ul pentru Drag -->
      <div class="admin-panel-header" @mousedown="startDrag">
        <span class="admin-panel-title">Instrumente Admin</span>
        <button class="admin-close-btn" @click="showAdminTools = false">✕</button>
      </div>

      <!-- Info nod selectat -->
      <div class="admin-selected-info">
        <div v-if="selectedAdminNode" class="node-selected">
          <strong>Selectat:</strong> {{ selectedAdminNode.label }}
        </div>
        <div v-else class="node-selected-hint">
          Click dreapta pe un nod din organigramă pentru a-l selecta
        </div>
      </div>

      <!-- Butoane Acțiuni (Apar doar dacă NU suntem în formular) -->
      <div v-if="!adminAction" class="admin-actions">
        <button class="admin-action-btn create" @click="handleAdminCreate" :disabled="!selectedAdminNode">
          <Plus style="width:18px; height:18px;" />
          Creează
        </button>
        <button class="admin-action-btn edit" @click="handleAdminEdit" :disabled="!selectedAdminNode">
          <Edit3 style="width:18px; height:18px;" />
          Modifică
        </button>
        <button class="admin-action-btn delete" @click="handleAdminDelete" :disabled="!selectedAdminNode">
          <Trash2 style="width:18px; height:18px;" />
          Șterge
        </button>
        <button class="admin-action-btn move" @click="handleAdminMove" :disabled="!selectedAdminNode">
          <Move style="width:18px; height:18px;" />
          Muta
        </button>
      </div>

      <!-- Butonul de Anulare Mutare -->
      <div v-if="isMoveMode && !adminAction" class="admin-actions">
        <button class="admin-form-btn cancel" style="width: 100%; margin-top:0;" @click="cancelMove">
          Anulează Mutarea
        </button>
      </div>



      <!-- FORMULAR COMPLET (Apare DOAR la Creează sau Editează) -->
      <div v-else-if="adminAction === 'create' || adminAction === 'edit'" class="new-admin-form">
        
        <!-- SECȚIUNEA 1: DETALII (3 coloane) -->
        <div class="form-top-half">
          <div class="details-grid-3col">
            
            <!-- 1. ETICHETE (Stânga) -->
            <div class="col-labels">
              <label>Denumire instituție *</label>
              <label>Acronim</label>
              <label>C.U.I.</label>
              <label>Adresa</label>
              <label>Website</label>
              <label>Program cu publicul</label>
              <label>Telefon</label>
              <label>E-mail</label>
            </div>

            <!-- 2. CÂMPURI (Mijloc) -->
            <div class="col-inputs">
              <input type="text" v-model="adminFormData.nume" placeholder="ex: Direcția Generală X" :disabled="isSavingNode" />
              <input type="text" v-model="adminFormData.acronim" placeholder="ex: DGS" :disabled="isSavingNode" />
              <input type="text" v-model="adminFormData.cui" placeholder="ex: 12345678" :disabled="isSavingNode" />
              <input type="text" v-model="adminFormData.adresa" placeholder="ex: Str. X, Nr. 1" :disabled="isSavingNode" />
              <input type="text" v-model="adminFormData.website" placeholder="ex: www.site.ro" :disabled="isSavingNode" />
              <input type="text" v-model="adminFormData.program" placeholder="ex: Luni-Vineri 08:00-16:00" :disabled="isSavingNode" />
              <input type="text" v-model="adminFormData.telefon" placeholder="ex: 021.123.456" :disabled="isSavingNode" />
              <input type="email" v-model="adminFormData.email" placeholder="ex: contact@institutie.ro" :disabled="isSavingNode" />
            </div>

            <!-- 3. ROL (Dreapta) -->
            <div class="col-rol">
              <label>Descriere rol</label>
              <textarea v-model="adminFormData.rol" placeholder="ex: Coordonarea și monitorizarea activităților..." :disabled="isSavingNode"></textarea>
            </div>

          </div>
        </div>

        <!-- SECȚIUNEA: RELAȚII INSTITUȚIONALE -->
        <div class="relation-admin-section">
          <label>Instituție superioară (opțional)</label>
          <input 
            type="text" 
            v-model="adminFormData.relatie" 
            placeholder="ex: Guvernul României / Ministerul X" 
            :disabled="isSavingNode" 
          />
        </div>


        <!-- Upload Poza (Doar la Editare) -->
        <div v-if="adminAction === 'edit'" class="upload-row">
          <label>Poză:</label>
          <input type="file" accept="image/*" @change="onFileChange" :disabled="isSavingNode" />
        </div>
        <div v-if="imagePreview" class="image-preview-container">
          <img :src="imagePreview" alt="Preview" class="image-preview" />
          <button class="remove-img-btn" @click="imagePreview = null; removeImage = true" title="Șterge">✕</button>
        </div>

 <!-- SECȚIUNEA: CE E NOU? -->
        <div class="news-admin-section">
          <label>Știri / Ce e nou?</label>
          <textarea 
            v-model="adminFormData.news" 
            placeholder="Adaugă noutăți, linkuri sau anunțuri despre această instituție..." 
            rows="3"
            :disabled="isSavingNode"
          ></textarea>
        </div>


        <!-- SECȚIUNEA 2: DATE PERSONAL -->
        <div class="form-bottom-half">
          <div class="hr-header">
            <span>Date Personal</span>
            <button class="add-hr-btn" @click="addHrRow" :disabled="isSavingNode">+ Adaugă Rând</button>
          </div>
          
          <table class="hr-table">
            <thead>
              <tr>
                <th>Nr. Crt.</th>
                <th>Denumire Post</th>
                <th>Ocupate</th>
                <th>Vacante</th>
                <th>Total posturi</th>
                <th>Statut</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, index) in hrRows" :key="index">
                <td>{{ index + 1 }}</td>
                <td><input type="text" v-model="row.functie" placeholder="Nume post" :disabled="isSavingNode" /></td>
                <td><input type="number" v-model.number="row.ocupate" min="0" :disabled="isSavingNode" /></td>
                <td><input type="number" v-model.number="row.vacante" min="0" :disabled="isSavingNode" /></td>
               <td><input type="number" :value="(row.ocupate || 0) + (row.vacante || 0)" disabled /></td>
                <td><input type="text" v-model="row.statut" placeholder="Activ / Link concurs" :disabled="isSavingNode" /></td>
                <td><button class="remove-row-btn" @click="removeHrRow(index)" :disabled="isSavingNode">✕</button></td>
              </tr>
              <tr v-if="hrRows.length === 0">
                <td colspan="7" style="text-align:center; color:#94a3b8; padding: 10px;">Nu au fost adăugate posturi</td>
              </tr>
            </tbody>
          </table>
        </div>


        <!-- SECȚIUNEA 3: SURSE INFORMAȚII -->
        <div class="form-bottom-half">
          <div class="hr-header">
            <span>Surse Informații</span>
            <button class="add-hr-btn" @click="addSourceRow" :disabled="isSavingNode">+ Adaugă Rand Info</button>
          </div>
          
          <table class="hr-table">
            <thead>
              <tr>
                <th>Nr. Crt.</th>
                <th>Subiect informație</th>
                <th>Link sursă</th>
                <th>Observații</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, index) in sourceRows" :key="'src-'+index">
                <td>{{ index + 1 }}</td>
                <td><input type="text" v-model="row.subiect" placeholder="Nume subiect" :disabled="isSavingNode" /></td>
                <td><input type="text" v-model="row.link" placeholder="https://..." :disabled="isSavingNode" /></td>
                <td><input type="text" v-model="row.observatii" placeholder="Detalii suplimentare" :disabled="isSavingNode" /></td>
                <td><button class="remove-row-btn" @click="removeSourceRow(index)" :disabled="isSavingNode">✕</button></td>
              </tr>
              <tr v-if="sourceRows.length === 0">
                <td colspan="5" style="text-align:center; color:#94a3b8; padding: 10px;">Nu au fost adăugate surse</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Mesaj și Butoane -->
        <div v-if="adminMessage.text" :class="['admin-msg', adminMessage.type]">{{ adminMessage.text }}</div>
        
        <div class="form-buttons-new">
          <button class="btn-save-3d" @click="saveAdminNode" :disabled="isSavingNode">
            {{ isSavingNode ? 'Se salvează...' : 'Salvează' }}
          </button>
          <button class="btn-cancel-flat" @click="cancelAdminAction" :disabled="isSavingNode">
            Anulează
          </button>
        </div>
      </div>
      <!-- AICI se închide definitiv formularul -->
    </div>

    <!-- Modal Autentificare (pentru vizitatori când vor să facă drill-down) -->
    <AuthModal 
      v-if="showAuthModal" 
      :initial-mode="authModalMode"
      @close="showAuthModal = false" 
    />

    <!-- PANOU REZULTATE CĂUTARE (Pasul 5) -->
    <transition name="slide-panel">
      <div v-if="showSearchPanel" class="search-side-panel">
        <div class="panel-header">
          <h3>Rezultate Căutare</h3>
          <button class="panel-close-btn" @click="showSearchPanel = false">✕</button>
        </div>
        <div class="panel-list">
          <a 
            href="#" 
            class="panel-link" 
            v-for="tag in panelTags" :key="tag.id"
            @click.prevent="handlePanelLinkClick(tag)"
          >
            {{ tag.nume }}
          </a>
        </div>
      </div>
    </transition>

        <!-- PANOU PROFIL INSTITUȚIONAL (Pasul 2 - HTML static de test) -->
    <transition name="slide-panel">
      <div v-if="showProfilePanel" class="panel-left">
            <div class="panel-header">
        <h1>Profil Instituțional</h1>
        <img v-if="selectedUserData?.metadata?.imagine" :src="selectedUserData.metadata.imagine" class="panel-thumbnail" />
        <button class="panel-close-btn" @click="closeProfilePanel">✕</button>
            <!-- BUTON EXPORT PDF PROFIL -->
      <div class="profile-pdf-actions">
        <button class="btn-export-profile-pdf" @click="exportProfilePDF">Exportă Profil PDF</button>
      </div>
    </div>
      
        
              <div class="panel-body" id="user-profile-pdf-section">
                          <!-- HEADER ȘI POZĂ PENTRU PDF (Ascunse pe ecran) -->
            <div id="pdf-header-section" class="pdf-header-section">
              <h1>Profil Instituțional</h1>
              <img v-if="selectedUserData?.metadata?.imagine" :src="selectedUserData.metadata.imagine" class="pdf-header-img" />
            </div>
                   <!-- 1. Identitate & Contact -->
          <div class="profile-section" v-if="selectedUserData">
            <div class="section-title">Identitate & Contact</div>
            <div class="contact-grid">
              <span class="c-label">Denumire</span> <div class="c-value">{{ selectedUserData.nume || '-' }}</div>
              <span class="c-label">Acronim</span> <div class="c-value">{{ selectedUserData.acronim || '-' }}</div>
              <span class="c-label">C.U.I.</span> <div class="c-value">{{ selectedUserData.cui || '-' }}</div>
              <span class="c-label">Adresă</span> <div class="c-value">{{ selectedUserData.adresa || '-' }}</div>
              <span class="c-label">Website</span> <div class="c-value" style="color: #2563eb;">{{ selectedUserData.website || '-' }}</div>
                            <span class="c-label">Program cu publicul</span> <div class="c-value">{{ selectedUserData?.program || '-' }}</div>
              <span class="c-label">Telefon</span> <div class="c-value">{{ selectedUserData?.telefon || '-' }}</div>
             <span class="c-label">E-mail</span> <div class="c-value">{{ selectedUserData?.email || '-' }}</div>
            </div>
          </div>

          <!-- 2. Rol & Bază Legală -->
          <div class="profile-section" v-if="selectedUserData">
            <div class="section-title">Rol & Bază Legală</div>
            <p style="font-size: 0.9rem; color: #334155; line-height: 1.6; margin: 0;">
              {{ selectedUserData.rol || 'Nu există descriere disponibilă.' }}
            </p>
          </div>

                  <!-- 3. Relații Instituționale -->
          <div class="profile-section" v-if="selectedUserData">
            <div class="section-title">Relații Instituționale</div>
            <div class="relation-box">
              <div class="relation-label">Instituție superioară:</div>
              <div class="relation-value">{{ selectedUserData.metadata?.relatie_superioara || 'Nu este specificată' }}</div>
            </div>
          </div>

                             <!-- 4. Structură & Resurse Umane -->
          <div class="profile-section" v-if="selectedUserData">
            <div class="section-title">Structură & Resurse Umane</div>
            <div class="metric-row">
              <div class="metric-card">
                <div class="metric-num">{{ userHrData.reduce((sum, row) => sum + (row.ocupate || 0) + (row.vacante || 0), 0) }}</div>
                <div class="metric-label">Total Posturi</div>
              </div>
              <div class="metric-card" style="border-color: #bbf7d0;">
                <div class="metric-num">{{ userHrData.reduce((sum, row) => sum + (row.ocupate || 0), 0) }}</div>
                <div class="metric-label" style="color: #16a34a;">Ocupate</div>
              </div>
              <div class="metric-card" style="border-color: #fecaca;">
                <div class="metric-num">{{ userHrData.reduce((sum, row) => sum + (row.vacante || 0), 0) }}</div>
                <div class="metric-label" style="color: #dc2626;">Vacante</div>
              </div>
            </div>
            
            <button class="btn-structura-hr" @click="showHrPopup = true">Structura H.R.</button>
                       
            <!-- TABEL HR ASCUNS PENTRU PDF -->
            <div id="hr-table-for-pdf" class="hr-pdf-wrapper">
              <table class="hr-pdf-table">
                <thead>
                  <tr>
                    <th>Nr. Crt.</th>
                    <th>Denumire Post</th>
                    <th>Ocupate</th>
                    <th>Vacante</th>
                    <th>Total Posturi</th>
                    <th>Statut</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(row, index) in userHrData" :key="'pdf-'+index">
                    <td style="text-align: center;">{{ index + 1 }}</td>
                    <td>{{ row.functie || '-' }}</td>
                    <td style="text-align: center;">{{ row.ocupate || 0 }}</td>
                    <td style="text-align: center;">{{ row.vacante || 0 }}</td>
                    <td style="text-align: center;">{{ (row.ocupate || 0) + (row.vacante || 0) }}</td>
                    <td>{{ row.statut || '-' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          

                        <!-- 5. Ce e nou? -->
          <div class="profile-section" v-if="selectedUserData">
            <div class="section-title">Ce e nou?</div>
            <div v-if="selectedUserData.metadata && selectedUserData.metadata.news" class="news-item">
              <div class="news-icon">📄</div>
              <div class="news-link" style="white-space: pre-wrap;">{{ selectedUserData.metadata.news }}</div>
            </div>
            <div v-else class="news-item">
              <div class="news-icon">📄</div>
              <div class="news-link" style="color: #94a3b8;">Momentan nu sunt știri introduse de admin.</div>
                      </div>

          <!-- 6. Surse Informații -->
          <div class="profile-section" v-if="userSourceData.length > 0">
            <div class="section-title">Surse Informații</div>
            <table class="sources-profile-table">
              <thead>
                <tr>
                  <th>Nr. Crt.</th>
                  <th>Subiect informație</th>
                  <th>Link sursă</th>
                  <th>Observații</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, index) in userSourceData" :key="'usr-src-'+index">
                  <td style="text-align: center;">{{ index + 1 }}</td>
                  <td>{{ row.subiect || '-' }}</td>
                  <td>
                    <a v-if="row.link" :href="row.link" target="_blank" style="color: #2563eb; text-decoration: underline;">Deschide link</a>
                    <span v-else>-</span>
                  </td>
                  <td>{{ row.observatii || '-' }}</td>
                </tr>
              </tbody>
            </table>
          </div>

        </div>
      </div>
    </div>
    </transition>
   
        <!-- POP-UP TABEL STRUCTURĂ H.R. -->
    <div 
      v-if="showHrPopup" 
      class="hr-popup-container"
      :style="{ left: hrPopupPos.x + 'px', top: hrPopupPos.y + 'px' }"
    >
      <!-- Header pentru Drag -->
      <div class="hr-popup-header" @mousedown="startHrDrag">
        <span class="hr-popup-title">Structura H.R.</span>
        <button class="hr-popup-close" @click="closeHrPopup">✕</button>
      </div>

      <!-- Tabelul cu date reale -->
      <div class="hr-popup-body">
        <table class="hr-popup-table">
          <thead>
            <tr>
              <th>Nr. Crt.</th>
              <th>Denumire Post</th>
              <th>Ocupate</th>
              <th>Vacante</th>
              <th>Total Posturi</th>
              <th>Statut</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, index) in userHrData" :key="index">
              <td style="text-align: center;">{{ index + 1 }}</td>
              <td>{{ row.functie || '-' }}</td>
              <td style="text-align: center;">{{ row.ocupate || 0 }}</td>
              <td style="text-align: center;">{{ row.vacante || 0 }}</td>
              <td style="text-align: center;">{{ (row.ocupate || 0) + (row.vacante || 0) }}</td>
              <td style="text-align: center;">{{ row.statut || '-' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Lightbox Imagine Instituție -->
    <transition name="fade">
      <div v-if="showLightbox" class="lightbox-overlay" @click="closeLightbox">
        <div class="lightbox-card" @click.stop>
          <button class="lightbox-close" @click="closeLightbox">✕</button>
          <img :src="lightboxImage" alt="Imagine instituție" class="lightbox-img" />
        </div>
      </div>
    </transition>
  </div>
</template>



<!-- Importăm DOAR structura de bază Vue Flow, FĂRA tema albă -->
<style>
@import '@vue-flow/core/dist/style.css';
</style>

<!-- Stiluri pentru NODURI (FĂRĂ scoped, altfel Vue Flow câștigă lupta) -->
<style lang="scss">
/* 1. DISTRUGEM WRAPPER-UL ALB IMPLICIT AL VUE FLOW */
.vue-flow__node-default {
  background: transparent !important;
  border: none !important;
  padding: 0 !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  overflow: visible !important;
}

/* 2. Containerul tău vizual (Cutia interioară) - Setări de bază */
.custom-node-container {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  padding: 8px 25px;
  box-sizing: border-box;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  text-align: center;
  border: 2px solid transparent;
  overflow: visible !important; 
  cursor: pointer;
  background-color: white;
  border-radius: 12px;
  
  &:hover {
    transform: translateY(-4px) scale(1.03);
  }
}

/* Textul */
.node-label {
  font-size: 0.9rem;
  font-weight: 700;
  line-height: 1.2;
  color: white;
  word-break: break-word;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  pointer-events: none;
  text-shadow: 1px 1px 2px rgba(0,0,0,0.3); 
}

/* Insigna */
.subordinate-badge {
  position: absolute;
  top: -12px;
  right: -12px;
  background: linear-gradient(145deg, #8b5cf6, #6d28d9); 
  color: white;
  font-size: 11px;
  font-weight: 800;
  min-width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  box-shadow: 0 4px 8px rgba(0,0,0,0.4);
  border: 2px solid rgba(255,255,255,0.6);
  z-index: 10;
}

.lock-indicator {
  position: absolute;
  bottom: -20px;
  font-size: 9px;
  color: #333;
  font-weight: 700;
  white-space: nowrap;
  background: white;
  padding: 2px 8px;
  border-radius: 4px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.15);
}

.details-badge {
  position: absolute;
  bottom: -12px;
  left: -12px; // În stânga-jos
  background: linear-gradient(145deg, #22c55e, #16a34a); // Verde
  color: white;
  font-size: 12px;
  font-weight: 800;
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  box-shadow: 0 4px 8px rgba(0,0,0,0.4);
  border: 2px solid rgba(255,255,255,0.6);
  z-index: 10;
  cursor: pointer;
  transition: transform 0.2s;
}

.details-badge:hover {
  transform: scale(1.2);
}


/* Miniatura foto în nod */
.node-thumbnail {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  object-fit: cover;
  border: 2.5px solid rgba(255, 255, 255, 0.7);
  position: absolute;
  top: -19px;
  left: -19px;
  background: #f1f5f9;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
  z-index: 5;
  box-shadow: 0 2px 6px rgba(0,0,0,0.2);
}

.node-thumbnail:hover {
  transform: scale(1.2);
  box-shadow: 0 4px 12px rgba(0,0,0,0.35);
}

/* ==========================================
ESTETICA SPECIFICĂ (3D, Oval, Culori)
AICI ESTE FIX-UL: Selectorul cu spațiu (.wrapper .interior)
========================================== */

.node-national .custom-node-container {
  background: linear-gradient(145deg, #ef4444, #b91c1c) !important;
  border-radius: 50px !important; /* OVAL */
  border-color: #991b1b !important;
  box-shadow: 
    8px 8px 16px rgba(0, 0, 0, 0.5),   
    -4px -4px 10px rgba(255, 255, 255, 0.15), 
    inset -3px -3px 8px rgba(0, 0, 0, 0.3),  
    inset 3px 3px 8px rgba(255, 150, 150, 0.3) !important; 
}

.node-judet .custom-node-container {
  background: linear-gradient(145deg, #f59e0b, #d97706) !important;
  border-radius: 16px !important; 
  border-color: #b45309 !important;
  box-shadow: 
    8px 8px 16px rgba(0, 0, 0, 0.4), 
    -4px -4px 10px rgba(255, 255, 255, 0.15),
    inset -3px -3px 8px rgba(0, 0, 0, 0.2), 
    inset 3px 3px 8px rgba(255, 220, 100, 0.4) !important;
  .node-label { color: #422006 !important; text-shadow: none !important; }
}

.node-local .custom-node-container {
  background: linear-gradient(145deg, #3b82f6, #1d4ed8) !important;
  border-radius: 16px !important; 
  border-color: #1e40af !important;
  box-shadow: 
    8px 8px 16px rgba(0, 0, 0, 0.5), 
    -4px -4px 10px rgba(255, 255, 255, 0.15),
    inset -3px -3px 8px rgba(0, 0, 0, 0.3), 
    inset 3px 3px 8px rgba(100, 160, 255, 0.3) !important;
}

.vue-flow__node { transition: opacity 0.3s ease, transform 0.3s ease; }
.fade-in { opacity: 0; transform: scale(0.9); }
.fade-in.is-visible { opacity: 1; transform: scale(1); }

   /* Efect vizual pentru Nodul Selectat de Admin */
    .is-selected .custom-node-container {
      outline: 3px solid #facc15 !important; /* Contur galben strălucitor */
      outline-offset: 4px;
      filter: brightness(1.1); /* Îl face puțin mai luminos */
      transition: all 0.2s ease;
    }
</style>

<!-- Restul stilurilor pentru Dashboard (Cu scoped) -->
<style lang="scss" scoped>
.dashboard-container { display: flex; width: 100vw; height: 100vh; overflow: hidden; background-color: #f8fafc; }
.main-content { flex-grow: 1; position: relative; height: 100vh; width: 100%; overflow: hidden; }
.visual-wrapper { height: 100%; width: 100%; position: relative; display: flex; flex-direction: column; }
.vue-flow { flex-grow: 1; width: 100%; height: 100%; background-color: #f1f5f9; }

.right-menu { position: fixed; right: 0; top: 0; width: 80px; height: 100vh; z-index: 20; background: rgba(255,255,255,0.85); backdrop-filter: blur(12px); border-left: 1px solid rgba(226,232,240,0.8); padding-top: 30px; display: flex; flex-direction: column; align-items: center; box-shadow: -4px 0 15px rgba(0,0,0,0.03); }
.menu-item { display: flex; flex-direction: column; align-items: center; padding: 12px 5px; cursor: pointer; transition: all 0.2s ease; width: 65px; margin-bottom: 5px; border-radius: 10px; &:hover { background: #f1f5f9; } }
.icon { width: 24px; height: 24px; stroke-width: 1.5; stroke: #64748b; transition: all 0.2s ease; }
.menu-item:hover .icon { stroke: #2563eb; transform: scale(1.1); }
.label { font-size: 0.65rem; font-weight: 600; margin-top: 6px; color: #475569; text-align: center; transition: color 0.2s ease; }
.menu-item:hover .label { color: #2563eb; }

.secondary-menu { position: fixed; top: 0; right: 80px; width: 220px; height: 100vh; background: #ffffff; z-index: 15; padding: 30px 15px 20px 15px; overflow-y: auto; border-left: 1px solid #e2e8f0; box-shadow: -4px 0 15px rgba(0,0,0,0.05); & > div:last-child { padding-bottom: 40px; } }
.slide-enter-active, .slide-leave-active { transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
.slide-enter-from, .slide-leave-to { transform: translateX(110%); }
.slide-enter-to, .slide-leave-from { transform: translateX(0); }
.panel-title { color: #1e293b; text-align: center; font-weight: 700; font-size: 0.95rem; margin: 10px 0 20px 0; text-transform: uppercase; letter-spacing: 0.5px; }

%btn-base { border-radius: 10px; text-align: center; font-weight: 600; font-size: 0.85rem; border: 1px solid transparent; cursor: pointer; transition: all 0.2s ease; box-shadow: 0 1px 3px rgba(0,0,0,0.08); display: block; &:active { transform: scale(0.97); } }
.red-button { @extend %btn-base; background-color: #dc2626; color: #ffffff; padding: 12px 20px; width: 100%; margin-bottom: 8px; &:hover { background-color: #b91c1c; box-shadow: 0 4px 6px -1px rgba(220,38,38,0.3); } }
.yellow-button { @extend %btn-base; background-color: #f59e0b; color: #ffffff; padding: 10px 15px; width: 100%; margin-bottom: 8px; &:hover { background-color: #d97706; box-shadow: 0 4px 6px -1px rgba(245,158,11,0.3); } }
.context-btn, .local-style .yellow-button { @extend %btn-base; background-color: #2563eb; color: white; padding: 10px 20px; &:hover { background-color: #1d4ed8; box-shadow: 0 4px 6px -1px rgba(37,99,235,0.3); } }

.context-bar { position: fixed; top: 20px; left: 20px; z-index: 30; display: flex; gap: 10px; }
.nav-controls { position: absolute; top: 15px; left: 50%; transform: translateX(-50%); z-index: 100; display: flex; flex-direction: row; gap: 10px; align-items: center; background: rgba(255,255,255,0.9); backdrop-filter: blur(8px); padding: 8px 15px; border-radius: 15px; box-shadow: 0 4px 15px rgba(0,0,0,0.08); border: 1px solid #e2e8f0; }
.back-button { @extend %btn-base; background-color: #1e293b; color: white; padding: 6px 14px; font-size: 0.8rem; border-radius: 8px; &:hover { background-color: #0f172a; } }
.depth-indicator { background-color: #f8fafc; color: #1e293b; font-weight: 700; padding: 6px 12px; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 0.8rem; }
.layout-selector { display: flex; flex-direction: column; align-items: center; margin-left: 10px; font-size: 0.7rem; font-weight: 700; color: #64748b; select { margin-top: 3px; padding: 4px 8px; border-radius: 6px; border: 1px solid #cbd5e1; cursor: pointer; background: white; font-size: 0.75rem; } }

.chart-switcher-container { position: fixed; left: 20px; bottom: 30px; z-index: 1000; display: flex; flex-direction: column; gap: 8px; transition: all 0.3s ease; &.is-open .main-switcher-btn { border-radius: 12px; } }
.main-switcher-btn { width: 45px; height: 45px; border-radius: 50%; padding: 0; background: #1e293b; color: white; border: none; box-shadow: 0 4px 12px rgba(0,0,0,0.15); cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 20px; transition: all 0.2s; &:hover { background: #334155; transform: scale(1.05); } }
.chart-options-card { background: #ffffff; padding: 8px; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); display: flex; flex-direction: column; gap: 4px; border: 1px solid #e2e8f0; button { padding: 8px 16px; border: none; background: transparent; cursor: pointer; border-radius: 8px; transition: 0.2s; text-align: left; font-weight: 500; color: #475569; font-size: 0.85rem; &:hover { background: #f1f5f9; } &.active { background: #2563eb; color: white; } } }

/* Stil special pentru butonul de Logout - Vizibilitate crescută */
.logout-btn {
  margin-top: auto; 
  margin-bottom: 20px;
  background-color: rgba(220, 38, 38, 0.1); /* Fundal roșu foarte subtil (10% opacitate) */
  border: 1px solid rgba(220, 38, 38, 0.3); /* Margine roșie subțire */
  
  .icon { stroke: #dc2626; } /* Iconița roșie */
  .label { color: #dc2626; } /* Text roșu */
  
  /* Efect la Hover: Se transformă în buton roșu solid */
  &:hover {
    background-color: #dc2626; /* Fundal roșu intens */
    border-color: #dc2626;
    
    .icon { stroke: white; } /* Iconița devine albă */
    .label { color: white; } /* Textul devine alb */
  }
}

.role-indicator {
  position: absolute;
  top: 15px;
  right: 100px;
  z-index: 100;
  font-size: 0.8rem;
  font-weight: 700;
  color: #dc2626;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(8px);
  padding: 6px 14px;
  border-radius: 8px;
  border: 1px solid rgba(220, 38, 38, 0.25);
  box-shadow: 0 2px 8px rgba(220, 38, 38, 0.1);
  pointer-events: none;
  user-select: none;

  span {
    text-transform: capitalize;
  }
}
/* Stil pentru butonul Contul meu */
.account-btn {
  background-color: rgba(99, 102, 241, 0.1);
  border: 1px solid rgba(99, 102, 241, 0.3);
  
  .icon { stroke: #6366f1; }
  .label { color: #6366f1; }
  
  &:hover {
    background-color: #6366f1;
    .icon { stroke: white; }
    .label { color: white; }
  }
}

/* Dropdown-ul care iese din meniu */
.account-dropdown {
  position: fixed;
  right: 88px; /* Iese fix lângă meniul de 80px */
  bottom: 70px; /* Poziționat jos */
  width: 240px;
  background: #ffffff;
  border-radius: 14px;
  box-shadow: 0 10px 30px rgba(0,0,0,0.15);
  border: 1px solid #e2e8f0;
  padding: 8px;
  z-index: 50;
}

.dropdown-header {
  padding: 8px 12px;
}

.dropdown-email {
  font-size: 0.8rem;
  font-weight: 600;
  color: #475569;
  word-break: break-all;
}

.dropdown-divider {
  height: 1px;
  background: #e2e8f0;
  margin: 6px 0;
}

.dropdown-delete-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border: none;
  background: transparent;
  border-radius: 10px;
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 600;
  color: #ef4444;
  transition: all 0.2s;
  
  &:hover {
    background-color: rgba(239, 68, 68, 0.1);
  }
}

/* Animație simplă pentru dropdown */
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: translateY(10px); }

/* =========================================
   ADMIN TOOLS - Buton Pencil
   ========================================= */
.admin-toggle-container {
  position: fixed;
  left: 20px;
  bottom: 90px; /* Exact deasupra butonului cu ochiul */
  z-index: 1000;
}

.admin-toggle-btn {
  width: 45px;
  height: 45px;
  border-radius: 50%;
  padding: 0;
  background: #1e293b;
  color: white;
  border: none;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.admin-toggle-btn:hover {
  background: #334155;
  transform: scale(1.05);
}

.admin-toggle-btn.is-active {
  background: #dc2626; /* Devine roșu când fereastra e deschisă */
  box-shadow: 0 4px 12px rgba(220, 38, 38, 0.4);
}

/* =========================================
   ADMIN TOOLS - Fereastra Pop-up Draggable
   ========================================= */
.admin-tools-panel {
  position: fixed;
  width: 260px;
  background: #ffffff;
  border-radius: 16px;
  box-shadow: 0 15px 40px rgba(0,0,0,0.2);
  border: 1px solid #e2e8f0;
  z-index: 1100; // Peste tot
  user-select: none;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.admin-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  cursor: grab; /* Indicator de drag */
  
  &:active {
    cursor: grabbing;
  }
}

.admin-panel-title {
  font-size: 0.85rem;
  font-weight: 700;
  color: #1e293b;
}

.admin-close-btn {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: none;
  background: #e2e8f0;
  color: #64748b;
  font-size: 0.8rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  
  &:hover {
    background: #dc2626;
    color: white;
  }
}

.admin-selected-info {
  padding: 12px 16px;
  min-height: 40px;
}

.node-selected {
  font-size: 0.75rem;
  color: #1e293b;
  background: #f1f5f9;
  padding: 8px 10px;
  border-radius: 8px;
  border-left: 3px solid #2563eb;
  word-break: break-word;
}

.node-selected-hint {
  font-size: 0.75rem;
  color: #94a3b8;
  font-style: italic;
}

.admin-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0 16px 16px 16px;
}

.admin-action-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 14px;
  border: 1px solid transparent;
  border-radius: 10px;
  font-size: 0.85rem;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.2s;
  
  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  &.create {
    background: rgba(22, 163, 74, 0.1);
    color: #16a34a;
    border-color: rgba(22, 163, 74, 0.2);
    &:hover:not(:disabled) { background: #16a34a; color: white; }
  }

  &.edit {
    background: rgba(37, 99, 235, 0.1);
    color: #2563eb;
    border-color: rgba(37, 99, 235, 0.2);
    &:hover:not(:disabled) { background: #2563eb; color: white; }
  }

  &.delete {
    background: rgba(220, 38, 38, 0.1);
    color: #dc2626;
    border-color: rgba(220, 38, 38, 0.2);
    &:hover:not(:disabled) { background: #dc2626; color: white; }
  }
}

/* =========================================
   ADMIN TOOLS - Formular Inline
   ========================================= */
.admin-form {
  padding: 0 16px 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.admin-form-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
  
  label {
    font-size: 0.75rem;
    font-weight: 700;
    color: #64748b;
    text-transform: uppercase;
  }

  input {
    width: 100%;
    padding: 8px 12px;
    border: 1.5px solid #e2e8f0;
    border-radius: 8px;
    font-size: 0.85rem;
    font-family: inherit;
    outline: none;
    transition: border-color 0.2s;
    
    &:focus {
      border-color: #2563eb;
    }
    &:disabled {
      background: #f8fafc;
      cursor: not-allowed;
    }
  }
}

.admin-msg {
  font-size: 0.8rem;
  font-weight: 600;
  padding: 8px 10px;
  border-radius: 8px;
  text-align: center;
  
  &.success {
    background: rgba(22, 163, 74, 0.1);
    color: #16a34a;
    border: 1px solid rgba(22, 163, 74, 0.2);
  }
  
  &.error {
    background: rgba(220, 38, 38, 0.1);
    color: #dc2626;
    border: 1px solid rgba(220, 38, 38, 0.2);
  }
}

.admin-form-buttons {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}

.admin-form-btn {
  flex: 1;
  padding: 9px 0;
  border-radius: 8px;
  border: none;
  font-size: 0.85rem;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.2s;

  &.save {
    background: #16a34a;
    color: white;
    &:hover:not(:disabled) { background: #15803d; }
    &:disabled { background: #86efac; cursor: not-allowed; }
  }

  &.cancel {
    background: #f1f5f9;
    color: #475569;
    border: 1px solid #e2e8f0;
    &:hover:not(:disabled) { background: #e2e8f0; }
  }
}

      &.move {
        background: rgba(124, 58, 237, 0.1);
        color: #7c3aed;
        border-color: rgba(124, 58, 237, 0.2);
        &:hover:not(:disabled) { background: #7c3aed; color: white; }
      }

      .image-preview-container {
  width: 100%;
  display: flex;
  justify-content: center;
  padding: 10px;
  background: #f8fafc;
  border-radius: 10px;
  border: 1px dashed #cbd5e1;
}

.image-preview {
  max-width: 120px;
  max-height: 120px;
  border-radius: 10px;
  object-fit: cover;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

/* Buton Șterge Poză */
.remove-img-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: none;
  background: rgba(220, 38, 38, 0.9);
  color: white;
  font-size: 0.8rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}
.remove-img-btn:hover {
  background: #dc2626;
  transform: scale(1.15);
}

.image-preview-container {
  width: 100%;
  display: flex;
  justify-content: center;
  padding: 10px;
  background: #f8fafc;
  border-radius: 10px;
  border: 1px dashed #cbd5e1;
  position: relative; /* ADAUGAT: Pentru ca butonul absolut să se pozitioneze corect */
}

.image-preview {
  max-width: 120px;
  max-height: 120px;
  border-radius: 10px;
  object-fit: cover;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  margin-top: 8px; /* ADAUGAT: Spațiu pentru buton */
}


/* =========================================
   ADMIN TOOLS - FORMULAR NOU (Detalii & HR)
   ========================================= */

.admin-tools-panel {
  // Lărgim panoul când se deschide formularul
  &:has(.new-admin-form) {
    width: 750px;
    max-width: 95vw;
    max-height: 90vh;
    // AM ELIMINAT forțarea poziției (left, top, transform) pentru a permite DRAG & DROP
  }
}

.new-admin-form {
  display: flex;
  flex-direction: column;
  gap: 24px; // Spațiu mai aerisit între secțiuni
  padding: 24px;
  overflow-y: auto; 
  flex-grow: 1;
}

// --- SECȚIUNEA 1: DETALII (Grid 3 coloane fix) ---
.form-top-half {
  background: #f8fafc;
  padding: 20px;
  border-radius: 12px;
  border: 1px solid #e2e8f0;

  .details-grid-3col {
    display: grid;
    grid-template-columns: 150px 1fr 2.5fr;
    gap: 0px 20px;
    align-items: start;
    direction: ltr; // FORȚĂZIM citirea de la stânga la dreapta (blochează orice setare RTL ascunsă)
  }

  .col-labels, .col-inputs {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .col-labels {
    grid-column: 1; // FIXEZ COLOANA 1
    label {
      height: 42px;
      margin: 0;
      padding: 0 12px 0 0;
      font-size: 0.9rem;
      font-weight: 700;
      color: #334155;
      text-align: left;
      display: flex;
      align-items: left;
      justify-content: flex-start;
      box-sizing: border-box;
    }
  }

  .col-inputs {
    grid-column: 2; // FIXEZ COLOANA 2
    input {
      width: 100%;
      height: 42px;
      padding: 0 12px;
      border: 1.5px solid #cbd5e1;
      border-radius: 8px;
      font-size: 0.9rem;
      font-family: inherit;
      outline: none;
      transition: all 0.2s;
      box-sizing: border-box;
      background: #ffffff;
      color: #0f172a;
      margin: 0;

      &::placeholder { color: #94a3b8; font-size: 0.8rem; }
      &:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15); }
      &:disabled { background: #f1f5f9; cursor: not-allowed; color: #94a3b8; }
    }
  }

  // COLOANA 3: Rol
  .col-rol {
    grid-column: 3; // FIXEZ COLOANA 3
    grid-row: 1 / -1; 
    display: flex;
    flex-direction: column;
    gap: 6px;
    
    label {
      font-size: 0.75rem;
      font-weight: 700;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    textarea {
      flex-grow: 1;
      min-height: 200px; 
      width: 100%;
      padding: 12px;
      border: 1.5px solid #cbd5e1;
      border-radius: 8px;
      font-size: 0.9rem;
      font-family: inherit;
      outline: none;
      resize: none;
      box-sizing: border-box;
      transition: all 0.2s;
      color: #0f172a;
      background: #ffffff;

      &::placeholder { color: #94a3b8; }
      &:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15); background: #ffffff; }
      &:disabled { background: #f1f5f9; cursor: not-allowed; color: #94a3b8; }
    }
  }
}
// --- SECȚIUNEA: CE E NOU? ---
.news-admin-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
  
  label {
    font-size: 0.75rem;
    font-weight: 700;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  textarea {
    width: 100%;
    padding: 12px;
    border: 1.5px solid #cbd5e1;
    border-radius: 8px;
    font-size: 0.9rem;
    font-family: inherit;
    outline: none;
    resize: vertical; 
    box-sizing: border-box;
    transition: all 0.2s;
    color: #0f172a;
    background: #ffffff;
    min-height: 80px;

    &::placeholder { color: #94a3b8; }
    &:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15); background: #ffffff; }
    &:disabled { background: #f1f5f9; cursor: not-allowed; color: #94a3b8; }
  }
}

// --- SECȚIUNEA: RELAȚII INSTITUȚIONALE ---
.relation-admin-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
  
  label {
    font-size: 0.75rem;
    font-weight: 700;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  input {
    width: 100%;
    height: 42px;
    padding: 0 12px;
    border: 1.5px solid #cbd5e1;
    border-radius: 8px;
    font-size: 0.9rem;
    font-family: inherit;
    outline: none;
    box-sizing: border-box;
    background: #ffffff;
    color: #0f172a;
    transition: all 0.2s;

    &::placeholder { color: #94a3b8; font-size: 0.8rem; }
    &:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15); }
    &:disabled { background: #f1f5f9; cursor: not-allowed; color: #94a3b8; }
  }
}
// --- SECȚIUNEA 2: DATE PERSONAL (Tabel) ---
.form-bottom-half {
  border-top: 2px solid #e2e8f0;
  padding-top: 16px;
  margin-top: 4px;

  .hr-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 14px;

    span { font-size: 1rem; font-weight: 800; color: #1e293b; }

    .add-hr-btn {
      background: #2563eb; color: white; border: none; padding: 8px 14px; border-radius: 8px;
      font-size: 0.85rem; font-weight: 700; cursor: pointer; transition: 0.2s; font-family: inherit;
      box-shadow: 0 2px 4px rgba(37, 99, 235, 0.2);
      &:hover:not(:disabled) { background: #1d4ed8; transform: translateY(-1px); }
      &:disabled { opacity: 0.5; cursor: not-allowed; }
    }
  }

  .hr-table {
    width: 100%; border-collapse: separate; border-spacing: 0; font-size: 0.85rem;
    border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden;

    th {
      background: #f1f5f9; color: #475569; font-weight: 700; padding: 12px 8px;
      text-align: left; border-bottom: 2px solid #cbd5e1; font-size: 0.8rem;
      text-transform: uppercase; letter-spacing: 0.5px;
    }

    td {
      padding: 6px; border-bottom: 1px solid #f1f5f9; background: white;
      &:last-child { border-bottom: none; }

      input {
        width: 100%; padding: 8px; border: 1px solid #e2e8f0; border-radius: 6px;
        font-size: 0.9rem; outline: none; box-sizing: border-box; background: white; color: #0f172a;
        &:focus { border-color: #3b82f6; background: #f8fafc; }
        &:disabled { background: #f8fafc; cursor: not-allowed; }
      }
      
      // Centrăm coloanele: 1(Nr), 3(Ocupate), 4(Vacante), 5(Total)
      &:nth-child(1), &:nth-child(3), &:nth-child(4), &:nth-child(5) {
        text-align: center;
        input { text-align: center; }
      }
    }

    .remove-row-btn {
      background: transparent; color: #cbd5e1; border: none; cursor: pointer; font-size: 1rem;
      transition: 0.2s; padding: 4px; width: 30px; height: 30px; display: flex;
      align-items: center; justify-content: center; margin: 0 auto;
      &:hover:not(:disabled) { color: #dc2626; transform: scale(1.2); }
      &:disabled { opacity: 0.3; cursor: not-allowed; }
    }
  }
}

// --- BUTOANE SALVEAZĂ / ANULEAZĂ ---
.form-buttons-new {
  display: flex; gap: 16px; padding: 20px 24px 24px 24px; border-top: 1px solid #e2e8f0;
  background: white; position: sticky; bottom: 0;

  .btn-save-3d {
    flex: 1; padding: 14px; background: linear-gradient(180deg, #22c55e, #16a34a); color: white;
    border: none; border-bottom: 5px solid #15803d; border-radius: 10px; font-weight: 800;
    font-size: 1rem; font-family: inherit; cursor: pointer; transition: all 0.1s;
    box-shadow: 0 4px 6px rgba(0,0,0,0.1); letter-spacing: 0.5px;
    &:active:not(:disabled) { transform: translateY(3px); border-bottom-width: 2px; box-shadow: none; }
    &:disabled { background: #86efac; border-bottom-color: #6ee7a0; color: #f0fdf4; cursor: not-allowed; }
  }

  .btn-cancel-flat {
    flex: 1; padding: 14px; background: #ffffff; color: #dc2626; border: 2px solid #dc2626;
    border-radius: 10px; font-weight: 800; font-size: 1rem; font-family: inherit; cursor: pointer;
    transition: all 0.2s; box-shadow: none; letter-spacing: 0.5px;
    &:hover:not(:disabled) { background: #dc2626; color: white; border-color: #dc2626; }
    &:disabled { opacity: 0.5; cursor: not-allowed; }
  }
}

// --- DRAWER UTILIZATOR ---
.drawer-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.4); z-index: 1200; display: flex; justify-content: flex-end; }
.drawer-panel { width: 700px; max-width: 95vw; height: 100vh; background: #ffffff; box-shadow: -10px 0 30px rgba(0,0,0,0.2); display: flex; flex-direction: column; }
.drawer-header { display: flex; justify-content: space-between; align-items: center; padding: 20px 24px; border-bottom: 1px solid #e2e8f0; h2 { font-size: 1.2rem; font-weight: 800; color: #1e293b; margin: 0; } }
.drawer-close-btn { background: #f1f5f9; border: none; width: 32px; height: 32px; border-radius: 8px; font-size: 1rem; cursor: pointer; color: #64748b; &:hover { background: #e2e8f0; } }
.drawer-body { padding: 0; display: flex; flex-direction: column; height: 100%; overflow-y: auto; }

// Grid Detalii
.user-details-section { padding: 24px; border-bottom: 2px solid #e2e8f0; background: #f8fafc; }

.details-ro-grid { 
  display: grid; 
  grid-template-columns: 120px 1fr 1.5fr; 
  gap: 12px 20px; 
  margin-bottom: 20px; 
  direction: ltr; // BLOCAM ORICE INVERSARE
}

// Le-am despărțit ca să putem pune grid-column pe fiecare
.ro-col-labels { display: flex; flex-direction: column; gap: 12px; grid-column: 1; }
.ro-col-values { display: flex; flex-direction: column; gap: 12px; grid-column: 2; }

.ro-col-labels span { font-size: 0.85rem; font-weight: 700; color: #64748b; text-align: right; }
.ro-col-values span { font-size: 0.9rem; color: #0f172a; font-weight: 500; }

.ro-col-rol { grid-row: 1 / -1; display: flex; flex-direction: column; gap: 8px; grid-column: 3; }
.rol-title { font-size: 0.75rem; font-weight: 700; color: #64748b; text-transform: uppercase; }
.rol-text { font-size: 0.85rem; color: #334155; line-height: 1.5; background: white; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0; flex-grow: 1; }

// Butoane PDF
.ro-actions-top { display: flex; justify-content: flex-end; }
.btn-pdf-triangle { background: #16a34a; color: white; border: none; padding: 10px 20px; font-size: 0.8rem; font-weight: 700; clip-path: polygon(50% 0%, 0% 100%, 100% 100%); width: 140px; height: 50px; display: flex; align-items: flex-end; justify-content: center; padding-bottom: 8px; cursor: pointer; transition: 0.2s; font-family: inherit; &:hover { background: #15803d; transform: scale(1.05); } }

// Tabel Posturi
.user-hr-section { padding: 24px; flex-grow: 1; }
.hr-header-ro { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.hr-header-ro span { font-size: 1rem; font-weight: 800; color: #1e293b; }
.btn-pdf-diamond { background: #2563eb; color: white; border: none; padding: 15px 20px; font-size: 0.8rem; font-weight: 700; clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%); width: 120px; height: 120px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: 0.2s; font-family: inherit; &:hover { background: #1d4ed8; transform: scale(1.05); } }

.hr-table-ro { width: 100%; border-collapse: collapse; font-size: 0.85rem; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
.hr-table-ro th { background: #f1f5f9; color: #475569; font-weight: 700; padding: 10px; text-align: left; border-bottom: 2px solid #cbd5e1; font-size: 0.8rem; text-transform: uppercase; }
.hr-table-ro td { padding: 10px; border-bottom: 1px solid #f1f5f9; color: #0f172a; }
.hr-table-ro .center { text-align: center; }

// Animație
.slide-drawer-enter-active, .slide-drawer-leave-active { transition: transform 0.3s ease; }
.slide-drawer-enter-from, .slide-drawer-leave-to { transform: translateX(100%); }

/* =========================================
   CĂUTARE GLOBALĂ (Pasul 1)
   ========================================= */
.search-container {
  position: fixed;
  top: 80px; /* COBORÂM SUB BUTOANELE PRIMĂRIE / LOCAL */
  left: 20px;
  z-index: 1000; 
}

.search-wrapper {
  display: flex;
  align-items: center;
  background: transparent; /* Fără fundal când e închis */
  border-radius: 30px;
  border: 1px solid transparent; /* Fără bordură gri când e închis */
  box-shadow: none; /* Fără umbră când e închis */
  overflow: visible; /* Crucial: lasă bordura roșie să nu fie tăiată */
  transition: all 0.3s ease;
  width: 45px; 
  height: 45px;
}

.search-wrapper.is-open {
  width: 320px; 
  background: rgba(255, 255, 255, 0.95); /* Fundalul apare abia acum */
  backdrop-filter: blur(8px);
  border: 1px solid #e2e8f0; /* Bordura gri apare abia acum */
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

/* BUTONUL CU LITERA C */
.search-icon-btn {
  width: 45px;
  height: 45px;
  flex-shrink: 0; 
  background: #ffffff;
  border: 2px solid #dc2626; /* CHENAR ROȘU */
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #0f172a; /* TEXT NEGRU */
  font-size: 1.1rem;
  font-weight: 800; /* C BOLD */
  font-family: inherit;
  transition: all 0.2s;
}

.search-icon-btn:hover {
  background: #dc2626; /* LA HOVER SE UMPLE CU ROȘU */
  color: #ffffff; /* TEXTUL DEVINE ALB */
}


/* ETICHETE (Chips) */
/* Layout pentru container (Acum pune elementele pe coloană) */
.search-container {
  position: fixed;
  top: 80px;
  left: 20px;
  z-index: 1000; 
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

/* Randul cu insigne și buton */
.search-tags-row {
  display: flex;
  align-items: center; /* Aliniere pe mijloc */
  gap: 15px;
  margin-top: 10px;
  max-width: 600px; /* Să nu se întindă pe tot ecranul */
}

.search-badges-wrapper {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

/* Insigna (Badge-ul) */
.search-badge {
  position: relative;
  background: #eff6ff; /* Albastru foarte deschis */
  color: #1e40af; /* Text albastru închis */
  border: 2px solid #dc2626; /* Contur roșu */
  border-radius: 20px;
  padding: 5px 12px 5px 15px;
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.5px;
  font-family: monospace; /* Font tip cod pentru un aspect tehnic */
}

/* X-ul de pe insigne */
.badge-x {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 18px;
  height: 18px;
  background: #ffffff;
  color: #000000; /* Text negru */
  border: 1px solid #e2e8f0;
  border-radius: 50%;
  font-size: 0.65rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: 0.2s;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  &:hover { background: #dc2626; color: white; border-color: #dc2626; }
}

/* Butonul Verde */
.btn-see-institutions {
  background: #16a34a; /* Verde */
  color: #ffffff; /* Text alb */
  border: none;
  padding: 8px 16px;
  border-radius: 8px;
  font-weight: 700;
  font-size: 0.85rem;
  cursor: pointer;
  transition: 0.2s;
  font-family: inherit;
  white-space: nowrap;
  box-shadow: 0 4px 6px rgba(22, 163, 74, 0.2);
  &:hover { background: #15803d; transform: translateY(-1px); }
}

/* DROPDOWN AUTOCOMPLETARE */
.search-dropdown {
  position: absolute;
  top: 55px; /* Sub câmpul de search */
  left: 0;
  width: 320px;
  max-height: 350px;
  overflow-y: auto; /* Scroll elegant dacă sunt multe */
  background: rgba(155, 155, 155, 0.15); /* Ușor transparent */
  backdrop-filter: blur(30px); /* Efect glassmorphism */
  border-radius: 15px;
  box-shadow: 0 10px 25px rgba(0,0,0,0.15);
  border: 1px solid #e2e8f0;
  z-index: 2000; /* E obligatoriu să fie peste insigne și restul paginii */
}

/* PANOU LATERAL REZULTATE CĂUTARE (Pasul 5) */
.search-side-panel {
  position: fixed;
  top: 0;
  left: 0;
  width: 320px;
  height: 100vh;
  background: rgba(155, 155, 155, 0.10); /* Glassmorphism */
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-right: 2px solid #dc2626; /* Dunga roșie */
  z-index: 1500; /* Peste organigramă */
  display: flex;
  flex-direction: column;
  box-shadow: 4px 0 15px rgba(0,0,0,0.05);
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom: 1px solid rgba(0,0,0,0.05);
  h3 { font-size: 1rem; font-weight: 800; color: #1e293b; margin: 0; }
}

.panel-close-btn {
  background: #f1f5f9; border: none; width: 28px; height: 28px; border-radius: 6px;
  font-size: 0.85rem; cursor: pointer; color: #64748b; transition: 0.2s;
  &:hover { background: #e2e8f0; color: #0f172a; }
}

.panel-list {
  padding: 15px 20px;
  flex-grow: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.panel-link {
  color: #2563eb; /* Text albastru */
  text-decoration: none;
  font-size: 0.95rem;
  font-weight: 600;
  padding: 8px 0;
  border-bottom: 1px solid #f1f5f9;
  transition: color 0.2s;
  &:hover { color: #1d4ed8; }
}

/* Animație intrare panou */
.slide-panel-enter-active, .slide-panel-leave-active { transition: transform 0.3s ease; }
.slide-panel-enter-from, .slide-panel-leave-to { transform: translateX(-100%); }

/* =========================================
   PANOU PROFIL INSTITUȚIONAL
   ========================================= */
.panel-left {
  position: fixed;
  top: 0; left: 0;
  width: 450px;
  height: 100vh;
  background: rgba(255, 255, 255, 0.8); 
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-right: 3px solid #dc2626; 
  z-index: 2000; 
  display: flex;
  flex-direction: column;
  box-shadow: 6px 0 25px rgba(0,0,0,0.08);
}

.panel-header {
  display: flex;
  justify-content: flex-start; /* Schimbat din flex-end în flex-start */
  align-items: flex-start; /* Aliniază sus în stânga */
  padding: 24px 35px 24px 24px; 
  border-bottom: 1px solid rgba(0,0,0,0.05);
  flex-shrink: 0;
}

.panel-header h2 { 
  font-size: 1.1rem; 
  font-weight: 800; 
  color: #1e293b; 
  margin: 0; 
  display: flex; 
  align-items: center; 
} 

.panel-header h2::before { 
  content: ''; 
  width: 6px; 
  height: 6px; 
  background: #2563eb; 
  border-radius: 50%; 
  display: inline-block; 
}

.panel-close-btn {
  background: #fef2f2; 
  border: 1px solid #fecaca; 
  color: #dc2626; 
  width: 28px; 
  height: 28px; 
  border-radius: 6px; 
  font-size: 0.85rem; 
  cursor: pointer; 
  transition: 0.2s;
  display: flex; 
  align-items: center; 
  justify-content: center;
  position: absolute; /* Rămâne fix în coloana din dreapta */
  top: 12px; 
  right: 12px;
  &:hover { background: #dc2626; color: white; }
}

.panel-thumbnail {
  width: 90px; 
  height: 90px;
  border-radius: 50%;
  object-fit: cover;
  border: 8px solid #e2e8f0;
  margin-top: 60px; /* Spațiu între titlu și poză */
  margin-left: 10; /* Revine la stânga, nu se mai duce în dreapta */
}

.panel-body { 
  padding: 24px; 
  flex-grow: 1; 
  overflow-y: auto; 
  display: flex; 
  flex-direction: column; 
  gap: 24px; 
}

/* Secțiuni Profil */
.profile-section { 
  background: #ffffff; 
  padding: 20px; 
  border-radius: 10px; 
  border: 1px solid #e2e8f0; 
}
.section-title { 
  font-size: 0.75rem; 
  font-weight: 800; 
  color: #64748b; 
  text-transform: uppercase; 
  letter-spacing: 1px; 
  margin-bottom: 16px; 
  padding-bottom: 8px; 
  border-bottom: 2px solid #f1f5f9; 
}

/* Grid Contact */
.contact-grid { 
  display: grid; 
  grid-template-columns: 140px 1fr; 
  gap: 12px; 
}
.c-label { font-size: 0.8rem; font-weight: 600; color: #64748b; }
.c-value { 
  font-size: 0.85rem; 
  color: #0f172a; 
  font-weight: 500; 
  background: #f8fafc; 
  padding: 8px 10px; 
  border-radius: 6px; 
  border: 1px solid #e2e8f0; 
  word-break: break-all; 
}

/* Relații */
.relation-box { 
  background: #eff6ff; 
  padding: 14px; 
  border-radius: 8px; 
  border-left: 4px solid #2563eb; 
}
.relation-label { 
  font-size: 0.7rem; 
  font-weight: 700; 
  color: #2563eb; 
  text-transform: uppercase; 
  margin-bottom: 4px; 
}
.relation-value { 
  font-size: 0.9rem; 
  font-weight: 700; 
  color: #1e40af; 
}

/* Metrice HR */
.metric-row { display: flex; gap: 10px; margin-bottom: 12px; }
.metric-card { 
  flex: 1; 
  background: #f8fafc; 
  padding: 12px; 
  border-radius: 8px; 
  text-align: center; 
  border: 1px solid #e2e8f0; 
}
.metric-num { font-size: 1.4rem; font-weight: 800; color: #0f172a; }
.metric-label { font-size: 0.7rem; font-weight: 600; color: #64748b; text-transform: uppercase; }
.metric-bar { 
  width: 100%; 
  height: 6px; 
  background: #e2e8f0; 
  border-radius: 3px; 
  margin-top: 8px; 
  overflow: hidden; 
  position: relative; 
}
.metric-fill-green { height: 100%; background: #16a34a; width: 75%; position: absolute; left: 0; top: 0; border-radius: 3px 0 0 3px; }
.metric-fill-red { height: 100%; background: #dc2626; width: 25%; position: absolute; right: 0; top: 0; border-radius: 0 3px 3px 0; }

/* Buton Structura HR */
.btn-structura-hr { 
  background: #fb923c; 
  color: #ffffff; 
  border: none; 
  padding: 14px 20px; 
  border-radius: 8px; 
  font-size: 0.9rem; 
  font-weight: 700; 
  font-family: inherit; 
  cursor: pointer; 
  width: 100%; 
  text-align: center; 
  transition: 0.2s; 
  box-shadow: 0 4px 6px rgba(251, 146, 60, 0.3); 
  &:hover { background: #f97316; transform: translateY(-1px); }
}

/* Ce e nou? */
.news-item { display: flex; align-items: flex-start; gap: 12px; padding: 12px 0; border-bottom: 1px solid #f1f5f9; }
.news-icon { color: #2563eb; font-size: 1.2rem; margin-top: 2px; }
.news-link { color: #2563eb; font-weight: 600; font-size: 0.9rem; text-decoration: none; line-height: 1.4; &:hover { text-decoration: underline; } }

/* =========================================
   POP-UP STRUCTURĂ H.R. (Pasul 3)
   ========================================= */
.hr-popup-container {
  position: fixed;
  width: 650px;
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 15px 40px rgba(0,0,0,0.2);
  border: 1px solid #e2e8f0;
  z-index: 3000; // Peste tot (Graph, Panou, Căutare)
  user-select: none;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.hr-popup-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  cursor: grab; // Cursor specific pentru drag
  border-radius: 12px 12px 0 0;
  &:active { cursor: grabbing; }
}

.hr-popup-title {
  font-size: 0.95rem;
  font-weight: 800;
  color: #1e293b;
}

.hr-popup-close {
  background: #e2e8f0; border: none; width: 28px; height: 28px; border-radius: 6px;
  font-size: 0.85rem; cursor: pointer; color: #64748b; transition: 0.2s;
  display: flex; align-items: center; justify-content: center;
  &:hover { background: #dc2626; color: white; }
}

.hr-popup-body {
  padding: 16px 20px;
  overflow-y: auto;
  flex-grow: 1;
}

.hr-popup-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  overflow: hidden;
  margin-bottom: 0;
}

.hr-popup-table th {
  background: #f1f5f9;
  color: #475569;
  font-weight: 700;
  padding: 10px 8px;
  text-align: left;
  border-bottom: 2px solid #cbd5e1;
  font-size: 0.8rem;
  text-transform: uppercase;
}

.hr-popup-table td {
  padding: 10px 8px;
  border-bottom: 1px solid #f1f5f9;
  color: #0f172a;
}

.hr-status-link {
  color: #2563eb;
  font-weight: 600;
  text-decoration: none;
  font-size: 0.85rem;
  &:hover { text-decoration: underline; }
}

/* Tabel HR ascuns pentru PDF */
.hr-pdf-wrapper {
  display: none; /* Îl ascundem complet din interfață */
}

/* =========================================
   BUTON EXPORT PDF PROFIL
   ========================================= */
.profile-pdf-actions {
  padding: 16px 24px 24px 24px;
  border-top: 1px solid #e2e8f0;
  background: white;
}

.btn-export-profile-pdf {
  width: 100%;
  background: #f97316; /* Portocaliu */
  color: #ffffff;
  border: none;
  padding: 14px 20px;
  border-radius: 8px;
  font-size: 0.9rem;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
  transition: 0.2s;
  box-shadow: 0 4px 6px rgba(249, 115, 22, 0.3);
  
  &:hover {
    background: #ea580c;
    transform: translateY(-1px);
  }
}

/* =========================================
   ELEMENTE ASCUNSE PENTRU PDF (Titlu și Poză)
   ========================================= */
.pdf-header-section {
  display: none; /* Ascuns pe ecran, vizibil doar în generarea PDF-ului */
  
  h1 {
    font-size: 1.5rem;
    font-weight: 800;
    color: #1e293b;
    margin: 0 0 15px 0;
    text-align: center;
  }
  
  .pdf-header-img {
    display: block;
    max-width: 100px;
    max-height: 100px;
    border-radius: 50%;
    object-fit: cover;
    margin: 0 auto 20px auto;
    border: 4px solid #e2e8f0;
  }
}

/* =========================================
   TABEL HR PENTRU PDF (Linii și stil plăcut)
   ========================================= */
.hr-pdf-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
  margin-top: 15px;
  
  th {
    background: #f1f5f9;
    color: #475569;
    font-weight: 700;
    padding: 10px 8px;
    text-align: left;
    border: 1px solid #cbd5e1;
    font-size: 0.8rem;
    text-transform: uppercase;
  }
  
  td {
    padding: 8px;
    border: 1px solid #e2e8f0;
    color: #0f172a;
  }
  
  /* Linii alternative pentru lizibilitate */
  tbody tr:nth-child(even) {
    background-color: #f8fafc;
  }
}

/* =========================================
   TABEL SURSE PENTRU PANOU PROFIL
   ========================================= */
.sources-profile-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
  
  th {
    background: #f1f5f9;
    color: #475569;
    font-weight: 700;
    padding: 10px 8px;
    text-align: left;
    border: 1px solid #cbd5e1;
    font-size: 0.8rem;
    text-transform: uppercase;
  }
  
  td {
    padding: 10px 8px;
    border: 1px solid #e2e8f0;
    color: #0f172a;
    vertical-align: top;
  }
  
  tbody tr:nth-child(even) {
    background-color: #f8fafc;
  }
}
</style>