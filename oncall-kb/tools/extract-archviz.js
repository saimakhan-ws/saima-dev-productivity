#!/usr/bin/env node
/**
 * Extracts architecture data from the archviz HTML file.
 * Usage: node extract-archviz.js <path-to-html> <output-dir>
 */
const fs = require('fs');
const path = require('path');

const htmlPath = process.argv[2] || path.join(process.env.HOME, 'Downloads', 'archviz (2).html');
const outputDir = process.argv[3] || path.join(__dirname, '..', 'architecture');

console.log(`Reading: ${htmlPath}`);
const html = fs.readFileSync(htmlPath, 'utf-8');

// Find window.ARCHVIZ_DATA = {...}
const marker = 'window.ARCHVIZ_DATA';
const idx = html.indexOf(marker);
if (idx === -1) {
  console.error('Could not find window.ARCHVIZ_DATA in the HTML file');
  process.exit(1);
}

// Find the start of the JSON object
const jsonStart = html.indexOf('=', idx) + 1;
// Find the matching end - look for the closing that ends the assignment
// The data is assigned as: window.ARCHVIZ_DATA = {...};
// We need to find the matching closing brace
let depth = 0;
let inString = false;
let escapeNext = false;
let jsonEnd = -1;

for (let i = jsonStart; i < html.length; i++) {
  const ch = html[i];

  if (escapeNext) {
    escapeNext = false;
    continue;
  }

  if (ch === '\\' && inString) {
    escapeNext = true;
    continue;
  }

  if (ch === '"' && !escapeNext) {
    inString = !inString;
    continue;
  }

  if (inString) continue;

  if (ch === '{') depth++;
  if (ch === '}') {
    depth--;
    if (depth === 0) {
      jsonEnd = i + 1;
      break;
    }
  }
}

if (jsonEnd === -1) {
  console.error('Could not find end of ARCHVIZ_DATA object');
  process.exit(1);
}

const jsonStr = html.substring(jsonStart, jsonEnd).trim();
console.log(`Extracted JSON: ${(jsonStr.length / 1024 / 1024).toFixed(1)}MB`);

let data;
try {
  data = JSON.parse(jsonStr);
} catch (e) {
  console.error('Failed to parse JSON:', e.message);
  // Try wrapping in eval-like approach for JS objects with unquoted keys
  try {
    data = new Function('return ' + jsonStr)();
  } catch (e2) {
    console.error('Also failed with Function():', e2.message);
    process.exit(1);
  }
}

console.log('Parsed successfully. Top-level keys:', Object.keys(data));

// Save full data
const fullPath = path.join(outputDir, 'archviz-data.json');
fs.writeFileSync(fullPath, JSON.stringify(data, null, 2));
console.log(`Full data saved to: ${fullPath} (${(fs.statSync(fullPath).size / 1024 / 1024).toFixed(1)}MB)`);

// Build condensed summary
const summary = {
  _meta: {
    extractedAt: new Date().toISOString(),
    sourceFile: htmlPath,
  },
  diagrams: [],
  services: {},
  nodeToService: data.nodeToService || {},
  nodeCategories: data.nodeCategories || {},
  nodeDescriptions: data.nodeDescriptions || {},
  nodeTechIcons: data.nodeTechIcons || {},
  diagramDescriptions: data.diagramDescriptions || {},
  serviceToDiagrams: data.serviceToDiagrams || {},
  stories: [],
};

// Extract diagram metadata (without SVG blobs)
if (data.diagrams && Array.isArray(data.diagrams)) {
  summary.diagrams = data.diagrams.map(d => ({
    id: d.id,
    title: d.title,
    category: d.category,
    mermaid: d.mermaid, // keep the mermaid source - it's the actual architecture
  }));
}

// Extract services
if (data.services) {
  for (const [key, svc] of Object.entries(data.services)) {
    summary.services[key] = {
      name: svc.name,
      purpose: svc.purpose,
      keyFunctions: svc.keyFunctions,
      ...svc, // keep any other metadata
    };
    // Remove large blobs if present
    delete summary.services[key].svg;
    delete summary.services[key].svgLight;
  }
}

// Extract stories (without frames/heavy data)
if (data.stories && Array.isArray(data.stories)) {
  summary.stories = data.stories.map(s => ({
    title: s.title,
    description: s.description,
    diagram: s.diagram,
    steps: s.steps ? s.steps.map(step => ({
      title: step.title,
      description: step.description,
      flow: step.flow,
    })) : [],
  }));
}

// Extract edge data if present
if (data.edges) summary.edges = data.edges;
if (data.edgeGraph) summary.edgeGraph = data.edgeGraph;

const summaryPath = path.join(outputDir, 'archviz-summary.json');
fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
console.log(`Summary saved to: ${summaryPath} (${(fs.statSync(summaryPath).size / 1024 / 1024).toFixed(1)}MB)`);

// Print quick overview
console.log('\n=== Quick Overview ===');
console.log(`Diagrams: ${summary.diagrams.length}`);
console.log(`Services: ${Object.keys(summary.services).length}`);
console.log(`Node mappings: ${Object.keys(summary.nodeToService).length}`);
console.log(`Stories: ${summary.stories.length}`);
console.log(`Diagram titles:`);
summary.diagrams.forEach(d => console.log(`  - [${d.category}] ${d.title}`));
console.log(`\nService names:`);
Object.entries(summary.services).forEach(([k, v]) => console.log(`  - ${k}: ${v.name || v.purpose || '(no description)'}`));
