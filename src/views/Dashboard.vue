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
import DynamicFinTable from '../components/DynamicFinTable.vue';
import { Home, Landmark, MapPin, Building, LogOut, Trash2, User, Pencil, Plus, Edit3, Move, Search, BookOpen, Moon, Sun, Crown } from 'lucide-vue-next';
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

// NOU: Dicționar pentru copți (Crește viteza de la O(N^2) la O(N))
const childrenMap = computed(() => {
  const map = new Map();
  allNodesList.value.forEach(node => {
    if (node.parent_id) {
      const pId = String(node.parent_id).trim();
      if (!map.has(pId)) map.set(pId, []);
      map.get(pId).push(node);
    }
  });
  return map;
});

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

const selectedLogoFile = ref(null);
const logoPreview = ref(null);
const removeLogo = ref(false);

const onLogoChange = (event) => {
  const file = event.target.files[0];
  if (!file) return;
  selectedLogoFile.value = file;
  logoPreview.value = URL.createObjectURL(file);
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

// NOU: Căutare optimizată cu Debounce (Așteaptă 300ms să oprească tastarea)
const filteredInstitutions = ref([]);
let searchTimeout = null;

watch(searchTerm, (newTerm) => {
  clearTimeout(searchTimeout);
  
  if (!newTerm || newTerm.length < 2) {
    filteredInstitutions.value = [];
    return;
  }
  
  // Așteptăm 300ms după ce userul a terminat de tastat
  searchTimeout = setTimeout(() => {
    const term = removeDiacritics(newTerm);
    // Folosim câmpul 'nume_curat' pregătit anterior (Mult mai rapid!)
    filteredInstitutions.value = allInstitutions.value.filter(inst => inst.nume_curat.includes(term));
  }, 300);
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
// --- TEMA (Dark / Light Mode) ---
const isDarkMode = ref(localStorage.getItem('darkMode') === 'true');

const toggleDarkMode = () => {
  isDarkMode.value = !isDarkMode.value;
  localStorage.setItem('darkMode', isDarkMode.value);
};
const selectedAdminNode = ref(null);
const adminPanelPos = ref({ x: 80, y: 100 }); // Poziția inițială a pop-up-ului
const isDragging = ref(false);
const dragOffset = ref({ x: 0, y: 0 });



// --- VARIABILE PENTRU DRAWER UTILIZATOR ---
const showProfilePanel = ref(false);
const showRolePanel = ref(false);
const showDepartmentPanel = ref(false);
const selectedDepartmentData = ref(null);
const departmentProfileHrData = ref([]);
const showCommitteePanel = ref(false);
const selectedCommitteeData = ref(null);

const selectedRoleData = ref(null);
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

                             // 1. Extragem ID-urile tuturor copiilor (departamente + roluri) direct din lista încărcată în graf
          const childNodeIds = allNodesList.value
            .filter(n => String(n.institutie_id) === String(node.id))
            .map(n => String(n.id));

          // 2. Facem un singur array cu ID-ul instituției + ID-urile copiilor
          const allRelevantNodeIds = [String(node.id), ...childNodeIds];

                   let combinedHrData = [];

          // 1. Funcție de cautare recursivă rapidă folosind dicționarul
          const getDescendantIds = (parentId) => {
            let ids = [];
            const stack = [String(parentId)]; // Folosim o stivă pentru a evita limitările de recursivitate
            
            while (stack.length > 0) {
              const currentId = stack.pop();
              const directChildren = childrenMap.value.get(currentId) || [];
              
              directChildren.forEach(child => {
                const childId = String(child.id);
                ids.push(childId);
                stack.push(childId); // Adăugăm copilul în stivă pentru a-i căuta și lui copiii
              });
            }
            return ids;
          };

                             // Obținem ID-urile tuturor copiilor instituției
          const allDescendantIds = getDescendantIds(String(node.id));
          const allIdsToQuery = [String(node.id), ...allDescendantIds];

                   // Pregătim ID-urile și NUMELE departamentelor și birourilor pentru a le filtra
          const childDepartments = allNodesList.value.filter(n => 
            allDescendantIds.includes(String(n.id)) && (n.is_department === true || n.is_office === true)
          );
          const departmentIds = childDepartments.map(n => String(n.id));

          // DEFINIM CORECT ROLURILE (folosim !n.is_... pentru a prinde și null-urile din DB)
          const childRoles = allNodesList.value.filter(n => 
            allDescendantIds.includes(String(n.id)) && 
            !n.is_institution && 
            !n.is_department && 
            !n.is_office && 
            !n.is_committee
          );

          // Siguranță: Supabase dă eroare 400 dacă trimitem un ID care nu e UUID valid
          const isUUID = (id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
          const safeIdsToQuery = allIdsToQuery.filter(id => isUUID(id));

          // 2. Aducem datele HR din tabelul date_joburi (FILTRÂND DEPARTEMENTELE)
          const { data: tableData, error: tableError } = await supabase
            .from('date_joburi')
            .select('*')
            .in('organogram_node_id', safeIdsToQuery);
          
                   // 2. Aducem datele HR din tabelul date_joburi (FILTRÂND DEPARTEMENTELE)
          // [Codul existent cu safeIdsToQuery rămâne la fel, dar modificăm maparea de mai jos:]

          if (!tableError && tableData) {
            const instName = selectedUserData.value?.nume || 'Instituție';
            if (tableData.length > 0) {
              // HEADER Instituție
              combinedHrData.push({ isHeader: true, title: instName });
              combinedHrData.push(...tableData
                .filter(row => !departmentIds.includes(String(row.organogram_node_id))) 
                .map(row => ({
                  functie: row.functie || '',
                  ocupate: row.pozitii_ocupate || 0,
                  vacante: row.pozitii_vacante || 0,
                  total: (row.pozitii_ocupate || 0) + (row.pozitii_vacante || 0),
                  statut: row.statut || 'Activ',
                  finColumns: row.fin_columns || [] 
                }))
              );
            }
          }
          // 3. Aducem datele HR din METADATA pentru DEPARTEMENTE
          // Funcție ajutătoare: Găsește numele instituției părinte (dacă nodul nu e direct sub rădăcină)
          const getParentInstitutionName = (startNodeId, rootId) => {
            let currentId = startNodeId;
            while (currentId && String(currentId) !== String(rootId)) {
              const currentNode = allNodesList.value.find(n => String(n.id) === String(currentId));
              if (!currentNode || !currentNode.parent_id) break;
              
              const parent = allNodesList.value.find(n => String(n.id) === String(currentNode.parent_id));
              if (!parent) break;
              
              // Dacă părintele e o instituție și NU e rădăcina pe care am clickuit-o
              if (parent.is_institution === true && String(parent.id) !== String(rootId)) {
                return parent.nume || parent.node_name || 'Instituție';
              }
              currentId = parent.id;
            }
            return null; // Dacă nu găsește o sub-instituție, returnează null
          };

          childDepartments.forEach(dept => {
            const deptRows = dept.metadata?.hr_departament || [];
            if (deptRows.length > 0) {
              // Verificăm dacă acest departament aparține unei sub-instituții
              const parentInstName = getParentInstitutionName(String(dept.id), String(node.id));
              
              // Dacă da, afișăm "Instituție ➔ Departament", altfel doar "Departament"
              const headerTitle = parentInstName 
                ? `${parentInstName} ➔ ${dept.nume || dept.node_name || 'Departament'}`
                : (dept.nume || dept.node_name || 'Departament');

              // HEADER Departament
              combinedHrData.push({ isHeader: true, title: headerTitle });
              combinedHrData.push(...deptRows.map(row => ({
                functie: row.functie || '',
                ocupate: row.ocupate || 0,
                vacante: row.vacante || 0,
                total: (row.ocupate || 0) + (row.vacante || 0),
                statut: 'Activ',
                finColumns: row.finColumns || [] 
              })));
            }
          });

          // 4. Aducem ROLURILE ca posturi (1 post per rol)
          childRoles.forEach(role => {
            const roleStatus = role.metadata?.role_statut || 'Vacant';
            
            // Verificăm și pentru rol dacă aparține unei sub-instituții
            const parentInstName = getParentInstitutionName(String(role.id), String(node.id));
            const headerTitle = parentInstName 
              ? `${parentInstName} ➔ Rol: ${role.nume || role.node_name || 'N/A'}`
              : `Rol: ${role.nume || role.node_name || 'N/A'}`;

            // HEADER Rol
            combinedHrData.push({ isHeader: true, title: headerTitle });
            combinedHrData.push({
              functie: role.nume || role.node_name || 'Rol Nedefinit',
              ocupate: roleStatus === 'Activ' ? 1 : 0,
              vacante: roleStatus === 'Vacant' ? 1 : 0,
              total: 1,
              statut: roleStatus,
              finColumns: role.metadata?.role_fin_columns || [] 
            });
          });
          // 5. Salvăm totul
          userHrData.value = combinedHrData;
        }
        };
       const handleDetailsClick = (node) => {
  const nodeData = allNodesList.value.find(n => String(n.id) === String(node.id));
  
  if (nodeData && nodeData.is_committee) {
    // CASA NOUĂ: Pentru Comisii
    selectedCommitteeData.value = nodeData;
    showCommitteePanel.value = true;
    showProfilePanel.value = false;
    showDepartmentPanel.value = false;
    showRolePanel.value = false;
  } else if (nodeData && nodeData.is_department) {
    selectedDepartmentData.value = nodeData;
    departmentProfileHrData.value = nodeData.metadata?.hr_departament || [];
    showDepartmentPanel.value = true;
    showProfilePanel.value = false;
    showRolePanel.value = false;
    showCommitteePanel.value = false;
  } else if (nodeData && nodeData.is_institution === false) {
    selectedRoleData.value = nodeData;
    showRolePanel.value = true;
    showProfilePanel.value = false;
    showDepartmentPanel.value = false;
    showCommitteePanel.value = false;
  } else {
    openUserDetails(node);
    showDepartmentPanel.value = false;
    showRolePanel.value = false;
    showCommitteePanel.value = false;
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
  
  let newX = e.clientX - hrDragOffset.value.x;
  let newY = e.clientY - hrDragOffset.value.y;

  // Panoul HR are dimensiuni stocate în hrModalSize
  const pWidth = parseInt(hrModalSize.value.width) || 650;
  const pHeight = parseInt(hrModalSize.value.height) || 400;

  const minX = -(pWidth - 100);
  const maxX = window.innerWidth - 100;
  const minY = 0;
  const maxY = window.innerHeight - 50;

  hrPopupPos.value = {
    x: Math.max(minX, Math.min(newX, maxX)),
    y: Math.max(minY, Math.min(newY, maxY))
  };
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

// Funcție care numără corect rândurile, sărind peste headere
const getDisplayHrRows = computed(() => {
  let counter = 0;
  return userHrData.value.map(row => {
    if (!row.isHeader) {
      counter++;
      return { ...row, displayIndex: counter }; // Adăugăm numărul corect
    }
    return row; // Header-ul rămâne fără număr
  });
});

const closeRolePanel = () => {
  showRolePanel.value = false;
  selectedRoleData.value = null;
};

const closeCommitteePanel = () => {
  showCommitteePanel.value = false;
  selectedCommitteeData.value = null;
};
        const closeDepartmentPanel = () => {
  showDepartmentPanel.value = false;
  selectedDepartmentData.value = null;
  departmentProfileHrData.value = [];
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

const exportChartPDF = () => {
  const element = document.querySelector('.chart-container');
  if (!element) return;

  const opt = { 
    margin: 10, 
    filename: `Vizualizare_${currentView.value}.pdf`, 
    image: { type: 'jpeg', quality: 0.98 }, 
    html2canvas: { scale: 2, useCORS: true }, 
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' } // Landscape pt chart
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

const exportRolePDF = () => {
  const element = document.getElementById('role-profile-pdf-section');
  if (!element) return;

  // 1. Clonăm elementul pentru a nu strica designul de pe ecran
  const clonedElement = element.cloneNode(true);
  clonedElement.style.position = 'static';
  clonedElement.style.margin = '0';
  clonedElement.style.padding = '20px';
  clonedElement.style.height = 'auto'; // Forțăm înălțimea să se adapteze la conținut
  clonedElement.style.overflow = 'hidden'; // Evităm spații goale infinite

  // 2. Creăm un wrapper temporar invizibil pe ecran
  const wrapper = document.createElement('div');
  wrapper.style.position = 'absolute';
  wrapper.style.left = '-9999px';
  wrapper.style.top = '0';
  wrapper.style.width = '600px'; // Lățime fixă pentru un PDF curat
  wrapper.style.background = 'white';
  wrapper.appendChild(clonedElement);
  
  document.body.appendChild(wrapper);

  const opt = { 
    margin: [10, 10, 10, 10], 
    filename: `Profil_Rol_${selectedRoleData.value?.nume || 'rol'}.pdf`, 
    image: { type: 'jpeg', quality: 0.98 }, 
    html2canvas: { scale: 2, useCORS: true }, 
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
  };

  html2pdf().set(opt).from(clonedElement).save().finally(() => {
    // 3. Ștergem wrapper-ul din DOM
    document.body.removeChild(wrapper);
  });
};



const exportDepartmentPDF = () => {
  const element = document.getElementById('department-profile-pdf-section');
  if (!element) return;

  // 1. Clonăm elementul
  const clonedElement = element.cloneNode(true);
  clonedElement.style.position = 'static';
  clonedElement.style.margin = '0';
  clonedElement.style.padding = '20px';

  // 2. Creăm un wrapper temporar invizibil pe ecran
  const wrapper = document.createElement('div');
  wrapper.style.position = 'absolute';
  wrapper.style.left = '-9999px';
  wrapper.style.top = '0';
  wrapper.style.width = '600px';
  wrapper.style.background = 'white';
  wrapper.appendChild(clonedElement);
  
  document.body.appendChild(wrapper);

  const opt = { 
    margin: [10, 10, 10, 10], 
    filename: `Profil_Departament_${selectedDepartmentData.value?.node_name || 'departament'}.pdf`, 
    image: { type: 'jpeg', quality: 0.98 }, 
    html2canvas: { scale: 2, useCORS: true }, 
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };

  html2pdf().set(opt).from(clonedElement).save().finally(() => {
    // 3. Ștergem wrapper-ul din DOM
    document.body.removeChild(wrapper);
  });
};

const exportCommitteePDF = () => {
  const element = document.getElementById('committee-profile-pdf-section');
  if (!element) return;

  const clonedElement = element.cloneNode(true);
  clonedElement.style.position = 'static';
  clonedElement.style.margin = '0';
  clonedElement.style.padding = '20px';

  const wrapper = document.createElement('div');
  wrapper.style.position = 'absolute';
  wrapper.style.left = '-9999px';
  wrapper.style.top = '0';
  wrapper.style.width = '600px';
  wrapper.style.background = 'white';
  wrapper.appendChild(clonedElement);
  
  document.body.appendChild(wrapper);

  const opt = { 
    margin: [10, 10, 10, 10], 
    filename: `Profil_Consiliu_${selectedCommitteeData.value?.node_name || selectedCommitteeData.value?.nume || 'comisie'}.pdf`, 
    image: { type: 'jpeg', quality: 0.98 }, 
    html2canvas: { scale: 2, useCORS: true }, 
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
  };

  html2pdf().set(opt).from(clonedElement).save().finally(() => {
    document.body.removeChild(wrapper);
  });
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
  relatie: '',
   is_institution: true,
   is_department: false,
   calitate_bugetara: '',
   department_angajati: 0,
  department_rof: '',
  // Câmpuri specifice ROL
  role_cod_cor: '',
  role_baza_legala: '',
  role_reglementare: '',
  role_gradatie_treapta: '',
  role_statut: 'Vacant',
});

// --- VARIABILE PENTRU ROBOT AUTOMATIZARE ---
const isAiLoading = ref(false);
const aiStatusText = ref('');
const robotUrlContact = ref('');
const robotUrlRof = ref('');
const robotUrlHr = ref('');
const robotUrlSalarii = ref('');

let finColIdCounter = 0; // Contor pentru ID-uri unice de coloane
// Tabelul de jos (Date Personal)
const hrRows = ref([]);
const addHrRow = () => {  
  hrRows.value.push({ 
    functie: '', 
    ocupate: 1, 
    vacante: 0, 
    statut: 'Activ',
    finColumns: [] // <-- ADAUGAT: Aici se vor stoca coloanele dinamice ale acestui rând
  });
};
const removeHrRow = (index) => {
  hrRows.value.splice(index, 1);
};

// --- VARIABILE PENTRU MODAL VENITURI ---
const openRowDrawer = ref(null);
const activeFinTableType = ref(null); // 'inst', 'dept', sau 'role'
const newColName = ref('');
const newColType = ref('valoare');
const newColValue = ref(null);

// --- LOGICĂ REDIMENSIONARE MODAL HR ---
const hrModalSize = ref({ width: '850px', height: '70vh' }) // Dimensiuni inițiale
const isResizingHrModal = ref(false)
const resizeStartCoords = ref({ x: 0, y: 0, w: 0, h: 0 })

function startHrModalResize(e) {
  // Oprește propagarea ca să nu se închidă modalul dacă dai click pe overlay
  e.stopPropagation() 
  isResizingHrModal.value = true
  resizeStartCoords.value = {
    x: e.clientX,
    y: e.clientY,
    w: parseInt(hrModalSize.value.width),
    h: parseInt(hrModalSize.value.height)
  }
  document.addEventListener('mousemove', doHrModalResize)
  document.addEventListener('mouseup', stopHrModalResize)
  
  // Opțional: previne selectarea textului în timpul tragerii
  document.body.style.userSelect = 'none'
}

function doHrModalResize(e) {
  if (!isResizingHrModal.value) return
  
  // Calculează noua lățime și înălțime
  let newW = resizeStartCoords.value.w + (e.clientX - resizeStartCoords.value.x)
  let newH = resizeStartCoords.value.h + (e.clientY - resizeStartCoords.value.y)
  
  // Setează limite minime și maxime
  newW = Math.max(500, Math.min(newW, window.innerWidth - 40))
  newH = Math.max(400, Math.min(newH, window.innerHeight - 40))
  
  hrModalSize.value.width = `${newW}px`
  hrModalSize.value.height = `${newH}px`
}

function stopHrModalResize() {
  isResizingHrModal.value = false
  document.removeEventListener('mousemove', doHrModalResize)
  document.removeEventListener('mouseup', stopHrModalResize)
  document.body.style.userSelect = ''
}

// --- SUPER FUNCȚIA PENTRU ADAUGARE (Asta o cheamă butonul din Modal) ---
const handleFinColAdd = () => {
  if (!newColName.value.trim()) return alert("Specifică un nume pentru venit!");
  
  const newCol = {
    id: 'fin_' + (++finColIdCounter),
    name: newColName.value,
    type: newColType.value,
    value: newColType.value === 'text' ? newColValue.value : (newColValue.value || 0)
  };

  // Aici decide unde să pună coloana
  if (activeFinTableType.value === 'inst') {
    hrRows.value[openRowDrawer.value].finColumns.push(newCol);
  } else if (activeFinTableType.value === 'dept') {
    departmentHrRows.value[openRowDrawer.value].finColumns.push(newCol);
  } else if (activeFinTableType.value === 'role') {
    roleFinColumns.value.push(newCol);
  }

  // Resetăm Modal-ul și închidem
  newColName.value = '';
  newColValue.value = null;
  newColType.value = 'valoare';
  openRowDrawer.value = null;
};

const removeFinColFromRow = (rowIndex, colId) => {
  hrRows.value[rowIndex].finColumns = hrRows.value[rowIndex].finColumns.filter(c => c.id !== colId);
};

// Tabelul Surse Informații
const sourceRows = ref([]);
const addSourceRow = () => {
  sourceRows.value.push({ subiect: '', link: '', observatii: '' });
};
const removeSourceRow = (index) => {
  sourceRows.value.splice(index, 1);
};


// Tabelul Sporuri pentru ROL
const roleSporuriRows = ref([]);
const departmentHrRows = ref([]);
const addDepartmentHrRow = () => {
  departmentHrRows.value.push({ 
    functie: '', 
    total: 0, 
    ocupate: 0, 
    vacante: 0, 
    observatii: '',
    finColumns: [] 
  });
};
const removeDepartmentHrRow = (index) => {
  departmentHrRows.value.splice(index, 1);
};

// --- LOGICĂ COLOANE DINAMICE DEPARTAMENTE ---
// (Funcția veche addFinColToDeptRow a fost ștearsă, acum folosește handleFinColAdd)

const removeFinColFromDeptRow = (rowIndex, colId) => {
  departmentHrRows.value[rowIndex].finColumns = departmentHrRows.value[rowIndex].finColumns.filter(c => c.id !== colId);
};

// --- LOGICĂ DE CALCUL FINANCIAR ---

// Calcul pentru un rând de INSTITUȚIE
const calculateInstRowTotal = (row) => {
  let total = 0;
  const safeColumns = row.finColumns || []; // PLASĂ DE SIGURANȚĂ
  // Căutăm prima coloană de tip 'valoare' din rând (va fi baza pentru procente)
  const baseCol = safeColumns.find(c => c.type === 'valoare');
  const baseValue = baseCol ? (parseFloat(baseCol.value) || 0) : 0;

  safeColumns.forEach(col => {
    const val = parseFloat(col.value) || 0;
    if (col.type === 'valoare') {
      total += val * (row.ocupate || 0); // Valoare x Ocupate
    } else if (col.type === 'procent') {
      total += (baseValue * (val / 100)) * (row.ocupate || 0); // (Baza x Procent / 100) x Ocupate
    }
    // Dacă e 'text', nu se face niciun calcul
  });
  return total;
};

// Total general pentru toate rândurile de INSTITUȚIE
const getInstNodeFinTotal = () => {
  let grandTotal = 0;
  hrRows.value.forEach(row => { grandTotal += calculateInstRowTotal(row); });
  return grandTotal;
};

// Total general specific pentru PANOU PROFIL (citește din userHrData, nu din hrRows)
const getProfileFinTotal = () => {
  let grandTotal = 0;
  userHrData.value.forEach(row => { grandTotal += calculateInstRowTotal(row); });
  return grandTotal;
};

// Total general specific pentru PANOU PROFIL DEPARTAMENT
const getDeptProfileFinTotal = () => {
  let grandTotal = 0;
  departmentProfileHrData.value.forEach(row => { grandTotal += calculateDeptRowTotal(row); });
  return grandTotal;
};

// Calcul pentru un rând de DEPARTAMENT
const calculateDeptRowTotal = (row) => {
  let total = 0;
  const safeColumns = row.finColumns || []; // PLASĂ DE SIGURANȚĂ
  const baseCol = safeColumns.find(c => c.type === 'valoare');
  const baseValue = baseCol ? (parseFloat(baseCol.value) || 0) : 0;

  safeColumns.forEach(col => {
    const val = parseFloat(col.value) || 0;
    if (col.type === 'valoare') {
      total += val * (row.ocupate || 0);
    } else if (col.type === 'procent') {
      total += (baseValue * (val / 100)) * (row.ocupate || 0);
    }
  });
  return total;
};

// Total general pentru toate rândurile de DEPARTAMENT
const getDeptNodeFinTotal = () => {
  let grandTotal = 0;
  departmentHrRows.value.forEach(row => { grandTotal += calculateDeptRowTotal(row); });
  return grandTotal;
};

// --- GENERARE AUTOMATĂ CAPETE DE TABEL (COMPUTED) ---

// Extrage toate coloanele unice din tabelul de INSTITUȚII
const masterInstFinColumns = computed(() => {
  const colsMap = new Map();
  hrRows.value.forEach(row => {
    const safeColumns = row.finColumns || []; // PLASĂ DE SIGURANȚĂ
    safeColumns.forEach(col => {
      if (!colsMap.has(col.id)) {
        colsMap.set(col.id, { id: col.id, name: col.name });
      }
    });
  });
  return Array.from(colsMap.values());
});

// Extrage toate coloanele unice din tabelul de DEPARTEMENTE

const masterDeptFinColumns = computed(() => {
  const colsMap = new Map();
  departmentHrRows.value.forEach(row => {
    const safeColumns = row.finColumns || []; // PLASĂ DE SIGURANȚĂ
    safeColumns.forEach(col => {
      if (!colsMap.has(col.id)) {
        colsMap.set(col.id, { id: col.id, name: col.name });
      }
    });
  });
  return Array.from(colsMap.values());
});

const addSporRow = () => {
  roleSporuriRows.value.push({ nume: '' });
};
const removeSporRow = (index) => {
  roleSporuriRows.value.splice(index, 1);
};


// --- LOGICĂ COMISIE / CONSILIU ---
const committeeMembers = ref([]);
const addCommitteeMember = () => {
  committeeMembers.value.push({ nume: '', rol_in_comisie: '', functia_de_baza: '' });
};
const removeCommitteeMember = (index) => {
  committeeMembers.value.splice(index, 1);
};
// --- LOGICĂ COLOANE FINANCIARE PENTRU ROL ---
const roleFinColumns = ref([]); // Array-ul care va ține coloanele orizontale

// (VECHIUL addRoleFinCol CU PROMPT-UL A FOST ȘTERS, ACUM SE FOLOSEȘTE handleFinColAdd)

const removeRoleFinCol = (colId) => {
  roleFinColumns.value = roleFinColumns.value.filter(c => c.id !== colId);
};

// Calculul totalului pentru ROL (nu se înmulțește cu Ocupate, e o singură persoană)
const getRoleTotal = () => {
  let total = 0;
  // Căutăm prima coloană de tip 'valoare' (ex: Salariul de bază) ca referință pentru procente
  const baseCol = roleFinColumns.value.find(c => c.type === 'valoare');
  const baseValue = baseCol ? (parseFloat(baseCol.value) || 0) : 0;

  roleFinColumns.value.forEach(col => {
    const val = parseFloat(col.value) || 0;
    if (col.type === 'valoare') {
      total += val; // Adunăm direct valoarea
    } else if (col.type === 'procent') {
      total += (baseValue * (val / 100)); // Calculăm procentul din baza de referință
    }
    // 'text' se ignoră la calcul
  });
  return total;
};

// Datele financiare extrase sigur pentru afișare în PANOU PROFIL ROL
const profileRoleFinCols = computed(() => {
  return selectedRoleData.value?.metadata?.role_fin_columns || [];
});

// Calculul totalului specific pentru PANOU PROFIL ROL
const getProfileRoleTotal = () => {
  let total = 0;
  const cols = profileRoleFinCols.value;
  const baseCol = cols.find(c => c.type === 'valoare');
  const baseValue = baseCol ? (parseFloat(baseCol.value) || 0) : 0;

  cols.forEach(col => {
    const val = parseFloat(col.value) || 0;
    if (col.type === 'valoare') total += val;
    else if (col.type === 'procent') total += (baseValue * (val / 100));
  });
  return total;
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
      statut: row.statut || 'Activ',
      finColumns: row.fin_columns || [] // PRELUARE DIN DB (col. fin_columns)
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
  // 1. VERIFICARE FORMULAR DESCHIS
  if (adminAction.value) {
    const confirmLeave = window.confirm("Ai modificări nesalvate în formularul de administrare. Sigur vrei să abandonezi și să navighezi în graf?");
    if (!confirmLeave) return; // Dacă dă Cancel, oprim execuția
    adminAction.value = null; // Dacă dă OK, închidem formularul
    adminMessage.value = { text: '', type: '' };
  }

  // INTERCEPTARE MUTARE
  if (isMoveMode.value) {
    moveTargetNode.value = event.node;
    executeMove();
    return;
  }

  const clickedNodeId = String(event.node.id);
  const clickedNode = allNodesList.value.find(n => String(n.id) === clickedNodeId);

  // BLOCARE VIZITATOR
  if (userRole.value === 'vizitator' && event.node.data?.subCount > 0) {
    authModalMode.value = 'register';
    showAuthModal.value = true;
    return; 
  }

  // LOGICA NORMALĂ
  if (clickedNode && clickedNode.parent_id !== null && clickedNodeId !== currentRootId.value) {
    navigationStack.value.push(currentRootId.value);
    currentRootId.value = clickedNodeId;
  }
};

// Selectare nod exclusiv prin Click Dreapta (pt Admin) - ACUM ESTE SEPARAT CORECT
const onNodeRightClick = (event) => {
  event.event.preventDefault();

  if (userRole.value !== 'admin' || !showAdminTools.value) return;

  // VERIFICARE FORMULAR DESCHIS
  if (adminAction.value) {
    const confirmLeave = window.confirm("Ai modificări nesalvate. Sigur vrei să selectezi alt nod?");
    if (!confirmLeave) return;
    adminAction.value = null;
    adminMessage.value = { text: '', type: '' };
  }

  selectedAdminNode.value = event.node;
};

const goBack = () => {
  // VERIFICARE FORMULAR DESCHIS
  if (adminAction.value) {
    const confirmLeave = window.confirm("Ai modificări nesalvate. Sigur vrei să mergi înapoi?");
    if (!confirmLeave) return;
    adminAction.value = null;
    adminMessage.value = { text: '', type: '' };
  }

  if (navigationStack.value.length > 0) {
    currentRootId.value = navigationStack.value.pop();
    updateLayout();
  }
};


// --- BREADCRUMBS (Firimituri de navigare) ---
const breadcrumbTrail = computed(() => {
  const trail = [];
  let currentId = currentRootId.value;
  
  // Urcăm în arbore prin parent_id până ajungem la null (rădăcina absolută)
  while (currentId) {
    const node = allNodesList.value.find(n => String(n.id) === String(currentId));
    if (!node) break;
    
    trail.unshift(node); // Adăugăm la începutul array-ului ca să meargă Rădăcină -> Copil
    
    // Oprim bucla dacă nu are părinte
    if (!node.parent_id) break;
    currentId = String(node.parent_id);
  }
  return trail;
});

const navigateToBreadcrumb = (nodeId) => {
  // Dacă dăm click pe nodul curent, nu facem nimic
  if (String(nodeId) === String(currentRootId.value)) return;

  // Calculăm noul stack de navigare
  const trail = breadcrumbTrail.value;
  const clickedIndex = trail.findIndex(n => String(n.id) === String(nodeId));
  
  // Păstrăm în stack doar nodurile de dinaintea celui pe care am click-uit
  navigationStack.value = trail.slice(0, clickedIndex).map(n => String(n.id));
  
  // Setăm noul nod rădăcină
  currentRootId.value = String(nodeId);
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
  
  let newX = e.clientX - dragOffset.value.x;
  let newY = e.clientY - dragOffset.value.y;

  // Obținem dimensiunile reale ale panoului de admin
  const panel = document.querySelector('.admin-tools-panel');
  const pWidth = panel ? panel.offsetWidth : 260;
  const pHeight = panel ? panel.offsetHeight : 400;

  // Limităm X: permitem să iasă parțial, dar cel puțin 100px rămân vizibile
  const minX = -(pWidth - 100);
  const maxX = window.innerWidth - 100;
  // Limităm Y: nu permitem să urce deasupra paginii (y=0) și să lase 50px jos
  const minY = 0;
  const maxY = window.innerHeight - 50;

  adminPanelPos.value = {
    x: Math.max(minX, Math.min(newX, maxX)),
    y: Math.max(minY, Math.min(newY, maxY))
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
          adminFormData.value = { nume: '', tip_institutie: '', news: '', relatie: '', is_institution: true, is_department: false,  is_office: false,    is_committee: false, };

      hrRows.value = []; 
  sourceRows.value = []; 
  roleFinColumns.value = []; // GOLIM COLOANELE FINANCIARE ROL
  committeeMembers.value = []; // GOLIM MEMBRII COMISIE
  adminMessage.value = { text: '', type: '' };
};

// Funcție pentru a permite selectarea unui singur tip de nod (CU TOGGLE CORECT)
const setNodeType = (type) => {
  // Resetăm totul la false (dacă apelezi 'role', rămâne totul false, perfect)
  adminFormData.value.is_institution = false;
  adminFormData.value.is_department = false;
  adminFormData.value.is_office = false;
  adminFormData.value.is_committee = false;
  
  // Dacă e un tip specific, îl setăm pe true
  if (type === 'institution') adminFormData.value.is_institution = true;
  else if (type === 'department') adminFormData.value.is_department = true;
  else if (type === 'office') adminFormData.value.is_office = true;
  else if (type === 'committee') adminFormData.value.is_committee = true;
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
      news: nodeData.metadata?.news || '',
      rol: nodeData.rol || '',
      website: nodeData.website || '',
      relatie: (() => {
        if (!nodeData.parent_id) return nodeData.metadata?.relatie_superioara || '';
        const parentNode = allNodesList.value.find(n => String(n.id) === String(nodeData.parent_id));
        return parentNode ? (parentNode.nume || parentNode.node_name) : '';
      })(),
               is_institution: nodeData.is_institution ?? true,
        is_department: nodeData.is_department ?? false,
        is_office: nodeData.is_office ?? false,         // <-- ADAUGĂ ASTA
        is_committee: nodeData.is_committee ?? false,   // <-- ADAUGĂ ASTA

      };

       imagePreview.value = nodeData.metadata?.imagine || null;

            // Preluare date specifice ROL din metadata
      adminFormData.value.role_cod_cor = nodeData.metadata?.cod_cor || '';
      adminFormData.value.role_baza_legala = nodeData.metadata?.baza_legala || '';
            adminFormData.value.role_reglementare = nodeData.metadata?.reglementare || '';
      adminFormData.value.role_gradatie_treapta = nodeData.metadata?.gradatie_treapta || '';
      adminFormData.value.role_statut = nodeData.metadata?.role_statut || 'Vacant';

      
      if (nodeData.metadata?.sporuri && Array.isArray(nodeData.metadata.sporuri)) {
        roleSporuriRows.value = nodeData.metadata.sporuri.map(s => ({ nume: s.nume || '' }));
        committeeMembers.value = nodeData.metadata?.committee_members || []; // ÎNCĂRCĂM MEMBRII COMISIE
          } else {
      roleSporuriRows.value = [];
    }
 // Încărcăm coloanele financiare pentru ROL
    roleFinColumns.value = nodeData.metadata?.role_fin_columns || [];

    // Preluare date specifice DEPARTAMENT din metadata
    adminFormData.value.department_rof = nodeData.metadata?.rof || '';
     adminFormData.value.calitate_bugetara = nodeData.metadata?.calitate_bugetara || '';
    
          if (nodeData.metadata?.hr_departament && Array.isArray(nodeData.metadata.hr_departament)) {
      departmentHrRows.value = nodeData.metadata.hr_departament.map(h => ({
        functie: h.functie || '',
        total: h.total || 0,
        ocupate: h.ocupate || 0,
        vacante: h.vacante || 0,
        observatii: h.observatii || '',
        finColumns: h.finColumns || [] // PRELUARE DIN DB (metadata)
      }));
    } else {
      departmentHrRows.value = [];
    }

    imagePreview.value = nodeData.metadata?.imagine || null;
    
    // Aducem datele HR din tabelul date_joburi
    await fetchHrData(selectedAdminNode.value.id);
    await fetchSourceData(selectedAdminNode.value.id);
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
  let finalLogoUrl = null; // <-- NOU: Variabila pentru logo

  // 1. Gestionarea Imaginii (rămâne în metadata)
  if (adminAction.value === 'edit') {
    const nodeInfo = allNodesList.value.find(n => String(n.id) === nodeId);
    if (selectedFile.value) {
      try { finalImageUrl = await uploadImage(selectedFile.value); } 
      catch (e) { isSavingNode.value = false; adminMessage.value = { text: 'Eroare poză: ' + e.message, type: 'error' }; return; }
    } else if (removeImage.value) { finalImageUrl = null; } 
    else { finalImageUrl = nodeInfo?.metadata?.imagine || null; }
  }

  // --- NOU: 1.1 Gestionarea Logo-ului ---
  if (adminAction.value === 'edit') {
    const nodeInfo = allNodesList.value.find(n => String(n.id) === nodeId);
    if (selectedLogoFile.value) {
      try { finalLogoUrl = await uploadImage(selectedLogoFile.value); } 
      catch (e) { isSavingNode.value = false; adminMessage.value = { text: 'Eroare logo: ' + e.message, type: 'error' }; return; }
    } else if (removeLogo.value) { 
      finalLogoUrl = null; 
    } else { 
      finalLogoUrl = nodeInfo?.metadata?.logo_url || null; 
    }
  } else if (adminAction.value === 'create') {
     if (selectedLogoFile.value) {
      try { finalLogoUrl = await uploadImage(selectedLogoFile.value); } 
      catch (e) { isSavingNode.value = false; adminMessage.value = { text: 'Eroare logo: ' + e.message, type: 'error' }; return; }
    }
  }
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
            
      metadata: { 
        tip: adminFormData.value.tip_institutie, 
        imagine: finalImageUrl, 
        logo_url: finalLogoUrl,
        news: adminFormData.value.news, 
        relatie_superioara: adminFormData.value.relatie,
        // Salvare date ROL
        cod_cor: adminFormData.value.role_cod_cor,
        baza_legala: adminFormData.value.role_baza_legala,
        reglementare: adminFormData.value.role_reglementare,
        gradatie_treapta: adminFormData.value.role_gradatie_treapta,
         role_statut: adminFormData.value.role_statut,
                      sporuri: roleSporuriRows.value,
              role_fin_columns: roleFinColumns.value, // SALVARE COLOANE FINANCIARE ROL
                     // Salvare date DEPARTAMENT
        rof: adminFormData.value.department_rof,
        hr_departament: departmentHrRows.value,
        // Salvare date INSTITUȚIE
        calitate_bugetara: adminFormData.value.calitate_bugetara
      }, 

           is_institution: adminFormData.value.is_institution,
      is_department: adminFormData.value.is_department,
      is_office: adminFormData.value.is_office,
      is_committee: adminFormData.value.is_committee
    };

    const res = await supabase.from('organograms').insert([insertData]).select();
    error = res.error; 
    data = res.data;

    // 2.1. Salvăm rândurile de HR (dacă există) folosind ID-ul nodului nou creat
    
        if (!error && data && data[0] && hrRows.value.length > 0) {
          const hrInserts = hrRows.value.map(row => ({
            organogram_node_id: data[0].id,
            functie: row.functie,
            pozitii_ocupate: row.ocupate,
            pozitii_vacante: row.vacante,
            salariu_minim: null,
            salariu_maxim: null,
            statut: row.statut,
            fin_columns: row.finColumns || [] // SALVARE COLOANE FINANCIARE
          }));
          const { error: hrErr } = await supabase.from('date_joburi').insert(hrInserts);
          if (hrErr) console.error('Eroare HR Create:', hrErr.message);
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
            metadata: { 
              tip: adminFormData.value.tip_institutie, 
              imagine: finalImageUrl, 
              logo_url: finalLogoUrl,
              news: adminFormData.value.news, 
              relatie_superioara: adminFormData.value.relatie,
              calitate_bugetara: adminFormData.value.calitate_bugetara
            },
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
          metadata: { 
            tip: adminFormData.value.tip_institutie, 
            imagine: finalImageUrl,
            logo_url: finalLogoUrl, 
            news: adminFormData.value.news, 
            relatie_superioara: adminFormData.value.relatie,
            cod_cor: adminFormData.value.role_cod_cor,
            baza_legala: adminFormData.value.role_baza_legala,
            reglementare: adminFormData.value.role_reglementare,
            gradatie_treapta: adminFormData.value.role_gradatie_treapta,
             role_statut: adminFormData.value.role_statut,
           sporuri: roleSporuriRows.value,
            role_fin_columns: roleFinColumns.value, // SALVARE COLOANE FINANCIARE ROL
            rof: adminFormData.value.department_rof,
            hr_departament: departmentHrRows.value,
        calitate_bugetara: adminFormData.value.calitate_bugetara,
        committee_members: committeeMembers.value,
          },
                    is_institution: adminFormData.value.is_institution,
          is_department: adminFormData.value.is_department,
          is_office: adminFormData.value.is_office,
          is_committee: adminFormData.value.is_committee 
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
            statut: row.statut,
            fin_columns: row.finColumns || [] // SALVARE COLOANE FINANCIARE
          }));
           const { error: hrErr } = await supabase.from('date_joburi').insert(hrInserts);
          if (hrErr) console.error('Eroare HR Edit:', hrErr.message);
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
                    metadata: { 
        tip: adminFormData.value.tip_institutie, 
        imagine: finalImageUrl,
        logo_url: finalLogoUrl, 
        news: adminFormData.value.news, 
        relatie_superioara: adminFormData.value.relatie,
        // Salvare date ROL
        cod_cor: adminFormData.value.role_cod_cor,
        baza_legala: adminFormData.value.role_baza_legala,
        reglementare: adminFormData.value.role_reglementare,
        gradatie_treapta: adminFormData.value.role_gradatie_treapta,
         role_statut: adminFormData.value.role_statut,
                     sporuri: roleSporuriRows.value,
              role_fin_columns: roleFinColumns.value, // FIX: Actualizare locală pentru Profil
                      // Salvare date DEPARTAMENT
              rof: adminFormData.value.department_rof,
              hr_departament: departmentHrRows.value,
              // Salvare date INSTITUȚIE
              calitate_bugetara: adminFormData.value.calitate_bugetara,
               committee_members: committeeMembers.value,
            }, 
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

            const getNodeClass = (node) => {
      if (node.is_department) return 'node-department';
      if (node.is_office) return 'node-office';
      if (node.is_committee) return 'node-committee';
      if (node.is_institution === false) return 'node-role';
      return getBaseClass(node);
    };

       const rootClass = getNodeClass(rootNode);
    const rootSubCount = rootNode.children ? rootNode.children.length : 0;
   nodes.push({
    id: String(rootNode.id),
    label: rootNode.nume || rootNode.node_name,
    position: { x: 0, y: 0 }, 
    class: rootClass, // Am scos fade-in is-visible de aici
    data: { subCount: rootSubCount, imagine: rootNode.metadata?.imagine || null, animDelay: '0ms' },
    style: { width: '270px', height: '60px' }
  });

    if (rootNode.children && rootNode.children.length > 0) {
    rootNode.children.forEach((child, index) => { // <-- Am adăugat "index" aici
      const childClass = getNodeClass(child);
      const childSubCount = child.children ? child.children.length : 0;
      
      nodes.push({
        id: String(child.id),
        label: child.nume || child.node_name,
        position: { x: 0, y: 150 }, 
        class: childClass, // Am scos fade-in is-visible de aici
        data: { 
          subCount: childSubCount, 
          imagine: child.metadata?.imagine || null, 
          animDelay: `${index * 50}ms` // <-- AICI E MAGIA: Întârzierea de 50ms înmulțită cu indexul
        }, 
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
  const { data: roots, error: err1 } = await supabase.from('institutii').select('id, nume');
  const { data: children, error: err2 } = await supabase.from('organograms').select('id, node_name');

  let combined = [];
  if (!err1 && roots) combined = roots.map(r => ({ id: r.id, nume: r.nume }));
  if (!err2 && children) {
    const normalizedChildren = children.map(c => ({ id: c.id, nume: c.node_name }));
    combined = [...combined, ...normalizedChildren];
  }

  // CHEIA OPTIMIZĂRII: Curățăm diacriticele O SINGURĂ DATĂ la încărcare
  allInstitutions.value = combined.map(inst => ({
    ...inst,
    nume_curat: removeDiacritics(inst.nume) // Adăugăm un câmp ascuns curățat
  }));
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

// Funcție ajutătoare care comunică cu serverul și prinde erorile de timeout
const callRobot = async (url, type, nodeName) => {
  const res = await fetch('/api/robot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, type, nodeName })
  });
  
  // Dacă Vercel dă eroare 500/502 (A server error...), prindem eroarea aici
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Serverul nu a putut procesa linkul (Posibil Timeout). Cod: ${res.status}`);
  }
  
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  
  // Curățăm și returnăm JSON-ul de la AI
  return JSON.parse(data.result.replace(/```json/g, '').replace(/```/g, '').trim());
};

const runDataRobot = async () => {
  if (!robotUrlContact.value && !robotUrlRof.value && !robotUrlHr.value && !robotUrlSalarii.value) {
    alert('Te rog introdu cel puțin un link pentru ca Robotul să poată lucra.');
    return;
  }

  isAiLoading.value = true;
  const nodeName = adminFormData.value.nume || adminFormData.value.node_name || selectedAdminNode.value?.label;
  let errorsFound = []; // Aici strângem erorile ca să le afișăm la final, dar nu oprim robotul

  try {
    // 1. Procesăm Linkul de Contact
    if (robotUrlContact.value) {
      aiStatusText.value = '🤖 [1/4] Citesc datele de contact...';
      try {
        const parsed = await callRobot(robotUrlContact.value, 'contact', nodeName);
        if (parsed.cui) adminFormData.value.cui = parsed.cui;
        if (parsed.adresa) adminFormData.value.adresa = parsed.adresa;
        if (parsed.telefon) adminFormData.value.telefon = parsed.telefon;
        if (parsed.email) adminFormData.value.email = parsed.email;
        if (parsed.website) adminFormData.value.website = parsed.website;
      } catch (err) { errorsFound.push(`Contact: ${err.message}`); }
    }

    // 2. Procesăm Linkul cu ROF-ul
    if (robotUrlRof.value) {
      aiStatusText.value = '🤖 [2/4] Citesc ROF-ul și extrag atribuțiile...';
      try {
        const parsed = await callRobot(robotUrlRof.value, 'rof', nodeName);
        if (parsed.reglementare) adminFormData.value.department_rof = parsed.reglementare;
        if (parsed.atributii) adminFormData.value.rol = parsed.atributii;
      } catch (err) { errorsFound.push(`ROF: ${err.message}`); }
    }

    // 3. Procesăm Linkul cu Statul de Funcții
    if (robotUrlHr.value) {
      aiStatusText.value = '🤖 [3/4] Citesc Statul de Funcții (HR)...';
      try {
        const parsedHr = await callRobot(robotUrlHr.value, 'hr', nodeName);
        hrRows.value.splice(0);
        parsedHr.forEach(row => {
          hrRows.value.push({
            functie: row.functie || 'N/A',
            ocupate: row.ocupate || 0,
            vacante: row.vacante || 0,
            total: row.total || (row.ocupate + row.vacante),
            statut: row.ocupate > 0 ? 'Activ' : 'Vacant',
            finColumns: []
          });
        });
      } catch (err) { errorsFound.push(`HR: ${err.message}`); }
    }

    // 4. Procesăm Linkul cu Salariile
    if (robotUrlSalarii.value) {
      aiStatusText.value = '🤖 [4/4] Citesc Centralizatorul Salarial...';
      try {
        const parsedSalarii = await callRobot(robotUrlSalarii.value, 'salarii', nodeName);
        parsedSalarii.forEach(sal => {
          const hrRow = hrRows.value.find(r => r.functie.toLowerCase().includes(sal.functie.toLowerCase()));
          if (hrRow && sal.salariu_baza) {
            hrRow.finColumns.push({
              id: 'fin_ai_' + Date.now() + '_' + Math.random(),
              name: 'Salariu de bază',
              type: 'valoare',
              value: parseFloat(sal.salariu_baza)
            });
          }
        });
      } catch (err) { errorsFound.push(`Salarii: ${err.message}`); }
    }

    // AFIȘĂM REZULTATUL FINAL
    if (errorsFound.length > 0) {
      aiStatusText.value = `⚠️ Robotul a terminat, dar ${errorsFound.length} link(uri) au dat greș. (Vezi consola)`;
      console.log("ERORI ROBOT:", errorsFound);
    } else {
      aiStatusText.value = '✅ Robotul a terminat cu succes! Verifică datele și apasă Salvează.';
    }
    
  } catch (error) {
    console.error('Eroare Generală Robot:', error);
    aiStatusText.value = '❌ Eroare critică: ' + error.message;
  } finally {
    isAiLoading.value = false;
  }
};
</script>

<template src="./dashboard-template.html"></template>

<style>
@import '@vue-flow/core/dist/style.css';
</style>

<style lang="scss" src="./dashboard-flow-style.scss"></style>

<style lang="scss" scoped src="./dashboard-style.scss"></style>