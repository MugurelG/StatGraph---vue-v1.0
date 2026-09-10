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
import { Home, Landmark, MapPin, Building, LogOut, Trash2, User, Pencil, Plus, Edit3, Move, Search, BookOpen, Moon, Sun } from 'lucide-vue-next';
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

// --- VARIABILE PENTRU PARSER AI ---
const isAiLoading = ref(false);
const aiStatusText = ref('');
const aiRawTextContact = ref(''); // Pentru Zona 2 (Contact)
const aiRawTextRof = ref('');     // Pentru Zona 2 (ROF)
const aiRawTextHr = ref('');      // Pentru Zona 3 (HR/Salarii)

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

// --- FUNCȚII PARSER AI (Momentan fals, pentru testare UI) ---
const showAiInputs = ref(false);

const runParserZone1 = async () => {
  const instName = adminFormData.value.nume || adminFormData.value.node_name || selectedAdminNode.value?.label;
  if (!instName) {
    alert('Te rog selectează sau creează mai întâi un nod cu un nume.');
    return;
  }

  isAiLoading.value = true;
  aiStatusText.value = `🤖 Întreb AI-ul despre: ${instName}...`;

  try {
    const prompt = `Ești un asistent administrativ român. Găsește informațiile oficiale pentru instituția: "${instName}". 
    Returnează RĂSPUNSUL STRICT într-un format JSON valid, fără text adițional, cu următoarele chei:
    {
      "cui": "codul fiscal numeric",
      "acronim": "acronimul oficial de 2-5 litere sau null dacă nu există",
      "calitate_bugetara": "una dintre opțiunile: Ordonator principal de credite, Ordonator secundar de credite, Ordonator terțiar de credite, Nu se aplică"
    }`;

    const response = await fetch('/api/parser', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: prompt, text: '' })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error);

    let aiResult = data.result.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsedData = JSON.parse(aiResult);

    if (parsedData.cui) adminFormData.value.cui = parsedData.cui;
    if (parsedData.acronim) adminFormData.value.acronim = parsedData.acronim;
    if (parsedData.calitate_bugetara) adminFormData.value.calitate_bugetara = parsedData.calitate_bugetara;

    aiStatusText.value = '✅ Date generale găsite și completate!';
    
  } catch (error) {
    console.error('Eroare Parser Zona 1:', error);
    aiStatusText.value = '❌ Eroare: ' + error.message;
  } finally {
    isAiLoading.value = false;
  }
};

const runParserZone2 = () => {
  showAiInputs.value = true; // Arată căsuța de paste
};

const executeZone2 = () => {
  alert('AI ar trebui să citească textul lipit: ' + aiRawTextContact.value);
};

const runParserZone3 = () => {
  alert('AI ar trebui să importe HR-ul aici (Pasul 4)');
};
</script>



<template>
  <div class="dashboard-container" :class="{ 'dark-mode': isDarkMode }">
    
    <!-- Switcher pentru vizualizări (Graph / Sunburst / Treemap) -->
    <div :class="['chart-switcher-container', { 'is-open': isSwitcherOpen }]">
      <button @click="isSwitcherOpen = !isSwitcherOpen" class="main-switcher-btn">
        👁️
      </button>

      <div v-if="isSwitcherOpen" class="chart-options-card">
        <button @click="selectView('flow')" :class="{ active: currentView === 'flow' }">Graph</button>
        <button @click="selectView('sunburst')" :class="{ active: currentView === 'sunburst' }">Sunburst</button>
        <button @click="selectView('treemap')" :class="{ active: currentView === 'treemap' }">Treemap</button>
           <button 
          v-if="currentView !== 'flow'" 
          @click="exportChartPDF" 
          class="chart-export-btn"
        >
          📥 Exportă vizualizare
        </button>
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
                   <div v-if="userRole !== 'vizitator'" class="nav-controls">
          <template v-if="navigationStack.length > 0">
            <button @click="goBack" class="back-button">
              ⬅ Înapoi
            </button>
        
            <div class="depth-indicator">
              Nivel: {{ navigationStack.length }}
            </div>
          </template>

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
           <div class="custom-node-container" :style="{ animationDelay: nodeProps.data?.animDelay }">

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
                @click.stop="handleDetailsClick(nodeProps)"
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
        <span class="label">ACASA</span>
      </div>
            <div class="menu-item" @click="toggleDarkMode">
        <Moon v-if="!isDarkMode" class="icon" />
        <Sun v-else class="icon" />
        <span class="label">{{ isDarkMode ? 'LIGHT' : 'DARK' }}</span>
      </div>
      <div class="menu-item" @click="activePanel = 'national'; localContext = false;">
        <Landmark class="icon" />
        <span class="label">NATIONAL</span>
      </div>
      <div class="menu-item" @click="activePanel = 'judet'; localContext = false;">
        <MapPin class="icon" />
        <span class="label">JUDETEAN</span>
      </div>
      <div class="menu-item" @click="openLocalMenu">
        <Building class="icon" />
        <span class="label">LOCAL</span>
      </div>

      <div class="menu-item" @click="$router.push('/educatie')">
        <BookOpen class="icon" />
        <span class="label">ACADEMIC</span>
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
 <div v-if="adminAction === 'create' || adminAction === 'edit'" class="new-admin-form">

 <!-- === PANOU ASISTENT PARSER AI === -->
      <div class="ai-parser-panel" style="background: rgba(139, 92, 246, 0.1); border: 1px solid #8b5cf6; border-radius: 12px; padding: 20px; margin-bottom: 25px;">
        <h3 style="color: #a78bfa; font-size: 1.1rem; margin: 0 0 15px 0; display: flex; align-items: center; gap: 10px;">
          🤖 Asistent Parser AI
        </h3>
        
        <div v-if="isAiLoading" style="background: #0f172a; padding: 10px; border-radius: 8px; margin-bottom: 15px; font-family: monospace; font-size: 0.85rem; color: #16a34a;">
          {{ aiStatusText || 'AI procesează...' }}
        </div>

        <div style="display: flex; gap: 15px; flex-wrap: wrap;">
          
          <!-- ZONA 1 -->
          <button @click="runParserZone1" style="flex: 1; min-width: 200px; background: #8A00C4; color: white; border: none; padding: 12px; border-radius: 8px; font-weight: 600; cursor: pointer;">
            🔎 Zona 1: Date Generale<br>
            <small style="opacity: 0.8; font-weight: normal;">CUI, Acronim, Ordonator</small>
          </button>

          <!-- ZONA 2 -->
          <button @click="runParserZone2" style="flex: 1; min-width: 200px; background: #8A00C4; color: white; border: none; padding: 12px; border-radius: 8px; font-weight: 600; cursor: pointer;">
            📂 Zona 2: Documente & Contact<br>
            <small style="opacity: 0.8; font-weight: normal;">ROF, Adresa, Atribuții</small>
          </button>

          <!-- ZONA 3 -->
          <button @click="runParserZone3" style="flex: 1; min-width: 200px; background: #8A00C4; color: white; border: none; padding: 12px; border-radius: 8px; font-weight: 600; cursor: pointer;">
            📊 Zona 3: Tabel HR & Venituri<br>
            <small style="opacity: 0.8; font-weight: normal;">Stat Funcții, Salarii</small>
          </button>

        </div>

        <!-- CĂSUȚE ASCUNSE PENTRU TEXT BRUT -->
        <div v-if="showAiInputs" style="margin-top: 20px; display: flex; flex-direction: column; gap: 15px;">
          <div>
            <label style="font-size: 0.8rem; color: #94a3b8; text-transform: uppercase; font-weight: 700;">Lipește aici textul pentru Contact / ROF / Membri:</label>
            <textarea v-model="aiRawTextContact" rows="4" style="width: 100%; background: #0f172a; border: 1px solid #475569; color: #f1f5f9; padding: 10px; border-radius: 8px; margin-top: 5px;" placeholder="Ctrl+V aici..."></textarea>
          </div>
          <button @click="executeZone2" style="background: #3b82f6; color: white; border: none; padding: 10px 15px; border-radius: 6px; cursor: pointer; font-weight: 700;">Extrage din Text</button>
        </div>

      </div>
      <!-- === SFÂRȘIT PANOU PARSER AI === -->

            <!-- SELECTOR TIP NOD (Comun pentru toate formularele) -->
        <div class="relation-admin-section" style="margin-bottom: 0; padding-bottom: 10px;">
          <label style="margin-bottom: 10px;">Tip entitate</label>
          <div style="display: flex; gap: 20px; margin-top: 5px; flex-wrap: wrap;">
            <label class="checkbox-label">
              <input type="checkbox" 
                     :checked="adminFormData.is_institution" 
                     :disabled="isSavingNode" 
                     @change="setNodeType('institution')" />
              Instituție
            </label>
            <label class="checkbox-label">
              <input type="checkbox" 
                     :checked="adminFormData.is_department" 
                     :disabled="isSavingNode" 
                     @change="setNodeType('department')" />
              Compartiment / Departament
            </label>
            <label class="checkbox-label">
              <input type="checkbox" 
                     :checked="adminFormData.is_office" 
                     :disabled="isSavingNode" 
                     @change="setNodeType('office')" />
              Birou
            </label>
            <label class="checkbox-label">
              <input type="checkbox" 
                     :checked="adminFormData.is_committee" 
                     :disabled="isSavingNode" 
                     @change="setNodeType('committee')" />
              Comisie / Consiliu
            </label>
                       <label class="checkbox-label">
              <input type="checkbox" 
                     :checked="!adminFormData.is_institution && !adminFormData.is_department && !adminFormData.is_office && !adminFormData.is_committee" 
                     :disabled="isSavingNode" 
                     @change="setNodeType('role')" />
              Rol
            </label>
          </div>
        </div>
        
              <!-- ==================== FORMULAR PENTRU INSTITUȚIE ==================== -->
      <template v-if="adminFormData.is_institution">
        <!-- SECȚIUNEA 1: DETALII (3 coloane) -->
        <div class="form-top-half">
          <div class="details-grid-3col">
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
            <div class="col-rol">
             
              <label>Descriere rol</label>
              <textarea v-model="adminFormData.rol" placeholder="ex: Coordonarea și monitorizarea activităților..." :disabled="isSavingNode"></textarea>
            </div>
          </div>
        </div>


        <!-- SECȚIUNEA: CALITATE BUGETARĂ -->
        <div class="relation-admin-section">
          <label>Calitate bugetară</label>
          <select v-model="adminFormData.calitate_bugetara" :disabled="isSavingNode" style="width: 100%; height: 42px; padding: 0 12px; border: 1.5px solid #cbd5e1; border-radius: 8px; font-size: 0.9rem; font-family: inherit; background: #ffffff; color: #0f172a; box-sizing: border-box;">
            <option value="">- Selectează -</option>
            <option value="Ordonator principal de credite">Ordonator principal de credite</option>
            <option value="Ordonator secundar de credite">Ordonator secundar de credite</option>
            <option value="Ordonator terțiar de credite">Ordonator terțiar de credite</option>
            <option value="Nu se aplică">Nu se aplică</option>
          </select>
        </div>



        <!-- SECȚIUNEA: RELAȚII INSTITUȚIONALE -->
        <div class="relation-admin-section">
          <label>Instituție superioară (opțional)</label>
          <input type="text" v-model="adminFormData.relatie" placeholder="ex: Guvernul României / Ministerul X" :disabled="isSavingNode" />
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

        <!-- Upload Logo (Doar la Editare) -->
        <div v-if="adminAction === 'edit'" class="upload-row">
          <label>Logo Instituție:</label>
          <input type="file" accept="image/*" @change="onLogoChange" :disabled="isSavingNode" />
        </div>
        <div v-if="logoPreview" class="image-preview-container">
          <img :src="logoPreview" alt="Preview Logo" class="image-preview" />
          <button class="remove-img-btn" @click="logoPreview = null; removeLogo = true" title="Șterge Logo">✕</button>
        </div>



        <!-- SECȚIUNEA: CE E NOU? -->
        <div class="news-admin-section">
          <label>Știri / Ce e nou?</label>
          <textarea v-model="adminFormData.news" placeholder="Adaugă noutăți, linkuri sau anunțuri..." rows="3" :disabled="isSavingNode"></textarea>
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
        <!-- COLOANE DINAMICE GENERATE AUTOMAT -->
        <th v-for="col in masterInstFinColumns" :key="col.id" style="min-width: 140px; font-size: 11px;">{{ col.name }}</th>
        <!-- BUTOANE FINAL -->
        <th style="width: 40px;"></th>
        <th style="width: 100px;"></th>
        <th style="width: 100px; background: #f0f9ff; color: #0284c7;">Total Rând</th>
      </tr>
    </thead>
                    <tbody>
  <tr v-for="(row, index) in hrRows" :key="index">
    <td class="td-center">{{ index + 1 }}</td>
    <td><input type="text" v-model="row.functie" placeholder="Nume post" class="clean-input" :disabled="isSavingNode" /></td>
    <td class="td-center"><input type="number" v-model.number="row.ocupate" min="0" class="clean-input input-sm" :disabled="isSavingNode" /></td>
    <td class="td-center"><input type="number" v-model.number="row.vacante" min="0" class="clean-input input-sm" :disabled="isSavingNode" /></td>
    <td class="td-center"><input type="number" :value="(row.ocupate || 0) + (row.vacante || 0)" disabled class="clean-input input-sm" /></td>
    <td><input type="text" v-model="row.statut" placeholder="Activ / Link concurs" class="clean-input" :disabled="isSavingNode" /></td>
    
    <!-- UN SINGUR BUTON + VENIT (Deschide Modal-ul) -->
    <td class="td-center td-action">
      <button @click="activeFinTableType = 'inst'; openRowDrawer = index" class="btn-add-income" :disabled="isSavingNode">
        + Venit
      </button>
    </td>

    <!-- COLOANELE DINAMICE (Componentă separată) -->
      <DynamicFinTable 
      :columns="row.finColumns" 
      :disabled="isSavingNode" 
      @remove-col="(colId) => removeFinColFromRow(index, colId)" 
    />
    
    <!-- BUTON ȘTERGE RÂND -->
    <td class="td-center td-action">
      <button class="remove-row-btn" @click="removeHrRow(index)" :disabled="isSavingNode">✕</button>
    </td>

    <!-- TOTAL CALCULAT LIVE -->
    <td class="td-total">
      {{ calculateInstRowTotal(row) }} RON
    </td>

  </tr>

  <!-- RÂNDUL GOL -->
  <tr v-if="hrRows.length === 0">
    <td :colspan="8 + masterInstFinColumns.length" style="text-align:center; color:#94a3b8; padding: 20px;">Nu au fost adăugate posturi</td>
  </tr>
</tbody>
        
        <!-- OPȚIONAL: Total General la baza tabelului -->
        <tfoot v-if="hrRows.length > 0">
          <tr>
            <td :colspan="8 + masterInstFinColumns.length" style="text-align: right; font-weight: bold; padding: 10px;">TOTAL GENERAL INSTITUȚIE:</td>
            <td style="text-align: center; font-weight: bold; font-size: 14px; color: #dc2626; background: #fef2f2;">
              {{ getInstNodeFinTotal() }} RON
            </td>
          </tr>
        </tfoot>
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
      </template>

      <!-- ==================== FORMULAR PENTRU DEPARTAMENT/BIROU ==================== -->
      <template v-else-if="adminFormData.is_department || adminFormData.is_office">
              <div class="form-top-half">
          <div class="details-grid-3col">
            <div class="col-labels">
              <label>{{ adminFormData.is_office ? 'Denumire birou' : 'Denumire departament' }} *</label>
              <label>Referință reglementare</label>
              <label>Subordonare</label>
            </div>
            <div class="col-inputs">
              <input type="text" v-model="adminFormData.nume" placeholder="ex: Compartiment Resurse Umane" :disabled="isSavingNode" />
              <input type="text" v-model="adminFormData.department_rof" placeholder="ex: ROF art. 5, alin. (2)" :disabled="isSavingNode" />
              <input type="text" v-model="adminFormData.relatie" placeholder="ex: Director General" :disabled="isSavingNode" />
            </div>
            <div class="col-rol">
              <label>Rol departament</label>
              <textarea v-model="adminFormData.rol" placeholder="Descrierea succintă a activității compartimentului..." :disabled="isSavingNode"></textarea>
            </div>
          </div>
        </div>

  <div class="form-bottom-half">
        <div class="hr-header">
          <span>Structură Resurse Umane</span>
          <button class="add-hr-btn" @click="addDepartmentHrRow" :disabled="isSavingNode">+ Adaugă Rând</button>
        </div>

                 <table class="hr-table">
            <thead>
              <tr>
                <th style="width: 60px;" class="td-center">Nr. Crt.</th>
                <th>Denumire post</th>
                <th style="width: 100px;" class="td-center">Total posturi</th>
                <th style="width: 100px;" class="td-center">Ocupate</th>
                <th style="width: 100px;" class="td-center">Vacante</th>
                <th>Observații</th>
                <!-- COLOANE DINAMICE - Am schimbat style cu clasa noua pentru latime -->
                <th v-for="col in masterDeptFinColumns" :key="col.id" class="td-dynamic-col" style="font-size: 11px; text-align: center;">{{ col.name }}</th>
                <!-- BUTOANE FINAL -->
                <th style="width: 100px;" class="td-center"></th>
                <th style="width: 50px;" class="td-center"></th>
                <th style="width: 130px; background: #f0fdf4; color: #16a34a;" class="td-center">Total Rând</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, index) in departmentHrRows" :key="'dep-hr-'+index">
                <td class="td-center">{{ index + 1 }}</td>
                <td><input type="text" v-model="row.functie" placeholder="Nume post" class="clean-input" :disabled="isSavingNode" /></td>
                <td class="td-center"><input type="number" v-model.number="row.total" min="0" class="clean-input input-sm" :disabled="isSavingNode" /></td>
                <td class="td-center"><input type="number" v-model.number="row.ocupate" min="0" class="clean-input input-sm" :disabled="isSavingNode" /></td>
                <td class="td-center"><input type="number" v-model.number="row.vacante" min="0" class="clean-input input-sm" :disabled="isSavingNode" /></td>
                <td><input type="text" v-model="row.observatii" placeholder="Detalii" class="clean-input" :disabled="isSavingNode" /></td>
                
                               <!-- COLOANELE DINAMICE (Componentă separată) -->
                <DynamicFinTable 
                  :columns="row.finColumns" 
                  :disabled="isSavingNode" 
                  @remove-col="(colId) => removeFinColFromDeptRow(index, colId)" 
                />

                <!-- BUTON ADAUGĂ VENIT (Deschide Modal-ul) -->
                <td class="td-center td-action">
                  <button @click="activeFinTableType = 'dept'; openRowDrawer = index" class="btn-add-income" :disabled="isSavingNode">
                    + Venit
                  </button>
                </td>

                <!-- BUTON ȘTERGE RÂND -->
                <td class="td-center td-action">
                  <button class="remove-row-btn" @click="removeDepartmentHrRow(index)" :disabled="isSavingNode">✕</button>
                </td>
                
                <!-- TOTAL CALCULAT LIVE -->
                <td class="td-total" style="background: #f0fdf4 !important; color: #16a34a !important;">
                  {{ calculateDeptRowTotal(row) }} RON
                </td>
              </tr>
              
              <tr v-if="departmentHrRows.length === 0">
                <td :colspan="9 + masterDeptFinColumns.length" style="text-align:center; color:#94a3b8; padding: 10px;">Nu au fost adăugate posturi</td>
              </tr>
            </tbody>
            
          <!-- TOTAL GENERAL DEPARTAMENT -->
            <tfoot v-if="departmentHrRows.length > 0">
              <tr>
                <td :colspan="8 + masterDeptFinColumns.length" style="text-align: right; font-weight: bold; padding: 10px;">TOTAL GENERAL DEPARTAMENT:</td>
                <td style="text-align: center; font-weight: bold; font-size: 14px; color: #dc2626; background: #fef2f2;">
                  {{ getDeptNodeFinTotal() }} RON
                </td>
              </tr>
            </tfoot>
          </table>
          </div>
          </template> 

                <!-- ==================== FORMULAR PENTRU COMISIE / CONSILIU ==================== -->
      <template v-else-if="adminFormData.is_committee">
        <div class="form-top-half">
          <div class="details-grid-3col">
            <div class="col-labels">
              <label>Denumire comisie *</label>
              <label>Bază legală de înființare</label>
              <label>Subordonare (Coordonare)</label>
            </div>
            <div class="col-inputs">
              <input type="text" v-model="adminFormData.nume" placeholder="ex: Comisia de Audiere" :disabled="isSavingNode" />
              <input type="text" v-model="adminFormData.department_rof" placeholder="ex: HG nr. 123/2023" :disabled="isSavingNode" />
              <input type="text" v-model="adminFormData.relatie" placeholder="ex: Președintele instituției" :disabled="isSavingNode" />
            </div>
            <div class="col-rol">
              <label>Rol / Atribuții comisie</label>
              <textarea v-model="adminFormData.rol" placeholder="Descrierea detaliată a rolului, atribuțiilor și competențelor comisiei..." style="min-height: 120px;" :disabled="isSavingNode"></textarea>
            </div>
          </div>
        </div>

        <div class="form-bottom-half">
          <div class="hr-header">
            <span>Componenta Comisiei / Consiliului</span>
            <button class="add-hr-btn" @click="addCommitteeMember" :disabled="isSavingNode">+ Adaugă Membru</button>
          </div>

          <table class="hr-table">
            <thead>
              <tr>
                <th style="width: 50px;" class="td-center">Nr. Crt.</th>
                <th>Reprezentantul</th>
                <th>Rol în comisie</th>
                <th>Funcția de bază</th>
                <th style="width: 60px;" class="td-center"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(membru, index) in committeeMembers" :key="'membru-'+index">
                <td class="td-center">{{ index + 1 }}</td>
                <td><input type="text" v-model="membru.nume" placeholder="ex: Reprezentant APG Guvern" class="clean-input" :disabled="isSavingNode" /></td>
                <td><input type="text" v-model="membru.rol_in_comisie" placeholder="ex: Președinte" class="clean-input" :disabled="isSavingNode" /></td>
                <td><input type="text" v-model="membru.functia_de_baza" placeholder="ex: Director Executiv" class="clean-input" :disabled="isSavingNode" /></td>
                <td class="td-center">
                  <button class="remove-row-btn" @click="removeCommitteeMember(index)" :disabled="isSavingNode">✕</button>
                </td>
              </tr>
              <tr v-if="committeeMembers.length === 0">
                <td colspan="5" style="text-align:center; color:#94a3b8; padding: 10px;">Nu au fost adăugați membri</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>


            <!-- ==================== FORMULAR PENTRU ROL ==================== -->
            <template v-else-if="!adminFormData.is_institution && !adminFormData.is_department && !adminFormData.is_office && !adminFormData.is_committee">
        <!-- SECȚIUNEA 1: IDENTITATE ROL (3 coloane) -->
        <div class="form-top-half">
          <div class="details-grid-3col">
            <div class="col-labels">
              <label>Denumire funcție *</label>
              <label>Cod COR</label>
              <label>Baza legală a rolului</label>
              <label>Reglementarea funcției</label>
              <label>Superior ierarhic</label>
              <label>Program audiențe</label>
            </div>
            <div class="col-inputs">
              <input type="text" v-model="adminFormData.nume" placeholder="ex: Director Executiv" :disabled="isSavingNode" />
              <input type="text" v-model="adminFormData.role_cod_cor" placeholder="ex: 111101" :disabled="isSavingNode" />
              <input type="text" v-model="adminFormData.role_baza_legala" placeholder="ex: Legea nr. X/2023" :disabled="isSavingNode" />
              <input type="text" v-model="adminFormData.role_reglementare" placeholder="ex: HG nr. Y/2022" :disabled="isSavingNode" />
              <input type="text" v-model="adminFormData.relatie" placeholder="ex: Ministrul X" :disabled="isSavingNode" />
              <input type="text" v-model="adminFormData.program" placeholder="ex: Luni 10:00-12:00" :disabled="isSavingNode" />
            </div>
             <div class="form-group" style="margin-top: 10px;">
             <label style="font-size: 0.85rem; color: #64748b; margin-bottom: 4px; display: block;">Statut Post Rol</label>
              <select v-model="adminFormData.role_statut" class="admin-input" style="width: 100%;">
                <option value="Activ">Activ (Ocupat)</option>
                <option value="Vacant">Vacant</option>
              </select>
            </div>
            <div class="col-rol">
              <label>Descrierea rolului</label>
              <textarea v-model="adminFormData.rol" placeholder="Descrierea atribuțiilor și responsabilităților funcției..." :disabled="isSavingNode"></textarea>
            </div>
          </div>
        </div>

        <!-- SECȚIUNEA 1.1: GRADAȚIE / TREAPTĂ -->
        <div class="relation-admin-section">
          <label>Gradație / Treaptă</label>
          <input type="text" v-model="adminFormData.role_gradatie_treapta" placeholder="ex: Gradația 3, Treapta I" :disabled="isSavingNode" />
        </div>

        <!-- SECȚIUNEA 2: VENITURI ROL (Design Nou) -->
        <div class="form-bottom-half">
          <div class="hr-header">
            <span>Venituri Funcție</span>
            <button @click="activeFinTableType = 'role'; openRowDrawer = 0" class="btn-add-income" :disabled="isSavingNode" style="border-color: #facc15; color: #ca8a04; background: #fefce8;">
              + Adaugă Venit
            </button>
          </div>
          
          <table class="hr-table">
            <tbody>
              <!-- Rândul principal cu veniturile -->
              <tr v-if="roleFinColumns.length > 0">
                
                               <!-- COLOANELE DINAMICE (Componentă separată) -->
                <DynamicFinTable 
                  :columns="roleFinColumns" 
                  :disabled="isSavingNode" 
                  @remove-col="removeRoleFinCol" 
                />

                <!-- TOTAL CALCULAT LIVE -->
                <td class="td-total" style="background: #fefce8 !important; color: #ca8a04 !important; min-width: 140px;">
                  {{ getRoleTotal() }} RON
                </td>
              </tr>

              <!-- Mesajul dacă nu sunt venituri -->
              <tr v-else>
                <td style="text-align:center; color:#94a3b8; padding: 20px; border: 1px dashed #e2e8f0; border-radius: 8px;">
                  Nu au fost adăugate venituri pentru acest rol.
                </td>
              </tr>
            </tbody>
            
            <!-- TOTAL GENERAL ROL -->
            <tfoot v-if="roleFinColumns.length > 0">
              <tr>
                <td :colspan="roleFinColumns.length" style="text-align: right; font-weight: bold; padding: 10px;">TOTAL ROL:</td>
                <td style="text-align: center; font-weight: bold; font-size: 14px; color: #dc2626; background: #fef2f2;">
                  {{ getRoleTotal() }} RON
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
           
      </template>

      <!-- MESAJ ȘI BUTOANE (Comune pentru ambele formulare) -->
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

     
    <!-- PANOU PROFIL INSTITUȚIONAL -->
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

            <!-- BANDA LOGO INSTITUȚIE -->
        <div v-if="selectedUserData?.metadata?.logo_url" class="profile-logo-band">
          <img :src="selectedUserData.metadata.logo_url" alt="Logo" class="logo-medalion" />
        </div>
        
        <div class="panel-body" id="user-profile-pdf-section">
          <!-- HEADER ȘI POZĂ PENTRU PDF (Ascunse pe ecran) -->
          <div id="pdf-header-section" class="pdf-header-section">
            <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 10px;">
              <img v-if="selectedUserData?.metadata?.logo_url" :src="selectedUserData.metadata.logo_url" style="width: 60px; height: 60px; object-fit: contain;" />
              <h1 style="margin: 0;">Profil Instituțional</h1>
            </div>
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

          <!-- 1.5 Calitate Bugetară -->
          <div class="profile-section" v-if="selectedUserData">
            <div class="section-title">Calitate Bugetară</div>
            <div class="c-value" style="background: #f8fafc; padding: 8px 10px; border-radius: 6px; border: 1px solid #e2e8f0;">
              {{ selectedUserData.metadata?.calitate_bugetara || 'Nu este specificată' }}
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
        <template v-for="(row, index) in userHrData" :key="'hr-popup-'+index">
          
          <!-- RÂND HEADER (Aici afișăm Numele Departamentului / Rolului) -->
          <tr v-if="row.isHeader" class="td-group-header">
            <td colspan="6" style="background: #f1f5f9; font-weight: 800; text-align: left; padding: 12px 8px; border-bottom: 2px solid #cbd5e1; color: #1e293b;">
              🏛️ {{ row.title }}
            </td>
          </tr>

          <!-- RÂND NORMAL (Posturile HR) -->
          <tr v-else>
            <td style="text-align: center;">{{ index + 1 }}</td>
            <td>{{ row.functie || '-' }}</td>
            <td style="text-align: center;">{{ row.ocupate || 0 }}</td>
            <td style="text-align: center;">{{ row.vacante || 0 }}</td>
            <td style="text-align: center;">{{ (row.ocupate || 0) + (row.vacante || 0) }}</td>
            <td style="text-align: center;">{{ row.statut || '-' }}</td>
          </tr>

        </template>
        
        <tr v-if="userHrData.length === 0">
          <td colspan="6" style="text-align:center; color:#94a3b8; padding: 10px;">Nu au fost adăugate posturi</td>
        </tr>
      </tbody>

                            
              </table>
            </div>
          </div>

                    <!-- 4.1. Venituri & Calcule Financiare -->
          <div class="profile-section" v-if="userHrData.length > 0 && userHrData.some(r => r.finColumns && r.finColumns.length > 0)">
            <div class="section-title">Venituri & Calcul Financiar</div>
            
            <div style="display: flex; flex-direction: column; gap: 12px;">
              <!-- Folosim <template> pentru v-for pentru a evita conflictul cu v-if -->
              <template v-for="(row, rowIndex) in userHrData" :key="'fin-display-'+rowIndex">
                <div v-if="row.finColumns && row.finColumns.length > 0" style="border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; background: #f8fafc;">
                  <div style="font-weight: bold; margin-bottom: 8px; color: #334155;">
                    {{ row.functie || 'Post necunoscut' }} 
                    <span style="font-weight: normal; font-size: 0.8rem; color: #64748b;">(Ocupate: {{ row.ocupate }})</span>
                  </div>
                  <div style="display: flex; flex-wrap: wrap; gap: 15px; font-size: 0.85rem;">
                    <div v-for="col in row.finColumns" :key="col.id">
                      <span style="color: #64748b;">{{ col.name }}:</span> 
                      <span v-if="col.type === 'text'" style="font-style: italic;">{{ col.value || '-' }}</span>
                      <span v-else style="font-weight: 500;">{{ col.value || 0 }}{{ col.type === 'procent' ? ' %' : ' RON' }}</span>
                    </div>
                  </div>
                  <div style="margin-top: 8px; text-align: right; font-weight: bold; color: #0284c7; border-top: 1px dashed #cbd5e1; padding-top: 5px;">
                    Total post: {{ calculateInstRowTotal(row) }} RON
                  </div>
                </div>
              </template>
            </div>

            <!-- TOTAL GENERAL INSTITUȚIE -->
            <div style="margin-top: 15px; text-align: right; font-size: 1.1rem; font-weight: bold; color: #dc2626; background: #fef2f2; padding: 10px; border-radius: 6px;">
              TOTAL CHELUIELI CU VENITURILE/INSTITUȚIE: {{ getProfileFinTotal() }} RON
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
    </transition>


       <!-- PANOU PROFIL DEPARTAMENT -->
    <transition name="slide-panel">
      <div v-if="showDepartmentPanel" class="panel-left">
        <div class="panel-header">
          <h1>Profil Departament</h1>
          <button class="panel-close-btn" @click="closeDepartmentPanel">✕</button>
        </div>
        
        <div class="panel-body" id="department-profile-pdf-section">
          <!-- 1. Identitate Departament -->
          <div class="profile-section" v-if="selectedDepartmentData">
            <div class="section-title">Identitate Departament</div>
            <div class="contact-grid">
              <span class="c-label">Denumire departament</span> <div class="c-value">{{ selectedDepartmentData.node_name || selectedDepartmentData.nume || '-' }}</div>
              <span class="c-label">Referință reglementare</span> <div class="c-value">{{ selectedDepartmentData.metadata?.rof || '-' }}</div>
              <span class="c-label">Subordonare</span> <div class="c-value">{{ selectedDepartmentData.metadata?.relatie_superioara || '-' }}</div>
            </div>
          </div>

          <!-- 2. Rol Departament -->
          <div class="profile-section" v-if="selectedDepartmentData">
            <div class="section-title">Rol Departament</div>
            <p style="font-size: 0.9rem; color: #334155; line-height: 1.6; margin: 0;">
              {{ selectedDepartmentData.rol || 'Nu există descriere disponibilă.' }}
            </p>
          </div>

          <!-- 3. Structură Resurse Umane -->
          <div class="profile-section" v-if="selectedDepartmentData">
            <div class="section-title">Structură Resurse Umane</div>
            <table class="sources-profile-table">
              <thead>
                <tr>
                  <th>Nr. Crt.</th>
                  <th>Denumire post</th>
                  <th>Total posturi</th>
                  <th>Ocupate</th>
                  <th>Vacante</th>
                  <th>Observații</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, index) in departmentProfileHrData" :key="'dep-prof-'+index">
                  <td style="text-align: center;">{{ index + 1 }}</td>
                  <td>{{ row.functie || '-' }}</td>
                  <td style="text-align: center;">{{ row.total || 0 }}</td>
                  <td style="text-align: center;">{{ row.ocupate || 0 }}</td>
                  <td style="text-align: center;">{{ row.vacante || 0 }}</td>
                  <td>{{ row.observatii || '-' }}</td>
                </tr>
                <tr v-if="departmentProfileHrData.length === 0">
                  <td colspan="6" style="text-align:center; color:#94a3b8; padding: 10px;">Nu au fost adăugate posturi</td>
                </tr>
              </tbody>
                       </table>
          </div>

          <!-- 3.1. Venituri & Calcule Financiare Departament -->
          <div class="profile-section" v-if="departmentProfileHrData.length > 0 && departmentProfileHrData.some(r => r.finColumns && r.finColumns.length > 0)">
            <div class="section-title" style="color: #16a34a;">Venituri & Calcul Financiar</div>
            
            <div style="display: flex; flex-direction: column; gap: 12px;">
              <template v-for="(row, rowIndex) in departmentProfileHrData" :key="'fin-dep-display-'+rowIndex">
                <div v-if="row.finColumns && row.finColumns.length > 0" style="border: 1px solid #bbf7d0; border-radius: 8px; padding: 10px; background: #f0fdf4;">
                  <div style="font-weight: bold; margin-bottom: 8px; color: #334155;">
                    {{ row.functie || 'Post necunoscut' }} 
                    <span style="font-weight: normal; font-size: 0.8rem; color: #64748b;">(Ocupate: {{ row.ocupate }})</span>
                  </div>
                  <div style="display: flex; flex-wrap: wrap; gap: 15px; font-size: 0.85rem;">
                    <div v-for="col in row.finColumns" :key="col.id">
                      <span style="color: #64748b;">{{ col.name }}:</span> 
                      <span v-if="col.type === 'text'" style="font-style: italic;">{{ col.value || '-' }}</span>
                      <span v-else style="font-weight: 500;">{{ col.value || 0 }}{{ col.type === 'procent' ? ' %' : ' RON' }}</span>
                    </div>
                  </div>
                  <div style="margin-top: 8px; text-align: right; font-weight: bold; color: #16a34a; border-top: 1px dashed #86efac; padding-top: 5px;">
                    Total post: {{ calculateDeptRowTotal(row) }} RON
                  </div>
                </div>
              </template>
            </div>

                       <!-- TOTAL GENERAL DEPARTAMENT -->
            <div style="margin-top: 30px; text-align: right; font-size: 1.1rem; font-weight: bold; color: #dc2626; background: #fef2f2; padding: 10px; border-radius: 6px; break-inside: avoid; page-break-inside: avoid;">
              TOTAL VENITURI DEPARTAMENT: {{ getDeptProfileFinTotal() }} RON
            </div>
          </div>

          <!-- BUTON EXPORT PDF -->
          <div class="profile-pdf-actions" style="margin-top: 20px;">
            <button class="btn-export-profile-pdf" @click="exportDepartmentPDF">Exportă Profil PDF</button>
          </div>

        </div> <!-- Închidere panel-body -->
      </div>
    </transition>


    <!-- PANOU PROFIL ROL (Apare DOAR la is_institution === false) -->
    <transition name="slide-panel">
      <div v-if="showRolePanel" class="panel-left">
            <div class="panel-header">
          <h1>Profil Rol</h1>
          <button class="panel-close-btn" @click="closeRolePanel">✕</button>
        </div>
    
        <div class="panel-body" id="role-profile-pdf-section">
          
          <!-- 1. Identitate Funcție -->
          <div class="profile-section" v-if="selectedRoleData">
            <div class="section-title">Identitate Funcție</div>
            <div class="contact-grid">
              <span class="c-label">Denumire funcție</span> <div class="c-value">{{ selectedRoleData.nume || '-' }}</div>
              <span class="c-label">Cod COR</span> <div class="c-value">{{ selectedRoleData.metadata?.cod_cor || '-' }}</div>
              <span class="c-label">Bază legală</span> <div class="c-value">{{ selectedRoleData.metadata?.baza_legala || '-' }}</div>
              <span class="c-label">Reglementare funcție</span> <div class="c-value">{{ selectedRoleData.metadata?.reglementare || '-' }}</div>
            </div>
          </div>

          <!-- 2. Descrierea Rolului -->
          <div class="profile-section" v-if="selectedRoleData">
            <div class="section-title">Descrierea Rolului</div>
            <p style="font-size: 0.9rem; color: #334155; line-height: 1.6; margin: 0;">
              {{ selectedRoleData.rol || 'Nu există descriere disponibilă.' }}
            </p>
          </div>

          <!-- 3. Subordonat Ierarhic -->
          <div class="profile-section" v-if="selectedRoleData">
            <div class="section-title">Subordonat Ierarhic</div>
            <div class="relation-box">
              <div class="relation-label">Superior ierarhic:</div>
              <div class="relation-value">{{ selectedRoleData.metadata?.relatie_superioara || 'Nu este specificat' }}</div>
            </div>
          </div>

                    <!-- 4. Gradație / Treaptă -->
          <div class="profile-section" v-if="selectedRoleData">
            <div class="section-title">Gradație / Treaptă</div>
            <div class="c-value" style="background: #f8fafc; padding: 8px 10px; border-radius: 6px; border: 1px solid #e2e8f0;">
              {{ selectedRoleData.metadata?.gradatie_treapta || '-' }}
            </div>
          </div>

               <!-- 6. Program Audiențe -->
          <div class="profile-section" v-if="selectedRoleData">
            <div class="section-title">Program Audiențe</div>
            <div class="c-value" style="background: #f8fafc; padding: 8px 10px; border-radius: 6px; border: 1px solid #e2e8f0;">
              {{ selectedRoleData.program || 'Nu este specificat' }}
            </div>
                    </div>

                  <!-- 5.1. Venituri & Calcul Financiar Rol -->
          <div class="profile-section" v-if="profileRoleFinCols.length > 0">
            <div class="section-title" style="color: #d97706;">Venituri & Calcul Financiar</div>
            
            <div style="display: flex; flex-wrap: wrap; gap: 20px; font-size: 0.95rem; margin-bottom: 15px; padding: 15px; background: #fffbeb; border-radius: 8px; border: 1px solid #fde68a;">
              <div v-for="col in profileRoleFinCols" :key="col.id">
                <span style="color: #92400e; font-weight: 500;">{{ col.name }}:</span> 
                <span v-if="col.type === 'text'" style="font-style: italic; margin-left: 5px;">{{ col.value || '-' }}</span>
                <span v-else style="font-weight: bold; margin-left: 5px;">{{ col.value || 0 }}{{ col.type === 'procent' ? ' %' : ' RON' }}</span>
              </div>
            </div>

            <!-- TOTAL VENITURI ROL -->
            <div style="text-align: right; font-size: 1.1rem; font-weight: bold; color: #dc2626; background: #fef2f2; padding: 10px; border-radius: 6px; break-inside: avoid; page-break-inside: avoid;">
              TOTAL VENITURI ROL: {{ getProfileRoleTotal() }} RON
            </div>
          </div>

          <!-- BUTON EXPORT PDF -->
          <div class="profile-pdf-actions" style="margin-top: 20px;">
            <button class="btn-export-profile-pdf" @click="exportRolePDF">Exportă Profil PDF</button>
          </div>

        </div> <!-- Închidere panel-body -->
      </div>
    </transition> 

    <!-- PANOU PROFIL COMISIE / CONSILIU -->
    <transition name="slide-panel">
      <div v-if="showCommitteePanel" class="panel-left">
        <div class="panel-header">
          <h1>Profil Comisie</h1>
          <button class="panel-close-btn" @click="closeCommitteePanel">✕</button>
        </div>
        
        <div class="panel-body" id="committee-profile-pdf-section">
          
          <!-- 1. Identitate Comisie -->
          <div class="profile-section" v-if="selectedCommitteeData">
            <div class="section-title">Identitate Comisie</div>
            <div class="contact-grid">
              <span class="c-label">Denumire comisie</span> 
              <div class="c-value">{{ selectedCommitteeData.nume || selectedCommitteeData.node_name || '-' }}</div>
              <span class="c-label">Bază legală de înființare</span> 
              <div class="c-value">{{ selectedCommitteeData.metadata?.rof || '-' }}</div>
              <span class="c-label">Subordonare (Coordonare)</span> 
              <div class="c-value">{{ selectedCommitteeData.metadata?.relatie_superioara || '-' }}</div>
            </div>
          </div>

          <!-- 2. Rol / Atribuții -->
          <div class="profile-section" v-if="selectedCommitteeData">
            <div class="section-title">Rol / Atribuții</div>
            <p style="font-size: 0.9rem; color: #334155; line-height: 1.6; margin: 0;">
              {{ selectedCommitteeData.rol || 'Nu există descriere disponibilă.' }}
            </p>
          </div>

          <!-- 3. Componenta Comisiei -->
          <div class="profile-section" v-if="selectedCommitteeData">
            <div class="section-title">Componenta Comisiei</div>
            <table class="sources-profile-table">
              <thead>
                <tr>
                  <th style="width: 60px; text-align: center;">Nr. Crt.</th>
                  <th>Reprezentantul</th>
                  <th>Rol în comisie</th>
                  <th>Funcția de bază</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(membru, index) in (selectedCommitteeData.metadata?.committee_members || [])" :key="'com-mem-'+index">
                  <td style="text-align: center;">{{ index + 1 }}</td>
                  <td>{{ membru.nume || '-' }}</td>
                  <td>{{ membru.rol_in_comisie || '-' }}</td>
                  <td>{{ membru.functia_de_baza || '-' }}</td>
                </tr>
                <tr v-if="!selectedCommitteeData.metadata?.committee_members || selectedCommitteeData.metadata.committee_members.length === 0">
                  <td colspan="4" style="text-align:center; color:#94a3b8; padding: 10px;">Nu au fost adăugați membri în comisie.</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- BUTON EXPORT PDF (Aici poți adăuga logică pentru PDF mai târziu dacă vrei) -->
          <div class="profile-pdf-actions" style="margin-top: 20px;">
           <button class="btn-export-profile-pdf" @click="exportCommitteePDF">Exportă Profil PDF</button>
          </div>
        </div>
      </div>
    </transition>
      
        <!-- POP-UP TABEL STRUCTURĂ H.R. -->
 <div 
  v-if="showHrPopup" 
  class="hr-popup-container hr-modal-container"
  :style="{ left: hrPopupPos.x + 'px', top: hrPopupPos.y + 'px', width: hrModalSize.width, height: hrModalSize.height }"
  @mousedown.stop
>
  <!-- Header pentru Drag -->
  <div class="hr-modal-header" @mousedown="startHrDrag">
    <span class="hr-popup-title">Structura H.R.</span>
    <button class="hr-popup-close" @click="closeHrPopup">✕</button>
  </div>

  <!-- ÎNCEPE ZONA DE SCROLL -->
  <div class="hr-modal-body">
    
    <!-- Tabelul cu date reale (am scos vechiul div hr-popup-body, nu mai e nevoie de el) -->
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
        <template v-for="(row, index) in userHrData" :key="'hr-popup-'+index">
          
          <!-- RÂND HEADER (Aici afișăm Numele Departamentului / Rolului) -->
          <tr v-if="row.isHeader" class="td-group-header">
            <td colspan="6" style="background: #f1f5f9; font-weight: 800; text-align: left; padding: 12px 8px; border-bottom: 2px solid #cbd5e1; color: #1e293b;">
              🏛️ {{ row.title }}
            </td>
          </tr>

          <!-- RÂND NORMAL (Posturile HR) -->
          <tr v-else>
            <td style="text-align: center;">{{ index + 1 }}</td>
            <td>{{ row.functie || '-' }}</td>
            <td style="text-align: center;">{{ row.ocupate || 0 }}</td>
            <td style="text-align: center;">{{ row.vacante || 0 }}</td>
            <td style="text-align: center;">{{ (row.ocupate || 0) + (row.vacante || 0) }}</td>
            <td style="text-align: center;">{{ row.statut || '-' }}</td>
          </tr>

        </template>
      </tbody>
    </table>

  </div> <!-- AICI SE ÎNCHIDE ZONA DE SCROLL -->

  <!-- COLȚUL DE TRAGERE PENTRU REDIMENSIONARE -->
  <div class="hr-resize-handle" @mousedown.prevent="startHrModalResize"></div>

</div> <!-- AICI SE ÎNCHIDE hr-modal-container -->
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

<!-- MODAL POP-UP PENTRU ADAUGARE VENIT -->
<div v-if="openRowDrawer !== null" class="modal-overlay" @click.self="openRowDrawer = null">
  <div class="modal-content">
    <div class="modal-header">
      <h3>Adaugă Coloană Venit</h3>
      <button class="modal-close-btn" @click="openRowDrawer = null">✕</button>
    </div>
    
    <div class="modal-body">
      <label class="modal-label">Denumirea venitului</label>
      <input type="text" v-model="newColName" placeholder="ex: Salariu de bază, Spor toxicitate..." class="clean-input modal-input" autofocus />

      <label class="modal-label" style="margin-top: 20px;">Tip de calcul</label>
      <div class="modal-type-group">
        <button 
          @click="newColType = 'valoare'" 
          :class="['modal-type-btn', { active: newColType === 'valoare' }]">
          💰 Valoare (Lei)
        </button>
        <button 
          @click="newColType = 'procent'" 
          :class="['modal-type-btn', { active: newColType === 'procent' }]">
          📊 Procent (%)
        </button>
        <button 
          @click="newColType = 'text'" 
          :class="['modal-type-btn', { active: newColType === 'text' }]">
          📝 Text (Info)
        </button>
      </div>

      <div v-if="newColType !== 'text'" style="margin-top: 20px;">
        <label class="modal-label">Valoare implicită (opțional)</label>
        <input type="number" v-model.number="newColValue" placeholder="0" class="clean-input modal-input" />
      </div>
      <div v-else style="margin-top: 20px;">
        <label class="modal-label">Text informativ (opțional)</label>
        <textarea v-model="newColValue" placeholder="Scrie detaliile aici..." class="clean-input modal-input" rows="3"></textarea>
      </div>
    </div>

    <div class="modal-footer">
      <button class="btn-cancel-modal" @click="openRowDrawer = null">Anulează</button>
      <button class="btn-confirm-modal" @click="handleFinColAdd">Adaugă în tabel</button>
      </div>
  </div>
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
  opacity: 0; /* Start invizibil */
  animation: nodeCascade 0.4s ease-out forwards; /* Animație care se termină vizibil */
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

.node-role .custom-node-container {
  background: linear-gradient(145deg, #fef9e7, #fdf1b8) !important;
  border-radius: 25px !important;
  border-color: #f5d060 !important;
  box-shadow: 
    4px 4px 8px rgba(0, 0, 0, 0.15), 
    -2px -2px 6px rgba(255, 255, 255, 0.5), 
    inset -2px -2px 4px rgba(0, 0, 0, 0.05),  
    inset 2px 2px 4px rgba(255, 255, 255, 0.7) !important; 
  
  .node-label { 
    color: #FF3F34 !important; 
    text-shadow: none !important; 
    font-size: 0.8rem !important; 
  }
}

.node-department .custom-node-container {
  background: linear-gradient(145deg, #8A00C4, #8A00C4) !important;
  border-radius: 25px !important;
  border-color: #5A0078 !important;
  box-shadow: 
    4px 4px 8px rgba(0, 0, 0, 0.15), 
    -2px -2px 6px rgba(255, 255, 255, 0.5), 
    inset -2px -2px 4px rgba(0, 0, 0, 0.05),  
    inset 2px 2px 4px rgba(255, 255, 255, 0.7) !important; 

  .node-label { 
    color: #3AC400 !important; 
    text-shadow: none !important; 
    font-size: 0.8rem !important; 
  }
}

.node-office .custom-node-container {
  background: linear-gradient(145deg, #008000, #006600) !important;
  border-radius: 25px !important;
  border-color: #004d00 !important;
  box-shadow: 
    4px 4px 8px rgba(0, 0, 0, 0.15), 
    -2px -2px 6px rgba(255, 255, 255, 0.5), 
    inset -2px -2px 4px rgba(0, 0, 0, 0.05),  
    inset 2px 2px 4px rgba(255, 255, 255, 0.7) !important; 

  .node-label { 
    color: #ffffff !important; 
    text-shadow: 1px 1px 2px rgba(0,0,0,0.3) !important; 
    font-size: 0.8rem !important; 
  }
}

.node-committee .custom-node-container {
  background: linear-gradient(145deg, #7FFFD4, #66DDAA) !important;
  border-radius: 25px !important;
  border-color: #4DCC99 !important;
  box-shadow: 
    4px 4px 8px rgba(0, 0, 0, 0.15), 
    -2px -2px 6px rgba(255, 255, 255, 0.5), 
    inset -2px -2px 4px rgba(0, 0, 0, 0.05),  
    inset 2px 2px 4px rgba(255, 255, 255, 0.7) !important; 

  .node-label { 
    color: #004d40 !important; /* Text închis pentru contrast maxim */
    text-shadow: none !important; 
    font-size: 0.8rem !important; 
  }
}
/* ANIMAȚIE CASCADĂ NOUĂ */
@keyframes nodeCascade {
  0% {
    opacity: 0;
    transform: translateY(-20px) scale(0.85);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

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

.checkbox-label input[type="checkbox"] {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.profile-logo-band {
  display: flex;
  align-items: center;
  padding: 0 20px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  margin-top: -30px; /* AICI TRAGEM BANDA ÎN SUS spre text */
  padding-bottom: 10px; /* Lăsăm totuși un mic spațiu jos */
}

.logo-medalion {
  width: 55px;
  height: 55px;
  border-radius: 50%;
  object-fit: contain;
  background: white;
  border: 2px solid #e2e8f0;
  padding: 4px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
  flex-shrink: 0;
}

/* --- ESTETICA NOUĂ PENTRU FORMULAR --- */

/* Resetare generală inputuri */
.clean-input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 13px;
  transition: border-color 0.2s, box-shadow 0.2s;
  background: white;
  box-sizing: border-box;
}
.clean-input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}
.clean-input:disabled {
  background: #f8fafc;
  color: #64748b;
}
.input-sm { max-width: 60px; text-align: center; }

/* Styling pentru Select */
.clean-select {
  padding: 6px 8px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 11px;
  background: white;
  cursor: pointer;
  flex: 1;
}
.clean-select:focus { outline: 1px solid #3b82f6; }

/* Stilizare celule tabel */
.td-center { text-align: center; vertical-align: middle; }
.td-action { width: 90px; }
.td-total { 
  width: 120px; 
  font-weight: bold; 
  font-size: 13px; 
  background: #f0f9ff; 
  color: #0284c7; 
  text-align: center;
}

/* Buton + Venit principal */
.btn-add-income {
  background: #eff6ff;
  color: #2563eb;
  border: 1px dashed #93c5fd;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-add-income:hover {
  background: #dbeafe;
  border-color: #3b82f6;
}

/* Coltul dinamic (Redesign) */
.td-dynamic-col {
  background: #fafafa;
  padding: 8px !important;
  min-width: 220px; /* Lărgit considerabil */
  vertical-align: top;
}
.dynamic-col-wrapper {
  display: flex;
  flex-direction: column;
  gap: 6px; /* Spațiu aerisit între elemente */
}
.col-name-input {
  font-size: 11px !important;
  font-weight: 600;
  color: #334155;
  background: #f1f5f9 !important;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.col-value-input {
  font-size: 14px !important; /* Valoarea mare și clară */
  font-weight: 500;
  padding: 10px !important;
}
.col-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  border-top: 1px solid #e2e8f0;
  padding-top: 6px;
}
.btn-delete-col {
  background: #fef2f2;
  color: #ef4444;
  border: none;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: 0.2s;
}
.btn-delete-col:hover { background: #fee2e2; }
.remove-row-btn {
  background: #f1f5f9;
  color: #ef4444;
  border: 1px solid #e2e8f0;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
}


/* --- ESTETICA NOUĂ PENTRU FORMULAR (BULLETPROOF) --- */

/* Forțăm inputurile din tabel să arate nou */
.hr-table .clean-input {
  width: 100% !important;
  padding: 8px 10px !important;
  border: 1px solid #e2e8f0 !important;
  border-radius: 6px !important;
  font-size: 13px !important;
  transition: border-color 0.2s, box-shadow 0.2s !important;
  background: white !important;
  box-sizing: border-box !important;
  height: auto !important;
  line-height: normal !important;
}
.hr-table .clean-input:focus {
  outline: none !important;
  border-color: #3b82f6 !important;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1) !important;
}
.hr-table .clean-input:disabled {
  background: #f8fafc !important;
  color: #64748b !important;
}
.hr-table .input-sm { max-width: 70px !important; text-align: center !important; }

/* Forțăm Select-ul */
.hr-table .clean-select {
  padding: 6px 8px !important;
  border: 1px solid #e2e8f0 !important;
  border-radius: 6px !important;
  font-size: 11px !important;
  background: white !important;
  cursor: pointer !important;
  flex: 1 !important;
  height: auto !important;
  width: 100% !important;
}
.hr-table .clean-select:focus { outline: 1px solid #3b82f6 !important; }

/* Stilizare celule tabel */
.hr-table .td-center { text-align: center !important; vertical-align: middle !important; }
.hr-table .td-action { width: 100px !important; }
.hr-table .td-total { 
  width: 130px !important; 
  font-weight: bold !important; 
  font-size: 13px !important; 
  background: #f0f9ff !important; 
  color: #0284c7 !important; 
  text-align: center !important;
  padding: 10px !important;
}

/* Buton + Venit principal */
.hr-table .btn-add-income {
  background: #eff6ff !important;
  color: #2563eb !important;
  border: 1px dashed #93c5fd !important;
  padding: 8px 14px !important;
  border-radius: 6px !important;
  font-size: 12px !important;
  font-weight: 600 !important;
  cursor: pointer !important;
  transition: all 0.2s !important;
  display: inline-block !important;
}
.hr-table .btn-add-income:hover {
  background: #dbeafe !important;
  border-color: #3b82f6 !important;
}

/* Coltul dinamic (Redesign) */
.hr-table .td-dynamic-col {
  background: #fafafa !important;
  padding: 10px !important;
  min-width: 220px !important; /* Lărgit considerabil */
  vertical-align: top !important;
}
.hr-table .dynamic-col-wrapper {
  display: flex !important;
  flex-direction: column !important;
  gap: 8px !important; /* Spațiu aerisit între elemente */
}
.hr-table .col-name-input {
  font-size: 11px !important;
  font-weight: 600 !important;
  color: #334155 !important;
  background: #f1f5f9 !important;
  text-transform: uppercase !important;
  letter-spacing: 0.5px !important;
}
.hr-table .col-value-input {
  font-size: 14px !important; /* Valoarea mare și clară */
  font-weight: 500 !important;
  padding: 10px !important;
}
.hr-table .col-toolbar {
  display: flex !important;
  align-items: center !important;
  gap: 8px !important;
  border-top: 1px solid #e2e8f0 !important;
  padding-top: 8px !important;
  margin-top: 4px !important;
}
.hr-table .btn-delete-col {
  background: #fef2f2 !important;
  color: #ef4444 !important;
  border: none !important;
  width: 28px !important;
  height: 28px !important;
  border-radius: 6px !important;
  font-size: 14px !important;
  cursor: pointer !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  transition: 0.2s !important;
  flex-shrink: 0 !important;
}
.hr-table .btn-delete-col:hover { background: #fee2e2 !important; }

.hr-table .remove-row-btn {
  background: #f1f5f9 !important;
  color: #ef4444 !important;
  border: 1px solid #e2e8f0 !important;
  width: 32px !important;
  height: 32px !important;
  border-radius: 6px !important;
  font-size: 16px !important;
  cursor: pointer !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
}


/* --- ESTETICA MODAL POP-UP (BULLETPROOF) --- */
.modal-overlay {
  position: fixed !important;
  top: 0 !important; left: 0 !important; right: 0 !important; bottom: 0 !important;
  background: rgba(15, 23, 42, 0.6) !important;
  backdrop-filter: blur(4px) !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  z-index: 99999 !important; /* Prioritate maximă să fie peste tot */
}
.modal-content {
  background: white !important;
  border-radius: 16px !important;
  width: 90% !important;
  max-width: 500px !important;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25) !important;
  animation: modalFadeIn 0.2s ease-out !important;
}
@keyframes modalFadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }

.modal-header {
  display: flex !important;
  justify-content: space-between !important;
  align-items: center !important;
  padding: 24px 24px 0 !important;
  border-bottom: 1px solid #f1f5f9 !important;
  padding-bottom: 16px !important;
}
.modal-header h3 { margin: 0 !important; font-size: 18px !important; color: #0f172a !important; font-weight: 700 !important; }
.modal-close-btn {
  background: none !important; border: none !important; font-size: 24px !important; color: #94a3b8 !important; cursor: pointer !important;
}
.modal-close-btn:hover { color: #ef4444 !important; }

.modal-body { padding: 24px !important; }
.modal-label { display: block !important; font-size: 13px !important; font-weight: 600 !important; color: #475569 !important; margin-bottom: 8px !important; }
.modal-input { font-size: 15px !important; padding: 12px !important; }

.modal-type-group {
  display: flex !important;
  gap: 10px !important;
}
.modal-type-btn {
  flex: 1 !important;
  padding: 14px 10px !important;
  border: 2px solid #e2e8f0 !important;
  border-radius: 10px !important;
  background: white !important;
  font-size: 13px !important;
  font-weight: 500 !important;
  color: #64748b !important;
  cursor: pointer !important;
  transition: 0.2s !important;
  text-align: center !important;
}
.modal-type-btn:hover { border-color: #93c5fd !important; color: #3b82f6 !important; }
.modal-type-btn.active {
  border-color: #3b82f6 !important;
  background: #eff6ff !important;
  color: #2563eb !important;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15) !important;
}

.modal-footer {
  display: flex !important;
  justify-content: flex-end !important;
  gap: 12px !important;
  padding: 0 24px 24px !important;
}
.btn-cancel-modal {
  padding: 12px 20px !important;
  border-radius: 8px !important;
  border: 1px solid #e2e8f0 !important;
  background: white !important;
  color: #475569 !important;
  font-weight: 500 !important;
  cursor: pointer !important;
  font-size: 14px !important;
}
.btn-confirm-modal {
  padding: 12px 24px !important;
  border-radius: 8px !important;
  border: none !important;
  background: #3b82f6 !important;
  color: white !important;
  font-weight: 600 !important;
  cursor: pointer !important;
  box-shadow: 0 4px 6px -1px rgba(59, 130, 246, 0.3) !important;
  font-size: 14px !important;
}
.btn-confirm-modal:hover { background: #2563eb !important; }

/* Containerul principal al modalului */
.hr-modal-container {
  /* Am scos position: fixed și z-index pentru că le are deja în hr-popup-container */
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Antetul - nu se micșorează și nu intră în scroll */
.hr-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  border-bottom: 1px solid #e2e8f0;
  background-color: #f8fafc;
  flex-shrink: 0; /* FOARTE IMPORTANT: Fixează antetul */
  border-radius: 12px 12px 0 0;
}

.hr-modal-header h3 {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 600;
  color: #1e293b;
}

.close-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: #64748b;
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
}

.close-btn:hover {
  background-color: #f1f5f9;
  color: #0f172a;
}

/* Body-ul - ocupă tot spațiul rămas și face scroll */
.hr-modal-body {
  flex-grow: 1; /* FOARTE IMPORTANT: Umple spațiul rămas */
  overflow-y: auto; /* Activează scrollul vertical */
  padding: 24px;
}

/* Estetică pentru scrollbar (opțional, pentru a arăta mai modern) */
.hr-modal-body::-webkit-scrollbar {
  width: 8px;
}
.hr-modal-body::-webkit-scrollbar-track {
  background: #f1f5f9;
}
.hr-modal-body::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 4px;
}
.hr-modal-body::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}

/* Punctul de tragere (Resize Handle) din colț */
.hr-resize-handle {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 24px;
  height: 24px;
  cursor: nwse-resize; /* Cursorul clasic de redimensionare */
  background: transparent;
  z-index: 10;
}

/* Efect vizual opțional în colț pentru a indica că se poate trage */
.hr-resize-handle::after {
  content: '';
  position: absolute;
  bottom: 4px;
  right: 4px;
  width: 10px;
  height: 10px;
  border-right: 2px solid #94a3b8;
  border-bottom: 2px solid #94a3b8;
  border-radius: 0 0 3px 0;
  opacity: 0.5;
  transition: opacity 0.2s;
}

.hr-resize-handle:hover::after {
  opacity: 1;
  border-color: #334155;
}

/* --- STILURI PENTRU NOILE NODURI (FORȚAT) --- */

/* Nod BIROU */
.node-office {
  background: linear-gradient(135deg, #fbbf24, #f59e0b) !important;
  border: 2px solid #d97706 !important;
  box-shadow: 0 4px 6px rgba(245, 158, 11, 0.2) !important;
}
.node-office * {
  color: #1e293b !important; /* Forțează textul întunecat */
  fill: #1e293b !important; /* Pentru iconițele SVG dacă au */
}

/* Nod COMISIE / CONSILIU */
.node-committee {
  background: linear-gradient(135deg, #f472b6, #ec4899) !important;
  border: 2px solid #db2777 !important;
  box-shadow: 0 4px 6px rgba(236, 72, 153, 0.2) !important;
}
.node-committee * {
  color: #ffffff !important; /* Forțează textul alb */
  fill: #ffffff !important; 
}

.td-group-header {
  background: #f1f5f9 !important;
  border-bottom: 2px solid #cbd5e1 !important;
  font-weight: 800;
  padding: 12px 15px !important;
  color: #1e293b;
  font-size: 0.95rem;
  text-align: left;
}

/* =========================================
   DARK MODE (Temă Nocturnă Premium)
   ========================================= */
.dashboard-container.dark-mode {
  background-color: #0f172a;
  color: #e2e8f0;

  /* Fundal Canvas Graf */
  .vue-flow, .main-content { background-color: #0f172a !important; }

  /* Meniuri Dreapta & Secundare (Glassmorphism Dark) */
  .right-menu {
    background: rgba(15, 23, 42, 0.85);
    border-left-color: rgba(51, 65, 85, 0.5);
    .menu-item .icon { stroke: #94a3b8; }
    .menu-item .label { color: #94a3b8; }
    .menu-item:hover { background: rgba(51, 65, 85, 0.5); }
    .menu-item:hover .icon { stroke: #60a5fa; }
    .menu-item:hover .label { color: #60a5fa; }
  }
  .secondary-menu {
    background: #1e293b;
    border-left-color: #334155;
    .panel-title { color: #f1f5f9; }
  }

  /* Panouri Laterale & Pop-up-uri (Profile, Search, HR, Admin) */
  .panel-left, .search-side-panel, .admin-tools-panel, .hr-popup-container, .modal-content {
    background: rgba(30, 41, 59, 0.95) !important; 
    border-color: #334155 !important;
    color: #e2e8f0;
    box-shadow: 0 15px 40px rgba(0,0,0,0.5) !important;
    h1, h2, h3, .panel-header h3, .hr-popup-title { color: #f1f5f9 !important; }
  }
  .admin-panel-header, .hr-modal-header {
    background: #0f172a !important;
    border-bottom-color: #334155 !important;
  }

  /* Carduri din Profil (Metrici, Contact) */
  .profile-section, .metric-card, .contact-grid .c-value, .relation-box, .c-label {
    background: #1e293b !important;
    border-color: #334155 !important;
    color: #e2e8f0 !important;
  }
  .section-title { color: #94a3b8 !important; border-bottom-color: #334155 !important; }

  /* Formulare, Inputuri & Textareas */
  input, textarea, select, .clean-input, .clean-select {
    background: #0f172a !important;
    color: #f1f5f9 !important;
    border-color: #475569 !important;
    &::placeholder { color: #64748b !important; }
    &:focus { border-color: #3b82f6 !important; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2) !important; }
    &:disabled { background: #1e293b !important; color: #64748b !important; }
  }

  /* Tabele (HR, Surse, Membri Comisie) */
  table.hr-table, table.sources-profile-table, .hr-popup-table, .hr-pdf-table {
    th { 
      background: #0f172a !important; 
      color: #cbd5e1 !important; 
      border-color: #334155 !important; 
    }
    td { 
      background: #1e293b !important; 
      color: #e2e8f0 !important; 
      border-color: #334155 !important; 
    }
    tbody tr:nth-child(even) { background-color: #24344d !important; }
  }

  /* Controale Navigare & Căutare */
  .nav-controls { background: rgba(30, 41, 59, 0.95) !important; border-color: #334155 !important; }
  .back-button { background: #334155; color: white; &:hover { background: #475569; } }
  .depth-indicator { background: #1e293b; color: #e2e8f0; border-color: #334155; }
  .role-indicator { background: rgba(30, 41, 59, 0.95); color: #f87171; border-color: rgba(248, 113, 113, 0.3); }
  
  .search-wrapper.is-open { background: rgba(15, 23, 42, 0.95) !important; border-color: #334155 !important; }
  .search-dropdown { background: rgba(15, 23, 42, 0.95) !important; border-color: #334155 !important; }
  .dropdown-item { color: #e2e8f0; &:hover { background: #1e293b; } }

  /* Scrollbar curat pe intunecat */
  ::-webkit-scrollbar { width: 8px; height: 8px; }
  ::-webkit-scrollbar-track { background: #0f172a; }
  ::-webkit-scrollbar-thumb { background: #334155; border-radius: 4px; }
  ::-webkit-scrollbar-thumb:hover { background: #475569; }
}
</style>