<template>
  <div ref="chartRef" class="chart-box"></div>
</template>

<script setup>
import { ref, onMounted, watch, nextTick } from 'vue';
import * as d3 from 'd3';

const props = defineProps({
  data: Object,
  rootColor: {
    type: String,
    default: '#3498db'
  }
});

const chartRef = ref(null);

const getColor = (d) => {
  if (d.depth === 0) return props.rootColor;
  const secondaryColors = ["#f1c40f", "#27ae60", "#95a5a6"];
  return secondaryColors[Math.min(d.depth - 1, secondaryColors.length - 1)];
};

const renderChart = async () => {
  if (!props.data || !chartRef.value) return;
  await nextTick();
  const el = chartRef.value;
  d3.select(el).selectAll("*").remove();

  const root = d3.hierarchy(JSON.parse(JSON.stringify(props.data)));
  const treeLayout = d3.tree().nodeSize([160, 100]);
  treeLayout(root);

  const svg = d3.select(el).append("svg")
    .attr("viewBox", "-600 -50 1200 800")
    .style("width", "100%")
    .style("height", "100%");

  // === ADAUGARE 3D: Definiții filtre pentru umbre volumetrice ===
  const defs = svg.append("defs");
  
  // Umbră de repaus (subtilă, dă senzația că nodul plutește deasupra paginii)
  const filter = defs.append("filter")
    .attr("id", "shadow-3d")
    .attr("x", "-20%").attr("y", "-20%")
    .attr("width", "140%").attr("height", "140%");
  filter.append("feDropShadow")
    .attr("dx", "3").attr("dy", "5")
    .attr("stdDeviation", "4")
    .attr("flood-color", "rgba(0,0,0,0.35)");

  // Umbră la Hover (mult mai adâncă, dă senzația că nodul "iese" în evidență)
  const filterHover = defs.append("filter")
    .attr("id", "shadow-3d-hover")
    .attr("x", "-20%").attr("y", "-20%")
    .attr("width", "140%").attr("height", "140%");
  filterHover.append("feDropShadow")
    .attr("dx", "6").attr("dy", "10")
    .attr("stdDeviation", "8")
    .attr("flood-color", "rgba(0,0,0,0.5)");
  // === SFÂRȘIT ADAUGARE 3D ===

  const g = svg.append("g");
  svg.call(d3.zoom().scaleExtent([0.2, 3]).on("zoom", (e) => g.attr("transform", e.transform)));

  // Linile de legătură (îmbunătățite estetic: mai închise și semi-transparente)
  g.selectAll(".link")
    .data(root.links())
    .join("path")
    .attr("fill", "none")
    .attr("stroke", "#2d3748") 
    .attr("stroke-width", 2.5)
    .attr("stroke-opacity", 0.4) 
    .attr("d", d3.linkVertical().x(d => d.x).y(d => d.y));

  const nodes = g.selectAll(".node")
    .data(root.descendants())
    .join("g")
    .attr("transform", d => `translate(${d.x},${d.y})`)
    .style("cursor", "pointer")
    // Aplicăm umbra 3D inițială pe grup
    .attr("filter", "url(#shadow-3d)") 
    .on("mouseover", function(event, d) {
      d3.select(this).raise(); // Aduce elementul în față
      
      // Animație hover: mută ușor elementul + schimbă umbra
      d3.select(this).transition().duration(200)
        .attr("transform", `translate(${d.x},${d.y}) scale(1.5)`)
        .attr("filter", "url(#shadow-3d-hover)");
        
      // Modificăm conturul și iluminarea rect-ului
      d3.select(this).select("rect")
        .style("stroke-width", "3px")
        .attr("fill", d3.color(getColor(d)).brighter(0.6)); // Luminăm culoarea
    })
    .on("mouseout", function(event, d) {
      // Revenire la starea inițială
      d3.select(this).transition().duration(200)
        .attr("transform", `translate(${d.x},${d.y}) scale(1)`)
        .attr("filter", "url(#shadow-3d)");
        
      d3.select(this).select("rect")
        .style("stroke-width", "2px")
        .attr("fill", getColor(d)); // Revenim la culoarea de bază
    });

  // Dreptunghiurile nodurilor (Îmbunătățite 3D: colțuri rotunjite, contur muchie întunecată)
  nodes.append("rect")
    .attr("width", 140).attr("height", 45)
    .attr("x", -70).attr("y", -22)
    .attr("rx", 8) // Colțuri mai rotunjite pentru efect de "capsulă"
    .attr("fill", d => getColor(d))
    .style("stroke", d => d3.color(getColor(d)).darker(1.5)) // Muchie 3D întunecată
    .style("stroke-width", "2px"); // Muchie mai groasă

  // Textul (Îmbunătățit 3D: contur subtil pentru lizibilitate pe gradient/umbre)
  nodes.append("text")
    .attr("text-anchor", "middle")
    .style("font-size", "10px")
    .style("font-weight", "bold")
    .style("fill", "#fff")
    .style("pointer-events", "none")
    .style("paint-order", "stroke") // Face ca conturul să nu acopere literele
    .style("stroke", "#0000004d")   // Contur semi-transparent negru
    .style("stroke-width", "2px")   // Lățime contur
    .each(function(d) {
      const text = d3.select(this);
      const name = d.data.name;
      const words = name.split(/\s+/);
      
      // Logica: împărțim în două grupe aproximativ egale ca număr de cuvinte
      const mid = Math.ceil(words.length / 2);
      const line1 = words.slice(0, mid).join(" ");
      const line2 = words.slice(mid).join(" ");
      
      [line1, line2].forEach((line, i) => {
        if (line) {
          text.append("tspan")
            .attr("x", 0)
            .attr("dy", i === 0 ? "-0.5em" : "1.1em")
            .text(line);
        }
      });
    });
}; // Acolada care închide renderChart()

onMounted(renderChart);
watch(() => [props.data, props.rootColor], renderChart, { deep: true });
</script>

<style scoped>
/* Fundal modificat: un gri-albăstrui deschis, care lasă umbrele 3D să iasă în evidență */
.chart-box { 
  width: 100%; 
  height: 100%; 
  min-height: 600px; 
  overflow: hidden; 
  background: #edf2f7; 
  border-radius: 12px;
}
</style>