<template>
  <div ref="chartRef" class="chart-box"></div>
</template>

<script setup>
import { ref, onMounted, watch, nextTick } from 'vue';
import * as d3 from 'd3';

const props = defineProps(['data']);
const chartRef = ref(null);

const renderChart = async () => {
  if (!props.data || !chartRef.value) return;
  await nextTick();
  const el = chartRef.value;
  d3.select(el).selectAll("*").remove();

  const raw = JSON.parse(JSON.stringify(props.data));
  const root = d3.hierarchy(raw).count();
  d3.partition().size([2 * Math.PI, 250])(root);

  const svg = d3.select(el).append("svg")
    .attr("viewBox", "-250 -250 500 500")
    .style("width", "100%")
    .style("height", "100%");

  // === ADAUGARE 3D: Definim filtrele de umbre pentru volum ===
  const defs = svg.append("defs");
  
  // Umbră normală (stare de repaus)
  const filter = defs.append("filter")
    .attr("id", "shadow-3d")
    .attr("x", "-20%").attr("y", "-20%")
    .attr("width", "140%").attr("height", "140%");
  filter.append("feDropShadow")
    .attr("dx", "2").attr("dy", "4")
    .attr("stdDeviation", "3")
    .attr("flood-color", "rgba(0,0,0,0.5)");

  // Umbră mai puternică (la hover - senzația de "ridicare")
  const filterHover = defs.append("filter")
    .attr("id", "shadow-3d-hover")
    .attr("x", "-20%").attr("y", "-20%")
    .attr("width", "140%").attr("height", "140%");
  filterHover.append("feDropShadow")
    .attr("dx", "4").attr("dy", "8")
    .attr("stdDeviation", "5")
    .attr("flood-color", "rgba(0,0,0,0.7)");
  // === SFÂRȘIT ADAUGARE 3D ===

  const g = svg.append("g");
  svg.call(d3.zoom().scaleExtent([0.5, 5]).on("zoom", (e) => g.attr("transform", e.transform)));

  const colors = ["#3366cc", "#dc3912", "#ff9900", "#109618", "#990099", "#0099c6", "#dd4477", "#66aa00", "#b82e2e", "#316395"];

  root.descendants().forEach(d => {
    const arcGen = d3.arc();
    const data = { 
      startAngle: d.x0, 
      endAngle: d.x1, 
      innerRadius: d.depth === 0 ? 0 : d.y0, 
      outerRadius: d.y1 
    };

    // Nodul principal ca grup (g)
    // === ADAUGARE 3D: Aplicăm filtrul de umbră pe grup ===
    const node = g.append("g")
      .style("cursor", "pointer")
      .attr("filter", "url(#shadow-3d)"); 
    
    // Calculăm culoarea de bază pentru a o folosi la margini și hover
    const baseColor = d.depth === 0 ? "#2c3e50" : colors[d.depth % colors.length];
    
    const path = node.append("path")
      .attr("d", arcGen(data))
      .attr("fill", baseColor)
      // === ADAUGARE 3D: Margine mai groasă și mai închisă pentru efect de cant ===
      .attr("stroke", d3.color(baseColor).darker(1.5)) 
      .attr("stroke-width", 2);

    const text = node.append("text")
      .attr("transform", d.depth === 0 ? "translate(0,0)" : `translate(${arcGen.centroid(data)})`)
      .attr("text-anchor", "middle")
      .style("font-size", "8px")
      .style("fill", "#fff")
      .style("pointer-events", "none")
      // Adăugăm un mic contur negru textului pentru lizibilitate 3D
      .style("paint-order", "stroke")
      .style("stroke", "#0000004d")
      .style("stroke-width", "2px")
      .text(d.data.name.length > 10 ? d.data.name.substring(0, 8) + "..." : d.data.name);

    // LOGICA HOVER
    node.on("mouseover", function() {
      // 1. Aduce elementul deasupra
      d3.select(this).raise();
      
      // 2. Scalează întregul grup (path + text)
      d3.select(this).transition().duration(200)
        .attr("transform", "scale(1.15)")
        // === ADAUGARE 3D: Schimbăm umbra la hover ===
        .attr("filter", "url(#shadow-3d-hover)"); 
      
      // 3. Luminăm ușor culoarea la hover (efect de lumină)
      path.attr("fill", d3.color(baseColor).brighter(0.8));
      
      // 4. Extinde textul
      text.selectAll("tspan").remove();
      text.text("");
      const words = d.data.name.split(/\s+/);
      words.forEach((word, i) => {
        text.append('tspan')
          .attr('x', 0)
          .attr('dy', i === 0 ? '-0.5em' : '1.1em')
          .text(word);
      });
      text.style("font-size", "10px").style("fill", "#fff");
    })
    .on("mouseout", function() {
      // 1. Revine la scara normală
      d3.select(this).transition().duration(200)
        .attr("transform", "scale(1)")
        // === ADAUGARE 3D: Revenim la umbra normală ===
        .attr("filter", "url(#shadow-3d)"); 
      
      // 2. Revenim la culoarea de bază
      path.attr("fill", baseColor);
      
      // 3. Revine la textul trunchiat
      text.selectAll("tspan").remove();
      text.text(d.data.name.length > 10 ? d.data.name.substring(0, 8) + "..." : d.data.name)
          .style("font-size", "8px")
          .style("fill", "#fff");
    });
  });
};

onMounted(renderChart);
watch(() => props.data, renderChart, { deep: true });
</script>

<style scoped>
.chart-box { 
  width: 100%; 
  height: 100%; 
  min-height: 500px; 
  overflow: hidden; 
  /* Fundal puțin mai întunecat pentru ca umbrele 3D să iasă în evidență */
  background: #e2e8f0; 
  border-radius: 12px;
}
</style>