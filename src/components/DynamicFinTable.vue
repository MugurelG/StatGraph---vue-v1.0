<template>
  <!-- Componenta se ocupă exclusiv de randarea coloanelor financiare dinamică -->
  <td v-for="col in columns" :key="col.id" class="td-dynamic-col">
    <div class="dynamic-col-wrapper">
      <!-- Numele coloanei -->
      <input type="text" v-model="col.name" placeholder="Nume venit" class="clean-input col-name-input" :disabled="disabled" />
      
      <!-- Valoarea -->
      <input v-if="col.type === 'text'" type="text" v-model="col.value" placeholder="Detalii..." class="clean-input col-value-input" :disabled="disabled" />
      <input v-else type="number" v-model.number="col.value" placeholder="0" class="clean-input col-value-input" :disabled="disabled" />
      
      <!-- Toolbar: Tip calcul + Buton Șterge -->
      <div class="col-toolbar">
        <select v-model="col.type" class="clean-select" :disabled="disabled">
          <option value="valoare">Valoare (Lei)</option>
          <option value="procent">Procent (%)</option>
          <option value="text">Text</option>
        </select>
        <button @click="$emit('removeCol', col.id)" class="btn-delete-col" :disabled="disabled" title="Șterge coloana">
          ✕
        </button>
      </div>
    </div>
  </td>
</template>

<script setup>
defineProps({
  columns: {
    type: Array,
    default: () => []
  },
  disabled: {
    type: Boolean,
    default: false
  }
});

// Emitem evenimentul de ștergere către părinte (Dashboard.vue)
defineEmits(['removeCol']);
</script>

<style scoped>
/* Mutăm aici CSS-ul specific pentru aceste coloane, eliminând necesitatea !important-urilor */
.td-dynamic-col {
  background: #fafafa;
  padding: 10px;
  min-width: 220px;
  vertical-align: top;
}

.dynamic-col-wrapper {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.clean-input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 13px;
  transition: border-color 0.2s, box-shadow 0.2s;
  background: white;
  box-sizing: border-box;
  outline: none;
}
.clean-input:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}
.clean-input:disabled {
  background: #f8fafc;
  color: #64748b;
  cursor: not-allowed;
}

.col-name-input {
  font-size: 11px;
  font-weight: 600;
  color: #334155;
  background: #f1f5f9;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.col-value-input {
  font-size: 14px;
  font-weight: 500;
  padding: 10px;
}

.col-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  border-top: 1px solid #e2e8f0;
  padding-top: 8px;
  margin-top: 4px;
}

.clean-select {
  padding: 6px 8px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 11px;
  background: white;
  cursor: pointer;
  flex: 1;
  outline: none;
}
.clean-select:focus {
  border-color: #3b82f6;
}

.btn-delete-col {
  background: #fef2f2;
  color: #ef4444;
  border: none;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: 0.2s;
  flex-shrink: 0;
}
.btn-delete-col:hover {
  background: #fee2e2;
}
.btn-delete-col:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>